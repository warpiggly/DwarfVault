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
    });
}

/**
 * Carga todas las bases de datos y reconstruye el menú contextual.
 */
async function loadDatabases() {
    try {
        const db = await openDatabase();
        await buildContextMenu(db);
    } catch (error) {
        console.error('[DwarfVault] Error al cargar bases de datos:', error);
    }
}

// ── Menú contextual ───────────────────────────────────────────────────────────

/**
 * Extrae el hostname de una URL para mostrar en el menú contextual.
 * Devuelve cadena vacía si la URL no es válida.
 *
 * @param {string} url
 * @returns {string}
 */
function getHostname(url) {
    if (!url) return '';
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return '';
    }
}

/**
 * Construye el texto de un ítem de entrada en el menú contextual.
 * Formato: "📜 N: [dominio.com] Texto de la entrada..."
 *
 * @param {Object} entry       - Entrada con { text, url, favicon }
 * @param {number} idx         - Índice (0-based)
 * @returns {string}
 */
function buildEntryTitle(entry, idx) {
    const hostname = getHostname(entry.url);
    const source   = hostname ? `[${hostname}] ` : '';
    const snippet  = entry.text.substring(0, 30);
    const ellipsis = entry.text.length > 30 ? '...' : '';
    // Sin link → marcador "⛓ Unchained" (mismo que la vista corporate),
    // para que se reconozca de inmediato que a esa entrada le falta un link.
    const tail = hostname ? '' : '  ⛓ Unchained';
    return `📜 ${idx + 1}: ${source}${snippet}${ellipsis}${tail}`;
}

/**
 * Reconstruye el menú contextual a partir de las bases de datos existentes.
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
 *     └── 📂 Vault     → estructura completa padre/hijo (acceso avanzado)
 *
 * Favorites y Links solo aparecen si el usuario configuró una BD activa
 * desde index.html. El límite es 15 ítems por sección para no saturar el menú.
 *
 * @param {IDBDatabase} db
 */
async function buildContextMenu(db) {
    chrome.contextMenus.removeAll();

    const transaction = db.transaction('databases', 'readonly');
    const store       = transaction.objectStore('databases');

    const databases = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror   = (e) => reject(e.target.error);
    });

    // Actualizar caché global
    dbItems = databases;

    // Leer qué BD eligió el usuario para Favorites y Links en index.html
    const { activeFavoritesDb, activeLinksDb } = await chrome.storage.local.get([
        'activeFavoritesDb',
        'activeLinksDb'
    ]);

    const parentDatabases = databases.filter(d => !d.parentDatabase);
    const childDatabases  = databases.filter(d =>  d.parentDatabase);

    // ── 1. Menú GUARDAR texto seleccionado ───────────────────────────────────
    chrome.contextMenus.create({
        id:       'saveTextRoot',
        title:    '📥 Save to Vault 🏰',
        contexts: ['selection']
    });

    parentDatabases.forEach((dbItem, i) => {
        const children  = childDatabases.filter(c => c.parentDatabase === dbItem.name);
        const childInfo = children.length > 0 ? ` [${children.length} sub-DB]` : '';
        // Los IDs (save::X) usan el nombre real del registro para que el
        // lookup en onClicked siga funcionando; los TÍTULOS se sanean para
        // que nombres con \n o control chars no rompan el layout del menú.
        const safeParentTitle = DwarfSecurity.sanitizeDbName(dbItem.name);

        chrome.contextMenus.create({
            id:       `save::${dbItem.name}`,
            parentId: 'saveTextRoot',
            title:    `${i + 1}. ${safeParentTitle} — ${dbItem.entries.length} item(s)${childInfo} 🗂️`,
            contexts: ['selection']
        });

        children.forEach(childDb => {
            chrome.contextMenus.create({
                id:       `save::${childDb.name}`,
                parentId: `save::${dbItem.name}`,
                title:    `↳ ${DwarfSecurity.sanitizeDbName(childDb.name)} — ${childDb.entries.length} item(s) 🗂️`,
                contexts: ['selection']
            });
        });
    });

    // ── 2. Menú VER datos guardados ───────────────────────────────────────────
    chrome.contextMenus.create({
        id:       'viewTextRoot',
        title:    "The Dwarf's Vault",
        contexts: ['page']
    });

    // ── 2a. ⭐ Favorites — copia directa al portapapeles ─────────────────────
    // Muestra los ítems de la BD activa. Al hacer clic, el texto se copia
    // al portapapeles sin abrir el popup (fav::DBName::index).
    const favDb = activeFavoritesDb
        ? databases.find(d => d.name === activeFavoritesDb)
        : null;

    if (favDb && favDb.entries.length > 0) {
        chrome.contextMenus.create({
            id:       'favsRoot',
            parentId: 'viewTextRoot',
            title:    `⭐ Favorites — ${DwarfSecurity.sanitizeDbName(favDb.name)}`,
            contexts: ['page']
        });

        const limit = Math.min(favDb.entries.length, 15);
        for (let i = 0; i < limit; i++) {
            const entry   = favDb.entries[i];
            // Primera línea como snippet (sin \n para el título del menú)
            const snippet = entry.text.split('\n')[0].substring(0, 40);
            const ellipsis = entry.text.length > 40 ? '...' : '';
            chrome.contextMenus.create({
                id:       `fav::${favDb.name}::${i}`,
                parentId: 'favsRoot',
                title:    `${i + 1}: ${snippet}${ellipsis}`,
                contexts: ['page']
            });
        }
    }

    // ── 2b. 🔗 Links — abre URL directamente en nueva pestaña ───────────────
    // Muestra los ítems de la BD activa. Al hacer clic, abre entry.url
    // en una nueva pestaña sin abrir el popup (link::DBName::index).
    const linkDb = activeLinksDb
        ? databases.find(d => d.name === activeLinksDb)
        : null;

    if (linkDb && linkDb.entries.length > 0) {
        chrome.contextMenus.create({
            id:       'linksRoot',
            parentId: 'viewTextRoot',
            title:    `🔗 Links — ${DwarfSecurity.sanitizeDbName(linkDb.name)}`,
            contexts: ['page']
        });

        const limit = Math.min(linkDb.entries.length, 15);
        for (let i = 0; i < limit; i++) {
            const entry    = linkDb.entries[i];
            const hostname = getHostname(entry.url);
            // Usar el texto guardado como etiqueta; si no hay texto, usar el hostname
            const label = (entry.text.split('\n')[0] || hostname || `Link ${i + 1}`).substring(0, 40);
            // Sin link → mismo marcador que la vista corporate.
            const tail = hostname ? '' : '  ⛓ Unchained';
            chrome.contextMenus.create({
                id:       `link::${linkDb.name}::${i}`,
                parentId: 'linksRoot',
                title:    `${i + 1}: ${label}${tail}`,
                contexts: ['page']
            });
        }
    }
    // Separador entre Set Active Vault / Quick Access y el Vault completo
    chrome.contextMenus.create({
        id:       'quickAccessSep',
        parentId: 'viewTextRoot',
        type:     'separator',
        contexts: ['page']
    });
    // ── 2c. ⚙️ Set Active Vault — cambiar Favorites/Links desde el menú ────
    // NUEVO: Submenú que lista todas las BD disponibles para que el usuario
    // pueda cambiar la tabla activa de Favorites y Links sin abrir el popup.
    // Al seleccionar una tabla, se actualizan AMBOS (activeFavoritesDb y
    // activeLinksDb) en chrome.storage.local y se reconstruye el menú.
    chrome.contextMenus.create({
        id:       'setActiveRoot',
        parentId: 'viewTextRoot',
        title:    '⚙️ Set Active Vault',
        contexts: ['page']
    });

    // Opción para desactivar Quick Access (ninguna tabla activa)
    const noneActive = !activeFavoritesDb && !activeLinksDb;
    chrome.contextMenus.create({
        id:       'setActive::(None)',
        parentId: 'setActiveRoot',
        title:    `${noneActive ? '✓ ' : ''}(None) — Disable Quick Access`,
        contexts: ['page']
    });

    // Listar todas las BD con jerarquía, marcando la activa con ✓
    parentDatabases.forEach((dbItem, i) => {
        const isActive = dbItem.name === activeFavoritesDb;
        chrome.contextMenus.create({
            id:       `setActive::${dbItem.name}`,
            parentId: 'setActiveRoot',
            title:    `${isActive ? '✓ ' : ''}${i + 1}. ${DwarfSecurity.sanitizeDbName(dbItem.name)} (${dbItem.entries.length})`,
            contexts: ['page']
        });

        // Hijas de este padre
        const children = childDatabases.filter(c => c.parentDatabase === dbItem.name);
        children.forEach(childDb => {
            const isChildActive = childDb.name === activeFavoritesDb;
            chrome.contextMenus.create({
                id:       `setActive::${childDb.name}`,
                parentId: 'setActiveRoot',
                title:    `${isChildActive ? '✓ ' : ''}  ↳ ${DwarfSecurity.sanitizeDbName(childDb.name)} (${childDb.entries.length})`,
                contexts: ['page']
            });
        });
    });



    // ── 2d. 📂 Vault — estructura completa (acceso avanzado) ─────────────────
    // Mismo comportamiento que antes: abre el popup con los datos de la entrada.
    chrome.contextMenus.create({
        id:       'vaultSection',
        parentId: 'viewTextRoot',
        title:    '📂 Vault',
        contexts: ['page']
    });

    parentDatabases.forEach((dbItem, i) => {
        const children  = childDatabases.filter(c => c.parentDatabase === dbItem.name);
        const dbIcon    = children.length > 0 ? '🗃️' : '📂';
        const childInfo = children.length > 0 ? ` [${children.length} sub-DB]` : '';

        chrome.contextMenus.create({
            id:       `viewParent::${dbItem.name}`,
            parentId: 'vaultSection',
            title:    `${i + 1}. ${dbIcon} ${DwarfSecurity.sanitizeDbName(dbItem.name)}${childInfo}`,
            contexts: ['page']
        });

        dbItem.entries.forEach((entry, idx) => {
            chrome.contextMenus.create({
                id:       `copy::${dbItem.name}::${idx}`,
                parentId: `viewParent::${dbItem.name}`,
                title:    buildEntryTitle(entry, idx),
                contexts: ['page']
            });
        });

        if (dbItem.entries.length > 0 && children.length > 0) {
            chrome.contextMenus.create({
                id:       `sep::${dbItem.name}`,
                parentId: `viewParent::${dbItem.name}`,
                type:     'separator',
                contexts: ['page']
            });
        }

        children.forEach(childDb => {
            chrome.contextMenus.create({
                id:       `viewChild::${childDb.name}`,
                parentId: `viewParent::${dbItem.name}`,
                title:    `📦↳ ${DwarfSecurity.sanitizeDbName(childDb.name)} (${childDb.entries.length} items)`,
                contexts: ['page']
            });

            childDb.entries.forEach((entry, idx) => {
                chrome.contextMenus.create({
                    id:       `copy::${childDb.name}::${idx}`,
                    parentId: `viewChild::${childDb.name}`,
                    title:    buildEntryTitle(entry, idx),
                    contexts: ['page']
                });
            });
        });
    });
}

// ── Portapapeles ──────────────────────────────────────────────────────────────

const OFFSCREEN_DOCUMENT_PATH = 'src/pages/offscreen.html';

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
 * Copia texto al portapapeles.
 *
 * ORDEN DE INTENTOS:
 *  1. Documento offscreen → execCommand('copy') sobre un textarea propio.
 *     Fiable: la página de la extensión sí puede enfocar su textarea, y
 *     funciona incluso en pestañas donde no se puede inyectar script
 *     (chrome://, Chrome Web Store, PDFs, about:blank).
 *  2. Inyección en la pestaña activa. Solo como respaldo para Chrome < 109;
 *     falla si el documento de la página no está enfocado, que es lo habitual
 *     tras un clic en el menú contextual.
 *
 * @param {string} text
 * @param {number} [tabId]
 * @returns {Promise<boolean>} true solo si el texto llegó al portapapeles.
 */
async function copyTextToClipboard(text, tabId) {
    if (typeof text !== 'string' || text.length === 0) return false;

    if (await ensureOffscreenDocument()) {
        try {
            const response = await chrome.runtime.sendMessage({
                target: 'dwarf-offscreen',
                action: 'copyToClipboard',
                text
            });
            if (response?.ok) return true;
        } catch (error) {
            console.warn('[DwarfVault] Copia vía offscreen falló:', error?.message);
        }
    }

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
 * @param {number} tabId
 * @returns {Promise<string>} - Texto con saltos de línea originales, o '' si falla.
 */
async function getSelectionFromTab(tabId) {
    try {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            // Esta función se ejecuta dentro de la página, no en el SW.
            func: () => window.getSelection()?.toString() ?? ''
        });
        return result ?? '';
    } catch {
        // Páginas restringidas (chrome://, extensiones, PDFs, etc.)
        return '';
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const { menuItemId, selectionText } = info;

    // Guardar texto seleccionado en una BD
    if (menuItemId.startsWith('save::') && selectionText?.trim()) {
        const dbName = menuItemId.slice('save::'.length);

        // Obtener el texto con formato original (saltos de línea, espacios).
        // getSelectionFromTab() usa executeScript que corre en la pestaña ahora mismo,
        // cuando la selección sigue activa. Es la única forma fiable de capturar \n.
        const captured = await getSelectionFromTab(tab.id);

        // Si executeScript no pudo ejecutarse (página restringida), caer en
        // info.selectionText como último recurso (sin saltos de línea).
        const textToSave = captured.trim() || selectionText.trim();

        openDatabase().then(db =>
            saveTextToDatabase(db, dbName, textToSave, tab.url, tab.favIconUrl)
        );
        return;
    }

    // ── ⭐ Favorites — copia el texto directamente al portapapeles ────────────
    // No abre el popup. La copia la hace copyTextToClipboard() a través del
    // documento offscreen (ver arriba), porque tras el clic en el menú
    // contextual la página no está enfocada y no puede copiar.
    if (menuItemId.startsWith('fav::')) {
        const withoutPrefix = menuItemId.slice('fav::'.length);
        const lastSep       = withoutPrefix.lastIndexOf('::');
        const dbName        = withoutPrefix.slice(0, lastSep);
        const entryIndex    = parseInt(withoutPrefix.slice(lastSep + 2), 10);

        // Si la caché está vacía (Service Worker dormido y recién reactivado),
        // recargarla desde IndexedDB antes de ejecutar la acción.
        let dbItem = dbItems.find(d => d.name === dbName);
        if (!dbItem) {
            await loadDatabases();
            dbItem = dbItems.find(d => d.name === dbName);
        }
        if (!dbItem || entryIndex < 0 || entryIndex >= dbItem.entries.length) return;

        const textToCopy = dbItem.entries[entryIndex].text;
        const copied     = await copyTextToClipboard(textToCopy, tab?.id);

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

    // ── 🔗 Links — abre la URL en una nueva pestaña ───────────────────────────
    // No abre el popup. Usa chrome.tabs.create con la URL guardada en la entrada.
    if (menuItemId.startsWith('link::')) {
        const withoutPrefix = menuItemId.slice('link::'.length);
        const lastSep       = withoutPrefix.lastIndexOf('::');
        const dbName        = withoutPrefix.slice(0, lastSep);
        const entryIndex    = parseInt(withoutPrefix.slice(lastSep + 2), 10);

        // Si la caché está vacía (Service Worker dormido y recién reactivado),
        // recargarla desde IndexedDB antes de ejecutar la acción.
        let dbItem = dbItems.find(d => d.name === dbName);
        if (!dbItem) {
            await loadDatabases();
            dbItem = dbItems.find(d => d.name === dbName);
        }
        if (!dbItem || entryIndex < 0 || entryIndex >= dbItem.entries.length) return;

        // Validar esquema: solo http(s). Bloquea javascript:/data:/file:
        // si la URL vino de un CSV/JSON importado sin validar en versiones previas.
        const url = DwarfSecurity.safeUrlOrEmpty(dbItem.entries[entryIndex].url);
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

    // ── ⚙️ Set Active Vault — cambiar la tabla activa desde el menú ────────
    // NUEVO: Al hacer clic en un ítem del submenú "Set Active Vault",
    // se actualizan AMBOS selectores (Favorites y Links) en chrome.storage.local
    // y se reconstruye el menú contextual para reflejar el cambio.
    if (menuItemId.startsWith('setActive::')) {
        const selectedDb = menuItemId.slice('setActive::'.length);
        // Si eligió "(None)", desactivar ambos; si no, activar la BD elegida
        const newValue = selectedDb === '(None)' ? null : selectedDb;

        await chrome.storage.local.set({
            activeFavoritesDb: newValue,
            activeLinksDb:     newValue
        });

        // Reconstruir menú para mostrar el ✓ actualizado y las nuevas entradas
        await loadDatabases();

        // Notificación de confirmación
        DwarfNotify.send({
            type:    'basic',
            iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
            title:   '⚙️ Active Vault Changed',
            message: newValue
                ? `"${newValue}" is now your active Favorites & Links vault.`
                : 'Quick Access disabled. No active vault selected.'
        });
        return;
    }

    // Abrir popup con la entrada seleccionada
    if (menuItemId.startsWith('copy::')) {
        // Formato: "copy::nombreBD::indice"
        // Usamos lastIndexOf para manejar nombres con "::" interno (poco probable
        // pero defensivo).
        const withoutPrefix = menuItemId.slice('copy::'.length);
        const lastSep       = withoutPrefix.lastIndexOf('::');
        const dbName        = withoutPrefix.slice(0, lastSep);
        const entryIndex    = parseInt(withoutPrefix.slice(lastSep + 2), 10);

        const dbItem = dbItems.find(d => d.name === dbName);

        if (dbItem && entryIndex >= 0 && entryIndex < dbItem.entries.length) {
            openPopupWithEntry(dbItem, entryIndex);
        } else {
            // La caché puede estar desactualizada; recargar y reintentar.
            loadDatabases().then(() => {
                const updated = dbItems.find(d => d.name === dbName);
                if (updated && entryIndex < updated.entries.length) {
                    openPopupWithEntry(updated, entryIndex);
                }
            });
        }
    }
});

/**
 * Guarda los datos de una entrada en storage.local y abre el popup.
 *
 * @param {Object} dbItem      - Objeto completo de la base de datos.
 * @param {number} entryIndex  - Índice de la entrada.
 */
function openPopupWithEntry(dbItem, entryIndex) {
    const entry = dbItem.entries[entryIndex];
    chrome.storage.local.set({
        entryIndex,
        selectedText: entry.text,
        selectedURL:  entry.url,
        dbName:       dbItem.name,
        favicon:      entry.favicon,
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
 * @param {IDBDatabase} db
 * @param {string}      dbName
 * @param {string}      text
 * @param {string}      url
 * @param {string}      favicon
 */
async function saveTextToDatabase(db, dbName, text, url, favicon) {
    const transaction = db.transaction('databases', 'readwrite');
    const store       = transaction.objectStore('databases');

    try {
        let dbData = await new Promise((resolve, reject) => {
            const req = store.get(dbName);
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror   = (e) => reject(e.target.error);
        });

        if (!dbData) {
            dbData = { name: dbName, entries: [], parentDatabase: null };
        }

        // Validar URL y favicon antes de persistir. Si algún sitio malicioso
        // intentase inyectar javascript:/data:text/html en tab.url o tab.favIconUrl
        // (improbable pero defensivo), se guarda cadena vacía en su lugar.
        dbData.entries.push({
            text,
            url:     DwarfSecurity.safeUrlOrEmpty(url),
            favicon: DwarfSecurity.safeFaviconOrEmpty(favicon),
            date:    new Date().toISOString()
        });

        await new Promise((resolve, reject) => {
            const req = store.put(dbData);
            req.onsuccess = resolve;
            req.onerror   = (e) => reject(e.target.error);
        });

        DwarfNotify.send({
            type:     'basic',
            iconUrl:  chrome.runtime.getURL('assets/icons/icon48.png'),
            title:    'Saved to DwarfVault',
            message:  `Text saved to "${dbName}".`
        });

        // Actualizar caché y menú
        await loadDatabases();

    } catch (error) {
        console.error('[DwarfVault] Error al guardar el texto:', error);
    }
}

// ── Mensajes desde el popup ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updateContextMenu') {
        loadDatabases();
    }
});

// ── Comando de teclado ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
    if (command === 'open-extension') {
        chrome.action.openPopup().catch((err) => {
            console.debug('[DwarfVault] openPopup rejected:', err?.message);
        });
    }
});