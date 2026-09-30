/**
 * DwarfVault — Lógica pura de importación (sin DOM ni IndexedDB).
 *
 * Decide QUÉ registros escribir al importar un CSV o un Full Vault JSON.
 * La vista (corporate.js) solo pregunta el destino y persiste el plan.
 * Separado para poder probarlo con `node --test` (tests/unit).
 *
 * Regla de oro: ningún import sobrescribe una tabla existente salvo que el
 * usuario elija explícitamente "Replace" sobre esa tabla.
 */
(function (root) {
    'use strict';

    const MODES = ['new-parent', 'new-child', 'append', 'replace'];

    // ── CSV ─────────────────────────────────────────────────────
    // Excel abre el CSV con el "separador de listas" del sistema: `,` en
    // locales con punto decimal (en-US), `;` donde el decimal es coma
    // (es-CO, es-ES, de...). Exportamos con el que toca y el import
    // detecta cualquiera de los dos (o tab).
    const BOM = '﻿';

    /** `;` si el locale usa coma decimal, si no `,`. */
    function csvDelimiterForLocale(locale) {
        try {
            const dec = new Intl.NumberFormat(locale).formatToParts(1.5).find(p => p.type === 'decimal');
            return dec && dec.value === ',' ? ';' : ',';
        } catch (_e) {
            return ',';
        }
    }

    /** Separador más frecuente fuera de comillas en la primera línea. */
    function detectDelimiter(text) {
        const counts = { ',': 0, ';': 0, '\t': 0 };
        let inQuote = false;
        for (const c of text) {
            if (c === '"') inQuote = !inQuote;
            else if (!inQuote && (c === '\n' || c === '\r')) break;
            else if (!inQuote && c in counts) counts[c]++;
        }
        return Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ',');
    }

    function csvEscape(v, delimiter) {
        const str = String(v == null ? '' : v);
        return str.includes(delimiter) || /["\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }

    /** Filas → texto CSV listo para Excel (BOM UTF-8 + CRLF). */
    function buildCsv(rows, delimiter) {
        const d = delimiter || ',';
        return BOM + rows.map(r => r.map(v => csvEscape(v, d)).join(d)).join('\r\n');
    }

    function csvParseLine(line, delimiter) {
        const out = []; let cur = ''; let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (inQuote) {
                if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (c === '"') { inQuote = false; }
                else                 { cur += c; }
            } else {
                if      (c === delimiter) { out.push(cur); cur = ''; }
                else if (c === '"')       { inQuote = true; }
                else                      { cur += c; }
            }
        }
        out.push(cur);
        return out;
    }

    /** Soporta saltos de línea entre comillas, BOM y separador `,` `;` o tab. */
    function csvParse(rawText) {
        const text = String(rawText || '').replace(/^﻿/, '');
        const delimiter = detectDelimiter(text);
        const rows = []; let buf = ''; let inQuote = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '"') inQuote = !inQuote;
            if ((c === '\n' || c === '\r') && !inQuote) {
                if (c === '\r' && text[i + 1] === '\n') i++;
                if (buf.length > 0) { rows.push(csvParseLine(buf, delimiter)); buf = ''; }
            } else {
                buf += c;
            }
        }
        if (buf.length > 0) rows.push(csvParseLine(buf, delimiter));
        return rows;
    }

    /** Entries → filas del export propio (`#,text,url,favicon,note`). */
    function entriesToRows(entries) {
        const rows = [['#', 'text', 'url', 'favicon', 'note']];
        (entries || []).forEach((e, i) => rows.push([i + 1, e.text || '', e.url || '', e.favicon || '', e.note || '']));
        return rows;
    }

    function entriesToCsv(entries, delimiter) {
        return buildCsv(entriesToRows(entries), delimiter);
    }

    /** Registros de IndexedDB → hojas para DwarfXlsx.buildXlsx (una por tabla). */
    function recordsToSheets(records) {
        return records.map(r => ({ name: r.name, rows: entriesToRows(r.entries), widths: [6, 70, 45, 30, 40] }));
    }

    function safeUrl(v)     { return root.DwarfSecurity ? root.DwarfSecurity.safeUrlOrEmpty(v)     : (v || ''); }
    function safeFavicon(v) { return root.DwarfSecurity ? root.DwarfSecurity.safeFaviconOrEmpty(v) : (v || ''); }

    /**
     * Filas (CSV o Excel) → entries `{text,url,favicon,date,note?}`.
     * Con encabezado se mapea por nombre de columna (en cualquier orden).
     * Sin encabezado, por ancho del archivo: `#,text,url,favicon[,note]` (4+) |
     * `text,url,favicon` | `text,url` | `text`. Se usa el ancho máximo y no
     * el de cada fila porque Excel omite las celdas vacías del final.
     */
    function rowsToEntries(rows, nowISO) {
        const date = nowISO || new Date().toISOString();
        if (!rows || rows.length === 0) return [];

        const head = rows[0].map(s => String(s == null ? '' : s).trim().toLowerCase());
        const hasHeader = head.includes('text') || head.includes('url');
        let col;
        if (hasHeader) {
            const url = head.indexOf('url');
            const text = head.indexOf('text');
            col = { text: text >= 0 ? text : (url === 0 ? 1 : 0), url, favicon: head.indexOf('favicon'), note: head.indexOf('note') };
        } else {
            const off = rows.reduce((m, r) => Math.max(m, r.length), 0) >= 4 ? 1 : 0;
            col = { text: off, url: off + 1, favicon: off + 2, note: off ? off + 3 : -1 };
        }
        const cell = (r, i) => (i >= 0 && r[i] != null ? String(r[i]) : '');

        return (hasHeader ? rows.slice(1) : rows)
            .filter(r => r.some(c => c != null && String(c).length > 0))
            .map(r => {
                const entry = {
                    text:    cell(r, col.text),
                    url:     safeUrl(cell(r, col.url)),
                    favicon: safeFavicon(cell(r, col.favicon)),
                    date,
                };
                const note = cell(r, col.note).trim();
                if (note) entry.note = note;
                return entry;
            });
    }

    function parseCsvEntries(text, nowISO) {
        return rowsToEntries(csvParse(text), nowISO);
    }

    /**
     * Archivo elegido por el usuario → tablas importables.
     * CSV → 1 tabla; .xlsx → 1 por hoja (solo las que tienen filas).
     *
     * @param {File} file
     * @returns {Promise<Array<{name:string, entries:Array}>>}
     */
    async function readImportFile(file, nowISO) {
        const fileBase = baseNameFromFile(file.name);
        if (/\.xlsx$/i.test(file.name)) {
            if (!root.DwarfXlsx) throw new Error('Excel support not loaded');
            const sheets = await root.DwarfXlsx.readXlsx(new Uint8Array(await file.arrayBuffer()));
            return sheets
                .map(s => ({ name: sheets.length === 1 ? fileBase : s.name, entries: rowsToEntries(s.rows, nowISO) }))
                .filter(t => t.entries.length > 0);
        }
        const entries = parseCsvEntries(await file.text(), nowISO);
        return entries.length ? [{ name: fileBase, entries }] : [];
    }

    // ── Nombres ─────────────────────────────────────────────────
    /** Nombre por defecto desde el archivo: "Recetas.csv" → "Recetas". */
    function baseNameFromFile(fileName) {
        const base = String(fileName || '').replace(/\.(csv|json|xlsx)$/i, '').trim();
        return base || 'Imported';
    }

    /** `base`, o `base (2)`, `base (3)`... el primero libre. */
    function uniqueName(taken, base) {
        const set = taken instanceof Set ? taken : new Set(taken);
        if (!set.has(base)) return base;
        let n = 2;
        while (set.has(`${base} (${n})`)) n++;
        return `${base} (${n})`;
    }

    function namesOf(allDbs) { return new Set((allDbs || []).map(d => d.name)); }

    // ── Planes ──────────────────────────────────────────────────
    /**
     * @param {Array}  allDbs   registros actuales del store
     * @param {Array}  entries  filas ya parseadas
     * @param {{mode:string, name?:string, parent?:string, target?:string}} choice
     * @returns {{ok:true, record:Object, select:{parent:string, sheet:string}} | {ok:false, error:string}}
     */
    function planCsvImport(allDbs, entries, choice) {
        const dbs  = allDbs || [];
        const mode = choice && choice.mode;
        if (!MODES.includes(mode))              return { ok: false, error: 'Pick where to import' };
        if (!entries || entries.length === 0)   return { ok: false, error: 'No rows to import' };

        const find = (n) => dbs.find(d => d.name === n);

        if (mode === 'append' || mode === 'replace') {
            const target = find(choice.target);
            if (!target) return { ok: false, error: 'Target sheet not found' };
            const record = {
                ...target,
                entries: mode === 'append' ? (target.entries || []).concat(entries) : entries.slice(),
            };
            return { ok: true, record, select: { parent: target.parentDatabase || target.name, sheet: target.name } };
        }

        const name = String(choice.name || '').trim();
        if (!name)       return { ok: false, error: 'Name cannot be empty' };
        if (find(name))  return { ok: false, error: 'A vault with that name already exists' };

        if (mode === 'new-parent') {
            return { ok: true, record: { name, parentDatabase: null, entries: entries.slice() }, select: { parent: name, sheet: name } };
        }

        const parent = find(choice.parent);
        if (!parent || parent.parentDatabase) return { ok: false, error: 'Pick a parent vault' };
        return { ok: true, record: { name, parentDatabase: parent.name, entries: entries.slice() }, select: { parent: parent.name, sheet: name } };
    }

    /**
     * Full Vault JSON → registros a escribir. Padre e hijas que choquen con
     * nombres existentes se renombran (nunca se pisan ni se "roban" hijas).
     *
     * @returns {{ok:true, parentName:string, records:Array, renamed:Array<{from:string,to:string}>} | {ok:false, error:string}}
     */
    function planFullImport(allDbs, data, parentName) {
        const parent = data && data.parentDatabase;
        if (!parent || !parent.name || parent.parentDatabase) return { ok: false, error: 'Invalid vault file' };

        const taken   = namesOf(allDbs);
        const renamed = [];
        const name    = String(parentName || parent.name).trim();
        if (!name)          return { ok: false, error: 'Name cannot be empty' };
        if (taken.has(name)) return { ok: false, error: 'A vault with that name already exists' };
        taken.add(name);

        const records = [{ ...parent, name, parentDatabase: null, entries: parent.entries || [] }];
        const childDbs = Array.isArray(data.childDatabases) ? data.childDatabases : [];
        for (const c of childDbs) {
            if (!c || !c.name) continue;
            const childName = uniqueName(taken, c.name);
            if (childName !== c.name) renamed.push({ from: c.name, to: childName });
            taken.add(childName);
            records.push({ ...c, name: childName, parentDatabase: name, entries: c.entries || [] });
        }
        return { ok: true, parentName: name, records, renamed };
    }

    const DwarfImport = {
        csvParse, buildCsv, entriesToCsv, csvDelimiterForLocale, parseCsvEntries,
        rowsToEntries, recordsToSheets, readImportFile,
        baseNameFromFile, uniqueName, planCsvImport, planFullImport,
    };

    root.DwarfImport = DwarfImport;
    if (typeof module !== 'undefined' && module.exports) module.exports = DwarfImport;
})(typeof self !== 'undefined' ? self : globalThis);
