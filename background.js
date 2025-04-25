// Inicializar la extensión al ser instalada o actualizada
chrome.runtime.onInstalled.addListener(() => {
    loadDatabases(); // Cargar las bases de datos al instalar
    startDatabaseCheckAndOverwrite(); // Iniciar la verificación y sobrescritura cada 10 segundos
});

// Cargar las bases de datos desde IndexedDB
let dbItems = []; // Variable global para almacenar los elementos de la base de datos


async function loadDatabases() {
    const db = await openDatabase();
    await createContextMenu(db);
}


// Abrir la base de datos y crear almacenes si es necesario
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('Dott-yDB', 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('databases')) {
                db.createObjectStore('databases', { keyPath: 'name' });
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            reject('Error al abrir la base de datos: ' + event.target.error);
        };
    });
}

// Crear el menú contextual dinámico en base a las bases de datos
async function createContextMenu(db) {
    await chrome.contextMenus.removeAll();

    chrome.contextMenus.create({
        id: "saveTextRoot",
        title: "--📥Save to Vault 🏰--",
        contexts: ["selection"]
    });

    const transaction = db.transaction('databases', 'readonly');
    const store = transaction.objectStore('databases');

    try {
        const databases = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });

        // Añadir un log para verificar los nombres de las bases de datos
        console.log('Bases de datos encontradas:', databases); 

        // IMPORTANT: Update the global dbItems array
        dbItems = databases; // Almacena las bases de datos en la variable global

        // Reinicia el contador cada vez que se llama a esta función
        let counter = 1;

        for (const dbItem of databases) {
            const entryCount = dbItem.entries.length;

            // Imprimir el nombre de la base de datos para depuración
            console.log(`Base de datos: ${dbItem.name}, Número de entradas: ${entryCount}`);

            
            chrome.contextMenus.create({
                id: `saveText_${dbItem.name}`,
                parentId: "saveTextRoot",
                title: `${counter}. ${dbItem.name} - ${entryCount} Item(s) 🗂️`,
                contexts: ["selection"]
            });
            

            chrome.contextMenus.create({
                id: `viewText_${dbItem.name}`,
                title: `👁️ View DB : ${dbItem.name}`,
                contexts: ["all"]
            });

            dbItem.entries.forEach((entry, index) => {
                chrome.contextMenus.create({
                    id: `copyText_${dbItem.name}_${index}`,
                    parentId: `viewText_${dbItem.name}`,
                    title: `📜-${index + 1}: ${entry.text.substring(0, 30)}...`,
                    contexts: ["all"]
                });
            });
          counter++;  
        }
        
    } catch (error) {
        console.error('Error al crear el menú contextual:', error);
    }
}


// Manejar clics en el menú contextual
chrome.contextMenus.onClicked.addListener((info, tab) => {
    // Log para depuración - identificar qué menú item fue clickeado
    console.log("Menú item clickeado:", info.menuItemId);
    
    // Si la acción es "guardar texto" y hay texto seleccionado
    if (info.menuItemId.startsWith("saveText_") && info.selectionText && info.selectionText.trim()) {
        const dbName = info.menuItemId.split("_")[1];
        console.log(`Guardando texto en la base de datos: ${dbName}`);
        
        openDatabase().then(db => {
            saveTextToDatabase(db, dbName, info.selectionText, tab.url, tab.favIconUrl);
        });
    } 
    // Verificar que el clic proviene de un elemento del menú para copiar texto
    else if (info.menuItemId.startsWith('copyText_')) {
        console.log("Acción de copiar texto detectada");
        
        const parts = info.menuItemId.split('_');
        if (parts.length >= 3) {
            const dbName = parts[1];
            const entryIndex = parseInt(parts[2]);
            
            console.log(`Buscando base de datos: ${dbName}, índice: ${entryIndex}`);
            console.log("Bases de datos disponibles:", dbItems.map(item => item.name));
            
            // Encontrar la base de datos por nombre
            const dbItem = dbItems.find(item => item.name === dbName);
            
            if (dbItem) {
                console.log(`Base de datos encontrada: ${dbName}`);
                if (entryIndex >= 0 && entryIndex < dbItem.entries.length) {
                    const selectedEntry = dbItem.entries[entryIndex];
                    console.log("Entrada encontrada:", selectedEntry);
                    
                    // Guardar datos en storage.local para que el popup pueda accederlos
                    chrome.storage.local.set({
                        entryIndex: entryIndex,
                        selectedText: selectedEntry.text,
                        selectedURL: selectedEntry.url,    
                        dbName: dbItem.name
                    }, () => {
                        console.log('Datos guardados en storage.local');
                        // Abrir el popup con el dato seleccionado
                        chrome.action.openPopup();
                    });
                } else {
                    console.error(`Índice de entrada inválido: ${entryIndex}`);
                }
            } else {
                // Recargar las bases de datos y reintentar
                console.error(`No se encontró la base de datos con el nombre: ${dbName}`);
                console.log("Intentando recargar las bases de datos...");
                
                openDatabase().then(async (db) => {
                    await loadDatabases();
                    
                    // Buscar nuevamente después de recargar
                    const updatedDbItem = dbItems.find(item => item.name === dbName);
                    if (updatedDbItem) {
                        console.log("Base de datos encontrada después de recargar");
                        const selectedEntry = updatedDbItem.entries[entryIndex];
                        
                        chrome.storage.local.set({
                            entryIndex: entryIndex,
                            selectedText: selectedEntry.text,
                            selectedURL: selectedEntry.url,    
                            dbName: updatedDbItem.name
                        }, () => {
                            console.log('Datos guardados en storage.local después de recargar');
                            chrome.action.openPopup();
                        });
                    }
                });
            }
        }
    }
});

// Función para guardar texto seleccionado en una base de datos
async function saveTextToDatabase(db, dbName, text, url, favicon) {
    const transaction = db.transaction('databases', 'readwrite');
    const store = transaction.objectStore('databases');

    try {
        let dbData = await new Promise((resolve, reject) => {
            const request = store.get(dbName);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });

        if (!dbData) {
            dbData = { name: dbName, entries: [] };
        }

        dbData.entries.push({
            text: text,
            date: new Date().toISOString(),
            favicon: favicon,
            url: url  // Añadir la URL aquí
        });

        await new Promise((resolve, reject) => {
            const request = store.put(dbData);
            request.onsuccess = resolve;
            request.onerror = (event) => reject(event.target.error);
        });

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Texto guardado',
            message: `El texto seleccionado ha sido guardado en la base de datos "${dbName}".`
        });

        // Importante: Actualizar el menú contextual y la variable global dbItems
        await loadDatabases();
    } catch (error) {
        console.error('Error al guardar el texto:', error);
    }
}

// Actualizar el menú contextual cuando se creen nuevas bases de datos desde el popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateContextMenu') {
        openDatabase().then(db => {
            loadDatabases(); // Asegurarse de que dbItems se actualiza
        }).catch(error => {
            console.error('Error al actualizar el menú contextual:', error);
        });
    }
});

////////////////////////////////////////////////////////"SOLUCION PUPURRUEL⚠️🚫☢️"/////////////////////////////////////////
////////////////////////////////////////////////////////"SOLUCION PUPURRUEL⚠️🚫☢️"/////////////////////////////////////////
////////////////////////////////////////////////////////"SOLUCION PUPURRUEL⚠️🚫☢️"/////////////////////////////////////////
////////////////////////////////////////////////////////"SOLUCION PUPURRUEL⚠️🚫☢️"/////////////////////////////////////////
////////////////////////////////////////////////////////"SOLUCION PUPURRUEL⚠️🚫☢️"/////////////////////////////////////////
////////////////////////////////////////////////////////"SOLUCION PUPURRUEL⚠️🚫☢️"/////////////////////////////////////////
////////////////////////////////////////////////////////"SOLUCION PUPURRUEL⚠️🚫☢️"/////////////////////////////////////////
///////////////////////////////////////////////NO TOCAR , ESTO ESTA PEGADO CON MOCOS/////////////////////////////////
////////////////////////////////////////////////////////Y UN PADRE NUESTRO//////////////////////////////////////////




// Evento cuando el navegador se inicia
chrome.runtime.onStartup.addListener(() => {
    console.log('El navegador se ha iniciado.');
    startDatabaseCheckAndOverwrite(); // Iniciar verificación y sobrescritura al iniciar el navegador
});

// Evento cuando la extensión se instala o se actualiza
chrome.runtime.onInstalled.addListener(() => {
    console.log('La extensión se ha instalado o actualizado.');
    startDatabaseCheckAndOverwrite(); // Iniciar verificación y sobrescritura al instalar o actualizar la extensión
});

// Función para iniciar la verificación de la base de datos cada 5 segundos
function startDatabaseCheckAndOverwrite() {
    setInterval(() => {
        checkDatabaseStatus().then(db => {
            if (db) {
                overwriteDatabaseEntry(db); // Sobrescribir datos cada vez que se verifica la base de datos
            }
        });
    }, 5000); // Cada 5 segundos
}

// Función para verificar el estado de la base de datos
function checkDatabaseStatus() {
    return openDatabase()
        .then(db => {
            console.log('La base de datos está activa.');
            return db;
        })
        .catch(error => {
            console.error('Error al verificar el estado de la base de datos:', error);
        });
}

// Función para sobrescribir un dato en la base de datos
async function overwriteDatabaseEntry(db) {
    const transaction = db.transaction('databases', 'readwrite');
    const store = transaction.objectStore('databases');

    try {
        const databases = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });

        if (databases.length > 0) {
            const dbData = databases[0];

            const currentDateTime = new Date().toLocaleString();
            const updateCount = dbData.entries.length + 1;

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            dbData.entries[dbData.entries.length - 1] = {
                text: `Actualización automática ${updateCount} a las ${currentDateTime}`,
                date: new Date().toISOString(),
                favicon: tab ? tab.favIconUrl : "https://default-favicon.com/favicon.ico",
                url: tab ? tab.url : "https://default-url.com"
            };

            await new Promise((resolve, reject) => {
                const request = store.put(dbData);
                request.onsuccess = resolve;
                request.onerror = (event) => reject(event.target.error);
            });

            console.log('Dato sobrescrito en la base de datos:', dbData.name);
            
            // Actualizar dbItems después de la modificación
            loadDatabases();
        } else {
            console.log('No se encontraron bases de datos.');
        }
    } catch (error) {
        console.error('Error al sobrescribir el dato en la base de datos:', error);
    }
}


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
chrome.commands.onCommand.addListener(function(command) {
    if (command === "open-extension") {
      chrome.windows.create({
        url: chrome.action.openPopup(),
        // type: "popup",
        // width: 500,
        // height: 5000
      });
    }
  });