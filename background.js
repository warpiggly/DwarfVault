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
    return `📜 ${idx + 1}: ${source}${snippet}${ellipsis}`;
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

        chrome.contextMenus.create({
            id:       `save::${dbItem.name}`,
            parentId: 'saveTextRoot',
            title:    `${i + 1}. ${dbItem.name} — ${dbItem.entries.length} item(s)${childInfo} 🗂️`,
            contexts: ['selection']
        });

        children.forEach(childDb => {
            chrome.contextMenus.create({
                id:       `save::${childDb.name}`,
                parentId: `save::${dbItem.name}`,
                title:    `↳ ${childDb.name} — ${childDb.entries.length} item(s) 🗂️`,
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
            title:    `⭐ Favorites — ${favDb.name}`,
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
            title:    `🔗 Links — ${linkDb.name}`,
            contexts: ['page']
        });

        const limit = Math.min(linkDb.entries.length, 15);
        for (let i = 0; i < limit; i++) {
            const entry    = linkDb.entries[i];
            const hostname = getHostname(entry.url);
            // Usar el texto guardado como etiqueta; si no hay texto, usar el hostname
            const label = (entry.text.split('\n')[0] || hostname || `Link ${i + 1}`).substring(0, 40);
            chrome.contextMenus.create({
                id:       `link::${linkDb.name}::${i}`,
                parentId: 'linksRoot',
                title:    `${i + 1}: ${label}`,
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
            title:    `${isActive ? '✓ ' : ''}${i + 1}. ${dbItem.name} (${dbItem.entries.length})`,
            contexts: ['page']
        });

        // Hijas de este padre
        const children = childDatabases.filter(c => c.parentDatabase === dbItem.name);
        children.forEach(childDb => {
            const isChildActive = childDb.name === activeFavoritesDb;
            chrome.contextMenus.create({
                id:       `setActive::${childDb.name}`,
                parentId: 'setActiveRoot',
                title:    `${isChildActive ? '✓ ' : ''}  ↳ ${childDb.name} (${childDb.entries.length})`,
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
            title:    `${i + 1}. ${dbIcon} ${dbItem.name}${childInfo}`,
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
                title:    `📦↳ ${childDb.name} (${childDb.entries.length} items)`,
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
    // No abre el popup. El texto se copia en la pestaña activa mediante
    // executeScript, que hereda el gesto de usuario del clic de menú contextual.
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

        try {
            // Inyectar la copia en la pestaña activa.
            //
            // MÉTODO PRIMARIO: document.execCommand('copy')
            //   - Síncrono, no requiere permisos de clipboard en la página.
            //   - Funciona siempre que el tab sea el activo (lo es: el usuario
            //     acaba de hacer clic derecho en él).
            //
            // MÉTODO SECUNDARIO: navigator.clipboard.writeText()
            //   - Solo se intenta si execCommand devuelve false.
            //   - Requiere HTTPS + clipboard-write en la página → intermitente.
            //   - Se dispara sin await para no bloquear si falla silenciosamente.
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (text) => {
                    // Crear un textarea invisible, seleccionar el texto y copiar
                    const el = document.createElement('textarea');
                    el.value = text;
                    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
                    document.body.appendChild(el);
                    el.focus();
                    el.select();
                    const ok = document.execCommand('copy'); // eslint-disable-line
                    document.body.removeChild(el);

                    // Si execCommand falló (algunos iframes restringidos), intentar
                    // clipboard API sin bloquear — la promesa corre en segundo plano.
                    if (!ok && navigator.clipboard) {
                        navigator.clipboard.writeText(text).catch(() => {});
                    }
                    return ok;
                },
                args: [textToCopy]
            });
        } catch {
            // La pestaña no acepta scripts (chrome://, extensiones, PDFs, etc.)
        }

        // Notificación de confirmación visible al usuario
        const preview = textToCopy.split('\n')[0].substring(0, 60);
        chrome.notifications.create({
            type:    'basic',
            iconUrl: 'icons/icon48.png',
            title:   '⭐ Copiado al portapapeles',
            message: preview + (textToCopy.length > 60 ? '...' : '')
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

        const url = dbItem.entries[entryIndex].url;
        if (url) chrome.tabs.create({ url });
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
        chrome.notifications.create({
            type:    'basic',
            iconUrl: 'icons/icon48.png',
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
        favicon:      entry.favicon
    }, () => {
        chrome.action.openPopup();
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

        dbData.entries.push({
            text,
            url,
            favicon,
            date: new Date().toISOString()
        });

        await new Promise((resolve, reject) => {
            const req = store.put(dbData);
            req.onsuccess = resolve;
            req.onerror   = (e) => reject(e.target.error);
        });

        chrome.notifications.create({
            type:     'basic',
            iconUrl:  'icons/icon48.png',
            title:    'Guardado en DwarfVault',
            message:  `Texto guardado en "${dbName}".`
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
        chrome.action.openPopup();
    }
});