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

    
    // Evento para crear nueva base de datos
    document.getElementById('createDatabase').addEventListener('click', () => {
        const dbName = prompt("Enter the name of the new database:");
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
        const newName = prompt("Enter the new database name:", oldName);
        if (newName && newName.trim()) {
            editDatabase(oldName, newName.trim());
        }
    });

    // Evento para eliminar la base de datos seleccionada
    document.getElementById('deleteDatabase').addEventListener('click', () => {
        const dbName = document.getElementById('databaseSelect').value;
        if (confirm(`¿Are you sure you want to delete the database  "${dbName}" and all its entries?`)) {
            deleteDatabase(dbName);
        }
    });


    // Enlaza el botón con la función de exportar a CSV
    document.getElementById("export-csv").addEventListener("click", function() {
        exportDataAsCSV();
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

// Función para abrir la base de datos y pasarla al callback
function openDatabase(callback) {
    const request = indexedDB.open('Dott-yDB', 1);
    console.log("Abriendo la base de datos...");

    request.onupgradeneeded = (event) => {
        console.log("Actualizando la base de datos...");
        const db = event.target.result;
        if (!db.objectStoreNames.contains('databases')) {
            db.createObjectStore('databases', { keyPath: 'name' });
        }
    };

    request.onsuccess = (event) => {
        const db = event.target.result;
        console.log("Base de datos abierta con éxito");
        callback(db); // Pasar la base de datos al callback
    };

    request.onerror = (event) => {
        console.error('Error al abrir la base de datos:', event.target.errorCode);
    };
}

// Cargar las bases de datos en el dropdown
function loadDatabases(db) {
    console.log("Cargando bases de datos...");
    const transaction = db.transaction('databases', 'readonly');
    const store = transaction.objectStore('databases');

    const dbSelect = document.getElementById('databaseSelect');
    dbSelect.innerHTML = ''; // Limpia el selector antes de agregar las opciones

    const request = store.getAll();
    request.onsuccess = (event) => {
        const databases = event.target.result;
        console.log("Bases de datos encontradas:", databases); // Log para verificar qué bases de datos se encuentran
        databases.forEach(db => {
            const option = document.createElement('option');
            option.value = db.name;
            option.textContent = db.name;
            dbSelect.appendChild(option);
        });

        // Verificar si hay bases de datos cargadas
        if (dbSelect.options.length > 0) {
            console.log("Cargando la primera base de datos por defecto:", dbSelect.options[0].value);
            loadEntries(dbSelect.options[0].value); // Cambio aquí - usar loadEntries en lugar de loadEntriesAsTable
        } else {
            console.log("No se encontraron bases de datos");
        }
    };

    request.onerror = (event) => {
        console.error('Error al cargar bases de datos:', event.target.errorCode);
    };
}

// Función para cargar entradas y mostrarlas en la tabla
function loadAllDatabasesAsTables() {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readonly');
        const store = transaction.objectStore('databases');
        
        const request = store.getAll();

        request.onsuccess = (event) => {
            const databases = event.target.result;
            const tablesContainer = document.getElementById('tablesContainer'); // Contenedor para todas las tablas
            tablesContainer.innerHTML = ''; // Limpiar contenedor

            databases.forEach((dbData) => {
                const entries = dbData.entries;
                const dbName = dbData.name;

                // Crear un contenedor para cada base de datos
                const dbContainer = document.createElement('div');
                dbContainer.classList.add('database-container');

                // Título de la base de datos
                const dbTitle = document.createElement('h3');
                dbTitle.textContent = `Database: ${dbName}`;
                dbContainer.appendChild(dbTitle);

                // Crear la tabla para esta base de datos
                const table = document.createElement('table');
                table.classList.add('entries-table');
                table.border = '1';

                const thead = document.createElement('thead');
                thead.innerHTML = `
                    <tr>
                        <th>#</th>
                        <th>Favicon</th>
                        <th>Text</th>
                        <th>URL</th>
                    </tr>
                `;
                table.appendChild(thead);

                const tbody = document.createElement('tbody');
                entries.forEach((entry, index) => {
                    const row = document.createElement('tr');

                    // Columna de índice
                    const indexCell = document.createElement('td');
                    indexCell.textContent = index + 1;
                    row.appendChild(indexCell);

                    // Columna de favicon (si existe)
                    const faviconCell = document.createElement('td');
                    if (entry.favicon) {
                        const faviconImg = document.createElement('img');
                        faviconImg.src = entry.favicon;
                        faviconImg.alt = 'Favicon';
                        faviconImg.style.width = '20px';
                        faviconImg.style.height = '20px';
                        faviconCell.appendChild(faviconImg);
                    }
                    row.appendChild(faviconCell);

                    // Columna de texto
                    const textCell = document.createElement('td');
                    textCell.textContent = entry.text;
                    row.appendChild(textCell);

                    // Columna de URL
                    const urlCell = document.createElement('td');
                    const urlLink = document.createElement('a');
                    urlLink.href = entry.url;
                    urlLink.textContent = entry.url;
                    urlLink.target = '_blank';
                    urlCell.appendChild(urlLink);
                    row.appendChild(urlCell);

                    tbody.appendChild(row);
                });

                table.appendChild(tbody);
                dbContainer.appendChild(table);
                tablesContainer.appendChild(dbContainer);
            });
        };

        request.onerror = (event) => {
            console.error('Error al cargar bases de datos:', event.target.errorCode);
        };
    });
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
                    copyButton.textContent = 'Copy Text';
                    copyButton.addEventListener('click', () => {
                        navigator.clipboard.writeText(entry.text).then(() => {
                            alert('Text copied to clipboard');
                        });
                    });
                    li.appendChild(copyButton);

                    // Botón para eliminar entrada
                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'Delete';
                    deleteButton.addEventListener('click', () => {
                        deleteEntry(dbName, index);
                    });
                    li.appendChild(deleteButton);

                    // Botón para editar entrada
                    const editButton = document.createElement('button');
                    editButton.textContent = 'Edit';
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


// Eliminar entrada con confirmación
function deleteEntry(dbName, entryIndex) {
    const userConfirmed = confirm("Are you sure you want to delete this entry? This action cannot be undone");

    if (!userConfirmed) {
        // Si el usuario cancela, no se realiza ninguna acción
        return;
    }

    // Proceder con la eliminación si se confirma
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readwrite');
        const store = transaction.objectStore('databases');

        const getRequest = store.get(dbName);

        getRequest.onsuccess = (event) => {
            const dbData = event.target.result;
            if (dbData) {
                dbData.entries.splice(entryIndex, 1);
                store.put(dbData).onsuccess = () => {
                    loadEntries(dbName); // Recargar las entradas después de eliminar
                    chrome.runtime.sendMessage({ action: 'updateContextMenu' }); // Actualizar el menú contextual
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
    const newText = prompt("Edit Text:", entry.text);
    const newUrl = prompt("Edit URL:", entry.url);

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
    openDatabase(db => {
        const transaction = db.transaction("databases", "readwrite");
        const store = transaction.objectStore("databases");

        store.add({ name: dbName, entries: entries }).onsuccess = () => {
            loadDatabases(db); // Recargar la lista de bases de datos
            chrome.runtime.sendMessage({ action: "updateContextMenu" });
            alert(`Database "${dbName}" imported successfully!`);
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






