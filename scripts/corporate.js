/**
 * DwarfVault — Corporate spreadsheet view (visual layer)
 *
 * Lee y escribe en el MISMO IndexedDB que la versión dwarven (store
 * `databases`, schema `{ name, parentDatabase?, data: [{text,url,favicon}] }`).
 * Esto significa que el backend (service worker, esquema, menú contextual)
 * no se toca. Después de cada mutación enviamos el mensaje
 * `{action:'updateContextMenu'}` que background.js ya maneja, para
 * mantener el menú contextual sincronizado.
 *
 * UX:
 *  - Top toolbar: dropdown de vault padre + CRUD + search + CSV import/export
 *  - Grid central: 3 columnas (# | Text | URL), favicon inline en Text,
 *    doble-click sobre celda → input editable (Enter/blur guarda, Esc cancela)
 *  - Bottom tabs: si el padre tiene hijos, se navega entre ellos. Si el padre
 *    tiene entradas propias, aparece su propia tab con el badge PARENT.
 *    Si solo existe el padre sin hijos, no se muestran tabs.
 */
(function () {
    'use strict';

    // ── State ───────────────────────────────────────────────────
    let allDbs        = [];
    let currentParent = '';
    let currentSheet  = '';

    // ── DOM refs ────────────────────────────────────────────────
    const vaultSelect = document.getElementById('vaultSelect');
    const gridBody    = document.getElementById('sheetGridBody');
    const sheetEmpty  = document.getElementById('sheetEmpty');
    const sheetTabs   = document.getElementById('sheetTabs');
    const searchInput = document.getElementById('searchInput');
    const importInput = document.getElementById('importInput');
    const toastEl     = document.getElementById('sheetToast');

    // ── IndexedDB helpers (Promise wrappers sobre db.js) ────────
    function getDb() {
        return new Promise((resolve, reject) => {
            try { openDatabase(resolve); } catch (e) { reject(e); }
        });
    }

    async function loadAll() {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction('databases', 'readonly');
            const req = tx.objectStore('databases').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror   = () => reject(req.error);
        });
    }

    async function putRecord(record) {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('databases', 'readwrite');
            tx.objectStore('databases').put(record);
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);
        });
    }

    async function deleteRecord(name) {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('databases', 'readwrite');
            tx.objectStore('databases').delete(name);
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);
        });
    }

    /** Reutiliza el handler existente del background; no toca background.js. */
    function notifyBackground() {
        try { chrome.runtime.sendMessage({ action: 'updateContextMenu' }); }
        catch (_e) { /* contexto no-extensión (dev directo) */ }
    }

    // ── Domain queries ──────────────────────────────────────────
    function parents()              { return allDbs.filter(d => !d.parentDatabase); }
    function children(parentName)   { return allDbs.filter(d => d.parentDatabase === parentName); }
    function getRecord(name)        { return allDbs.find(d => d.name === name); }
    function parentHasData(name) {
        const r = getRecord(name);
        return !!(r && Array.isArray(r.entries) && r.entries.length > 0);
    }

    // Nº mínimo de filas que renderiza la rejilla siempre — replica el feel
    // "siempre veo la cuadrícula" de Excel/Sheets. Si hay más entradas que esto,
    // la tabla simplemente crece. Si hay menos, rellenamos con filas vacías.
    const MIN_VISIBLE_ROWS = 18;

    // ── Toast ───────────────────────────────────────────────────
    let toastTimer = null;
    function showToast(msg, isError) {
        toastEl.textContent = msg;
        toastEl.classList.toggle('toast-error', !!isError);
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
    }

    // ── Render: vault dropdown ──────────────────────────────────
    function renderVaultDropdown() {
        const list = parents();
        vaultSelect.innerHTML = '';

        if (list.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No vaults yet — create one →';
            vaultSelect.appendChild(opt);
            vaultSelect.disabled = true;
            return;
        }
        vaultSelect.disabled = false;

        list.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            vaultSelect.appendChild(opt);
        });
        if (currentParent) vaultSelect.value = currentParent;
    }

    // ── Render: bottom tabs ─────────────────────────────────────
    function renderTabs() {
        sheetTabs.innerHTML = '';
        if (!currentParent) { sheetTabs.hidden = true; return; }

        const kids      = children(currentParent);
        const parentHas = parentHasData(currentParent);

        // Solo un sheet (padre sin hijos) → no mostramos navegación.
        if (kids.length === 0) {
            sheetTabs.hidden = true;
            return;
        }
        sheetTabs.hidden = false;

        if (parentHas) sheetTabs.appendChild(buildTab(currentParent, true));
        kids.forEach(c => sheetTabs.appendChild(buildTab(c.name, false)));

        // "+" para crear nueva child sheet rápidamente.
        const addBtn = document.createElement('button');
        addBtn.type        = 'button';
        addBtn.className   = 'sheet-tab-add';
        addBtn.textContent = '+';
        addBtn.title       = 'New child sheet';
        addBtn.addEventListener('click', onCreateChild);
        sheetTabs.appendChild(addBtn);
    }

    function buildTab(name, isParent) {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'sheet-tab' + (isParent ? ' parent-tab' : '') + (name === currentSheet ? ' active' : '');
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(name === currentSheet));
        btn.title = name;

        const label = document.createElement('span');
        label.className   = 'tab-label';
        label.textContent = name;
        btn.appendChild(label);

        if (isParent) {
            const badge = document.createElement('span');
            badge.className   = 'tab-badge';
            badge.textContent = 'PARENT';
            btn.appendChild(badge);
        }

        btn.addEventListener('click', () => {
            if (currentSheet === name) return;
            currentSheet = name;
            renderTabs();
            renderGrid();
            updateToolbarState();
        });
        return btn;
    }

    // ── Render: grid ────────────────────────────────────────────
    // Política: la rejilla SIEMPRE se ve. Si no hay sheet seleccionada,
    // mostramos solo filas vacías. Si hay sheet, mostramos sus entradas y
    // rellenamos hasta MIN_VISIBLE_ROWS con filas placeholder.
    function renderGrid() {
        gridBody.innerHTML = '';

        const sheet   = currentSheet ? getRecord(currentSheet) : null;
        const entries = (sheet && Array.isArray(sheet.entries)) ? sheet.entries : [];

        // Solo mostramos el hint flotante cuando no hay ningún vault todavía.
        sheetEmpty.hidden = parents().length > 0;

        entries.forEach((entry, idx) => gridBody.appendChild(buildRow(entry, idx)));

        const padFrom = entries.length;
        const padTo   = Math.max(MIN_VISIBLE_ROWS, entries.length);
        for (let i = padFrom; i < padTo; i++) {
            gridBody.appendChild(buildEmptyRow(i));
        }

        applySearchFilter();
    }

    function buildRow(entry, idx) {
        const tr = document.createElement('tr');
        tr.dataset.idx = String(idx);

        // # — no editable
        const tdIdx = document.createElement('td');
        tdIdx.className   = 'cell-index';
        tdIdx.textContent = String(idx + 1);
        tr.appendChild(tdIdx);

        // Favicon — columna propia, no editable (metadato derivado de la URL).
        const tdFav = document.createElement('td');
        tdFav.className = 'cell-favicon';
        renderFaviconCell(tdFav, entry);
        tr.appendChild(tdFav);

        // Text — doble-click abre el modal REFORGE ENTRY enfocando textarea.
        const tdText = document.createElement('td');
        tdText.className     = 'cell-text';
        tdText.dataset.field = 'text';
        renderTextCell(tdText, entry);
        tdText.addEventListener('dblclick', () => openEditModal(entry, idx, 'text'));
        tr.appendChild(tdText);

        // URL — doble-click abre el mismo modal, enfocando el input URL.
        const tdUrl = document.createElement('td');
        tdUrl.className     = 'cell-url';
        tdUrl.dataset.field = 'url';
        tdUrl.textContent   = entry.url || '';
        tdUrl.title         = entry.url || '';
        tdUrl.addEventListener('dblclick', () => openEditModal(entry, idx, 'url'));
        tr.appendChild(tdUrl);

        return tr;
    }

    function buildEmptyRow(idx) {
        const tr = document.createElement('tr');
        tr.className = 'row-empty';

        const tdIdx = document.createElement('td');
        tdIdx.className   = 'cell-index';
        tdIdx.textContent = String(idx + 1);
        tr.appendChild(tdIdx);

        const tdFav = document.createElement('td');
        tdFav.className = 'cell-favicon cell-empty';
        tr.appendChild(tdFav);

        const tdText = document.createElement('td');
        tdText.className = 'cell-text cell-empty';
        tr.appendChild(tdText);

        const tdUrl = document.createElement('td');
        tdUrl.className = 'cell-url cell-empty';
        tr.appendChild(tdUrl);

        return tr;
    }

    function renderFaviconCell(td, entry) {
        td.innerHTML = '';
        const safeFav = (window.DwarfSecurity && DwarfSecurity.safeFaviconOrEmpty)
            ? DwarfSecurity.safeFaviconOrEmpty(entry.favicon)
            : '';
        if (!safeFav) return;

        const img = document.createElement('img');
        img.className = 'cell-favicon-img';
        img.src       = safeFav;
        img.alt       = '';
        img.title     = entry.url || '';
        img.addEventListener('error', () => img.remove());
        td.appendChild(img);
    }

    function renderTextCell(td, entry) {
        td.innerHTML = '';
        const span = document.createElement('span');
        span.textContent = (entry.text || '').split('\n')[0];
        td.appendChild(span);
        td.title = entry.text || '';
    }

    // ── Edit modal (reciclado del REFORGE ENTRY dwarven) ────────
    // Abre un modal con textarea (preserva \n) + input de URL. Save
    // escribe ambos campos a IndexedDB de una sola pasada y refresca
    // la rejilla. focusField controla a qué campo va el foco inicial.
    function openEditModal(entry, idx, focusField) {
        // Si hubiera uno abierto (race condition), lo cerramos primero.
        document.querySelector('.edit-modal-backdrop')?.remove();

        const backdrop = document.createElement('div');
        backdrop.className = 'edit-modal-backdrop';

        const modal = document.createElement('div');
        modal.className = 'edit-modal';

        const title = document.createElement('h3');
        title.className   = 'edit-modal-title';
        title.textContent = '✏️ REFORGE ENTRY';
        modal.appendChild(title);

        // Textarea: white-space:pre-wrap garantiza que se vean los saltos
        // de línea exactamente como están guardados.
        const textLabel = document.createElement('label');
        textLabel.className   = 'edit-modal-label';
        textLabel.textContent = 'Text';
        modal.appendChild(textLabel);

        const textarea = document.createElement('textarea');
        textarea.className  = 'edit-modal-textarea';
        textarea.value      = entry.text || '';
        textarea.spellcheck = false;
        modal.appendChild(textarea);

        const urlLabel = document.createElement('label');
        urlLabel.className   = 'edit-modal-label';
        urlLabel.textContent = 'URL';
        modal.appendChild(urlLabel);

        const urlInput = document.createElement('input');
        urlInput.type      = 'url';
        urlInput.className = 'edit-modal-url';
        urlInput.value     = entry.url || '';
        modal.appendChild(urlInput);

        const btnRow = document.createElement('div');
        btnRow.className = 'edit-modal-actions';

        const saveBtn       = document.createElement('button');
        saveBtn.textContent = '💾 Save';
        saveBtn.className   = 'save-btn';

        const cancelBtn       = document.createElement('button');
        cancelBtn.textContent = '✖ Cancel';
        cancelBtn.className   = 'cancel-btn';

        btnRow.appendChild(saveBtn);
        btnRow.appendChild(cancelBtn);
        modal.appendChild(btnRow);

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        // Foco al campo correspondiente a la celda clickeada.
        if (focusField === 'url') {
            urlInput.focus();
            urlInput.select();
        } else {
            textarea.focus();
            // No select() para no perder el caret si el texto es largo.
        }

        const close = () => {
            backdrop.remove();
            document.removeEventListener('keydown', onKey);
        };

        // Esc cierra sin guardar; Ctrl/Cmd+Enter guarda.
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveBtn.click();
            }
        };
        document.addEventListener('keydown', onKey);

        // Click fuera del modal cierra sin guardar.
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });

        cancelBtn.addEventListener('click', close);

        saveBtn.addEventListener('click', async () => {
            const newText = textarea.value;
            const newUrl  = urlInput.value;
            try {
                const record = getRecord(currentSheet);
                record.entries[idx].text = newText;
                record.entries[idx].url  = newUrl;
                await putRecord(record);
                entry.text = newText;
                entry.url  = newUrl;
                notifyBackground();
                close();
                await refresh({ selectParent: currentParent, selectSheet: currentSheet });
                showToast('Saved');
            } catch (err) {
                console.error('[Corporate] Save (modal) failed:', err);
                showToast('Save failed', true);
            }
        });
    }

    // ── Emoji picker (reutiliza emojis.json de la vista dwarven) ─
    // Se carga una sola vez y se cachea. Si falla, el modal de nombre
    // simplemente no muestra rejilla (no rompe el flujo de crear/renombrar).
    let emojiCache = null;
    async function loadEmojis() {
        if (emojiCache) return emojiCache;
        try {
            const res  = await fetch(chrome.runtime.getURL('emojis.json'));
            const list = await res.json();
            // Dedup + quita vacíos (emojis.json trae repetidos y líneas en blanco).
            emojiCache = [...new Set(list.filter(e => e && e.trim()))];
        } catch (e) {
            console.error('[Corporate] Could not load emojis:', e);
            emojiCache = [];
        }
        return emojiCache;
    }

    // ── Name modal (crear parent / child / rename) ──────────────
    // Ventana al estilo del REFORGE ENTRY: input de nombre + rejilla de
    // emojis siempre visible. Al clickear un emoji se inserta en la
    // posición del cursor del input (permite varios y en cualquier lugar).
    //   onSubmit(name) → Promise. Si devuelve false la ventana NO se cierra
    //   (validación fallida; el caller ya mostró el toast).
    function openNameModal({ title, initialValue = '', confirmLabel = '💾 Save', onSubmit }) {
        document.querySelector('.edit-modal-backdrop')?.remove();

        const backdrop = document.createElement('div');
        backdrop.className = 'edit-modal-backdrop';

        const modal = document.createElement('div');
        modal.className = 'edit-modal';

        const titleEl = document.createElement('h3');
        titleEl.className   = 'edit-modal-title';
        titleEl.textContent = title;
        modal.appendChild(titleEl);

        const nameLabel = document.createElement('label');
        nameLabel.className   = 'edit-modal-label';
        nameLabel.textContent = 'Name';
        modal.appendChild(nameLabel);

        const nameInput = document.createElement('input');
        nameInput.type      = 'text';
        nameInput.className  = 'edit-modal-url';   // reutiliza el estilo del input URL
        nameInput.value      = initialValue;
        nameInput.spellcheck = false;
        modal.appendChild(nameInput);

        const emojiLabel = document.createElement('label');
        emojiLabel.className   = 'edit-modal-label';
        emojiLabel.textContent = 'Emoji';
        modal.appendChild(emojiLabel);

        const grid = document.createElement('div');
        grid.className = 'name-modal-emojis';
        modal.appendChild(grid);

        // Recuerda dónde estaba el cursor: el input pierde el foco al
        // clickear un emoji, así que guardamos la posición en cada cambio.
        let caret = nameInput.value.length;
        const trackCaret = () => { caret = nameInput.selectionStart ?? nameInput.value.length; };
        nameInput.addEventListener('keyup', trackCaret);
        nameInput.addEventListener('click', trackCaret);
        nameInput.addEventListener('select', trackCaret);

        loadEmojis().then(emojis => {
            emojis.forEach(emoji => {
                const span = document.createElement('button');
                span.type        = 'button';
                span.className   = 'name-modal-emoji';
                span.textContent = emoji;
                span.tabIndex    = -1;   // no rompe el tab-flow del input/botones
                // mousedown (no click) evita el blur previo → caret se conserva.
                span.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const v = nameInput.value;
                    const pos = Math.min(caret, v.length);
                    nameInput.value = v.slice(0, pos) + emoji + v.slice(pos);
                    const next = pos + emoji.length;
                    nameInput.focus();
                    nameInput.setSelectionRange(next, next);
                    caret = next;
                });
                grid.appendChild(span);
            });
        });

        const btnRow = document.createElement('div');
        btnRow.className = 'edit-modal-actions';

        const saveBtn       = document.createElement('button');
        saveBtn.textContent = confirmLabel;
        saveBtn.className   = 'save-btn';

        const cancelBtn       = document.createElement('button');
        cancelBtn.textContent = '✖ Cancel';
        cancelBtn.className   = 'cancel-btn';

        btnRow.appendChild(saveBtn);
        btnRow.appendChild(cancelBtn);
        modal.appendChild(btnRow);

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        nameInput.focus();
        nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);

        const close = () => {
            backdrop.remove();
            document.removeEventListener('keydown', onKey);
        };

        const submit = async () => {
            const name = nameInput.value.trim();
            const result = await onSubmit(name);
            if (result !== false) close();
        };

        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'Enter') { e.preventDefault(); submit(); }
        };
        document.addEventListener('keydown', onKey);

        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
        cancelBtn.addEventListener('click', close);
        saveBtn.addEventListener('click', submit);
    }

    // ── Options dialog (Quick Access — context menu bindings) ───
    // Configuración GLOBAL (no por hoja): qué vault alimenta Favorites y
    // Links del menú contextual del navegador, y si ambos se sincronizan.
    // Se guarda en chrome.storage.local (mismas claves que la vista dwarven:
    // activeFavoritesDb / activeLinksDb / quickAccessLinked) y al guardar se
    // notifica a background.js con {action:'updateContextMenu'}.
    //
    // Cambios pendientes en memoria → se aplican TODOS al pulsar Save; Cancel
    // descarta sin tocar storage. Sync mirror funciona en vivo dentro del modal.

    // Llena un <select> con (None) + padres y sus hijos indentados.
    function fillVaultOptions(select, activeValue) {
        select.innerHTML = '';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '(None)';
        select.appendChild(none);

        const parents = allDbs.filter(d => !d.parentDatabase);
        parents.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            select.appendChild(opt);
            allDbs.filter(c => c.parentDatabase === p.name).forEach(c => {
                const co = document.createElement('option');
                co.value = c.name;
                co.textContent = `  ↳ ${c.name}`;
                select.appendChild(co);
            });
        });
        select.value = activeValue || '';
    }

    function onContextMenu() {
        chrome.storage.local.get(
            ['activeFavoritesDb', 'activeLinksDb', 'quickAccessLinked'],
            (s) => openContextMenuModal(s.activeFavoritesDb, s.activeLinksDb, !!s.quickAccessLinked)
        );
    }

    function openContextMenuModal(favVal, linksVal, linked) {
        document.querySelector('.edit-modal-backdrop')?.remove();

        const backdrop = document.createElement('div');
        backdrop.className = 'edit-modal-backdrop';
        const modal = document.createElement('div');
        modal.className = 'edit-modal';

        const title = document.createElement('h3');
        title.className   = 'edit-modal-title';
        title.textContent = '🗂 Context Menu';
        modal.appendChild(title);

        const section = document.createElement('p');
        section.className   = 'options-section-title';
        section.textContent = 'Context menu';
        modal.appendChild(section);

        // ── ⭐ Favorites | 🔗 Links en dos columnas (mismo layout que el
        //    "QUICK ACCESS" de la vista vieja: selects lado a lado). ──
        const grid = document.createElement('div');
        grid.className = 'qa-grid';

        const favCol = document.createElement('div');
        favCol.className = 'qa-col';
        const favLabel = document.createElement('label');
        favLabel.className   = 'edit-modal-label';
        favLabel.textContent = '⭐ FAVORITES';
        const favSelect = document.createElement('select');
        favSelect.className = 'toolbar-select options-select';
        fillVaultOptions(favSelect, favVal);
        favCol.appendChild(favLabel);
        favCol.appendChild(favSelect);

        const linksCol = document.createElement('div');
        linksCol.className = 'qa-col';
        const linksLabel = document.createElement('label');
        linksLabel.className   = 'edit-modal-label';
        linksLabel.textContent = '🔗 LINKS';
        const linksSelect = document.createElement('select');
        linksSelect.className = 'toolbar-select options-select';
        fillVaultOptions(linksSelect, linksVal);
        linksCol.appendChild(linksLabel);
        linksCol.appendChild(linksSelect);

        grid.appendChild(favCol);
        grid.appendChild(linksCol);
        modal.appendChild(grid);

        // ── Botón Sync full-width debajo (estilo viejo: verde al enlazar). ──
        // Toggle pendiente: se aplica al pulsar Save junto con los selects.
        let linkedState = linked;
        const syncBtn = document.createElement('button');
        syncBtn.type     = 'button';
        syncBtn.className = 'dwarf-btn qa-sync';
        const paintSync = (on) => {
            syncBtn.classList.toggle('link-btn-active', on);
            syncBtn.textContent = on
                ? '⛓️ LINKED ✓ — Favorites & Links in sync'
                : '⛓️ LINK — Sync Favorites & Links';
        };
        paintSync(linkedState);
        modal.appendChild(syncBtn);

        // Mirror en vivo dentro del modal (igual que la vista dwarven).
        favSelect.addEventListener('change', () => {
            if (linkedState) linksSelect.value = favSelect.value;
        });
        linksSelect.addEventListener('change', () => {
            if (linkedState) favSelect.value = linksSelect.value;
        });
        syncBtn.addEventListener('click', () => {
            linkedState = !linkedState;
            paintSync(linkedState);
            if (linkedState) linksSelect.value = favSelect.value; // al enlazar: Links ← Favorites
        });

        // ── 🔒 Native Click (toggle por-pestaña, aplica al instante) ──
        // Delegado en contextUnlock.js: lee/pinta/escucha el click solo.
        // No depende del botón Save (es un estado de la pestaña activa).
        const pageTitle = document.createElement('p');
        pageTitle.className   = 'options-section-title';
        pageTitle.textContent = 'Active page';
        modal.appendChild(pageTitle);

        const nativeBtn = document.createElement('button');
        nativeBtn.type      = 'button';
        nativeBtn.className  = 'dwarf-btn ctx-toggle';
        nativeBtn.textContent = '🔒 NATIVE CLICK — OFF';
        modal.appendChild(nativeBtn);
        if (window.DwarfContextUnlock) {
            DwarfContextUnlock.init(nativeBtn);
        } else {
            nativeBtn.disabled = true;
            nativeBtn.title    = 'Native click module not loaded.';
        }

        const btnRow = document.createElement('div');
        btnRow.className = 'edit-modal-actions';
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '💾 Save';
        saveBtn.className   = 'save-btn';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '✖ Cancel';
        cancelBtn.className   = 'cancel-btn';
        btnRow.appendChild(saveBtn);
        btnRow.appendChild(cancelBtn);
        modal.appendChild(btnRow);

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        const close = () => {
            backdrop.remove();
            document.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveBtn.click(); }
        };
        document.addEventListener('keydown', onKey);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
        cancelBtn.addEventListener('click', close);

        saveBtn.addEventListener('click', () => {
            chrome.storage.local.set({
                activeFavoritesDb: favSelect.value || null,
                activeLinksDb:     linksSelect.value || null,
                quickAccessLinked: linkedState
            }, () => {
                notifyBackground();
                close();
                showToast('Options saved');
            });
        });
    }

    // ── Settings dialog (preferencias generales) ────────────────
    // Por ahora solo el toggle de Notifications (🔔/🔕). Es un toggle vivo
    // (aplica al instante vía DwarfNotify), por eso la ventana solo necesita
    // un botón "Close", no Save/Cancel.
    function onSettings() {
        document.querySelector('.edit-modal-backdrop')?.remove();

        const backdrop = document.createElement('div');
        backdrop.className = 'edit-modal-backdrop';
        const modal = document.createElement('div');
        modal.className = 'edit-modal';

        const title = document.createElement('h3');
        title.className   = 'edit-modal-title';
        title.textContent = '⚙ Settings';
        modal.appendChild(title);

        const section = document.createElement('p');
        section.className   = 'options-section-title';
        section.textContent = 'General';
        modal.appendChild(section);

        const notifBtn = document.createElement('button');
        notifBtn.type     = 'button';
        notifBtn.className = 'dwarf-btn';
        modal.appendChild(notifBtn);

        const paintNotif = (enabled) => {
            notifBtn.classList.toggle('notif-btn-off', !enabled);
            notifBtn.textContent = enabled ? '🔔 NOTIFICATIONS — ON' : '🔕 NOTIFICATIONS — OFF';
        };
        if (window.DwarfNotify) {
            DwarfNotify.isEnabled().then(paintNotif);
            notifBtn.addEventListener('click', async () => {
                const current = await DwarfNotify.isEnabled();
                await DwarfNotify.setEnabled(!current);
                paintNotif(!current);
            });
        } else {
            paintNotif(true);
            notifBtn.disabled = true;
            notifBtn.title    = 'Notifications module not loaded.';
        }

        const btnRow = document.createElement('div');
        btnRow.className = 'edit-modal-actions';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✖ Close';
        closeBtn.className   = 'cancel-btn';
        btnRow.appendChild(closeBtn);
        modal.appendChild(btnRow);

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        const close = () => {
            backdrop.remove();
            document.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        document.addEventListener('keydown', onKey);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
        closeBtn.addEventListener('click', close);
    }

    // ── CRUD ────────────────────────────────────────────────────
    function onCreateParent() {
        openNameModal({
            title: '⛏️ New Parent Vault',
            onSubmit: async (name) => {
                if (!name)           { showToast('Name cannot be empty', true); return false; }
                if (getRecord(name)) { showToast('A vault with that name already exists', true); return false; }
                try {
                    await putRecord({ name, parentDatabase: null, entries: [] });
                    notifyBackground();
                    await refresh({ selectParent: name, selectSheet: name });
                    showToast(`Vault "${name}" created`);
                } catch (e) {
                    console.error('[Corporate] Create parent failed:', e);
                    showToast('Could not create vault', true);
                    return false;
                }
            }
        });
    }

    function onCreateChild() {
        if (!currentParent) { showToast('Pick a parent vault first', true); return; }
        openNameModal({
            title: `🔨 New Child inside "${currentParent}"`,
            onSubmit: async (name) => {
                if (!name)           { showToast('Name cannot be empty', true); return false; }
                if (getRecord(name)) { showToast('A vault with that name already exists', true); return false; }
                try {
                    await putRecord({ name, parentDatabase: currentParent, entries: [] });
                    notifyBackground();
                    await refresh({ selectParent: currentParent, selectSheet: name });
                    showToast(`Sheet "${name}" created`);
                } catch (e) {
                    console.error('[Corporate] Create child failed:', e);
                    showToast('Could not create sheet', true);
                    return false;
                }
            }
        });
    }

    function onRename() {
        if (!currentSheet) return;
        openNameModal({
            title: `✎ Rename "${currentSheet}"`,
            initialValue: currentSheet,
            onSubmit: (newName) => doRename(newName)
        });
    }

    async function doRename(newName) {
        if (!newName)                  { showToast('Name cannot be empty', true); return false; }
        if (newName === currentSheet)  return; // sin cambios → cierra silenciosamente
        if (getRecord(newName))        { showToast('A vault with that name already exists', true); return false; }

        try {
            const record         = getRecord(currentSheet);
            const isParentVault  = !record.parentDatabase;
            const oldName        = currentSheet;

            // 1) Crear el registro renombrado primero (no perdemos data si algo falla).
            await putRecord({ ...record, name: newName });

            // 2) Re-apuntar los hijos si era un padre.
            if (isParentVault) {
                const kids = children(oldName);
                for (const kid of kids) {
                    await putRecord({ ...kid, parentDatabase: newName });
                }
            }

            // 3) Borrar el registro viejo.
            await deleteRecord(oldName);

            notifyBackground();
            const nextParent = isParentVault ? newName : currentParent;
            await refresh({ selectParent: nextParent, selectSheet: newName });
            showToast('Renamed');
        } catch (e) {
            console.error('[Corporate] Rename failed:', e);
            showToast('Rename failed', true);
        }
    }

    async function onDelete() {
        if (!currentSheet) return;
        const record = getRecord(currentSheet);
        if (!record) return;
        const isParentVault = !record.parentDatabase;

        let msg = `Delete "${currentSheet}"? This cannot be undone.`;
        if (isParentVault) {
            const kids = children(currentSheet);
            if (kids.length > 0) {
                msg += `\n\nWARNING: ${kids.length} child sheet(s) will also be deleted:\n` +
                       kids.map(k => `- ${k.name}`).join('\n');
            }
        }
        if (!confirm(msg)) return;

        try {
            const kids = isParentVault ? children(currentSheet) : [];
            await deleteRecord(currentSheet);
            for (const kid of kids) await deleteRecord(kid.name);
            notifyBackground();
            await refresh({});
            showToast('Deleted');
        } catch (e) {
            console.error('[Corporate] Delete failed:', e);
            showToast('Delete failed', true);
        }
    }

    // ── Search ──────────────────────────────────────────────────
    function applySearchFilter() {
        const q = (searchInput.value || '').trim().toLowerCase();
        const rows = gridBody.querySelectorAll('tr');

        if (!q) {
            rows.forEach(tr => tr.classList.remove('row-hidden'));
            return;
        }
        // Selectores por clase — sobreviven a reordenar columnas.
        rows.forEach(tr => {
            const textCell = tr.querySelector('.cell-text');
            const urlCell  = tr.querySelector('.cell-url');
            const text = ((textCell && (textCell.title || textCell.textContent)) || '').toLowerCase();
            const url  = ((urlCell  && (urlCell .title || urlCell .textContent)) || '').toLowerCase();
            tr.classList.toggle('row-hidden', !(text.includes(q) || url.includes(q)));
        });
    }

    // ── CSV ─────────────────────────────────────────────────────
    function csvEscape(s) {
        const str = String(s == null ? '' : s);
        return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }

    function csvParseLine(line) {
        const out = []; let cur = ''; let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (inQuote) {
                if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (c === '"') { inQuote = false; }
                else                 { cur += c; }
            } else {
                if      (c === ',') { out.push(cur); cur = ''; }
                else if (c === '"') { inQuote = true; }
                else                 { cur += c; }
            }
        }
        out.push(cur);
        return out;
    }

    function csvParse(text) {
        // Soporta saltos de línea dentro de campos entre comillas.
        const rows = []; let buf = ''; let inQuote = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '"') inQuote = !inQuote;
            if ((c === '\n' || c === '\r') && !inQuote) {
                if (c === '\r' && text[i + 1] === '\n') i++;
                if (buf.length > 0) { rows.push(csvParseLine(buf)); buf = ''; }
            } else {
                buf += c;
            }
        }
        if (buf.length > 0) rows.push(csvParseLine(buf));
        return rows;
    }

    function onExport() {
        if (!currentSheet) return;
        const record = getRecord(currentSheet);
        if (!record) return;

        const rows = [['#', 'text', 'url', 'favicon']];
        (record.entries || []).forEach((e, i) => {
            rows.push([i + 1, e.text || '', e.url || '', e.favicon || '']);
        });
        const csv  = rows.map(r => r.map(csvEscape).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${currentSheet}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Exported');
    }

    async function onImport(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file || !currentSheet) return;

        try {
            const text = await file.text();
            const rows = csvParse(text);
            if (rows.length === 0) { showToast('CSV is empty', true); return; }

            const head      = rows[0].map(s => (s || '').toLowerCase());
            const hasHeader = head.includes('text') || head.includes('url');
            const dataRows  = hasHeader ? rows.slice(1) : rows;

            // Layouts aceptados:
            //   4 cols: #, text, url, favicon  (formato del export propio)
            //   3 cols: text, url, favicon
            //   2 cols: text, url
            const nowISO = new Date().toISOString();
            const parsed = dataRows
                .filter(r => r.some(c => c && c.length > 0))
                .map(r => {
                    // Mantenemos `date` (campo del schema dwarven) para que las
                    // entradas importadas sean indistinguibles de las nativas.
                    if (r.length >= 4)  return { text: r[1] || '', url: r[2] || '', favicon: r[3] || '', date: nowISO };
                    if (r.length === 3) return { text: r[0] || '', url: r[1] || '', favicon: r[2] || '', date: nowISO };
                    if (r.length === 2) return { text: r[0] || '', url: r[1] || '', favicon: '',         date: nowISO };
                    return { text: r[0] || '', url: '', favicon: '', date: nowISO };
                });

            if (parsed.length === 0) { showToast('No rows to import', true); return; }

            const append = confirm(
                `Import ${parsed.length} row(s) into "${currentSheet}"?\n\n` +
                `OK  = Append to existing entries\n` +
                `Cancel = Replace all entries`
            );

            const record   = getRecord(currentSheet);
            record.entries = append ? (record.entries || []).concat(parsed) : parsed;
            await putRecord(record);
            notifyBackground();
            await refresh({ selectParent: currentParent, selectSheet: currentSheet });
            showToast(`Imported (${append ? 'append' : 'replace'}): ${parsed.length} row(s)`);
        } catch (e) {
            console.error('[Corporate] Import failed:', e);
            showToast('Import failed: invalid CSV', true);
        }
    }

    // ── Orchestration ───────────────────────────────────────────
    async function refresh(target) {
        target = target || {};
        try {
            allDbs = await loadAll();
        } catch (e) {
            console.error('[Corporate] Could not load databases:', e);
            showToast('Could not load vaults', true);
            allDbs = [];
        }

        const parentList = parents();

        // Decide qué padre mostrar.
        if (target.selectParent && parentList.some(p => p.name === target.selectParent)) {
            currentParent = target.selectParent;
        } else if (!parentList.some(p => p.name === currentParent)) {
            currentParent = parentList.length ? parentList[0].name : '';
        }

        // Decide qué sheet activa dentro de ese padre.
        const candidateSheets = currentParent
            ? [currentParent].concat(children(currentParent).map(c => c.name))
            : [];

        if (target.selectSheet && candidateSheets.includes(target.selectSheet)) {
            currentSheet = target.selectSheet;
        } else if (!candidateSheets.includes(currentSheet)) {
            if (currentParent) {
                currentSheet = parentHasData(currentParent)
                    ? currentParent
                    : (children(currentParent)[0] && children(currentParent)[0].name) || currentParent;
            } else {
                currentSheet = '';
            }
        }

        renderVaultDropdown();
        renderTabs();
        renderGrid();
        updateToolbarState();
    }

    function updateToolbarState() {
        const hasParent = !!currentParent;
        const hasSheet  = !!currentSheet;
        setMenuItemDisabled('new-child', !hasParent);
        setMenuItemDisabled('rename',    !hasSheet);
        setMenuItemDisabled('delete',    !hasSheet);
        setMenuItemDisabled('import',    !hasSheet);
        setMenuItemDisabled('export',    !hasSheet);
    }

    function setMenuItemDisabled(action, disabled) {
        const item = document.querySelector(`.menu-item[data-action="${action}"]`);
        if (item) item.disabled = disabled;
    }

    // ── Menubar (Excel/Sheets style dropdowns) ──────────────────
    let openMenuEl = null;

    function openMenu(menuEl) {
        if (openMenuEl === menuEl) return;
        closeMenu();
        menuEl.classList.add('is-open');
        const dropdown = menuEl.querySelector('.menu-dropdown');
        const trigger  = menuEl.querySelector('.menu-trigger');
        if (dropdown) dropdown.hidden = false;
        if (trigger)  trigger.setAttribute('aria-expanded', 'true');
        openMenuEl = menuEl;
    }

    function closeMenu() {
        if (!openMenuEl) return;
        const dropdown = openMenuEl.querySelector('.menu-dropdown');
        const trigger  = openMenuEl.querySelector('.menu-trigger');
        openMenuEl.classList.remove('is-open');
        if (dropdown) dropdown.hidden = true;
        if (trigger)  trigger.setAttribute('aria-expanded', 'false');
        openMenuEl = null;
    }

    // Mapeo data-action → función. Centralizado para que añadir nuevos
    // items a futuro sea agregar una entrada y un <button> en el HTML.
    const MENU_ACTIONS = {
        'new-parent': onCreateParent,
        'new-child':  onCreateChild,
        'rename':     onRename,
        'delete':     onDelete,
        'import':     () => importInput.click(),
        'export':     onExport
    };

    function setupMenuBar() {
        const triggers = document.querySelectorAll('.menu-trigger');
        const items    = document.querySelectorAll('.menu-item');

        triggers.forEach(trigger => {
            // Triggers de diálogo directo (Context Menu / Settings): un clic
            // abre la ventana al instante, sin desplegable intermedio.
            if (trigger.dataset.dialog) {
                trigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeMenu();
                    if (trigger.dataset.dialog === 'context')  onContextMenu();
                    else if (trigger.dataset.dialog === 'settings') onSettings();
                });
                return;
            }

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const menuEl = trigger.closest('.menu');
                if (openMenuEl === menuEl) closeMenu();
                else                       openMenu(menuEl);
            });

            // Patrón Excel/Sheets: si un menú ya está abierto, al pasar
            // el cursor sobre otro trigger se conmuta automáticamente.
            trigger.addEventListener('mouseenter', () => {
                if (openMenuEl) openMenu(trigger.closest('.menu'));
            });
        });

        items.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.disabled) return;
                const action = item.dataset.action;
                closeMenu();
                const fn = MENU_ACTIONS[action];
                if (fn) fn();
            });
        });

        // Click fuera del menubar cierra cualquier menú abierto.
        document.addEventListener('click', () => closeMenu());

        // Escape cierra. No bloqueamos otros atajos.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && openMenuEl) closeMenu();
        });
    }

    // ── Bind / init ─────────────────────────────────────────────
    function bind() {
        vaultSelect.addEventListener('change', (e) => {
            currentParent = e.target.value;
            currentSheet  = '';
            refresh({ selectParent: currentParent });
        });

        // Menubar (Vault | Data) — todas las acciones de CRUD + import/export
        // viven aquí ahora, mapeadas vía data-action.
        setupMenuBar();

        importInput.addEventListener('change', onImport);
        searchInput.addEventListener('input', applySearchFilter);
    }

    function init() {
        bind();
        refresh({});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
