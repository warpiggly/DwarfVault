// Script para View Board - Mostrar todas las bases de datos en formato de tabla
document.addEventListener('DOMContentLoaded', () => {
    loadAllDatabasesAsTables();
});

function openDatabase(callback) {
    const request = indexedDB.open('Dott-yDB', 2);

    request.onsuccess = (event) => {
        const db = event.target.result;
        if (callback) callback(db);
    };

    request.onerror = (event) => {
        console.error('Error al abrir la base de datos:', event.target.errorCode);
    };
}

function loadAllDatabasesAsTables() {
    openDatabase((db) => {
        const transaction = db.transaction('databases', 'readonly');
        const store = transaction.objectStore('databases');

        store.getAll().onsuccess = (event) => {
            const databases = event.target.result;
            const container = document.getElementById('tablesContainer');
            container.innerHTML = '';

            if (databases.length === 0) {
                container.innerHTML = '<p style="color: #f4e5c3; font-family: \'Righteous-Regular\', sans-serif; text-align: center; padding: 20px;">No databases found. Create one in the HOME page.</p>';
                return;
            }

            // Separar bases de datos padre e hijas
            const parentDatabases = databases.filter(db => !db.parentDatabase);
            const childDatabases = databases.filter(db => db.parentDatabase);

            // Crear tabla para cada base de datos padre
            parentDatabases.forEach((dbItem, parentIndex) => {
                // Contenedor principal para la base de datos padre
                const dbContainer = document.createElement('div');
                dbContainer.className = 'database-section';
                dbContainer.style.marginBottom = '15px';
                dbContainer.style.backgroundColor = 'rgba(121, 86, 73, 0.3)';
                dbContainer.style.borderRadius = '8px';
                dbContainer.style.border = '2px solid #c0a080';
                dbContainer.style.overflow = 'hidden';

                const children = childDatabases.filter(child => child.parentDatabase === dbItem.name);
                const totalEntries = dbItem.entries.length + children.reduce((sum, child) => sum + child.entries.length, 0);

                // Header clickeable para el padre
                const dbHeader = document.createElement('div');
                dbHeader.className = 'database-header';
                dbHeader.style.padding = '12px 15px';
                dbHeader.style.backgroundColor = '#795649';
                dbHeader.style.cursor = 'pointer';
                dbHeader.style.display = 'flex';
                dbHeader.style.justifyContent = 'space-between';
                dbHeader.style.alignItems = 'center';
                dbHeader.style.transition = 'background-color 0.2s ease';
                
                // Hover effect
                dbHeader.addEventListener('mouseenter', () => {
                    dbHeader.style.backgroundColor = '#8a6e2f';
                });
                dbHeader.addEventListener('mouseleave', () => {
                    dbHeader.style.backgroundColor = '#795649';
                });

                // Título del padre
                const titleSection = document.createElement('div');
                titleSection.style.display = 'flex';
                titleSection.style.alignItems = 'center';
                titleSection.style.gap = '10px';

                const toggleIcon = document.createElement('span');
                toggleIcon.className = 'toggle-icon';
                toggleIcon.textContent = '▼';
                toggleIcon.style.color = '#FFD700';
                toggleIcon.style.fontSize = '12px';
                toggleIcon.style.transition = 'transform 0.3s ease';

                const dbTitle = document.createElement('span');
                dbTitle.textContent = `📁 ${dbItem.name}`;
                dbTitle.style.fontFamily = "'Righteous-Regular', sans-serif";
                dbTitle.style.color = '#FFD700';
                dbTitle.style.fontSize = '16px';
                dbTitle.style.fontWeight = 'bold';

                titleSection.appendChild(toggleIcon);
                titleSection.appendChild(dbTitle);

                // Info del padre
                const infoSection = document.createElement('div');
                infoSection.style.display = 'flex';
                infoSection.style.gap = '15px';
                infoSection.style.fontFamily = "'Righteous-Regular', sans-serif";
                infoSection.style.fontSize = '12px';

                const entriesInfo = document.createElement('span');
                entriesInfo.textContent = `${dbItem.entries.length} entries`;
                entriesInfo.style.color = '#d4c5a3';

                const childrenInfo = document.createElement('span');
                childrenInfo.textContent = children.length > 0 ? `${children.length} sub-DB` : '';
                childrenInfo.style.color = '#ffc400';

                const totalInfo = document.createElement('span');
                totalInfo.textContent = `Total: ${totalEntries}`;
                totalInfo.style.color = '#FFD700';
                totalInfo.style.fontWeight = 'bold';

                infoSection.appendChild(entriesInfo);
                if (children.length > 0) {
                    infoSection.appendChild(childrenInfo);
                }
                infoSection.appendChild(totalInfo);

                dbHeader.appendChild(titleSection);
                dbHeader.appendChild(infoSection);

                // Contenido colapsable
                const dbContent = document.createElement('div');
                dbContent.className = 'database-content';
                dbContent.style.maxHeight = '0';
                dbContent.style.overflow = 'hidden';
                dbContent.style.transition = 'max-height 0.4s ease-in-out';
                dbContent.style.backgroundColor = 'rgba(121, 86, 73, 0.1)';

                // Wrapper interno para el contenido
                const contentWrapper = document.createElement('div');
                contentWrapper.style.padding = '10px';

                // Tabla del padre si tiene entradas
                if (dbItem.entries && dbItem.entries.length > 0) {
                    const parentLabel = document.createElement('div');
                    parentLabel.textContent = '📜 Parent Entries';
                    parentLabel.style.fontFamily = "'Righteous-Regular', sans-serif";
                    parentLabel.style.color = '#ffc400';
                    parentLabel.style.fontSize = '13px';
                    parentLabel.style.marginBottom = '8px';
                    parentLabel.style.marginLeft = '5px';
                    contentWrapper.appendChild(parentLabel);

                    const table = createCompactTable(dbItem);
                    contentWrapper.appendChild(table);
                }

                // Bases de datos hijas
                if (children.length > 0) {
                    children.forEach((childDb, childIndex) => {
                        // Separador entre padre e hijas
                        if (dbItem.entries.length > 0 && childIndex === 0) {
                            const divider = document.createElement('div');
                            divider.style.height = '1px';
                            divider.style.backgroundColor = '#c0a080';
                            divider.style.margin = '15px 0';
                            divider.style.opacity = '0.3';
                            contentWrapper.appendChild(divider);
                        }

                        // Label de la hija
                        const childLabel = document.createElement('div');
                        childLabel.textContent = `↳ ${childDb.name} (${childDb.entries.length} entries)`;
                        childLabel.style.fontFamily = "'Righteous-Regular', sans-serif";
                        childLabel.style.color = '#ffc400';
                        childLabel.style.fontSize = '13px';
                        childLabel.style.marginTop = childIndex > 0 ? '15px' : '0';
                        childLabel.style.marginBottom = '8px';
                        childLabel.style.marginLeft = '15px';
                        contentWrapper.appendChild(childLabel);

                        if (childDb.entries && childDb.entries.length > 0) {
                            const childTable = createCompactTable(childDb);
                            childTable.style.marginLeft = '15px';
                            childTable.style.width = 'calc(100% - 15px)';
                            contentWrapper.appendChild(childTable);
                        } else {
                            const emptyMsg = document.createElement('p');
                            emptyMsg.textContent = 'No entries yet';
                            emptyMsg.style.color = '#d4c5a3';
                            emptyMsg.style.fontFamily = "'Righteous-Regular', sans-serif";
                            emptyMsg.style.fontSize = '11px';
                            emptyMsg.style.fontStyle = 'italic';
                            emptyMsg.style.marginLeft = '25px';
                            contentWrapper.appendChild(emptyMsg);
                        }
                    });
                }

                dbContent.appendChild(contentWrapper);

                // Toggle functionality
                let isExpanded = false;
                dbHeader.addEventListener('click', () => {
                    isExpanded = !isExpanded;
                    if (isExpanded) {
                        dbContent.style.maxHeight = dbContent.scrollHeight + 'px';
                        toggleIcon.style.transform = 'rotate(-180deg)';
                    } else {
                        dbContent.style.maxHeight = '0';
                        toggleIcon.style.transform = 'rotate(0deg)';
                    }
                });

                dbContainer.appendChild(dbHeader);
                dbContainer.appendChild(dbContent);
                container.appendChild(dbContainer);
            });
        };

        store.getAll().onerror = (event) => {
            console.error('Error al cargar las bases de datos:', event.target.errorCode);
        };
    });
}

function createCompactTable(dbItem) {
    const tableWrapper = document.createElement('div');
    tableWrapper.style.marginBottom = '10px';
    tableWrapper.style.borderRadius = '6px';
    tableWrapper.style.overflow = 'hidden';
    tableWrapper.style.border = '2px solid #c0a080';
    tableWrapper.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.3)';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontFamily = "'Righteous-Regular', sans-serif";
    table.style.fontSize = '11px';
    table.style.color = '#f4e5c3';
    table.style.backgroundColor = 'rgba(121, 86, 73, 0.4)';

    // ====== ENCABEZADO ESTILO EXCEL ======
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.backgroundColor = '#795649';
    headerRow.style.borderBottom = '3px solid #DAA520';

    const headers = [
        { text: '#', width: '35px', align: 'center' },
        { text: '', width: '28px', align: 'center' }, // Favicon
        { text: 'TEXT', width: '50px', align: 'left' },
        { text: 'SOURCE', width: '65px', align: 'left' },
        { text: 'DATE', width: '75px', align: 'center' }
    ];

    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header.text;
        th.style.padding = '10px 8px';
        th.style.textAlign = header.align;
        th.style.color = '#FFD700';
        th.style.fontWeight = 'bold';
        th.style.fontSize = '10px';
        th.style.letterSpacing = '0.5px';
        th.style.borderRight = '1px solid rgba(192, 160, 128, 0.2)';
        th.style.textTransform = 'uppercase';
        if (header.width !== 'auto') {
            th.style.width = header.width;
        }
        if (header.text === '') {
            th.style.backgroundImage = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"%23FFD700\"><path d=\"M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z\"/></svg>')";
            th.style.backgroundRepeat = 'no-repeat';
            th.style.backgroundPosition = 'center';
            th.style.backgroundSize = '14px';
        }
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // ====== CUERPO DE LA TABLA ======
    const tbody = document.createElement('tbody');

    dbItem.entries.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.style.transition = 'all 0.2s ease';
        row.style.borderBottom = '1px solid rgba(192, 160, 128, 0.15)';

        // Color de fondo alternado
        if (index % 2 === 0) {
            row.style.backgroundColor = 'rgba(121, 86, 73, 0.2)';
        } else {
            row.style.backgroundColor = 'rgba(218, 165, 32, 0.05)';
        }

        // Hover effect
        row.addEventListener('mouseenter', () => {
            row.style.backgroundColor = 'rgba(255, 215, 0, 0.15)';
            row.style.transform = 'translateX(2px)';
            row.style.boxShadow = 'inset 3px 0 0 #FFD700';
        });
        row.addEventListener('mouseleave', () => {
            if (index % 2 === 0) {
                row.style.backgroundColor = 'rgba(121, 86, 73, 0.2)';
            } else {
                row.style.backgroundColor = 'rgba(218, 165, 32, 0.05)';
            }
            row.style.transform = 'translateX(0)';
            row.style.boxShadow = 'none';
        });

        // ===== COLUMNA 1: NÚMERO =====
        const indexCell = document.createElement('td');
        indexCell.textContent = index + 1;
        indexCell.style.padding = '10px 8px';
        indexCell.style.textAlign = 'center';
        indexCell.style.color = '#FFD700';
        indexCell.style.fontWeight = 'bold';
        indexCell.style.fontSize = '11px';
        indexCell.style.borderRight = '1px solid rgba(192, 160, 128, 0.2)';
        indexCell.style.backgroundColor = 'rgba(121, 86, 73, 0.15)';
        row.appendChild(indexCell);

        // ===== COLUMNA 2: FAVICON =====
        const faviconCell = document.createElement('td');
        faviconCell.style.padding = '8px';
        faviconCell.style.textAlign = 'center';
        faviconCell.style.borderRight = '1px solid rgba(192, 160, 128, 0.2)';
        
        if (entry.favicon) {
            const faviconImg = document.createElement('img');
            faviconImg.src = entry.favicon;
            faviconImg.style.width = '18px';
            faviconImg.style.height = '18px';
            faviconImg.style.borderRadius = '3px';
            faviconImg.style.border = '1px solid rgba(192, 160, 128, 0.3)';
            faviconImg.style.display = 'block';
            faviconImg.style.margin = '0 auto';
            faviconImg.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
            faviconCell.appendChild(faviconImg);
        } else {
            const placeholder = document.createElement('div');
            placeholder.textContent = '📄';
            placeholder.style.fontSize = '16px';
            placeholder.style.opacity = '0.4';
            faviconCell.appendChild(placeholder);
        }
        row.appendChild(faviconCell);

        // ===== COLUMNA 3: TEXTO =====
        const textCell = document.createElement('td');
        textCell.style.padding = '10px 12px';
        textCell.style.borderRight = '1px solid rgba(192, 160, 128, 0.2)';
        textCell.style.position = 'relative';
        textCell.style.maxWidth = '50px';
        textCell.style.width = '50px';
        
        const textContent = document.createElement('div');
        textContent.style.display = 'flex';
        textContent.style.alignItems = 'center';
        textContent.style.gap = '8px';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = entry.text;
        textSpan.style.flex = '1';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.color = '#f4e5c3';
        textSpan.style.cursor = 'pointer';
        textSpan.style.lineHeight = '1.4';
        textSpan.style.minWidth = '0';
        textSpan.title = entry.text; // Tooltip completo
        
        // Icono de copiar (aparece al hover)
        const copyIcon = document.createElement('span');
        copyIcon.textContent = '📋';
        copyIcon.style.fontSize = '14px';
        copyIcon.style.opacity = '0';
        copyIcon.style.transition = 'opacity 0.2s ease';
        copyIcon.style.cursor = 'pointer';
        copyIcon.title = 'Click to copy';
        
        textContent.appendChild(textSpan);
        textContent.appendChild(copyIcon);
        textCell.appendChild(textContent);

        // Mostrar icono al hover
        textCell.addEventListener('mouseenter', () => {
            copyIcon.style.opacity = '0.6';
        });
        textCell.addEventListener('mouseleave', () => {
            copyIcon.style.opacity = '0';
        });

        // Click para copiar (en toda la celda)
        textCell.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(entry.text).then(() => {
                // Feedback visual
                const originalBg = textCell.style.backgroundColor;
                textCell.style.backgroundColor = 'rgba(76, 175, 80, 0.3)';
                copyIcon.textContent = '✓';
                copyIcon.style.opacity = '1';
                
                setTimeout(() => {
                    textCell.style.backgroundColor = originalBg;
                    copyIcon.textContent = '📋';
                    copyIcon.style.opacity = '0';
                }, 600);
                
                showCopyNotification('Text copied!');
            });
        });

        row.appendChild(textCell);

        // ===== COLUMNA 4: SOURCE (URL) =====
        const urlCell = document.createElement('td');
        urlCell.style.padding = '10px 8px';
        urlCell.style.borderRight = '1px solid rgba(192, 160, 128, 0.2)';
        urlCell.style.width = '65px';
        urlCell.style.minWidth = '85px';
        urlCell.style.maxWidth = '85px';
        
        if (entry.url) {
            const urlLink = document.createElement('a');
            urlLink.href = entry.url;
            urlLink.target = '_blank';
            
            try {
                const urlObj = new URL(entry.url);
                const hostname = urlObj.hostname.replace('www.', '');
                
                // Container para favicon + dominio
                const urlContainer = document.createElement('div');
                urlContainer.style.display = 'flex';
                urlContainer.style.alignItems = 'center';
                urlContainer.style.gap = '4px';
                urlContainer.style.overflow = 'hidden';
                
                // Icono de link
                const linkIcon = document.createElement('span');
                linkIcon.textContent = '🔗';
                linkIcon.style.fontSize = '11px';
                linkIcon.style.opacity = '0.7';
                linkIcon.style.flexShrink = '0';
                
                const domainSpan = document.createElement('span');
                domainSpan.textContent = hostname.length > 10 ? hostname.substring(0, 8) + '..' : hostname;
                domainSpan.style.fontSize = '9px';
                domainSpan.style.overflow = 'hidden';
                domainSpan.style.textOverflow = 'ellipsis';
                domainSpan.style.whiteSpace = 'nowrap';
                
                urlContainer.appendChild(linkIcon);
                urlContainer.appendChild(domainSpan);
                urlLink.appendChild(urlContainer);
            } catch (e) {
                urlLink.textContent = '🔗 Link';
                urlLink.style.fontSize = '9px';
            }
            
            urlLink.style.color = '#ffc400';
            urlLink.style.textDecoration = 'none';
            urlLink.style.transition = 'all 0.2s ease';
            
            urlLink.addEventListener('mouseenter', () => {
                urlLink.style.color = '#FFD700';
                urlLink.style.textDecoration = 'underline';
            });
            urlLink.addEventListener('mouseleave', () => {
                urlLink.style.color = '#ffc400';
                urlLink.style.textDecoration = 'none';
            });
            
            urlCell.appendChild(urlLink);
        } else {
            const noLink = document.createElement('span');
            noLink.textContent = '—';
            noLink.style.color = '#d4c5a3';
            noLink.style.opacity = '0.5';
            noLink.style.fontSize = '10px';
            urlCell.appendChild(noLink);
        }
        
        row.appendChild(urlCell);

        // ===== COLUMNA 5: FECHA =====
        const dateCell = document.createElement('td');
        dateCell.style.padding = '10px 6px';
        dateCell.style.textAlign = 'center';
        dateCell.style.fontSize = '9px';
        dateCell.style.color = '#d4c5a3';
        dateCell.style.width = '75px';
        dateCell.style.minWidth = '75px';
        dateCell.style.maxWidth = '75px';
        
        if (entry.date) {
            const date = new Date(entry.date);
            const dateContainer = document.createElement('div');
            dateContainer.style.display = 'flex';
            dateContainer.style.flexDirection = 'column';
            dateContainer.style.gap = '2px';
            
            const dateSpan = document.createElement('span');
            dateSpan.textContent = date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric'
            });
            dateSpan.style.fontWeight = 'bold';
            dateSpan.style.fontSize = '9px';
            
            const timeSpan = document.createElement('span');
            timeSpan.textContent = date.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit'
            });
            timeSpan.style.fontSize = '8px';
            timeSpan.style.opacity = '0.7';
            
            dateContainer.appendChild(dateSpan);
            dateContainer.appendChild(timeSpan);
            dateCell.appendChild(dateContainer);
        } else {
            dateCell.textContent = '—';
            dateCell.style.opacity = '0.5';
        }
        
        row.appendChild(dateCell);
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    
    // Footer con contador de entradas
    const footer = document.createElement('div');
    footer.style.padding = '8px 12px';
    footer.style.backgroundColor = '#795649';
    footer.style.borderTop = '2px solid #DAA520';
    footer.style.fontSize = '10px';
    footer.style.color = '#d4c5a3';
    footer.style.fontFamily = "'Righteous-Regular', sans-serif";
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    
    const countSpan = document.createElement('span');
    countSpan.textContent = `${dbItem.entries.length} entries`;
    countSpan.style.color = '#FFD700';
    
    const dbNameSpan = document.createElement('span');
    dbNameSpan.textContent = dbItem.name;
    dbNameSpan.style.opacity = '0.7';
    
    footer.appendChild(countSpan);
    footer.appendChild(dbNameSpan);
    tableWrapper.appendChild(footer);
    
    return tableWrapper;
}

// Función para mostrar notificación de copia
function showCopyNotification(message) {
    // Evitar múltiples notificaciones
    const existing = document.querySelector('.copy-notification');
    if (existing) {
        existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = 'copy-notification';
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.bottom = '15px';
    notification.style.right = '15px';
    notification.style.backgroundColor = 'rgba(76, 175, 80, 0.95)';
    notification.style.color = 'white';
    notification.style.padding = '8px 12px';
    notification.style.borderRadius = '6px';
    notification.style.fontFamily = "'Righteous-Regular', sans-serif";
    notification.style.fontSize = '11px';
    notification.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
    notification.style.zIndex = '1000';
    notification.style.animation = 'slideIn 0.2s ease-out';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.2s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 200);
    }, 1500);
}

// Agregar animaciones CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);