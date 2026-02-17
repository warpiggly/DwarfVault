document.addEventListener('DOMContentLoaded', () => {
    loadAllDatabasesAsTables();
    console.log("DOM Content Loaded");

    // Crear la base de datos "Ejecutando" al iniciar la aplicación
    checkAndCreateDatabase("Running");

    // Eliminar la base de datos "Ejecutando" después de 1 segundo
    setTimeout(() => {
        deleteDatabase("Running");
    }, 1000);


    openDatabase(loadDatabases);

    
    // Evento para crear nueva base de datos PADRE
    document.getElementById('createParentDatabase').addEventListener('click', () => {
        const dbName = prompt("Enter the name of the new PARENT database:");
        if (dbName && dbName.trim()) {
            createDatabase(dbName.trim(), null); // null = es padre
        }
    });

    // Evento para crear nueva base de datos HIJA
    document.getElementById('createChildDatabase').addEventListener('click', () => {
        const dbName = prompt("Enter the name of the new database:");
        if (dbName && dbName.trim()) {
            // Preguntar si quiere agregarla a un padre o crearla independiente
            const addToParent = confirm(
                `Do you want to add "${dbName}" inside a PARENT database?\n\n` +
                `OK = Yes (choose parent database)\n` +
                `Cancel = No (create as independent database)`
            );
            
            if (addToParent) {
                // Obtener lista de bases de datos padre disponibles
                openDatabase((db) => {
                    const transaction = db.transaction('databases', 'readonly');
                    const store = transaction.objectStore('databases');
                    
                    const request = store.getAll();
                    request.onsuccess = (event) => {
                        const databases = event.target.result;
                        const parentDatabases = databases.filter(db => !db.parentDatabase);
                        
                        if (parentDatabases.length === 0) {
                            alert("No parent databases available. The database will be created as independent.");
                            createDatabase(dbName.trim(), null);
                            return;
                        }
                        
                        // Crear una lista de opciones
                        let options = "Available parent databases:\n\n";
                        parentDatabases.forEach((db, index) => {
                            options += `${index + 1}. ${db.name}\n`;
                        });
                        options += "\nEnter the number of the parent database:";
                        
                        const parentChoice = prompt(options);
                        const parentIndex = parseInt(parentChoice) - 1;
                        
                        if (parentIndex >= 0 && parentIndex < parentDatabases.length) {
                            const parentName = parentDatabases[parentIndex].name;
                            createDatabase(dbName.trim(), parentName); // crear como hija
                        } else {
                            alert("Invalid selection. Database will be created as independent.");
                            createDatabase(dbName.trim(), null);
                        }
                    };
                });
            } else {
                // Crear como independiente (sin padre)
                createDatabase(dbName.trim(), null);
            }
        }
    });

    // Evento para cambiar de base de datos
    document.getElementById('databaseSelect').addEventListener('change', (e) => {
        loadEntries(e.target.value);
    });

    // Evento para editar la base de datos seleccionada
    document.getElementById('editDatabase').addEventListener('click', () => {
        const dbSelect = document.getElementById('databaseSelect');
        const oldName = dbSelect.value;
        const newName = prompt("Enter the new database name:", oldName);
        if (newName && newName.trim()) {
            editDatabase(oldName, newName.trim());
        }
    });

    // Evento para eliminar la base de datos seleccionada
    document.getElementById('deleteDatabase').addEventListener('click', () => {
        const dbName = document.getElementById('databaseSelect').value;
        
        // Verificar si tiene bases de datos hijas
        openDatabase((db) => {
            const transaction = db.transaction('databases', 'readonly');
            const store = transaction.objectStore('databases');
            
            const request = store.getAll();
            request.onsuccess = (event) => {
                const databases = event.target.result;
                const childDatabases = databases.filter(db => db.parentDatabase === dbName);
                
                let confirmMessage = `Are you sure you want to delete the database "${dbName}" and all its entries?`;
                
                if (childDatabases.length > 0) {
                    confirmMessage += `\n\nWARNING: This database has ${childDatabases.length} child database(s) that will also be deleted:`;
                    childDatabases.forEach(child => {
                        confirmMessage += `\n- ${child.name}`;
                    });
                }
                
                if (confirm(confirmMessage)) {
                    deleteDatabase(dbName);
                }
            };
        });
    });


    // Enlaza el botón con la función de exportar a CSV
    document.getElementById("export-csv").addEventListener("click", function() {
        exportDataAsCSV();
    });

    // EXPORT PARENT DATABASE (con todas sus hijas)
    document.getElementById("export-parent").addEventListener("click", function() {
        exportParentDatabase();
    });

    // IMPORT DATA BASES 

    document.getElementById("importDatabase").addEventListener("click", function() {
        document.getElementById("importCSV").click(); // Abre el selector de archivos
    });
    
    document.getElementById("importCSV").addEventListener("change", function(event) {
        const file = event.target.files[0];
    
        if (!file) {
            alert("Please select a CSV file first.");
            return;
        }
    
        const reader = new FileReader();
        reader.onload = function(event) {
            const csvData = event.target.result;
            processCSV(csvData, file.name.replace(".csv", "")); // Usa el nombre del archivo como nombre de la BD
        };
        reader.readAsText(file);
    });

    // IMPORT PARENT DATABASE (con todas sus hijas)
    document.getElementById("importParent").addEventListener("click", function() {
        document.getElementById("importParentFile").click();
    });

    document.getElementById("importParentFile").addEventListener("change", function(event) {
        const file = event.target.files[0];
        
        if (!file) {
            alert("Please select a JSON file first.");
            return;
        }

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const jsonData = JSON.parse(event.target.result);
                importParentDatabase(jsonData);
            } catch (error) {
                alert("Error reading file: Invalid JSON format");
                console.error(error);
            }
        };
        reader.readAsText(file);
    });
    


        // Obtener el entryIndex, el texto y el enlace almacenado en local storage al cargar el popup
    chrome.storage.local.get(['entryIndex', 'selectedText', 'selectedURL', 'dbName' ,'favicon'], (result) => {
        if (result.selectedText) {
            // Mostrar el texto, el índice, la base de datos y el enlace en el popup
            const entryTextElement = document.getElementById('entryText');
            const entryIndexElement = document.getElementById('entryIndex');
            const dbNameElement = document.getElementById('dbName');
            const entryUrlElement = document.getElementById('entryUrl'); // Nuevo para el enlace
            const faviconImg = document.getElementById('faviconImg');
                    if (result.favicon && faviconImg) {
                        faviconImg.src = result.favicon;
                        faviconImg.style.display = "inline-block";
                    } else {
                        faviconImg.style.display = "none";
                    }


            entryIndexElement.textContent = `INDEX: ${parseInt(result.entryIndex) + 1}`;  // Mostrar el índice
            dbNameElement.textContent = `Base de Datos: ${result.dbName}`; // Mostrar el nombre de la base de datos
            entryTextElement.textContent = result.selectedText;

            // Mostrar el enlace como un hipervínculo
            if (result.selectedURL) {
                entryUrlElement.innerHTML = `<a href="${result.selectedURL}" target="_blank">Open Link</a>`;
            } else {
                entryUrlElement.textContent = 'No link available';
            }
        } else {
            console.log('No selected entry found');
        }
    });

    // Obtiene el botón de copiar y el elemento que contiene el texto 
    var copyButton = document.getElementById('copyButton');
    var entryTextElement = document.getElementById('entryText');

    // Verifica si los elementos existen antes de continuar  
    if (!copyButton || !entryTextElement) {
        console.error('No se encontró el botón o el campo de texto.');
        return;
    }


    // Agrega un evento de clic al botón de copiar 
    copyButton.addEventListener('click', function () {
        let textToCopy = entryTextElement.textContent.trim();

        if (!textToCopy) {
            alert('No hay texto para copiar.');
            return;
        }

        // Copia el texto al portapapeles
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                // alert('Texto copiado al portapapeles');
                window.close(); // Cierra la extensión después de copiar
            })
            .catch(err => {
                console.error('Error al copiar: ', err);
                alert('Hubo un problema al copiar el texto.');
            });
    });

    // Escuchar mensajes del background script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'openPopup') {
            // Obtener los datos del storage
            chrome.storage.local.get(['entryIndex', 'selectedText', 'selectedURL', 'dbName','favicon'], (result) => {
                if (result.selectedText) {
                    const entryIndexElement = document.getElementById('entryIndex');
                    const entryTextElement = document.getElementById('entryText');
                    const dbNameElement = document.getElementById('dbName');
                    const entryUrlElement = document.getElementById('entryUrl'); // Nuevo para el enlace
                    const faviconImg = document.getElementById('faviconImg');
                    if (result.favicon && faviconImg) {
                        faviconImg.src = result.favicon;
                        faviconImg.style.display = "inline-block";
                    } else {
                        faviconImg.style.display = "none";
                    }

                    entryIndexElement.textContent = `INDEX: ${parseInt(result.entryIndex) + 1}`;  // Mostrar el índice
                    dbNameElement.textContent = `Base de Datos: ${result.dbName}`;
                    entryTextElement.textContent = result.selectedText;

                    // Mostrar el enlace como un hipervínculo
                    if (result.selectedURL) {
                        entryUrlElement.innerHTML = `<a href="${result.selectedURL}" target="_blank">Open Link</a>`;
                    } else {
                        entryUrlElement.textContent = 'No link available';
                    }
                }
            });
        }
    });


    
});

// Función para verificar si la base de datos ya fue creada
function checkAndCreateDatabase(dbName) {
    chrome.storage.local.get(['dbCreated'], (result) => {
        // Si no existe la clave o está en false, creamos la base de datos
        if (!result.dbCreated) {
            createDatabase(dbName);
            
            // Marcamos que la base de datos fue creada
            chrome.storage.local.set({ dbCreated: true }, () => {
                console.log(`Base de datos "${dbName}" creada y marcada como creada en chrome.storage.`);
            });
        } else {
            console.log(`La base de datos "${dbName}" ya fue creada anteriormente.`);
        }
    });
}

// Función para crear la base de datos (ACTUALIZADA con soporte para jerarquía)
function createDatabase(dbName, parentDatabase = null) {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readwrite');
        const store = transaction.objectStore('databases');
        
        const request = store.get(dbName);

        request.onsuccess = (event) => {
            if (!event.target.result) {
                const newDb = { 
                    name: dbName, 
                    entries: [],
                    parentDatabase: parentDatabase  // Nuevo campo
                };
                
                store.add(newDb).onsuccess = () => {
                    loadDatabases(db);
                    chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                };
            } else {
                alert('A database with this name already exists.');
            }
        };

        request.onerror = (event) => {
            console.error('Error al crear la base de datos:', event.target.errorCode);
        };
    });
}

// Abrir la base de datos
function openDatabase(callback) {
    const request = indexedDB.open('Dott-yDB', 2); // Incrementar versión

    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Eliminar el store antiguo si existe (solo para migración)
        if (db.objectStoreNames.contains('databases')) {
            db.deleteObjectStore('databases');
        }
        
        // Crear nuevo store
        if (!db.objectStoreNames.contains('databases')) {
            db.createObjectStore('databases', { keyPath: 'name' });
        }
    };

    request.onsuccess = (event) => {
        const db = event.target.result;
        if (callback) callback(db);
    };

    request.onerror = (event) => {
        console.error('Error al abrir la base de datos:', event.target.errorCode);
    };
}

// Cargar todas las bases de datos en el selector (ACTUALIZADO para mostrar jerarquía)
function loadDatabases(db) {
    const transaction = db.transaction('databases', 'readonly');
    const store = transaction.objectStore('databases');

    store.getAll().onsuccess = (event) => {
        const databases = event.target.result;
        const select = document.getElementById('databaseSelect');
        select.innerHTML = '';

        // Separar bases de datos padre e hijas
        const parentDatabases = databases.filter(db => !db.parentDatabase);
        const childDatabases = databases.filter(db => db.parentDatabase);

        parentDatabases.forEach(dbItem => {
            const option = document.createElement('option');
            option.value = dbItem.name;
            option.textContent = dbItem.name;
            select.appendChild(option);

            // Agregar bases de datos hijas con indentación
            const children = childDatabases.filter(child => child.parentDatabase === dbItem.name);
            children.forEach(childDb => {
                const childOption = document.createElement('option');
                childOption.value = childDb.name;
                childOption.textContent = `  ↳ ${childDb.name}`; // Indentación visual
                select.appendChild(childOption);
            });
        });

        if (databases.length > 0) {
            loadEntries(databases[0].name);
        }
    };
}

// Cargar entradas de una base de datos
function loadEntries(dbName) {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readonly');
        const store = transaction.objectStore('databases');

        const request = store.get(dbName);

        request.onsuccess = (event) => {
            const dbData = event.target.result;
            const list = document.getElementById('entriesList');
            list.innerHTML = '';

            if (dbData && dbData.entries) {
                dbData.entries.forEach((entry, index) => {
                    const listItem = document.createElement('li');
                    
                    // Crear contenedor para favicon + texto
                    const contentDiv = document.createElement('div');
                    contentDiv.style.display = 'flex';
                    contentDiv.style.alignItems = 'center';
                    contentDiv.style.gap = '8px';
                    
                    // Agregar favicon si existe
                    if (entry.favicon) {
                        const favicon = document.createElement('img');
                        favicon.src = entry.favicon;
                        favicon.style.width = '16px';
                        favicon.style.height = '16px';
                        contentDiv.appendChild(favicon);
                    }
                    
                    // Agregar texto
                    const textSpan = document.createElement('span');
                    textSpan.textContent = `${index + 1}. ${entry.text}`;
                    contentDiv.appendChild(textSpan);
                    
                    listItem.appendChild(contentDiv);

                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'Delete';
                    deleteButton.addEventListener('click', () => {
                        deleteEntry(dbName, index);
                    });

                    listItem.appendChild(deleteButton);
                    list.appendChild(listItem);
                });
            }
        };

        request.onerror = (event) => {
            console.error('Error al cargar las entradas:', event.target.errorCode);
        };
    });
}

// Eliminar una entrada específica
function deleteEntry(dbName, entryIndex) {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readwrite');
        const store = transaction.objectStore('databases');

        const request = store.get(dbName);

        request.onsuccess = (event) => {
            const dbData = event.target.result;
            if (dbData && dbData.entries) {
                dbData.entries.splice(entryIndex, 1);
                store.put(dbData).onsuccess = () => {
                    loadEntries(dbName);
                    chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                };
            }
        };

        request.onerror = (event) => {
            console.error('Error al eliminar la entrada:', event.target.errorCode);
        };
    });
}

// Editar una base de datos
function editDatabase(oldName, newName) {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readwrite');
        const store = transaction.objectStore('databases');

        const getRequest = store.get(oldName);

        getRequest.onsuccess = (event) => {
            const dbData = event.target.result;
            if (dbData) {
                // Verificar si hay bases de datos hijas
                store.getAll().onsuccess = (getAllEvent) => {
                    const allDatabases = getAllEvent.target.result;
                    const childDatabases = allDatabases.filter(db => db.parentDatabase === oldName);
                    
                    // Eliminar la base de datos antigua
                    store.delete(oldName).onsuccess = () => {
                        // Crear la base de datos con el nuevo nombre
                        dbData.name = newName;
                        store.add(dbData).onsuccess = () => {
                            // Actualizar las referencias en las bases de datos hijas
                            childDatabases.forEach(childDb => {
                                childDb.parentDatabase = newName;
                                store.put(childDb);
                            });
                            
                            loadDatabases(db);
                            chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                        };
                    };
                };
            }
        };

        getRequest.onerror = (event) => {
            console.error('Error al editar la base de datos:', event.target.errorCode);
        };
    });
}

// Eliminar una base de datos (ACTUALIZADO para eliminar también las hijas)
function deleteDatabase(dbName) {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readwrite');
        const store = transaction.objectStore('databases');

        // Primero obtener todas las bases de datos para encontrar las hijas
        store.getAll().onsuccess = (event) => {
            const allDatabases = event.target.result;
            const childDatabases = allDatabases.filter(db => db.parentDatabase === dbName);
            
            // Eliminar todas las bases de datos hijas
            childDatabases.forEach(childDb => {
                store.delete(childDb.name);
            });
            
            // Eliminar la base de datos padre
            store.delete(dbName).onsuccess = () => {
                loadDatabases(db);
                chrome.runtime.sendMessage({ action: 'updateContextMenu' });
            };
        };
    });
}

//Descargar bases de datos 
function exportDataAsCSV() {
    const dbName = document.getElementById('databaseSelect').value;

    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readonly');
        const store = transaction.objectStore('databases');
        
        const request = store.get(dbName);

        request.onsuccess = (event) => {
            const dbData = event.target.result;
            if (dbData && dbData.entries.length > 0) {
                let csvContent = "data:text/csv;charset=utf-8,";

                // Añadir el encabezado
                csvContent += "Índice,Texto,URL,Favicon\n";

                // Añadir las filas con los datos de las entradas
                dbData.entries.forEach((entry, index) => {
                    const favicon = entry.favicon ? entry.favicon : "";
                    
                    // Escapar correctamente los campos
                    const escapedText = `"${entry.text.replace(/"/g, '""')}"`;
                    const escapedUrl = `"${entry.url.replace(/"/g, '""')}"`;
                    const escapedFavicon = `"${favicon.replace(/"/g, '""')}"`;
                    
                    const row = `${index + 1},${escapedText},${escapedUrl},${escapedFavicon}`;
                    csvContent += row + "\n";
                });

                // Crear un enlace para descargar el archivo CSV
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", `${dbName}.csv`);
                document.body.appendChild(link);
                
                // Descargar el archivo
                link.click();

                // Remover el enlace después de la descarga
                document.body.removeChild(link);
            } else {
                alert("No hay entradas en esta base de datos para exportar.");
            }
        };

        request.onerror = (event) => {
            console.error('Error al exportar datos:', event.target.errorCode);
        };
    });
}

// NUEVA FUNCIÓN: Exportar base de datos padre con todas sus hijas
function exportParentDatabase() {
    const dbName = document.getElementById('databaseSelect').value;

    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readonly');
        const store = transaction.objectStore('databases');

        // Obtener todas las bases de datos
        store.getAll().onsuccess = (event) => {
            const allDatabases = event.target.result;
            const selectedDb = allDatabases.find(db => db.name === dbName);

            if (!selectedDb) {
                alert("Database not found.");
                return;
            }

            // Verificar si es una base de datos padre
            if (selectedDb.parentDatabase) {
                alert("Please select a parent database to export. This is a child database.");
                return;
            }

            // Crear estructura de exportación
            const exportData = {
                version: "1.0",
                exportDate: new Date().toISOString(),
                parentDatabase: selectedDb,
                childDatabases: allDatabases.filter(db => db.parentDatabase === dbName)
            };

            // Convertir a JSON
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // Crear enlace de descarga
            const link = document.createElement('a');
            link.href = url;
            link.download = `${dbName}_complete.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            // Mostrar resumen
            const childCount = exportData.childDatabases.length;
            const totalEntries = selectedDb.entries.length + 
                exportData.childDatabases.reduce((sum, child) => sum + child.entries.length, 0);
            
            alert(`✅ Exported successfully!\n\n` +
                  `📁 Parent: ${dbName}\n` +
                  `📂 Child databases: ${childCount}\n` +
                  `📜 Total entries: ${totalEntries}`);
        };
    });
}

// NUEVA FUNCIÓN: Importar base de datos padre con todas sus hijas
function importParentDatabase(importData) {
    // Validar estructura del archivo
    if (!importData.version || !importData.parentDatabase) {
        alert("Invalid file format. Please select a valid parent database export file.");
        return;
    }

    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readwrite');
        const store = transaction.objectStore('databases');

        // Verificar si ya existe una base de datos con ese nombre
        const checkRequest = store.get(importData.parentDatabase.name);

        checkRequest.onsuccess = (event) => {
            if (event.target.result) {
                const overwrite = confirm(
                    `A database named "${importData.parentDatabase.name}" already exists.\n\n` +
                    `Do you want to overwrite it?\n` +
                    `⚠️ This will delete the existing database and all its children.`
                );

                if (!overwrite) {
                    // Preguntar por un nuevo nombre
                    const newName = prompt(
                        "Enter a new name for the parent database:",
                        importData.parentDatabase.name + "_imported"
                    );

                    if (!newName || !newName.trim()) {
                        alert("Import cancelled.");
                        return;
                    }

                    // Actualizar nombres
                    const oldName = importData.parentDatabase.name;
                    importData.parentDatabase.name = newName.trim();
                    
                    // Actualizar referencias en las hijas
                    importData.childDatabases.forEach(child => {
                        if (child.parentDatabase === oldName) {
                            child.parentDatabase = newName.trim();
                        }
                    });
                } else {
                    // Eliminar la base de datos existente y sus hijas
                    store.getAll().onsuccess = (getAllEvent) => {
                        const allDbs = getAllEvent.target.result;
                        const childrenToDelete = allDbs.filter(
                            db => db.parentDatabase === importData.parentDatabase.name
                        );

                        // Eliminar hijas
                        childrenToDelete.forEach(child => {
                            store.delete(child.name);
                        });

                        // Eliminar padre
                        store.delete(importData.parentDatabase.name);
                    };
                }
            }

            // Importar base de datos padre
            setTimeout(() => {
                const addParentRequest = store.add(importData.parentDatabase);

                addParentRequest.onsuccess = () => {
                    console.log("Parent database imported:", importData.parentDatabase.name);

                    // Importar bases de datos hijas
                    let importedChildren = 0;
                    if (importData.childDatabases && importData.childDatabases.length > 0) {
                        importData.childDatabases.forEach((childDb) => {
                            store.add(childDb).onsuccess = () => {
                                importedChildren++;
                                console.log("Child database imported:", childDb.name);

                                // Si es la última hija, mostrar mensaje de éxito
                                if (importedChildren === importData.childDatabases.length) {
                                    finishImport();
                                }
                            };
                        });
                    } else {
                        finishImport();
                    }

                    function finishImport() {
                        const totalEntries = importData.parentDatabase.entries.length +
                            (importData.childDatabases?.reduce((sum, child) => 
                                sum + child.entries.length, 0) || 0);

                        alert(
                            `✅ Import successful!\n\n` +
                            `📁 Parent: ${importData.parentDatabase.name}\n` +
                            `📂 Child databases: ${importData.childDatabases?.length || 0}\n` +
                            `📜 Total entries: ${totalEntries}`
                        );

                        // Recargar la interfaz
                        loadDatabases(db);
                        chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                    }
                };

                addParentRequest.onerror = (event) => {
                    console.error("Error importing parent database:", event.target.error);
                    alert("Error importing database. Please try again.");
                };
            }, 100); // Pequeño delay para asegurar que las eliminaciones se completen
        };

        checkRequest.onerror = (event) => {
            console.error("Error checking database:", event.target.error);
        };
    });
}
/**
 * Analiza una línea de texto CSV respetando las reglas estándar de CSV.
 * 
 * Esta función maneja correctamente:
 * - Campos delimitados por comas
 * - Texto entre comillas (que puede contener comas)
 * - Comillas escapadas dentro de campos con comillas ("" representa una comilla literal)
 * 
 * @param {string} text - La línea de texto CSV a analizar
 * @return {string[]} Un array con los valores de cada columna correctamente extraídos
 */
function parseCSVLine(text) {
    const result = [];
    let cell = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (char === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') {
                // Doble comilla dentro de comillas es una comilla escapada
                cell += '"';
                i++; // Saltar la siguiente comilla
            } else {
                // Alternar estado de comillas
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // Final de la celda si la coma no está dentro de comillas
            result.push(cell);
            cell = '';
        } else {
            cell += char;
        }
    }
    
    // No olvidar la última celda
    result.push(cell);
    return result;
}
//Importar las bases de datos 
function processCSV(csvData, dbName) {
    // Dividir por líneas
    const lines = csvData.split(/\r?\n/);
    
    if (lines.length < 2) {
        alert("Invalid CSV format.");
        return;
    }
    
    // Parsear encabezados y entradas
    const headers = parseCSVLine(lines[0]);
    const entries = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // Saltar líneas vacías
        
        const row = parseCSVLine(lines[i]);
        if (row.length >= 4) { // Aseguramos que hay suficientes columnas
            entries.push({
                text: row[1].replace(/^"(.*)"$/, '$1'), // Eliminar comillas externas si existen
                url: row[2].replace(/^"(.*)"$/, '$1'),
                favicon: row[3].replace(/^"(.*)"$/, '$1')
            });
        }
    }
    
    saveDatabase(dbName, entries);
}

// Función para limpiar comillas al inicio y al final de cada campo
function cleanValue(value) {
    return value ? value.trim().replace(/^"(.*)"$/, '$1') : "";
}

function saveDatabase(dbName, entries) {
    // Preguntar si quiere agregarla a un padre
    const addToParent = confirm(
        `Do you want to add "${dbName}" as a CHILD database inside a parent?\n\n` +
        `OK = Yes (choose parent)\n` +
        `Cancel = No (create as independent parent database)`
    );

    if (addToParent) {
        // Obtener bases de datos padre disponibles
        openDatabase(db => {
            const transaction = db.transaction("databases", "readonly");
            const store = transaction.objectStore("databases");
            
            store.getAll().onsuccess = (event) => {
                const allDatabases = event.target.result;
                const parentDatabases = allDatabases.filter(database => !database.parentDatabase);
                
                if (parentDatabases.length === 0) {
                    alert("No parent databases available. The database will be created as a parent.");
                    createImportedDatabase(dbName, entries, null);
                    return;
                }
                
                // Mostrar lista de padres
                let options = "Available parent databases:\n\n";
                parentDatabases.forEach((database, index) => {
                    options += `${index + 1}. ${database.name}\n`;
                });
                options += "\nEnter the number of the parent database:";
                
                const parentChoice = prompt(options);
                const parentIndex = parseInt(parentChoice) - 1;
                
                if (parentIndex >= 0 && parentIndex < parentDatabases.length) {
                    const parentName = parentDatabases[parentIndex].name;
                    createImportedDatabase(dbName, entries, parentName);
                } else {
                    alert("Invalid selection. Database will be created as parent.");
                    createImportedDatabase(dbName, entries, null);
                }
            };
        });
    } else {
        // Crear como padre
        createImportedDatabase(dbName, entries, null);
    }
}

// Nueva función auxiliar para crear la base de datos importada
function createImportedDatabase(dbName, entries, parentDatabase) {
    openDatabase(db => {
        const transaction = db.transaction("databases", "readwrite");
        const store = transaction.objectStore("databases");

        const dbData = { 
            name: dbName, 
            entries: entries,
            parentDatabase: parentDatabase
        };

        const addRequest = store.add(dbData);
        
        addRequest.onsuccess = () => {
            loadDatabases(db);
            chrome.runtime.sendMessage({ action: "updateContextMenu" });
            
            const dbType = parentDatabase ? `child of "${parentDatabase}"` : "parent database";
            alert(`Database "${dbName}" imported successfully as ${dbType}!`);
        };

        addRequest.onerror = (event) => {
            console.error("Error importing database:", event.target.error);
            alert(`Error: A database named "${dbName}" already exists. Please rename the CSV file and try again.`);
        };
    });
}

// Cargar emojis desde JSON y mostrarlos como botones
fetch(chrome.runtime.getURL('emojis.json'))
    .then(response => response.json())
    .then(emojis => {
        const emojiList = document.getElementById('emojiList');
        const feedback = document.getElementById('emojiCopyFeedback');

        emojis.forEach(emoji => {
            const span = document.createElement('span');
            span.textContent = emoji;
            span.className = 'emoji-item';
            span.style.cursor = 'pointer';
            span.style.fontSize = '24px';
            span.style.margin = '6px';
            span.addEventListener('click', () => {
                navigator.clipboard.writeText(emoji).then(() => {
                    feedback.style.display = 'block';
                    setTimeout(() => feedback.style.display = 'none', 1000);
                });
            });
            emojiList.appendChild(span);
        });
    })
    .catch(err => {
        console.error("Error loading emoji list:", err);
    });



// NUEVA FUNCIÓN: Cargar todas las bases de datos como tablas
function loadAllDatabasesAsTables() {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readonly');
        const store = transaction.objectStore('databases');

        store.getAll().onsuccess = (event) => {
            const databases = event.target.result;
            console.log('All databases loaded:', databases);
            
            // Aquí puedes agregar código para mostrar las bases de datos en formato de tabla
            // si tienes una sección en tu HTML para eso
        };
    });
}