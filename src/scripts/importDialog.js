/**
 * DwarfVault — Diálogo "¿dónde importo este CSV?" compartido por las vistas
 * corporate y dwarven. Reutiliza las clases .edit-modal-* que ambas hojas
 * de estilo ya definen. La lógica de qué se escribe vive en importPlanner.js.
 *
 *   DwarfImportDialog.open({
 *       count, defaultName,
 *       parents:       ['Work', ...],   // vaults padre disponibles
 *       currentParent: 'Work',          // preselección del select de padre
 *       currentSheet:  'Notes' | '',    // si hay, ofrece append / replace
 *       onSubmit({mode, name, parent, target}) → Promise; false = no cerrar
 *   })
 */
(function (root) {
    'use strict';

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function open({ count, defaultName, parents = [], currentParent = '', currentSheet = '', onSubmit }) {
        document.querySelector('.edit-modal-backdrop')?.remove();

        const backdrop = el('div', 'edit-modal-backdrop');
        const modal    = el('div', 'edit-modal import-modal');
        modal.appendChild(el('h3', 'edit-modal-title', `⇩ Import ${count} row(s) — where?`));

        const options = [
            { mode: 'new-parent', label: '📁 New standalone table' },
            { mode: 'new-child',  label: '📂 New child inside a parent', disabled: parents.length === 0 },
        ];
        if (currentSheet) {
            options.push({ mode: 'append',  label: `➕ Append to current sheet "${currentSheet}"` });
            options.push({ mode: 'replace', label: `⚠️ Replace current sheet "${currentSheet}"` });
        }

        const radios = {};
        options.forEach(o => {
            const row   = el('label', 'import-option');
            const radio = el('input');
            radio.type     = 'radio';
            radio.name     = 'importDest';
            radio.value    = o.mode;
            radio.disabled = !!o.disabled;
            radio.checked  = o.mode === 'new-parent';
            row.appendChild(radio);
            row.appendChild(document.createTextNode(' ' + o.label));
            modal.appendChild(row);
            radios[o.mode] = radio;
        });

        const parentLabel  = el('label', 'edit-modal-label', 'Parent');
        const parentSelect = el('select', 'toolbar-select options-select import-parent-select');
        parentSelect.id = 'importDestParent';
        parents.forEach(name => {
            const opt = el('option', null, name);
            opt.value = name;
            parentSelect.appendChild(opt);
        });
        if (parents.includes(currentParent)) parentSelect.value = currentParent;
        modal.appendChild(parentLabel);
        modal.appendChild(parentSelect);

        const nameLabel = el('label', 'edit-modal-label', 'New table name');
        const nameInput = el('input', 'edit-modal-url');
        nameInput.type       = 'text';
        nameInput.id         = 'importDestName';
        nameInput.value      = defaultName;
        nameInput.spellcheck = false;
        modal.appendChild(nameLabel);
        modal.appendChild(nameInput);

        const mode = () => Object.keys(radios).find(k => radios[k].checked);
        const sync = () => {
            const m = mode();
            parentLabel.hidden = parentSelect.hidden = m !== 'new-child';
            nameLabel.hidden   = nameInput.hidden    = !(m === 'new-parent' || m === 'new-child');
        };
        Object.values(radios).forEach(r => r.addEventListener('change', sync));
        sync();

        const btnRow    = el('div', 'edit-modal-actions');
        const saveBtn   = el('button', 'save-btn', '⇩ Import');
        const cancelBtn = el('button', 'cancel-btn', '✖ Cancel');
        btnRow.appendChild(saveBtn);
        btnRow.appendChild(cancelBtn);
        modal.appendChild(btnRow);

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
        nameInput.focus();
        nameInput.select();

        const close = () => {
            backdrop.remove();
            document.removeEventListener('keydown', onKey);
        };
        const submit = async () => {
            const result = await onSubmit({
                mode:   mode(),
                name:   nameInput.value.trim(),
                parent: parentSelect.value,
                target: currentSheet,
            });
            if (result !== false) close();
        };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); submit(); }
        };
        document.addEventListener('keydown', onKey);

        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
        cancelBtn.addEventListener('click', close);
        saveBtn.addEventListener('click', submit);
    }

    root.DwarfImportDialog = { open };
})(typeof self !== 'undefined' ? self : globalThis);
