/**
 * DwarfVault - Background Service Worker
 *
 * Responsabilidades:
 *  - Construir el menú contextual dinámico (guardar texto / ver datos).
 *  - Guardar texto seleccionado en IndexedDB.
 *  - Pasar datos al popup cuando el usuario elige una entrada.
 *  - Escuchar mensajes del popup para actualizar el menú contextual.
 *  - Abrir el popup con el atajo de teclado configurado.
 *
 * NOTA: Los IDs de los items del menú usan "::" como separador
 * (en lugar de "_") para evitar conflictos con nombres de BD que
 * contengan guiones bajos.
 *
 * INVARIANTE CRÍTICA: la reconstrucción del menú está serializada
 * (ver rebuildContextMenu). chrome.contextMenus.removeAll() es asíncrono y
 * el popup dispara 'updateContextMenu' desde muchos sitios; sin la cola, dos
 * reconstrucciones se solapan y la segunda removeAll() borra lo que la
 * primera acaba de crear, dejando el menú incompleto.
 */

// Módulos compartidos. importScripts es síncrono, así que el resto del
// archivo puede usar self.DwarfSecurity y self.DwarfNotify inmediatamente.
try {
    importScripts('scripts/security.js', 'scripts/notifications.js');
} catch (e) {
    console.error('[DwarfVault] No se pudo cargar módulos compartidos:', e);
}

const DB_NAME    = 'Dott-yDB';
const DB_VERSION = 2;

/** Separador de los IDs del menú contextual. */
const ID_SEP = '::';

/**
 * Tope de entradas que se renderizan por BD en la sección 📂 Vault.
 * Sin tope, una BD con miles de entradas crea miles de ítems y el menú
 * contextual nativo tarda segundos en abrirse. Lo que excede el tope sigue
 * accesible desde el popup mediante el ítem "… N more".
 */
const MAX_MENU_ENTRIES_PER_DB = 50;

/** Tope de ítems en los accesos rápidos ⭐ Favorites y 🔗 Links. */
const MAX_QUICK_ACCESS_ITEMS = 15;

/** Caché en memoria de las bases de datos para resolver clics rápidos. */
let dbItems = [];

// Nota: ya no usamos una variable en memoria para el texto capturado.
// Usamos chrome.storage.session para que el texto persista aunque Chrome
// termine y reactive el service worker entre el contextmenu y el onClicked.

// ── Inicialización ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
    console.log('[DwarfVault] Extensión instalada/actualizada.');
    loadDatabases();
});

chrome.runtime.onStartup.addListener(() => {
    console.log('[DwarfVault] Navegador iniciado.');
    loadDatabases();
});

// ── Base de datos ─────────────────────────────────────────────────────────────

/**
 * Abre la base de datos IndexedDB (versión Promise para el service worker).
 * No elimina datos en actualizaciones de versión.
 *
 * El caller es responsable de llamar a db.close() cuando termine: el service
 * worker puede seguir vivo mucho tiempo y las conexiones abiertas se acumulan
 * además de bloquear futuros upgrades de versión.
 *
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Crear el store solo si no existe — nunca borrar datos existentes.
            if (!db.objectStoreNames.contains('databases')) {
                db.createObjectStore('databases', { keyPath: 'name' });
            }
        };

        request.onsuccess  = (event) => resolve(event.target.result);
        request.onerror    = (event) => reject(event.target.error);
        request.onblocked  = () => reject(new Error('IndexedDB bloqueada por otra conexión.'));
    });
}

/**
 * Lee todos los registros de bases de datos y cierra la conexión.
 *
 * @returns {Promise<Array>}
 */
async function readAllDatabases() {
    const db = await openDatabase();
    try {
        return await new Promise((resolve, reject) => {
            const tx    = db.transaction('databases', 'readonly');
            const req   = tx.objectStore('databases').getAll();
            req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
            req.onerror   = () => reject(req.error);
            tx.onabort    = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

/**
 * Refresca únicamente la caché en memoria, SIN reconstruir el menú.
 *
 * Se usa en el camino caliente de los clics (⭐ Favorites, 🔗 Links, 📂 Vault)
 * cuando el service worker acaba de despertar y la caché está vacía:
 * reconstruir el menú entero ahí solo añadiría latencia a la acción que el
 * usuario está esperando.
 *
 * @returns {Promise<Array>}
 */
async function refreshCache() {
    dbItems = await readAllDatabases();
    return dbItems;
}

/**
 * Carga todas las bases de datos y reconstruye el menú contextual.
 * Alias histórico de rebuildContextMenu() — lo usan los listeners externos.
 *
 * @returns {Promise<void>}
 */
function loadDatabases() {
    return rebuildContextMenu();
}

// ── Menú contextual: primitivas seguras ───────────────────────────────────────

/**
 * Crea un ítem del menú consumiendo chrome.runtime.lastError.
 *
 * Sin el callback, cualquier fallo (ID duplicado, padre inexistente) se
 * reporta como error no comprobado y ensucia la consola del service worker
 * sin decir qué ítem falló.
 *
 * @param {Object} props - Mismo shape que chrome.contextMenus.create.
 */
function createMenuItem(props) {
    try {
        chrome.contextMenus.create(props, () => {
            const err = chrome.runtime.lastError;
            if (err) console.warn(`[DwarfVault] Menú "${props.id}": ${err.message}`);
        });
    } catch (error) {
        console.warn(`[DwarfVault] Menú "${props.id}" no se pudo crear:`, error?.message);
    }
}

/**
 * Versión Promise de chrome.contextMenus.removeAll().
 * Nunca rechaza: un fallo al limpiar no debe abortar la reconstrucción.
 *
 * @returns {Promise<void>}
 */
function removeAllMenuItems() {
    return new Promise((resolve) => {
        try {
            chrome.contextMenus.removeAll(() => {
                void chrome.runtime.lastError;
                resolve();
            });
        } catch {
            resolve();
        }
    });
}

// ── Menú contextual: formateo de títulos ──────────────────────────────────────

/**
 * Extrae el hostname de una URL para mostrar en el menú contextual.
 * Devuelve cadena vacía si la URL no es válida.
 *
 * @param {string} url
 * @returns {string}
 */
function getHostname(url) {
    if (!url || typeof url !== 'string') return '';
    try {
        // Quitar "www." solo como PREFIJO. El .replace('www.','') anterior
        // borraba la primera aparición en cualquier posición, así que
        // "notwww.example.com" se mostraba como "notexample.com".
        return new URL(url).hostname.replace(/^www\./i, '');
    } catch {
        return '';
    }
}

/**
 * Prepara cualquier texto para usarse como título de un ítem del menú.
 *
 *  - Toma solo la primera línea (los \n rompen el layout del menú nativo).
 *  - Sustituye caracteres de control por espacios.
 *  - Escapa "&" duplicándolo: en Windows, chrome.contextMenus interpreta un
 *    "&" suelto como acelerador de teclado, así que "AT&T" se dibujaba como
 *    "ATT" con la T subrayada.
 *  - Recorta a `max` caracteres añadiendo "..." si sobra.
 *
 * @param {*}      value - Texto de origen (tolera null/undefined/no-string).
 * @param {number} max   - Longitud máxima antes de los puntos suspensivos.
 * @returns {string}
 */
function menuLabel(value, max) {
    const raw = typeof value === 'string' ? value : '';
    const firstLine = raw
        .split('\n')[0]
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const clipped = firstLine.length > max
        ? `${firstLine.slice(0, max)}...`
        : firstLine;

    return clipped.replace(/&/g, '&&');
}

/**
 * Nombre de BD saneado y listo para un título de menú.
 *
 * @param {*} name
 * @returns {string}
 */
function menuDbName(name) {
    return DwarfSecurity.sanitizeDbName(name).replace(/&/g, '&&');
}

/**
 * Lee las entries de un registro tolerando datos corruptos.
 * Un registro antiguo o importado a mano puede no tener `entries` como array;
 * sin esta guarda, un solo registro malo rompía la construcción completa del
 * menú y el usuario se quedaba sin menú contextual.
 *
 * @param {*} dbItem
 * @returns {Array}
 */
function entriesOf(dbItem) {
    return dbItem && Array.isArray(dbItem.entries) ? dbItem.entries : [];
}

/**
 * Construye el texto de un ítem de entrada en el menú contextual.
 * Formato: "📜 N: [dominio.com] Texto de la entrada..."
 *
 * @param {Object} entry - Entrada con { text, url, favicon }
 * @param {number} idx   - Índice (0-based)
 * @returns {string}
 */
function buildEntryTitle(entry, idx) {
    const hostname = getHostname(entry?.url);
    const source   = hostname ? `[${hostname}] ` : '';
    const snippet  = menuLabel(entry?.text, 30) || '(empty)';
    // Sin link → marcador "⛓ Unchained" (mismo que la vista corporate),
    // para que se reconozca de inmediato que a esa entrada le falta un link.
    const tail = hostname ? '' : '  ⛓ Unchained';
    return `📜 ${idx + 1}: ${source}${snippet}${tail}`;
}

// ── Menú contextual: construcción ─────────────────────────────────────────────

/**
 * Cadena de reconstrucciones en curso. Todo rebuild se encola aquí para que
 * removeAll() y los create() de una reconstrucción nunca se intercalen con
 * los de otra.
 */
let rebuildChain = Promise.resolve();

/** Hay ya una reconstrucción esperando en la cola (coalescing). */
let rebuildPending = false;

/**
 * Solicita una reconstrucción del menú contextual.
 *
 * Las peticiones se serializan y se colapsan: si ya hay una encolada que aún
 * no ha empezado a leer IndexedDB, no tiene sentido añadir otra — esa leerá
 * igualmente el estado más reciente.
 *
 * @returns {Promise<void>}
 */
function rebuildContextMenu() {
    if (rebuildPending) return rebuildChain;

    rebuildPending = true;
    rebuildChain = rebuildChain
        // Un fallo anterior no debe envenenar la cadena para siempre.
        .catch(() => {})
        .then(() => {
            rebuildPending = false;
            return performRebuild();
        });

    return rebuildChain;
}

/**
 * Reconstruye el menú de verdad. No llamar directamente — usar
 * rebuildContextMenu() para respetar la serialización.
 *
 * Orden deliberado: primero se LEE todo (IndexedDB + storage) y solo después
 * se limpia y se recrea el menú de forma SÍNCRONA. Así:
 *  - Si la lectura falla, el menú anterior sigue en pie en vez de quedar vacío.
 *  - Entre removeAll() y el último create() no hay ningún await, así que no
 *    queda ninguna ventana en la que otro código pueda intercalarse.
 *
 * @returns {Promise<void>}
 */
async function performRebuild() {
    let databases;
    let settings;

    try {
        databases = await readAllDatabases();
        settings  = await chrome.storage.local.get(['activeFavoritesDb', 'activeLinksDb']);
    } catch (error) {
        console.error('[DwarfVault] No se pudo leer el estado para el menú:', error);
        return; // Conservar el menú actual antes que dejar al usuario sin menú.
    }

    // Actualizar caché global antes de dibujar: los handlers de clic la usan.
    dbItems = databases;

    await removeAllMenuItems();

    try {
        buildMenuItems(databases, settings);
    } catch (error) {
        console.error('[DwarfVault] Error al construir el menú contextual:', error);
    }
}

/**
 * Dibuja todos los ítems del menú. SÍNCRONA a propósito (ver performRebuild).
 *
 * Estructura:
 *   [con texto seleccionado]
 *   📥 Save to Vault → BD padre → BD hija
 *
 *   [siempre visible]
 *   The Dwarf's Vault
 *     ├── ⭐ Favorites → ítems (copia directa al portapapeles, 2 clics)
 *     ├── 🔗 Links     → ítems (abre URL en nueva pestaña, 2 clics)
 *     ├── ─────────────
 *     ├── ⚙️ Set Active Vault
 *     └── 📂 Vault     → estructura completa padre/hijo (acceso avanzado)
 *
 * Favorites y Links solo aparecen si el usuario configuró una BD activa.
 *
 * @param {Array}  databases - Registros crudos de IndexedDB.
 * @param {Object} settings  - { activeFavoritesDb, activeLinksDb }
 */
function buildMenuItems(databases, settings) {
    const { activeFavoritesDb, activeLinksDb } = settings || {};

    const parentDatabases = databases.filter(d => d && !d.parentDatabase);
    const childDatabases  = databases.filter(d => d &&  d.parentDatabase);

    // ── 1. Menú GUARDAR texto seleccionado ───────────────────────────────────
    createMenuItem({
        id:       'saveTextRoot',
        title:    '📥 Save to Vault 🏰',
        contexts: ['selection']
    });

    if (parentDatabases.length === 0) {
        // Sin este ítem, "Save to Vault" aparecía como una entrada que al
        // pulsarla no hacía absolutamente nada.
        createMenuItem({
            id:       'saveEmptyHint',
            parentId: 'saveTextRoot',
            title:    'No vaults yet — open the extension to create one',
            enabled:  false,
            contexts: ['selection']
        });
    }

    parentDatabases.forEach((dbItem, i) => {
        const children  = childDatabases.filter(c => c.parentDatabase === dbItem.name);
        const childInfo = children.length > 0 ? ` [${children.length} sub-DB]` : '';
        // Los IDs (save::X) usan el nombre real del registro para que el
        // lookup en onClicked siga funcionando; los TÍTULOS se sanean para
        // que nombres con \n o control chars no rompan el layout del menú.
        createMenuItem({
            id:       `save${ID_SEP}${dbItem.name}`,
            parentId: 'saveTextRoot',
            title:    `${i + 1}. ${menuDbName(dbItem.name)} — ${entriesOf(dbItem).length} item(s)${childInfo} 🗂️`,
            contexts: ['selection']
        });

        children.forEach(childDb => {
            createMenuItem({
                id:       `save${ID_SEP}${childDb.name}`,
                parentId: `save${ID_SEP}${dbItem.name}`,
                title:    `↳ ${menuDbName(childDb.name)} — ${entriesOf(childDb).length} item(s) 🗂️`,
                contexts: ['selection']
            });
        });
    });

    // ── 2. Menú VER datos guardados ───────────────────────────────────────────
    createMenuItem({
        id:       'viewTextRoot',
        title:    "The Dwarf's Vault",
        contexts: ['page']
    });

    // ── 2a. ⭐ Favorites — copia directa al portapapeles ─────────────────────
    // Muestra los ítems de la BD activa. Al hacer clic, el texto se copia
    // al portapapeles sin abrir el popup (fav::DBName::index).
    const favDb      = activeFavoritesDb ? databases.find(d => d?.name === activeFavoritesDb) : null;
    const favEntries = entriesOf(favDb);
    let hasQuickAccess = false;

    if (favDb && favEntries.length > 0) {
        hasQuickAccess = true;
        createMenuItem({
            id:       'favsRoot',
            parentId: 'viewTextRoot',
            title:    `⭐ Favorites — ${menuDbName(favDb.name)}`,
            contexts: ['page']
        });

        const limit = Math.min(favEntries.length, MAX_QUICK_ACCESS_ITEMS);
        for (let i = 0; i < limit; i++) {
            createMenuItem({
                id:       `fav${ID_SEP}${favDb.name}${ID_SEP}${i}`,
                parentId: 'favsRoot',
                title:    `${i + 1}: ${menuLabel(favEntries[i]?.text, 40) || '(empty)'}`,
                contexts: ['page']
            });
        }
    }

    // ── 2b. 🔗 Links — abre URL directamente en nueva pestaña ───────────────
    // Muestra los ítems de la BD activa. Al hacer clic, abre entry.url
    // en una nueva pestaña sin abrir el popup (link::DBName::index).
    const linkDb      = activeLinksDb ? databases.find(d => d?.name === activeLinksDb) : null;
    const linkEntries = entriesOf(linkDb);

    if (linkDb && linkEntries.length > 0) {
        hasQuickAccess = true;
        createMenuItem({
            id:       'linksRoot',
            parentId: 'viewTextRoot',
            title:    `🔗 Links — ${menuDbName(linkDb.name)}`,
            contexts: ['page']
        });

        const limit = Math.min(linkEntries.length, MAX_QUICK_ACCESS_ITEMS);
        for (let i = 0; i < limit; i++) {
            const entry    = linkEntries[i];
            const hostname = getHostname(entry?.url);
            // Usar el texto guardado como etiqueta; si no hay texto, el hostname.
            const label = menuLabel(entry?.text, 40) || menuLabel(hostname, 40) || `Link ${i + 1}`;
            // Sin link → mismo marcador que la vista corporate.
            const tail  = hostname ? '' : '  ⛓ Unchained';
            createMenuItem({
                id:       `link${ID_SEP}${linkDb.name}${ID_SEP}${i}`,
                parentId: 'linksRoot',
                title:    `${i + 1}: ${label}${tail}`,
                contexts: ['page']
            });
        }
    }

    // Separador entre Quick Access y el resto. Solo si hay algo encima de él,
    // para no abrir el submenú con una raya suelta.
    if (hasQuickAccess) {
        createMenuItem({
            id:       'quickAccessSep',
            parentId: 'viewTextRoot',
            type:     'separator',
            contexts: ['page']
        });
    }

    // ── 2c. ⚙️ Set Active Vault — cambiar Favorites/Links desde el menú ────
    // Submenú que lista todas las BD disponibles para que el usuario pueda
    // cambiar la tabla activa de Favorites y Links sin abrir el popup.
    // Al seleccionar una tabla, se actualizan AMBOS (activeFavoritesDb y
    // activeLinksDb) en chrome.storage.local y se reconstruye el menú.
    createMenuItem({
        id:       'setActiveRoot',
        parentId: 'viewTextRoot',
        title:    '⚙️ Set Active Vault',
        contexts: ['page']
    });

    // Opción para desactivar Quick Access. El ID termina en "::" (nombre
    // vacío) porque un nombre de BD vacío nunca es válido: así el sentinel no
    // puede colisionar con una BD que el usuario llame literalmente "(None)".
    const noneActive = !activeFavoritesDb && !activeLinksDb;
    createMenuItem({
        id:       `setActive${ID_SEP}`,
        parentId: 'setActiveRoot',
        title:    `${noneActive ? '✓ ' : ''}(None) — Disable Quick Access`,
        contexts: ['page']
    });

    // Listar todas las BD con jerarquía, marcando la activa con ✓
    parentDatabases.forEach((dbItem, i) => {
        const isActive = dbItem.name === activeFavoritesDb;
        createMenuItem({
            id:       `setActive${ID_SEP}${dbItem.name}`,
            parentId: 'setActiveRoot',
            title:    `${isActive ? '✓ ' : ''}${i + 1}. ${menuDbName(dbItem.name)} (${entriesOf(dbItem).length})`,
            contexts: ['page']
        });

        // Hijas de este padre
        childDatabases
            .filter(c => c.parentDatabase === dbItem.name)
            .forEach(childDb => {
                const isChildActive = childDb.name === activeFavoritesDb;
                createMenuItem({
                    id:       `setActive${ID_SEP}${childDb.name}`,
                    parentId: 'setActiveRoot',
                    title:    `${isChildActive ? '✓ ' : ''}  ↳ ${menuDbName(childDb.name)} (${entriesOf(childDb).length})`,
                    contexts: ['page']
                });
            });
    });

    // ── 2d. 📂 Vault — estructura completa (acceso avanzado) ─────────────────
    // Abre el popup con los datos de la entrada seleccionada.
    createMenuItem({
        id:       'vaultSection',
        parentId: 'viewTextRoot',
        title:    '📂 Vault',
        contexts: ['page']
    });

    parentDatabases.forEach((dbItem, i) => {
        const children  = childDatabases.filter(c => c.parentDatabase === dbItem.name);
        const dbIcon    = children.length > 0 ? '🗃️' : '📂';
        const childInfo = children.length > 0 ? ` [${children.length} sub-DB]` : '';

        createMenuItem({
            id:       `viewParent${ID_SEP}${dbItem.name}`,
            parentId: 'vaultSection',
            title:    `${i + 1}. ${dbIcon} ${menuDbName(dbItem.name)}${childInfo}`,
            contexts: ['page']
        });

        const parentEntries = buildEntryItems(dbItem, `viewParent${ID_SEP}${dbItem.name}`);

        if (parentEntries > 0 && children.length > 0) {
            createMenuItem({
                id:       `sep${ID_SEP}${dbItem.name}`,
                parentId: `viewParent${ID_SEP}${dbItem.name}`,
                type:     'separator',
                contexts: ['page']
            });
        }

        children.forEach(childDb => {
            createMenuItem({
                id:       `viewChild${ID_SEP}${childDb.name}`,
                parentId: `viewParent${ID_SEP}${dbItem.name}`,
                title:    `📦↳ ${menuDbName(childDb.name)} (${entriesOf(childDb).length} items)`,
                contexts: ['page']
            });

            buildEntryItems(childDb, `viewChild${ID_SEP}${childDb.name}`);
        });
    });
}

/**
 * Dibuja los ítems de entrada de una BD bajo el padre indicado, respetando
 * MAX_MENU_ENTRIES_PER_DB. Si hay más entradas de las que caben, añade un
 * ítem final que abre el popup en esa hoja.
 *
 * @param {Object} dbItem
 * @param {string} parentId
 * @returns {number} - Cuántos ítems de entrada se dibujaron.
 */
function buildEntryItems(dbItem, parentId) {
    const entries = entriesOf(dbItem);
    const shown   = Math.min(entries.length, MAX_MENU_ENTRIES_PER_DB);

    for (let idx = 0; idx < shown; idx++) {
        createMenuItem({
            id:       `copy${ID_SEP}${dbItem.name}${ID_SEP}${idx}`,
            parentId,
            title:    buildEntryTitle(entries[idx], idx),
            contexts: ['page']
        });
    }

    const hidden = entries.length - shown;
    if (hidden > 0) {
        createMenuItem({
            id:       `more${ID_SEP}${dbItem.name}`,
            parentId,
            title:    `… ${hidden} more — open the Vault`,
            contexts: ['page']
        });
    }

    return shown;
}

// ── Portapapeles ──────────────────────────────────────────────────────────────

const OFFSCREEN_DOCUMENT_PATH = 'src/pages/offscreen.html';

/** Tiempo máximo de espera a que el documento offscreen confirme la copia. */
const OFFSCREEN_TIMEOUT_MS = 3000;

/** Promesa en vuelo de creación del documento offscreen (evita carreras). */
let offscreenCreating = null;

/**
 * Garantiza que el documento offscreen exista.
 *
 * Solo puede haber UNO por extensión, así que primero se comprueba con
 * chrome.runtime.getContexts y las creaciones concurrentes comparten la
 * misma promesa.
 *
 * @returns {Promise<boolean>} true si el documento está disponible.
 */
async function ensureOffscreenDocument() {
    // chrome.offscreen existe desde Chrome 109. En versiones previas se usa
    // el fallback de inyección en la pestaña.
    if (!chrome.offscreen) return false;

    try {
        const contexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
        });
        if (contexts.length > 0) return true;
    } catch {
        // getContexts no disponible → intentar crear y tolerar el error de
        // "ya existe" más abajo.
    }

    if (!offscreenCreating) {
        offscreenCreating = chrome.offscreen
            .createDocument({
                url:           OFFSCREEN_DOCUMENT_PATH,
                reasons:       ['CLIPBOARD'],
                justification: 'Write a saved Vault entry to the clipboard.'
            })
            .catch((error) => {
                // Si ya existía, el documento sirve igual; cualquier otro
                // error sí es fatal para esta vía.
                if (!/single offscreen/i.test(error?.message || '')) throw error;
            })
            .finally(() => { offscreenCreating = null; });
    }

    try {
        await offscreenCreating;
        return true;
    } catch (error) {
        console.warn('[DwarfVault] No se pudo crear el documento offscreen:', error?.message);
        return false;
    }
}

/**
 * Pide al documento offscreen que copie el texto, con tope de tiempo.
 *
 * Sin el timeout, si el documento offscreen nunca responde (se quedó a medio
 * cargar) el await se queda colgado para siempre y el usuario no llega a ver
 * ni la confirmación ni el aviso de error.
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyViaOffscreen(text) {
    const request = chrome.runtime.sendMessage({
        target: 'dwarf-offscreen',
        action: 'copyToClipboard',
        text
    });

    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), OFFSCREEN_TIMEOUT_MS));

    try {
        const response = await Promise.race([request, timeout]);
        return response?.ok === true;
    } catch (error) {
        console.warn('[DwarfVault] Copia vía offscreen falló:', error?.message);
        return false;
    }
}

/**
 * Copia texto al portapapeles.
 *
 * ORDEN DE INTENTOS:
 *  1. Documento offscreen → execCommand('copy') sobre un textarea propio.
 *     Fiable: la página de la extensión sí puede enfocar su textarea, y
 *     funciona incluso en pestañas donde no se puede inyectar script
 *     (chrome://, Chrome Web Store, PDFs, about:blank).
 *  2. Inyección en la pestaña activa. SOLO para Chrome < 109, donde
 *     chrome.offscreen no existe.
 *
 * Por qué el fallback está restringido a Chrome < 109 y no se usa como
 * segundo intento genérico: inyectar el texto en la página lo expone al sitio
 * visitado, que puede leerlo con un MutationObserver antes de que el textarea
 * temporal se elimine. Filtrar el contenido del vault a una web arbitraria es
 * peor que fallar la copia y decírselo al usuario, así que cuando el offscreen
 * está disponible pero falla, se avisa en vez de recurrir a la página.
 *
 * @param {string} text
 * @param {number} [tabId]
 * @returns {Promise<boolean>} true solo si el texto llegó al portapapeles.
 */
async function copyTextToClipboard(text, tabId) {
    if (typeof text !== 'string' || text.length === 0) return false;

    if (chrome.offscreen) {
        if (!(await ensureOffscreenDocument())) return false;
        return copyViaOffscreen(text);
    }

    // ── Chrome < 109: sin API offscreen, la única vía es la pestaña ──────────
    if (typeof tabId === 'number') {
        try {
            const [injection] = await chrome.scripting.executeScript({
                target: { tabId },
                func: (value) => {
                    // Enfocar la ventana antes de copiar: execCommand exige un
                    // documento enfocado y el menú contextual se lo quitó.
                    try { window.focus(); } catch { /* iframes restringidos */ }

                    const el = document.createElement('textarea');
                    el.value = value;
                    el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
                    document.body.appendChild(el);
                    el.focus();
                    el.select();

                    let ok = false;
                    try {
                        ok = document.execCommand('copy'); // eslint-disable-line
                    } catch {
                        ok = false;
                    }
                    el.remove();
                    return ok;
                },
                args: [text]
            });
            if (injection?.result === true) return true;
        } catch {
            // La pestaña no acepta scripts (chrome://, extensiones, PDFs, etc.)
        }
    }

    return false;
}

// ── Manejador de clics del menú contextual ────────────────────────────────────

/**
 * Obtiene el texto seleccionado directamente desde la pestaña activa.
 *
 * chrome.scripting.executeScript inyecta código en la página EN EL MOMENTO
 * del clic, cuando la selección aún está activa. window.getSelection().toString()
 * preserva \n reales entre párrafos; info.selectionText los colapsa en espacios.
 *
 * Si el clic ocurrió dentro de un iframe (info.frameId > 0) hay que apuntar a
 * ESE frame: el frame principal no ve la selección del hijo y devolvería "".
 *
 * @param {number} tabId
 * @param {number} [frameId]
 * @returns {Promise<string>} - Texto con saltos de línea originales, o '' si falla.
 */
async function getSelectionFromTab(tabId, frameId) {
    if (typeof tabId !== 'number') return '';

    // Esta función se ejecuta dentro de la página, no en el SW.
    const readSelection = () => window.getSelection()?.toString() ?? '';

    const attempts = [];
    if (typeof frameId === 'number' && frameId > 0) {
        attempts.push({ tabId, frameIds: [frameId] });
    }
    attempts.push({ tabId });

    for (const target of attempts) {
        try {
            const results = await chrome.scripting.executeScript({ target, func: readSelection });
            const value = results?.[0]?.result;
            if (typeof value === 'string' && value.trim()) return value;
        } catch {
            // Frame desaparecido o página restringida → probar el siguiente.
        }
    }

    return '';
}

/**
 * Parsea un ID con forma "prefijo::nombreBD::indice".
 *
 * Usa lastIndexOf para tolerar nombres de BD que contengan "::" y valida que
 * el índice sea un entero real: parseInt devolvía NaN para IDs malformados y
 * la comprobación `NaN < 0 || NaN >= length` es SIEMPRE falsa, así que un ID
 * corrupto pasaba el filtro y reventaba al leer entries[NaN].text.
 *
 * @param {string} menuItemId
 * @param {string} prefix - Incluye el separador, p. ej. "copy::".
 * @returns {{dbName:string,index:number}|null}
 */
function parseEntryId(menuItemId, prefix) {
    const rest    = menuItemId.slice(prefix.length);
    const lastSep = rest.lastIndexOf(ID_SEP);
    if (lastSep <= 0) return null;

    const dbName   = rest.slice(0, lastSep);
    const rawIndex = rest.slice(lastSep + ID_SEP.length);
    if (!dbName || !/^\d+$/.test(rawIndex)) return null;

    const index = Number(rawIndex);
    return Number.isSafeInteger(index) ? { dbName, index } : null;
}

/**
 * Resuelve una entrada desde la caché, recargándola si el service worker
 * acaba de despertar y la caché está vacía.
 *
 * @param {string} dbName
 * @param {number} index
 * @returns {Promise<{dbItem:Object,entry:Object}|null>}
 */
async function resolveEntry(dbName, index) {
    let dbItem = dbItems.find(d => d?.name === dbName);

    if (!dbItem) {
        // Caché fría (SW reactivado) o desactualizada → releer solo los datos,
        // sin reconstruir el menú: el usuario está esperando esta acción.
        try {
            await refreshCache();
        } catch (error) {
            console.error('[DwarfVault] No se pudo releer la BD:', error);
            return null;
        }
        dbItem = dbItems.find(d => d?.name === dbName);
    }

    const entries = entriesOf(dbItem);
    const entry   = index < entries.length ? entries[index] : null;
    return entry ? { dbItem, entry } : null;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // menuItemId puede llegar como number según la API; normalizar antes de
    // usar métodos de string.
    const menuItemId    = String(info.menuItemId ?? '');
    const selectionText = info.selectionText;

    try {
        // ── 📥 Guardar texto seleccionado en una BD ──────────────────────────
        if (menuItemId.startsWith(`save${ID_SEP}`) && selectionText?.trim()) {
            const dbName = menuItemId.slice(`save${ID_SEP}`.length);
            if (!dbName) return;

            // Obtener el texto con formato original (saltos de línea, espacios).
            // getSelectionFromTab() usa executeScript en la pestaña ahora mismo,
            // mientras la selección sigue activa: única forma fiable de capturar \n.
            const captured = await getSelectionFromTab(tab?.id, info.frameId);

            // Si executeScript no pudo ejecutarse (página restringida), caer en
            // info.selectionText como último recurso (sin saltos de línea).
            const textToSave = captured.trim() || selectionText.trim();

            await saveTextToDatabase(dbName, textToSave, tab?.url, tab?.favIconUrl);
            return;
        }

        // ── ⭐ Favorites — copia el texto directamente al portapapeles ────────
        // No abre el popup. La copia la hace copyTextToClipboard() a través del
        // documento offscreen, porque tras el clic en el menú contextual la
        // página no está enfocada y no puede copiar.
        if (menuItemId.startsWith(`fav${ID_SEP}`)) {
            const parsed = parseEntryId(menuItemId, `fav${ID_SEP}`);
            if (!parsed) return;

            const resolved = await resolveEntry(parsed.dbName, parsed.index);
            if (!resolved) return;

            const textToCopy = typeof resolved.entry.text === 'string' ? resolved.entry.text : '';
            if (!textToCopy) return;

            const copied = await copyTextToClipboard(textToCopy, tab?.id);

            // Notificación de confirmación visible al usuario (respeta el toggle
            // 🔔/🔕 del popup — si está OFF, no se muestra nada).
            // Solo se anuncia "Copied" cuando la copia se confirmó de verdad; si
            // falló, se avisa en vez de mentir.
            const preview = textToCopy.split('\n')[0].substring(0, 60);
            DwarfNotify.send({
                type:    'basic',
                iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
                title:   copied ? '⭐ Copied to clipboard' : '⚠️ Could not copy',
                message: copied
                    ? preview + (textToCopy.length > 60 ? '...' : '')
                    : 'The clipboard is not available right now. Open the Vault and copy from there.'
            });
            return;
        }

        // ── 🔗 Links — abre la URL en una nueva pestaña ───────────────────────
        if (menuItemId.startsWith(`link${ID_SEP}`)) {
            const parsed = parseEntryId(menuItemId, `link${ID_SEP}`);
            if (!parsed) return;

            const resolved = await resolveEntry(parsed.dbName, parsed.index);
            if (!resolved) return;

            // Validar esquema: solo http(s). Bloquea javascript:/data:/file:
            // si la URL vino de un CSV/JSON importado sin validar en versiones previas.
            const url = DwarfSecurity.safeUrlOrEmpty(resolved.entry.url);
            if (url) {
                chrome.tabs.create({ url });
            } else {
                DwarfNotify.send({
                    type:    'basic',
                    iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
                    title:   '🔗 Link blocked',
                    message: 'The stored URL is invalid or uses a disallowed scheme.'
                });
            }
            return;
        }

        // ── ⚙️ Set Active Vault — cambiar la tabla activa desde el menú ───────
        // Actualiza AMBOS selectores (Favorites y Links) en chrome.storage.local
        // y reconstruye el menú contextual para reflejar el cambio.
        if (menuItemId.startsWith(`setActive${ID_SEP}`)) {
            const selectedDb = menuItemId.slice(`setActive${ID_SEP}`.length);
            // Sentinel "(None)" = nombre vacío (ver buildMenuItems).
            const newValue = selectedDb || null;

            await chrome.storage.local.set({
                activeFavoritesDb: newValue,
                activeLinksDb:     newValue
            });

            // Reconstruir menú para mostrar el ✓ actualizado y las nuevas entradas
            await rebuildContextMenu();

            DwarfNotify.send({
                type:    'basic',
                iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
                title:   '⚙️ Active Vault Changed',
                message: newValue
                    ? `"${DwarfSecurity.sanitizeDbName(newValue)}" is now your active Favorites & Links vault.`
                    : 'Quick Access disabled. No active vault selected.'
            });
            return;
        }

        // ── 📂 Vault — abrir popup con la entrada seleccionada ────────────────
        if (menuItemId.startsWith(`copy${ID_SEP}`)) {
            const parsed = parseEntryId(menuItemId, `copy${ID_SEP}`);
            if (!parsed) return;

            const resolved = await resolveEntry(parsed.dbName, parsed.index);
            if (resolved) openPopupWithEntry(resolved.dbItem, parsed.index);
            return;
        }

        // ── "… N more" — abrir el popup en esa hoja ───────────────────────────
        if (menuItemId.startsWith(`more${ID_SEP}`)) {
            const dbName   = menuItemId.slice(`more${ID_SEP}`.length);
            const resolved = await resolveEntry(dbName, 0);
            if (resolved) openPopupWithEntry(resolved.dbItem, 0);
        }
    } catch (error) {
        console.error('[DwarfVault] Error al procesar el clic del menú:', error);
    }
});

/**
 * Guarda los datos de una entrada en storage.local y abre el popup.
 *
 * @param {Object} dbItem      - Objeto completo de la base de datos.
 * @param {number} entryIndex  - Índice de la entrada.
 */
function openPopupWithEntry(dbItem, entryIndex) {
    const entry = entriesOf(dbItem)[entryIndex];
    if (!entry) return;

    chrome.storage.local.set({
        entryIndex,
        selectedText: typeof entry.text === 'string' ? entry.text : '',
        selectedURL:  DwarfSecurity.safeUrlOrEmpty(entry.url),
        dbName:       dbItem.name,
        favicon:      DwarfSecurity.safeFaviconOrEmpty(entry.favicon),
        // Marca de tiempo de la petición "ver entrada". La vista corporate la
        // usa para resaltar la fila SOLO cuando la apertura viene del menú
        // contextual (y no en aperturas normales del icono). La dwarven la
        // ignora, así que este campo no afecta su flujo.
        viewEntryAt:  Date.now()
    }, () => {
        // openPopup puede rechazar si ya hay popup abierto o si no hay
        // gesto reciente del usuario. Loguear en debug y seguir.
        chrome.action.openPopup().catch((err) => {
            console.debug('[DwarfVault] openPopup rejected:', err?.message);
        });
    });
}

// ── Guardar texto seleccionado ────────────────────────────────────────────────

/**
 * Agrega el texto seleccionado (con su URL y favicon) a la BD indicada.
 *
 * La entrada pasa por DwarfSecurity.sanitizeEntry antes de persistir: valida
 * los esquemas de url/favicon y aplica el tope MAX_ENTRY_TEXT, que existía en
 * security.js pero no se estaba aplicando en esta ruta — se podía guardar una
 * selección de decenas de MB e inflar IndexedDB sin límite.
 *
 * @param {string} dbName
 * @param {string} text
 * @param {string} [url]
 * @param {string} [favicon]
 */
async function saveTextToDatabase(dbName, text, url, favicon) {
    const entry = DwarfSecurity.sanitizeEntry({ text, url, favicon });

    if (!entry) {
        DwarfNotify.send({
            type:    'basic',
            iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
            title:   '⚠️ Nothing saved',
            message: 'The selected text was empty.'
        });
        return;
    }

    const truncated = text.length > entry.text.length;

    let db;
    try {
        db = await openDatabase();

        // Toda la lectura/escritura dentro de UNA transacción y resuelta en
        // tx.oncomplete: el put.onsuccess anterior disparaba la notificación
        // "Saved" antes de que la transacción confirmara, así que un abort
        // posterior dejaba al usuario creyendo que el texto estaba guardado.
        await new Promise((resolve, reject) => {
            const tx    = db.transaction('databases', 'readwrite');
            const store = tx.objectStore('databases');
            const getReq = store.get(dbName);

            getReq.onsuccess = () => {
                const existing = getReq.result;
                const record = (existing && typeof existing === 'object')
                    ? existing
                    : { name: dbName, entries: [], parentDatabase: null };

                // Registro corrupto o importado a mano sin `entries`.
                if (!Array.isArray(record.entries)) record.entries = [];

                record.entries.push(entry);
                store.put(record);
            };

            getReq.onerror = () => reject(getReq.error);
            tx.oncomplete  = () => resolve();
            tx.onerror     = () => reject(tx.error);
            tx.onabort     = () => reject(tx.error || new Error('Transacción abortada.'));
        });
    } catch (error) {
        console.error('[DwarfVault] Error al guardar el texto:', error);
        DwarfNotify.send({
            type:    'basic',
            iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
            title:   '⚠️ Could not save',
            message: `The entry could not be written to "${DwarfSecurity.sanitizeDbName(dbName)}".`
        });
        return;
    } finally {
        if (db) db.close();
    }

    DwarfNotify.send({
        type:    'basic',
        iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
        title:   'Saved to DwarfVault',
        message: truncated
            ? `Text saved to "${DwarfSecurity.sanitizeDbName(dbName)}" (trimmed to the maximum length).`
            : `Text saved to "${DwarfSecurity.sanitizeDbName(dbName)}".`
    });

    // Actualizar caché y menú
    await rebuildContextMenu();
}

// ── Mensajes desde el popup ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender) => {
    // Defensa en profundidad: aceptar solo mensajes de esta misma extensión.
    // Sin "externally_connectable" una web no puede llegar hasta aquí, pero la
    // comprobación cuesta nada y protege si el manifest cambia en el futuro.
    if (sender?.id !== chrome.runtime.id) return;
    if (message?.action !== 'updateContextMenu') return;

    rebuildContextMenu();
    // Sin sendResponse ni return true: este handler no responde, y devolver
    // true dejaría el puerto abierto bloqueando a otros listeners.
});

// ── Comando de teclado ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
    if (command === 'open-extension') {
        chrome.action.openPopup().catch((err) => {
            console.debug('[DwarfVault] openPopup rejected:', err?.message);
        });
    }
});
