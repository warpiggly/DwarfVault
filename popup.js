/**
 * DwarfVault - Popup Script
 *
 * Gestiona la interfaz principal:
 *  - Panel de entrada seleccionada (desde menú contextual).
 *  - Selector y CRUD de bases de datos (FORGE).
 *  - Lista de entradas con búsqueda en tiempo real (RELICS).
 *  - Importación/exportación CSV y JSON.
 *  - Selector de emojis.
 *
 * Depende de scripts/db.js para openDatabase().
 */

document.addEventListener('DOMContentLoaded', () => {

    // Cargar el selector de bases de datos al abrir el popup
    openDatabase(loadDatabases);

    // ── Panel de entrada seleccionada ────────────────────────────────────────

    // Mostrar la última entrada guardada desde el menú contextual
    chrome.storage.local.get(
        ['entryIndex', 'selectedText', 'selectedURL', 'dbName', 'favicon'],
        (result) => { if (result.selectedText) updateSelectedEntryPanel(result); }
    );

    // Actualizar el panel si el background abre el popup programáticamente
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'openPopup') {
            chrome.storage.local.get(
                ['entryIndex', 'selectedText', 'selectedURL', 'dbName', 'favicon'],
                (result) => { if (result.selectedText) updateSelectedEntryPanel(result); }
            );
        }
    });

    // Botón "Copy Text" del panel superior
    const copyButton      = document.getElementById('copyButton');
    const entryTextEl     = document.getElementById('entryText');

    if (copyButton && entryTextEl) {
        copyButton.addEventListener('click', () => {
            // Usar el texto original guardado en dataset para preservar saltos de línea
            // y espacios exactos. textContent.trim() los eliminaría.
            const text = entryTextEl.dataset.rawText;
            if (!text || text === 'No text selected yet.') {
                alert('No hay texto para copiar.');
                return;
            }
            navigator.clipboard.writeText(text)
                .then(() => window.close())
                .catch(err => {
                    console.error('[DwarfVault] Error al copiar:', err);
                    alert('Hubo un problema al copiar el texto.');
                });
        });
    }

    // ── FORGE: gestión de bases de datos ────────────────────────────────────

    // Crear BD padre
    document.getElementById('createParentDatabase').addEventListener('click', () => {
        const dbName = prompt('Enter the name of the new PARENT database:');
        if (dbName?.trim()) createDatabase(dbName.trim(), null);
    });

    // Crear BD hija
    document.getElementById('createChildDatabase').addEventListener('click', () => {
        const dbName = prompt('Enter the name of the new database:');
        if (!dbName?.trim()) return;

        const addToParent = confirm(
            `Do you want to add "${dbName}" inside a PARENT database?\n\n` +
            `OK = Yes (choose parent)\nCancel = No (create as independent)`
        );

        if (!addToParent) {
            createDatabase(dbName.trim(), null);
            return;
        }

        openDatabase((db) => {
            const store = db.transaction('databases', 'readonly').objectStore('databases');
            store.getAll().onsuccess = (event) => {
                const parents = event.target.result.filter(d => !d.parentDatabase);
                if (parents.length === 0) {
                    alert('No parent databases available. Creating as independent.');
                    createDatabase(dbName.trim(), null);
                    return;
                }
                const list   = parents.map((d, i) => `${i + 1}. ${d.name}`).join('\n');
                const choice = prompt(`Available parent databases:\n\n${list}\n\nEnter the number:`);
                const idx    = parseInt(choice, 10) - 1;
                if (idx >= 0 && idx < parents.length) {
                    createDatabase(dbName.trim(), parents[idx].name);
                } else {
                    alert('Invalid selection. Creating as independent.');
                    createDatabase(dbName.trim(), null);
                }
            };
        });
    });

    // Cambio de BD en el selector principal → recargar entradas y limpiar búsqueda
    document.getElementById('databaseSelect').addEventListener('change', (e) => {
        document.getElementById('searchBar').value = '';
        loadEntries(e.target.value);
    });

    // ── Quick Access: selección de BD activa para Favorites y Links ──────────

    const linkBtn          = document.getElementById('linkQuickAccess');
    const favSelect        = document.getElementById('favoritesDbSelect');
    const linksSelect      = document.getElementById('linksDbSelect');

    // Restaurar el estado del botón de enlace al abrir el popup
    chrome.storage.local.get('quickAccessLinked', ({ quickAccessLinked }) => {
        setLinkButtonState(linkBtn, !!quickAccessLinked);
    });

    // Toggle del botón ⛓ LINK — activa/desactiva la sincronización
    linkBtn.addEventListener('click', () => {
        chrome.storage.local.get('quickAccessLinked', ({ quickAccessLinked }) => {
            const newLinked = !quickAccessLinked;
            chrome.storage.local.set({ quickAccessLinked: newLinked }, () => {
                setLinkButtonState(linkBtn, newLinked);

                // Al activar el enlace, sincroniza Links con el valor actual de Favorites
                if (newLinked) {
                    const favValue = favSelect.value;
                    linksSelect.value = favValue;
                    chrome.storage.local.set({ activeLinksDb: favValue || null }, () => {
                        chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                    });
                }
            });
        });
    });

    // Cambio de ⭐ Favorites — si está vinculado, arrastra a Links también
    favSelect.addEventListener('change', (e) => {
        const value = e.target.value || null;
        chrome.storage.local.get('quickAccessLinked', ({ quickAccessLinked }) => {
            const updates = { activeFavoritesDb: value };
            if (quickAccessLinked) {
                updates.activeLinksDb = value;
                linksSelect.value = e.target.value;
            }
            chrome.storage.local.set(updates, () => {
                chrome.runtime.sendMessage({ action: 'updateContextMenu' });
            });
        });
    });

    // Cambio de 🔗 Links — si está vinculado, arrastra a Favorites también
    linksSelect.addEventListener('change', (e) => {
        const value = e.target.value || null;
        chrome.storage.local.get('quickAccessLinked', ({ quickAccessLinked }) => {
            const updates = { activeLinksDb: value };
            if (quickAccessLinked) {
                updates.activeFavoritesDb = value;
                favSelect.value = e.target.value;
            }
            chrome.storage.local.set(updates, () => {
                chrome.runtime.sendMessage({ action: 'updateContextMenu' });
            });
        });
    });

    // Renombrar BD seleccionada
    document.getElementById('editDatabase').addEventListener('click', () => {
        const select  = document.getElementById('databaseSelect');
        const oldName = select.value;
        if (!oldName) return;
        const newName = prompt('Enter the new database name:', oldName);
        if (newName?.trim() && newName.trim() !== oldName) {
            editDatabase(oldName, newName.trim());
        }
    });

    // Eliminar BD seleccionada (y sus hijas)
    document.getElementById('deleteDatabase').addEventListener('click', () => {
        const dbName = document.getElementById('databaseSelect').value;
        if (!dbName) return;

        openDatabase((db) => {
            const store = db.transaction('databases', 'readonly').objectStore('databases');
            store.getAll().onsuccess = (event) => {
                const children = event.target.result.filter(d => d.parentDatabase === dbName);
                let msg = `Are you sure you want to delete "${dbName}" and all its entries?`;
                if (children.length > 0) {
                    msg += `\n\nWARNING: ${children.length} child database(s) will also be deleted:\n`;
                    msg += children.map(c => `- ${c.name}`).join('\n');
                }
                if (confirm(msg)) deleteDatabase(dbName);
            };
        });
    });

    // ── Exportar / Importar ──────────────────────────────────────────────────

    document.getElementById('export-csv').addEventListener('click', exportDataAsCSV);
    document.getElementById('export-parent').addEventListener('click', exportParentDatabase);

    // Importar CSV (base de datos individual)
    document.getElementById('importDatabase').addEventListener('click', () => {
        document.getElementById('importCSV').click();
    });
    document.getElementById('importCSV').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => processCSV(e.target.result, file.name.replace(/\.csv$/i, ''));
        reader.readAsText(file);
        event.target.value = ''; // permitir reimportar el mismo archivo
    });

    // Importar JSON (padre + hijas)
    document.getElementById('importParent').addEventListener('click', () => {
        document.getElementById('importParentFile').click();
    });
    document.getElementById('importParentFile').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                importParentDatabase(JSON.parse(e.target.result));
            } catch {
                alert('Error reading file: Invalid JSON format.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    });

    // ── RELICS: búsqueda en tiempo real ──────────────────────────────────────

    document.getElementById('searchBar').addEventListener('input', (e) => {
        const query  = e.target.value.toLowerCase().trim();
        const dbName = document.getElementById('databaseSelect').value;
        if (!dbName) return;

        if (!query) {
            loadEntries(dbName);
            return;
        }

        openDatabase((db) => {
            const store = db.transaction('databases', 'readonly').objectStore('databases');
            store.get(dbName).onsuccess = (event) => {
                const dbData = event.target.result;
                if (!dbData?.entries) return;

                const filtered = dbData.entries
                    .map((entry, i) => ({ entry, originalIndex: i }))
                    .filter(({ entry, originalIndex }) =>
                        entry.text.toLowerCase().includes(query) ||
                        String(originalIndex + 1).includes(query)
                    );
                renderEntries(dbName, filtered);
            };
        });
    });

    // ── Selector de emojis ───────────────────────────────────────────────────

    fetch(chrome.runtime.getURL('emojis.json'))
        .then(r => r.json())
        .then(emojis => {
            const emojiList = document.getElementById('emojiList');
            const feedback  = document.getElementById('emojiCopyFeedback');

            emojis.forEach(emoji => {
                const span    = document.createElement('span');
                span.textContent = emoji;
                span.className   = 'emoji-item';
                span.title       = 'Click to copy';
                span.addEventListener('click', () => {
                    navigator.clipboard.writeText(emoji).then(() => {
                        feedback.style.display = 'block';
                        setTimeout(() => { feedback.style.display = 'none'; }, 1000);
                    });
                });
                emojiList.appendChild(span);
            });
        })
        .catch(err => console.error('[DwarfVault] Error al cargar emojis:', err));

}); // fin DOMContentLoaded

// ── Panel de entrada seleccionada ────────────────────────────────────────────

/**
 * Rellena el panel superior con los datos de la última entrada copiada
 * desde el menú contextual.
 *
 * @param {Object} result - Objeto con { entryIndex, selectedText, selectedURL, dbName, favicon }
 */
function updateSelectedEntryPanel(result) {
    document.getElementById('entryIndex').textContent =
        `INDEX: ${parseInt(result.entryIndex, 10) + 1}`;
    document.getElementById('dbName').textContent =
        `Database: ${result.dbName}`;
    // Guardar el texto original en dataset.rawText para que el botón "Copy Text"
    // copie exactamente lo guardado (con saltos de línea, espacios, etc.).
    // textContent lo renderiza visualmente gracias a white-space:pre-wrap en CSS.
    const entryTextEl2 = document.getElementById('entryText');
    entryTextEl2.textContent    = result.selectedText;
    entryTextEl2.dataset.rawText = result.selectedText;

    // Texto corto → centrado; texto largo/multilínea → izquierda.
    const txt = result.selectedText || '';
    const isShort = txt.length <= 80 && !txt.includes('\n');
    entryTextEl2.style.textAlign = isShort ? 'center' : 'left';

    // Favicon
    const faviconImg = document.getElementById('faviconImg');
    if (faviconImg) {
        faviconImg.src          = result.favicon || '';
        faviconImg.style.display = result.favicon ? 'inline-block' : 'none';
    }

    // Enlace — construido con DOM (sin innerHTML) para prevenir XSS
    const entryUrlEl = document.getElementById('entryUrl');
    entryUrlEl.innerHTML = '';
    if (result.selectedURL) {
        const link       = document.createElement('a');
        link.href        = result.selectedURL;
        link.target      = '_blank';
        link.rel         = 'noopener noreferrer';
        link.textContent = 'Open Link';
        entryUrlEl.appendChild(link);
    } else {
        entryUrlEl.textContent = 'No link available';
    }
}

// ── CRUD de bases de datos ────────────────────────────────────────────────────

/**
 * Crea una nueva base de datos.
 *
 * @param {string}      dbName         - Nombre de la nueva BD.
 * @param {string|null} parentDatabase - Nombre del padre, o null.
 */
function createDatabase(dbName, parentDatabase = null) {
    openDatabase((db) => {
        const store = db.transaction('databases', 'readwrite').objectStore('databases');
        store.get(dbName).onsuccess = (event) => {
            if (event.target.result) {
                alert('A database with this name already exists.');
                return;
            }
            const newDb = { name: dbName, entries: [], parentDatabase };
            store.add(newDb).onsuccess = () => {
                openDatabase(loadDatabases);
                chrome.runtime.sendMessage({ action: 'updateContextMenu' });
            };
        };
    });
}

/**
 * Carga todas las bases de datos y actualiza:
 *  - El selector principal (DWARF CHAMBER)
 *  - Los selectores de Quick Access (⭐ Favorites y 🔗 Links)
 *
 * @param {IDBDatabase} db
 */
function loadDatabases(db) {
    const store = db.transaction('databases', 'readonly').objectStore('databases');
    store.getAll().onsuccess = (event) => {
        const databases = event.target.result;

        // ── Selector principal (DWARF CHAMBER) ───────────────────────────────
        const select = document.getElementById('databaseSelect');
        const prev   = select.value;
        select.innerHTML = '';

        const parents  = databases.filter(d => !d.parentDatabase);
        const children = databases.filter(d =>  d.parentDatabase);

        parents.forEach(dbItem => {
            const opt       = document.createElement('option');
            opt.value       = dbItem.name;
            opt.textContent = dbItem.name;
            select.appendChild(opt);

            children
                .filter(c => c.parentDatabase === dbItem.name)
                .forEach(childDb => {
                    const childOpt       = document.createElement('option');
                    childOpt.value       = childDb.name;
                    childOpt.textContent = `  ↳ ${childDb.name}`;
                    select.appendChild(childOpt);
                });
        });

        if (prev && select.querySelector(`option[value="${prev.replace(/"/g, '\\"')}"]`)) {
            select.value = prev;
        } else if (select.options.length > 0) {
            select.value = select.options[0].value;
        }

        if (select.value) loadEntries(select.value);

        // ── Selectores de Quick Access ────────────────────────────────────────
        // Leer la configuración guardada para restaurar la selección activa.
        chrome.storage.local.get(['activeFavoritesDb', 'activeLinksDb'], (settings) => {
            populateQuickAccessSelect('favoritesDbSelect', databases, settings.activeFavoritesDb);
            populateQuickAccessSelect('linksDbSelect',     databases, settings.activeLinksDb);
        });
    };
}

/**
 * Llena un selector de Quick Access con todas las bases de datos disponibles
 * y restaura la selección guardada.
 *
 * @param {string}   selectId    - ID del elemento <select> en el DOM.
 * @param {Array}    databases   - Lista completa de bases de datos.
 * @param {string|null} activeDb - Nombre de la BD actualmente activa (puede ser null).
 */
function populateQuickAccessSelect(selectId, databases, activeDb) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '';

    // Opción vacía — "ninguna"
    const none       = document.createElement('option');
    none.value       = '';
    none.textContent = '(None)';
    select.appendChild(none);

    const parents  = databases.filter(d => !d.parentDatabase);
    const children = databases.filter(d =>  d.parentDatabase);

    parents.forEach(dbItem => {
        const opt       = document.createElement('option');
        opt.value       = dbItem.name;
        opt.textContent = dbItem.name;
        select.appendChild(opt);

        children
            .filter(c => c.parentDatabase === dbItem.name)
            .forEach(childDb => {
                const childOpt       = document.createElement('option');
                childOpt.value       = childDb.name;
                childOpt.textContent = `  ↳ ${childDb.name}`;
                select.appendChild(childOpt);
            });
    });

    // Restaurar la selección activa guardada
    select.value = activeDb || '';
}

/**
 * Carga las entradas de una BD y las muestra en la lista.
 *
 * @param {string} dbName
 */
function loadEntries(dbName) {
    openDatabase((db) => {
        const store = db.transaction('databases', 'readonly').objectStore('databases');
        store.get(dbName).onsuccess = (event) => {
            const dbData  = event.target.result;
            const entries = (dbData?.entries || []).map((entry, i) => ({
                entry,
                originalIndex: i
            }));
            renderEntries(dbName, entries);
        };
    });
}

/**
 * Renderiza en el DOM la lista de entradas recibida.
 * Acepta un subconjunto filtrado para la búsqueda, conservando
 * el índice original (necesario para el botón de borrar).
 *
 * @param {string} dbName
 * @param {Array<{entry: Object, originalIndex: number}>} entries
 */
function renderEntries(dbName, entries) {
    const list = document.getElementById('entriesList');
    list.innerHTML = '';

    if (entries.length === 0) {
        const empty       = document.createElement('li');
        empty.textContent = 'No entries found.';
        empty.style.cssText = 'text-align:center; color:#d4c5a3; list-style:none;';
        list.appendChild(empty);
        return;
    }

    entries.forEach(({ entry, originalIndex }) => {
        const li = document.createElement('li');

        // Contenedor: favicon + texto
        const contentDiv = document.createElement('div');
        contentDiv.className = 'entry-content';

        if (entry.favicon) {
            const favicon    = document.createElement('img');
            favicon.src      = entry.favicon;
            favicon.alt      = '';
            favicon.width    = 16;
            favicon.height   = 16;
            favicon.className = 'entry-favicon';
            contentDiv.appendChild(favicon);
        }

        const textSpan = document.createElement('span');
        // Mostrar solo la primera línea como preview en la lista para no romper el layout.
        // El texto completo (con saltos de línea) vive en entry.text y se copia
        // desde el panel superior al usar el botón "Copy Text".
        const preview        = entry.text.split('\n')[0] || entry.text;
        textSpan.textContent = `${originalIndex + 1}. ${preview}`;
        textSpan.title       = entry.text; // tooltip con el texto completo al hacer hover
        contentDiv.appendChild(textSpan);

        li.appendChild(contentDiv);

        // Botón de borrar
        const deleteBtn       = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className   = 'delete-btn';
        deleteBtn.addEventListener('click', () => deleteEntry(dbName, originalIndex));
        li.appendChild(deleteBtn);

        list.appendChild(li);
    });
}

/**
 * Elimina una entrada específica de una BD.
 *
 * @param {string} dbName
 * @param {number} entryIndex
 */
function deleteEntry(dbName, entryIndex) {
    openDatabase((db) => {
        const store = db.transaction('databases', 'readwrite').objectStore('databases');
        store.get(dbName).onsuccess = (event) => {
            const dbData = event.target.result;
            if (dbData?.entries) {
                dbData.entries.splice(entryIndex, 1);
                store.put(dbData).onsuccess = () => {
                    loadEntries(dbName);
                    chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                };
            }
        };
    });
}

/**
 * Renombra una BD y actualiza las referencias en sus hijas.
 *
 * @param {string} oldName
 * @param {string} newName
 */
function editDatabase(oldName, newName) {
    openDatabase((db) => {
        const store = db.transaction('databases', 'readwrite').objectStore('databases');
        store.get(oldName).onsuccess = (event) => {
            const dbData = event.target.result;
            if (!dbData) return;

            store.getAll().onsuccess = (getAllEvent) => {
                const childDbs = getAllEvent.target.result.filter(d => d.parentDatabase === oldName);
                store.delete(oldName).onsuccess = () => {
                    dbData.name = newName;
                    store.add(dbData).onsuccess = () => {
                        childDbs.forEach(child => {
                            child.parentDatabase = newName;
                            store.put(child);
                        });
                        openDatabase(loadDatabases);
                        chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                    };
                };
            };
        };
    });
}

/**
 * Elimina una BD y todas sus hijas.
 *
 * @param {string} dbName
 */
function deleteDatabase(dbName) {
    openDatabase((db) => {
        const store = db.transaction('databases', 'readwrite').objectStore('databases');
        store.getAll().onsuccess = (event) => {
            const children = event.target.result.filter(d => d.parentDatabase === dbName);
            children.forEach(child => store.delete(child.name));
            store.delete(dbName).onsuccess = () => {
                openDatabase(loadDatabases);
                chrome.runtime.sendMessage({ action: 'updateContextMenu' });
            };
        };
    });
}

// ── Exportar CSV ──────────────────────────────────────────────────────────────

/**
 * Exporta la BD seleccionada como archivo CSV.
 */
function exportDataAsCSV() {
    const dbName = document.getElementById('databaseSelect').value;
    if (!dbName) { alert('Please select a database first.'); return; }

    openDatabase((db) => {
        const store = db.transaction('databases', 'readonly').objectStore('databases');
        store.get(dbName).onsuccess = (event) => {
            const dbData = event.target.result;
            if (!dbData?.entries?.length) {
                alert('No entries to export.');
                return;
            }

            const esc  = (v) => `"${(v || '').replace(/"/g, '""')}"`;
            const rows = ['Index,Text,URL,Favicon'];
            dbData.entries.forEach((entry, i) => {
                rows.push(`${i + 1},${esc(entry.text)},${esc(entry.url)},${esc(entry.favicon)}`);
            });

            downloadBlob(
                new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' }),
                `${dbName}.csv`
            );
        };
    });
}

// ── Exportar JSON (padre + hijas) ─────────────────────────────────────────────

/**
 * Exporta la BD padre seleccionada junto a todas sus hijas en JSON.
 */
function exportParentDatabase() {
    const dbName = document.getElementById('databaseSelect').value;
    if (!dbName) { alert('Please select a database first.'); return; }

    openDatabase((db) => {
        const store = db.transaction('databases', 'readonly').objectStore('databases');
        store.getAll().onsuccess = (event) => {
            const all        = event.target.result;
            const selectedDb = all.find(d => d.name === dbName);

            if (!selectedDb) { alert('Database not found.'); return; }
            if (selectedDb.parentDatabase) {
                alert('Please select a PARENT database.\nThis is a child database.');
                return;
            }

            const childDbs = all.filter(d => d.parentDatabase === dbName);
            const data     = {
                version:         '1.0',
                exportDate:      new Date().toISOString(),
                parentDatabase:  selectedDb,
                childDatabases:  childDbs
            };

            downloadBlob(
                new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
                `${dbName}_complete.json`
            );

            const total = selectedDb.entries.length +
                childDbs.reduce((s, c) => s + c.entries.length, 0);
            alert(
                `✅ Exported!\n\n` +
                `📁 Parent: ${dbName}\n` +
                `📂 Children: ${childDbs.length}\n` +
                `📜 Total entries: ${total}`
            );
        };
    });
}

// ── Importar JSON (padre + hijas) ─────────────────────────────────────────────

/**
 * Importa una estructura padre + hijas desde un archivo JSON exportado
 * por DwarfVault.
 *
 * @param {Object} importData
 */
function importParentDatabase(importData) {
    if (!importData.version || !importData.parentDatabase) {
        alert('Invalid file format. Please select a valid DwarfVault export file.');
        return;
    }

    // Función interna: ejecuta la importación atómica en una transacción.
    const executeImport = (data) => {
        openDatabase((db) => {
            const tx    = db.transaction('databases', 'readwrite');
            const store = tx.objectStore('databases');

            tx.oncomplete = () => {
                const total = data.parentDatabase.entries.length +
                    (data.childDatabases || []).reduce((s, c) => s + c.entries.length, 0);
                alert(
                    `✅ Import successful!\n\n` +
                    `📁 Parent: ${data.parentDatabase.name}\n` +
                    `📂 Children: ${(data.childDatabases || []).length}\n` +
                    `📜 Total entries: ${total}`
                );
                openDatabase(loadDatabases);
                chrome.runtime.sendMessage({ action: 'updateContextMenu' });
            };

            tx.onerror = () => {
                alert('Error importing database. A database with this name may already exist.');
            };

            store.add(data.parentDatabase);
            (data.childDatabases || []).forEach(child => store.add(child));
        });
    };

    // Verificar si ya existe una BD con el mismo nombre
    openDatabase((db) => {
        const store = db.transaction('databases', 'readonly').objectStore('databases');
        store.get(importData.parentDatabase.name).onsuccess = (event) => {

            if (!event.target.result) {
                // No existe → importar directamente
                executeImport(importData);
                return;
            }

            // Ya existe → preguntar al usuario
            const overwrite = confirm(
                `"${importData.parentDatabase.name}" already exists.\n\n` +
                `Do you want to overwrite it? ⚠️ This will delete the existing data.`
            );

            if (overwrite) {
                // Eliminar la BD existente y sus hijas, luego importar
                openDatabase((db2) => {
                    const delTx    = db2.transaction('databases', 'readwrite');
                    const delStore = delTx.objectStore('databases');
                    delStore.getAll().onsuccess = (getAllEvent) => {
                        getAllEvent.target.result
                            .filter(d =>
                                d.name === importData.parentDatabase.name ||
                                d.parentDatabase === importData.parentDatabase.name
                            )
                            .forEach(d => delStore.delete(d.name));
                    };
                    delTx.oncomplete = () => executeImport(importData);
                    delTx.onerror    = () => alert('Error deleting existing database.');
                });
            } else {
                // Renombrar la BD importada
                const newName = prompt(
                    'Enter a new name for the imported database:',
                    importData.parentDatabase.name + '_imported'
                );
                if (!newName?.trim()) { alert('Import cancelled.'); return; }

                const oldName  = importData.parentDatabase.name;
                const trimmed  = newName.trim();
                const renamed  = {
                    ...importData,
                    parentDatabase: { ...importData.parentDatabase, name: trimmed },
                    childDatabases: (importData.childDatabases || []).map(c =>
                        c.parentDatabase === oldName ? { ...c, parentDatabase: trimmed } : c
                    )
                };
                executeImport(renamed);
            }
        };
    });
}

// ── Importar CSV ──────────────────────────────────────────────────────────────

/**
 * Parsea una línea CSV respetando campos entrecomillados y comas internas.
 *
 * @param {string} text
 * @returns {string[]}
 */
function parseCSVLine(text) {
    const result = [];
    let cell     = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            // Comilla doble dentro de un campo entrecomillado → comilla literal
            if (inQuotes && text[i + 1] === '"') { cell += '"'; i++; }
            else                                  { inQuotes = !inQuotes; }
        } else if (char === ',' && !inQuotes) {
            result.push(cell);
            cell = '';
        } else {
            cell += char;
        }
    }
    result.push(cell);
    return result;
}

/**
 * Procesa el contenido de un CSV y crea la BD correspondiente.
 *
 * @param {string} csvData
 * @param {string} dbName  - Nombre derivado del nombre del archivo.
 */
function processCSV(csvData, dbName) {
    const lines = csvData.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { alert('Invalid CSV format.'); return; }

    const entries = [];
    for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length >= 4) {
            entries.push({ text: row[1], url: row[2], favicon: row[3] });
        }
    }
    saveImportedDatabase(dbName, entries);
}

/**
 * Pregunta si la BD importada será hija o independiente y la crea.
 *
 * @param {string} dbName
 * @param {Array}  entries
 */
function saveImportedDatabase(dbName, entries) {
    const addToParent = confirm(
        `Do you want to add "${dbName}" as a CHILD inside a parent?\n\n` +
        `OK = Yes (choose parent)\nCancel = No (independent)`
    );

    if (!addToParent) {
        createImportedDatabase(dbName, entries, null);
        return;
    }

    openDatabase((db) => {
        const store = db.transaction('databases', 'readonly').objectStore('databases');
        store.getAll().onsuccess = (event) => {
            const parents = event.target.result.filter(d => !d.parentDatabase);
            if (parents.length === 0) {
                alert('No parent databases available. Creating as parent.');
                createImportedDatabase(dbName, entries, null);
                return;
            }
            const list   = parents.map((d, i) => `${i + 1}. ${d.name}`).join('\n');
            const choice = prompt(`Available parents:\n\n${list}\n\nEnter number:`);
            const idx    = parseInt(choice, 10) - 1;
            if (idx >= 0 && idx < parents.length) {
                createImportedDatabase(dbName, entries, parents[idx].name);
            } else {
                alert('Invalid selection. Creating as parent.');
                createImportedDatabase(dbName, entries, null);
            }
        };
    });
}

/**
 * Crea la BD importada en IndexedDB.
 *
 * @param {string}      dbName
 * @param {Array}       entries
 * @param {string|null} parentDatabase
 */
function createImportedDatabase(dbName, entries, parentDatabase) {
    openDatabase((db) => {
        const store  = db.transaction('databases', 'readwrite').objectStore('databases');
        const addReq = store.add({ name: dbName, entries, parentDatabase });

        addReq.onsuccess = () => {
            openDatabase(loadDatabases);
            chrome.runtime.sendMessage({ action: 'updateContextMenu' });
            const type = parentDatabase ? `child of "${parentDatabase}"` : 'parent database';
            alert(`✅ "${dbName}" imported successfully as ${type}.`);
        };

        addReq.onerror = () => {
            alert(
                `A database named "${dbName}" already exists.\n` +
                `Please rename the file and try again.`
            );
        };
    });
}

// ── Utilidades ────────────────────────────────────────────────────────────────

/**
 * Actualiza el aspecto visual del botón ⛓ LINK según si está activo o no.
 * Activo  → verde + texto "LINKED ✓"
 * Inactivo → marrón base + texto "LINK"
 *
 * @param {HTMLElement} btn
 * @param {boolean}     linked
 */
function setLinkButtonState(btn, linked) {
    if (linked) {
        btn.classList.add('link-btn-active');
        btn.textContent = '⛓️ LINKED ✓ — Favorites & Links in sync';
    } else {
        btn.classList.remove('link-btn-active');
        btn.textContent = '⛓️ LINK — Sync Favorites & Links';
    }
}

/**
 * Descarga un Blob como archivo en el navegador.
 *
 * @param {Blob}   blob
 * @param {string} filename
 */
function downloadBlob(blob, filename) {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
