/**
 * DwarfVault - View Board Script
 *
 * Muestra todas las bases de datos en formato de tabla colapsable.
 * Los estilos viven en "styles Board.css" — este archivo no usa
 * element.style.xxx para mantener la separación HTML/CSS/JS.
 *
 * Depende de scripts/db.js para openDatabase().
 */

document.addEventListener('DOMContentLoaded', () => {
    loadAllDatabasesAsTables();
});

// ── Carga principal ───────────────────────────────────────────────────────────

/**
 * Obtiene todas las bases de datos y construye las tablas en el DOM.
 */
function loadAllDatabasesAsTables() {
    openDatabase((db) => {
        const store = db.transaction('databases', 'readonly').objectStore('databases');

        store.getAll().onsuccess = (event) => {
            const databases  = event.target.result;
            const container  = document.getElementById('tablesContainer');
            container.innerHTML = '';

            if (databases.length === 0) {
                const msg       = document.createElement('p');
                msg.className   = 'empty-message';
                msg.textContent = 'No databases found. Create one in the HOME page.';
                container.appendChild(msg);
                return;
            }

            const parents  = databases.filter(d => !d.parentDatabase);
            const children = databases.filter(d =>  d.parentDatabase);

            parents.forEach(dbItem => {
                const section = buildDatabaseSection(dbItem, children);
                container.appendChild(section);
            });
        };

        store.getAll().onerror = (event) => {
            console.error('[DwarfVault] Error al cargar las bases de datos:', event.target.error);
        };
    });
}

// ── Construcción del bloque por base de datos padre ──────────────────────────

/**
 * Construye el bloque colapsable completo de una BD padre con sus hijas.
 *
 * @param {Object}   dbItem   - BD padre.
 * @param {Object[]} children - Todas las BDs hija disponibles.
 * @returns {HTMLElement}
 */
function buildDatabaseSection(dbItem, children) {
    const myChildren  = children.filter(c => c.parentDatabase === dbItem.name);
    const totalEntries = dbItem.entries.length +
        myChildren.reduce((sum, c) => sum + c.entries.length, 0);

    // Contenedor principal
    const section   = document.createElement('div');
    section.className = 'db-section';

    // ── Header colapsable ──────────────────────────────────────────────────
    const header      = document.createElement('div');
    header.className  = 'db-header';

    // Lado izquierdo: icono ▼ + nombre
    const titleSection = document.createElement('div');
    titleSection.className = 'db-title-section';

    const toggleIcon   = document.createElement('span');
    toggleIcon.className = 'db-toggle-icon';
    toggleIcon.textContent = '⛏️ ';

    const titleText    = document.createElement('span');
    titleText.className  = 'db-title-text';
    titleText.textContent = `📁 ${dbItem.name}`;

    titleSection.appendChild(toggleIcon);
    titleSection.appendChild(titleText);

    // Lado derecho: contadores
    const infoSection  = document.createElement('div');
    infoSection.className = 'db-info-section';

    const entriesInfo  = document.createElement('span');
    entriesInfo.className   = 'db-info-entries';
    entriesInfo.textContent = `${dbItem.entries.length} entries`;

    const totalInfo    = document.createElement('span');
    totalInfo.className   = 'db-info-total';
    totalInfo.textContent = `Total: ${totalEntries}`;

    infoSection.appendChild(entriesInfo);

    if (myChildren.length > 0) {
        const childrenInfo    = document.createElement('span');
        childrenInfo.className   = 'db-info-children';
        childrenInfo.textContent = `${myChildren.length} sub-DB`;
        infoSection.appendChild(childrenInfo);
    }
    infoSection.appendChild(totalInfo);

    header.appendChild(titleSection);
    header.appendChild(infoSection);

    // ── Contenido colapsable ───────────────────────────────────────────────
    const content      = document.createElement('div');
    content.className  = 'db-content';

    const wrapper      = document.createElement('div');
    wrapper.className  = 'db-content-wrapper';

    // Entradas propias del padre
    if (dbItem.entries.length > 0) {
        const parentLabel       = document.createElement('div');
        parentLabel.className   = 'db-label';
        parentLabel.textContent = '📜 Parent Entries';
        wrapper.appendChild(parentLabel);
        wrapper.appendChild(createTableWrapper(dbItem));
    }

    // Bases de datos hijas
    myChildren.forEach((childDb, idx) => {
        // Separador visual entre entradas del padre y las hijas
        if (dbItem.entries.length > 0 && idx === 0) {
            const divider     = document.createElement('div');
            divider.className = 'db-child-divider';
            wrapper.appendChild(divider);
        }

        const childLabel       = document.createElement('div');
        childLabel.className   = `db-label db-label--child${idx > 0 ? ' db-label--spaced' : ''}`;
        childLabel.textContent = `↳ ${childDb.name} (${childDb.entries.length} entries)`;
        wrapper.appendChild(childLabel);

        if (childDb.entries.length > 0) {
            const childTable     = createTableWrapper(childDb);
            childTable.classList.add('table-wrapper--child');
            wrapper.appendChild(childTable);
        } else {
            const emptyMsg       = document.createElement('p');
            emptyMsg.className   = 'db-empty-child';
            emptyMsg.textContent = 'No entries yet';
            wrapper.appendChild(emptyMsg);
        }
    });

    content.appendChild(wrapper);

    // ── Lógica de colapso ──────────────────────────────────────────────────
    let expanded = false;
    header.addEventListener('click', () => {
        expanded = !expanded;
        if (expanded) {
            content.style.maxHeight = content.scrollHeight + 'px';
            toggleIcon.classList.add('db-toggle-icon--open');
        } else {
            content.style.maxHeight = '0';
            toggleIcon.classList.remove('db-toggle-icon--open');
        }
    });

    section.appendChild(header);
    section.appendChild(content);
    return section;
}

// ── Construcción de tabla ─────────────────────────────────────────────────────

/**
 * Construye el wrapper (borde + tabla + footer) para una BD.
 *
 * @param {Object} dbItem - BD con sus entradas.
 * @returns {HTMLElement}
 */
function createTableWrapper(dbItem) {
    const wrapper     = document.createElement('div');
    wrapper.className = 'table-wrapper';

    wrapper.appendChild(createTable(dbItem));

    // Footer con el número de entradas y el nombre de la BD
    const footer      = document.createElement('div');
    footer.className  = 'table-footer';

    const countSpan      = document.createElement('span');
    countSpan.className  = 'table-footer-count';
    countSpan.textContent = `${dbItem.entries.length} entries`;

    const nameSpan       = document.createElement('span');
    nameSpan.className   = 'table-footer-name';
    nameSpan.textContent = dbItem.name;

    footer.appendChild(countSpan);
    footer.appendChild(nameSpan);
    wrapper.appendChild(footer);

    return wrapper;
}

/**
 * Construye el elemento <table> con encabezados y filas de datos.
 *
 * @param {Object} dbItem
 * @returns {HTMLTableElement}
 */
function createTable(dbItem) {
    const table = document.createElement('table');

    // ── Encabezado ─────────────────────────────────────────────────────────
    const thead     = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const colDefs = [
        { text: '#',      cls: 'th-index'  },
        { text: '',       cls: 'th-favicon' },  // columna de favicon
        { text: 'TEXT',   cls: 'th-text'   },
        { text: 'SOURCE', cls: 'th-source' },
        { text: 'DATE',   cls: 'th-date'   }
    ];

    colDefs.forEach(col => {
        const th    = document.createElement('th');
        th.className  = col.cls;
        th.textContent = col.text;
        // La columna de favicon lleva un ícono SVG via CSS (clase th-favicon)
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // ── Cuerpo ─────────────────────────────────────────────────────────────
    const tbody = document.createElement('tbody');

    dbItem.entries.forEach((entry, index) => {
        tbody.appendChild(createTableRow(entry, index));
    });

    table.appendChild(tbody);
    return table;
}

/**
 * Construye una fila <tr> con los datos de una entrada.
 *
 * @param {Object} entry
 * @param {number} index - Posición (0-based).
 * @returns {HTMLTableRowElement}
 */
function createTableRow(entry, index) {
    const row = document.createElement('tr');

    // ── Col 1: número ──────────────────────────────────────────────────────
    const indexCell       = document.createElement('td');
    indexCell.className   = 'td-index';
    indexCell.textContent = index + 1;
    row.appendChild(indexCell);

    // ── Col 2: favicon ─────────────────────────────────────────────────────
    const faviconCell   = document.createElement('td');
    faviconCell.className = 'td-favicon';

    if (entry.favicon) {
        const img    = document.createElement('img');
        img.src      = entry.favicon;
        img.alt      = '';
        img.className = 'td-favicon__img';
        faviconCell.appendChild(img);
    } else {
        const ph    = document.createElement('div');
        ph.className  = 'td-favicon__placeholder';
        ph.textContent = '📄';
        faviconCell.appendChild(ph);
    }
    row.appendChild(faviconCell);

    // ── Col 3: texto (clic para copiar) ───────────────────────────────────
    const textCell   = document.createElement('td');
    textCell.className = 'td-text';

    const textContent = document.createElement('div');
    textContent.className = 'td-text__content';

    const textSpan    = document.createElement('span');
    textSpan.className  = 'td-text__span';
    textSpan.textContent = entry.text;
    textSpan.title       = entry.text; // tooltip completo

    const copyIcon    = document.createElement('span');
    copyIcon.className  = 'td-text__copy-icon';
    copyIcon.textContent = '📋';
    copyIcon.title       = 'Click to copy';

    textContent.appendChild(textSpan);
    textContent.appendChild(copyIcon);
    textCell.appendChild(textContent);

    textCell.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(entry.text).then(() => {
            textCell.classList.add('td-text--copied');
            copyIcon.textContent = '✓';
            setTimeout(() => {
                textCell.classList.remove('td-text--copied');
                copyIcon.textContent = '📋';
            }, 600);
            showCopyNotification('Text copied!');
        });
    });

    row.appendChild(textCell);

    // ── Col 4: URL (source) ────────────────────────────────────────────────
    const urlCell   = document.createElement('td');
    urlCell.className = 'td-url';

    if (entry.url) {
        const link   = document.createElement('a');
        link.href    = entry.url;
        link.target  = '_blank';
        link.rel     = 'noopener noreferrer';

        try {
            const urlObj   = new URL(entry.url);
            const hostname = urlObj.hostname.replace('www.', '');

            const urlContainer = document.createElement('div');
            urlContainer.className = 'td-url__container';

            const linkIcon       = document.createElement('span');
            linkIcon.className   = 'td-url__icon';
            linkIcon.textContent = '🔗';

            const domain         = document.createElement('span');
            domain.className     = 'td-url__domain';
            domain.textContent   = hostname.length > 10
                ? hostname.substring(0, 8) + '..'
                : hostname;

            urlContainer.appendChild(linkIcon);
            urlContainer.appendChild(domain);
            link.appendChild(urlContainer);
        } catch {
            link.textContent = '🔗 Link';
            link.className   = 'td-url__fallback';
        }

        urlCell.appendChild(link);
    } else {
        const dash       = document.createElement('span');
        dash.className   = 'td-url__empty';
        dash.textContent = '—';
        urlCell.appendChild(dash);
    }

    row.appendChild(urlCell);

    // ── Col 5: fecha ───────────────────────────────────────────────────────
    const dateCell   = document.createElement('td');
    dateCell.className = 'td-date';

    if (entry.date) {
        const date   = new Date(entry.date);

        const dateContainer = document.createElement('div');
        dateContainer.className = 'td-date__container';

        const daySpan       = document.createElement('span');
        daySpan.className   = 'td-date__day';
        daySpan.textContent = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const timeSpan      = document.createElement('span');
        timeSpan.className  = 'td-date__time';
        timeSpan.textContent = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        dateContainer.appendChild(daySpan);
        dateContainer.appendChild(timeSpan);
        dateCell.appendChild(dateContainer);
    } else {
        dateCell.textContent = '—';
        dateCell.classList.add('td-date--empty');
    }

    row.appendChild(dateCell);
    return row;
}

// ── Notificación de copia ─────────────────────────────────────────────────────

/**
 * Muestra una notificación toast que confirma que el texto fue copiado.
 *
 * @param {string} message
 */
function showCopyNotification(message) {
    // Remover notificación previa si existe
    document.querySelector('.copy-notification')?.remove();

    const notification       = document.createElement('div');
    notification.className   = 'copy-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('copy-notification--hiding');
        setTimeout(() => notification.remove(), 200);
    }, 1500);
}
