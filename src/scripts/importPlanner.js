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

    /** Soporta saltos de línea dentro de campos entre comillas. */
    function csvParse(text) {
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

    function safeUrl(v)     { return root.DwarfSecurity ? root.DwarfSecurity.safeUrlOrEmpty(v)     : (v || ''); }
    function safeFavicon(v) { return root.DwarfSecurity ? root.DwarfSecurity.safeFaviconOrEmpty(v) : (v || ''); }

    /**
     * CSV → entries `{text,url,favicon,date}`.
     * Layouts: `#,text,url,favicon` (export propio) | `text,url,favicon` | `text,url` | `text`.
     */
    function parseCsvEntries(text, nowISO) {
        const date = nowISO || new Date().toISOString();
        const rows = csvParse(String(text || ''));
        if (rows.length === 0) return [];

        const head      = rows[0].map(s => (s || '').toLowerCase());
        const hasHeader = head.includes('text') || head.includes('url');
        const dataRows  = hasHeader ? rows.slice(1) : rows;

        return dataRows
            .filter(r => r.some(c => c && c.length > 0))
            .map(r => {
                let text, url = '', favicon = '';
                if      (r.length >= 4)  [, text, url, favicon] = r;
                else if (r.length === 3) [text, url, favicon]   = r;
                else if (r.length === 2) [text, url]            = r;
                else                     [text]                 = r;
                return { text: text || '', url: safeUrl(url), favicon: safeFavicon(favicon), date };
            });
    }

    // ── Nombres ─────────────────────────────────────────────────
    /** Nombre por defecto desde el archivo: "Recetas.csv" → "Recetas". */
    function baseNameFromFile(fileName) {
        const base = String(fileName || '').replace(/\.(csv|json)$/i, '').trim();
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
        csvParse, parseCsvEntries, baseNameFromFile, uniqueName, planCsvImport, planFullImport,
    };

    root.DwarfImport = DwarfImport;
    if (typeof module !== 'undefined' && module.exports) module.exports = DwarfImport;
})(typeof self !== 'undefined' ? self : globalThis);
