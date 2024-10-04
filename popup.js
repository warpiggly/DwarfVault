document.addEventListener('DOMContentLoaded', () => {
    // Crear la base de datos "Ejecutando" al iniciar la aplicación
    checkAndCreateDatabase("Ejecutando");

    // Eliminar la base de datos "Ejecutando" después de 1 segundo
    setTimeout(() => {
        deleteDatabase("Ejecutando");
    }, 1000);


    openDatabase(loadDatabases);

    
    // Evento para crear nueva base de datos
    document.getElementById('createDatabase').addEventListener('click', () => {
        const dbName = prompt("Ingrese el nombre de la nueva base de datos:");
        if (dbName && dbName.trim()) {
            createDatabase(dbName.trim());
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
        const newName = prompt("Ingrese el nuevo nombre de la base de datos:", oldName);
        if (newName && newName.trim()) {
            editDatabase(oldName, newName.trim());
        }
    });

    // Evento para eliminar la base de datos seleccionada
    document.getElementById('deleteDatabase').addEventListener('click', () => {
        const dbName = document.getElementById('databaseSelect').value;
        if (confirm(`¿Está seguro de que desea eliminar la base de datos "${dbName}" y todas sus entradas?`)) {
            deleteDatabase(dbName);
        }
    });


    // Enlaza el botón con la función de exportar a CSV
    document.getElementById("export-csv").addEventListener("click", function() {
        exportDataAsCSV();
    });
    // Obtener el entryIndex y el texto almacenado en local storage al cargar el popup
    chrome.storage.local.get(['entryIndex', 'selectedText'], (result) => {
        if (result.selectedText) {
            // Mostrar el texto en un elemento del popup
            const entryTextElement = document.getElementById('entryText');
            const entryIndexElement = document.getElementById('entryIndex');
            const dbNameElement = document.getElementById('dbName');

            entryIndexElement.textContent = `ÍNDICE: ${parseInt(result.entryIndex) + 1}`;  // Mostrar el índice
            dbNameElement.textContent = `Base de Datos: ${result.dbName}`; // Mostrar el nombre de la base de datos
            entryTextElement.textContent = result.selectedText;

            //     // Agregar un evento al botón de copiar solo después de que se haya cargado el texto
            // const copyButton = document.getElementById('copyButton');
            // copyButton.addEventListener('click', () => {
            //     copyToClipboard(entryTextElement.textContent);}); 
        } else {
            console.log('No se encontró ninguna entrada seleccionada');
        }
    });

            // Función para copiar texto al portapapeles
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                console.log('Texto copiado al portapapeles');
            }).catch(err => {
                console.error('Error al copiar el texto: ', err);
            });
        }

         // Agregar un evento al botón de copiar
        document.getElementById('copyButton').addEventListener('click', () => {
            const entryTextElement = document.getElementById('entryText');
            copyToClipboard(entryTextElement.textContent);
        });

    // Escuchar mensajes del background script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'openPopup') {
            // Obtener los datos del storage
            chrome.storage.local.get(['entryIndex', 'selectedText'], (result) => {
                if (result.selectedText) {
                    const entryIndexElement = document.getElementById('entryIndex');
                    const entryTextElement = document.getElementById('entryText');
                    const dbNameElement = document.getElementById('dbName');

                    entryIndexElement.textContent = `Índice: ${parseInt(result.entryIndex) + 1}`;  // Mostrar el índice
                    dbNameElement.textContent = `Base de Datos: ${result.dbName}`;
                    entryTextElement.textContent = result.selectedText;

                    //     // Agregar el evento al botón de copiar aquí también
                    // const copyButton = document.getElementById('copyButton');
                    // copyButton.addEventListener('click', () => {
                    //     copyToClipboard(entryTextElement.textContent);
                    // });
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

// Función para crear la base de datos
function createDatabase(dbName) {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readwrite');
        const store = transaction.objectStore('databases');
        
        const request = store.get(dbName);

        request.onsuccess = (event) => {
            if (!event.target.result) {
                store.add({ name: dbName, entries: [] }).onsuccess = () => {
                    loadDatabases(db);
                    chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                    console.log(`Base de datos "${dbName}" creada.`);
                };
            } else {
                console.log(`La base de datos "${dbName}" ya existe.`);
            }
        };

        request.onerror = (event) => {
            console.error('Error al crear la base de datos:', event.target.errorCode);
        };
    });
}

// Función para eliminar la base de datos (si es necesario en algún momento)
function deleteDatabase(dbName) {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readwrite');
        const store = transaction.objectStore('databases');

        store.delete(dbName).onsuccess = () => {
            loadDatabases(db);
            chrome.runtime.sendMessage({ action: 'updateContextMenu' });
            console.log(`Base de datos "${dbName}" eliminada.`);
        };
    });
}

// Abrir la base de datos y crear almacenes si es necesario
function openDatabase(callback) {
    const request = indexedDB.open('Dott-yDB', 1);

    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Crear el almacén para las bases de datos si no existe
        if (!db.objectStoreNames.contains('databases')) {
            db.createObjectStore('databases', { keyPath: 'name' });
        }
    };

    request.onsuccess = (event) => {
        const db = event.target.result;
        callback(db);
    };

    request.onerror = (event) => {
        console.error('Error al abrir la base de datos:', event.target.errorCode);
    };
}

// Cargar las bases de datos en el selector
function loadDatabases(db) {
    const transaction = db.transaction('databases', 'readonly');
    const store = transaction.objectStore('databases');
    
    const dbSelect = document.getElementById('databaseSelect');
    dbSelect.innerHTML = '';

    const request = store.getAll();

    request.onsuccess = (event) => {
        const databases = event.target.result;
        databases.forEach(db => {
            const option = document.createElement('option');
            option.value = db.name;
            option.textContent = db.name;
            dbSelect.appendChild(option);
        });
        if (dbSelect.options.length > 0) {
            loadEntries(dbSelect.options[0].value);
        }
    };

    request.onerror = (event) => {
        console.error('Error al cargar bases de datos:', event.target.errorCode);
    };
}

// Crear una nueva base de datos
function createDatabase(dbName) {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readwrite');
        const store = transaction.objectStore('databases');
        
        const request = store.get(dbName);

        request.onsuccess = (event) => {
            if (!event.target.result) {
                store.add({ name: dbName, entries: [] }).onsuccess = () => {
                    loadDatabases(db);

                    // Enviar mensaje al background para actualizar el menú contextual
                    chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                };
            } else {
                alert('Ya existe una base de datos con ese nombre.');
            }
        };

        request.onerror = (event) => {
            console.error('Error al crear la base de datos:', event.target.errorCode);
        };
    });
}



// Cargar entradas desde una base de datos
function loadEntries(dbName) {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readonly');
        const store = transaction.objectStore('databases');
        
        const request = store.get(dbName);

        request.onsuccess = (event) => {
            const dbData = event.target.result;
            const entries = dbData ? dbData.entries : [];
            const entriesList = document.getElementById('entriesList');
            const searchBar = document.getElementById('searchBar');
            
            entriesList.innerHTML = '';
            
            // Función para renderizar la lista
            const renderEntries = (filteredEntries) => {
                entriesList.innerHTML = '';
                filteredEntries.forEach((entry, index) => {
                    const li = document.createElement('li');

                    // Número de entrada
                    const numberSpan = document.createElement('span');
                    numberSpan.classList.add('entry-number');
                    numberSpan.textContent = `${index + 1}. `; // Número secuencial
                    li.appendChild(numberSpan);

                    // Favicon
                    if (entry.favicon) {
                        const favicon = document.createElement('img');
                        favicon.src = entry.favicon;
                        favicon.alt = 'Favicon';
                        favicon.style.width = '40px';
                        favicon.style.height = '40px';
                        favicon.style.display = 'block';  // Para centrarlo como un elemento de bloque
                        favicon.style.margin = '10px auto';  // Para centrar horizontalmente
                        li.appendChild(favicon);
                    }

                    // Texto
                    const textSpan = document.createElement('span');
                    textSpan.innerHTML = `<span class="item-label">Texto:</span> ${entry.text.substring(0, 50)}${entry.text.length > 50 ? '...' : ''}`;
                    li.appendChild(textSpan);

                    // URL
                    const urlLink = document.createElement('a');
                    urlLink.href = entry.url;
                    urlLink.textContent = entry.url;
                    urlLink.target = '_blank';
                    urlLink.innerHTML = `<span class="item-label">URL:</span> ${entry.url}`;
                    li.appendChild(document.createElement('br'));
                    li.appendChild(urlLink);

                    // Botón de copiar
                    const copyButton = document.createElement('button');
                    copyButton.textContent = 'Copiar texto';
                    copyButton.addEventListener('click', () => {
                        navigator.clipboard.writeText(entry.text).then(() => {
                            alert('Texto copiado al portapapeles');
                        });
                    });
                    li.appendChild(copyButton);

                    // Botón para eliminar entrada
                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'Eliminar';
                    deleteButton.addEventListener('click', () => {
                        deleteEntry(dbName, index);
                    });
                    li.appendChild(deleteButton);

                    // Botón para editar entrada
                    const editButton = document.createElement('button');
                    editButton.textContent = 'Editar';
                    editButton.addEventListener('click', () => {
                        editEntry(dbName, index, entry);
                    });
                    li.appendChild(editButton);

                    entriesList.appendChild(li);
                });
            };

            // Renderizar todas las entradas inicialmente
            renderEntries(entries);

            // Filtrar y renderizar las entradas en función de la búsqueda
            searchBar.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filteredEntries = entries.filter((entry, index) => {
                    return entry.text.toLowerCase().includes(searchTerm) || `${index + 1}`.includes(searchTerm);
                });
                renderEntries(filteredEntries);
            });
        };

        request.onerror = (event) => {
            console.error('Error al cargar entradas:', event.target.errorCode);
        };
    });
}


// Eliminar entrada
function deleteEntry(dbName, entryIndex) {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readwrite');
        const store = transaction.objectStore('databases');

        const getRequest = store.get(dbName);

        getRequest.onsuccess = (event) => {
            const dbData = event.target.result;
            if (dbData) {
                dbData.entries.splice(entryIndex, 1);
                store.put(dbData).onsuccess = () => {
                    loadEntries(dbName);
                    chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                };
            }
        };

        getRequest.onerror = (event) => {
            console.error('Error al eliminar entrada:', event.target.errorCode);
        };
    });
}

// Editar entrada
function editEntry(dbName, entryIndex, entry) {
    const newText = prompt("Editar texto:", entry.text);
    const newUrl = prompt("Editar URL:", entry.url);

    if (newText !== null && newUrl !== null) {
        openDatabase((db) => {
            const transaction = db.transaction('databases', 'readwrite');
            const store = transaction.objectStore('databases');

            const getRequest = store.get(dbName);

            getRequest.onsuccess = (event) => {
                const dbData = event.target.result;
                if (dbData) {
                    dbData.entries[entryIndex] = {
                        ...entry,
                        text: newText,
                        url: newUrl
                    };
                    store.put(dbData).onsuccess = () => {
                        loadEntries(dbName);
                        chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                    };
                }
            };

            getRequest.onerror = (event) => {
                console.error('Error al editar entrada:', event.target.errorCode);
            };
        });
    }
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
                store.delete(oldName).onsuccess = () => {
                    dbData.name = newName;
                    store.add(dbData).onsuccess = () => {
                        loadDatabases(db);
                        chrome.runtime.sendMessage({ action: 'updateContextMenu' });
                    };
                };
            }
        };

        getRequest.onerror = (event) => {
            console.error('Error al editar la base de datos:', event.target.errorCode);
        };
    });
}

// Eliminar una base de datos
function deleteDatabase(dbName) {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readwrite');
        const store = transaction.objectStore('databases');

        store.delete(dbName).onsuccess = () => {
            loadDatabases(db);
            chrome.runtime.sendMessage({ action: 'updateContextMenu' });
        };
    });
}


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
                    const row = `${index + 1},"${entry.text}","${entry.url}","${favicon}"`;
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



