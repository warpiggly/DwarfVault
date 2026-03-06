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
 * Secciones:
 *   1. "Save to Vault"  → aparece al seleccionar texto (contexts: selection).
 *   2. "View Saved Data" → aparece en cualquier página (contexts: page).
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

        // Sub-items: bases de datos hijas bajo el padre
        children.forEach(childDb => {
            chrome.contextMenus.create({
                id:       `save::${childDb.name}`,
                parentId: `save::${dbItem.name}`,
                title:    `↳ ${childDb.name} — ${childDb.entries.length} item(s) 🗂️`,
                contexts: ['selection']
            });
        });
    });

    // ── 2. Menú VER / COPIAR datos guardados ─────────────────────────────────
    chrome.contextMenus.create({
        id:       'viewTextRoot',
        title:    '👁️ View Saved Data 🏰',
        contexts: ['page']
    });

    parentDatabases.forEach((dbItem, i) => {
        const children = childDatabases.filter(c => c.parentDatabase === dbItem.name);

        // 📂 si tiene bases de datos hijas (es padre real)
        // 🗃️ si es una base de datos independiente sin hijos
        const dbIcon    = children.length > 0 ? '🗃️' : '📂';
        const childInfo = children.length > 0 ? ` [${children.length} sub-DB]` : '';

        chrome.contextMenus.create({
            id:       `viewParent::${dbItem.name}`,
            parentId: 'viewTextRoot',
            title:    `${i + 1}. ${dbIcon} ${dbItem.name}${childInfo}`,
            contexts: ['page']
        });

        // Entradas propias del padre
        dbItem.entries.forEach((entry, idx) => {
            chrome.contextMenus.create({
                id:       `copy::${dbItem.name}::${idx}`,
                parentId: `viewParent::${dbItem.name}`,
                title:    buildEntryTitle(entry, idx),
                contexts: ['page']
            });
        });

        // Separador si el padre tiene entradas propias Y tiene hijas
        if (dbItem.entries.length > 0 && children.length > 0) {
            chrome.contextMenus.create({
                id:       `sep::${dbItem.name}`,
                parentId: `viewParent::${dbItem.name}`,
                type:     'separator',
                contexts: ['page']
            });
        }

        // Bases de datos hijas y sus entradas
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
    const { menuItemId, selectionText } = info;

    // Guardar texto seleccionado en una BD
    if (menuItemId.startsWith('save::') && selectionText?.trim()) {
        const dbName = menuItemId.slice('save::'.length);
        openDatabase().then(db =>
            saveTextToDatabase(db, dbName, selectionText.trim(), tab.url, tab.favIconUrl)
        );
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
