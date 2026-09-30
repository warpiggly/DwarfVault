/**
 * DwarfVault — Lector/escritor mínimo de Excel (.xlsx), sin dependencias.
 *
 * Un .xlsx es un ZIP con XML dentro (Office Open XML). Aquí se arma y se lee
 * ese ZIP a mano y la compresión la hace el propio navegador
 * (CompressionStream / DecompressionStream 'deflate-raw', Chrome/Edge 103+).
 * Sin librerías de terceros: nada remoto, nada ofuscado, nada que auditar
 * aparte de este archivo (requisito cómodo para Chrome Web Store y Edge Add-ons).
 *
 * Escribe celdas como texto inline (`inlineStr`): un texto que empiece por
 * "=" se queda como texto, nunca se convierte en fórmula.
 *
 * API (global `DwarfXlsx`, y module.exports para tests en Node):
 *   buildXlsx([{name, rows, widths?}]) → Promise<{bytes:Uint8Array, truncated:number}>
 *   readXlsx(bytes)                    → Promise<[{name, rows}]>
 *   zip([{name, data}]) / unzip(bytes)  → utilidades ZIP
 */
(function (root) {
    'use strict';

    /** Límite de caracteres por celda de Excel. */
    const MAX_CELL_CHARS   = 32767;
    const MAX_SHEET_NAME   = 31;
    /** Anti zip-bomb: tope de bytes descomprimidos y de archivos en el ZIP. */
    const MAX_UNZIPPED     = 200 * 1024 * 1024;
    const MAX_ZIP_ENTRIES  = 2000;

    const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const NS_REL  = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const NS_PKG  = 'http://schemas.openxmlformats.org/package/2006/relationships';

    const utf8 = new TextEncoder();
    const utf8d = new TextDecoder('utf-8');

    // ── ZIP ─────────────────────────────────────────────────────
    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    async function pipeThrough(bytes, stream) {
        const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
        return new Uint8Array(await out.arrayBuffer());
    }

    /** @param {Array<{name:string, data:Uint8Array|string}>} files */
    async function zip(files) {
        const DOS_DATE = 0x21; // 1980-01-01: ZIP reproducible, sin fecha real
        const locals = []; const centrals = []; let offset = 0;

        for (const f of files) {
            const name = utf8.encode(f.name);
            const raw  = typeof f.data === 'string' ? utf8.encode(f.data) : f.data;
            const crc  = crc32(raw);
            let method = 8;
            let data   = await pipeThrough(raw, new CompressionStream('deflate-raw'));
            if (data.length >= raw.length) { method = 0; data = raw; }

            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);
            local.setUint16(6, 0x0800, true);          // nombres en UTF-8
            local.setUint16(8, method, true);
            local.setUint16(12, DOS_DATE, true);
            local.setUint32(14, crc, true);
            local.setUint32(18, data.length, true);
            local.setUint32(22, raw.length, true);
            local.setUint16(26, name.length, true);
            locals.push(new Uint8Array(local.buffer), name, data);

            const central = new DataView(new ArrayBuffer(46));
            central.setUint32(0, 0x02014b50, true);
            central.setUint16(4, 20, true);
            central.setUint16(6, 20, true);
            central.setUint16(8, 0x0800, true);
            central.setUint16(10, method, true);
            central.setUint16(14, DOS_DATE, true);
            central.setUint32(16, crc, true);
            central.setUint32(20, data.length, true);
            central.setUint32(24, raw.length, true);
            central.setUint16(28, name.length, true);
            central.setUint32(42, offset, true);
            centrals.push(new Uint8Array(central.buffer), name);

            offset += 30 + name.length + data.length;
        }

        const cdSize = centrals.reduce((s, p) => s + p.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, files.length, true);
        end.setUint16(10, files.length, true);
        end.setUint32(12, cdSize, true);
        end.setUint32(16, offset, true);

        const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
        const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
        let pos = 0;
        for (const p of parts) { out.set(p, pos); pos += p.length; }
        return out;
    }

    /** @returns {Promise<Map<string, Uint8Array>>} */
    async function unzip(input) {
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
        const view  = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        let eocd = -1;
        for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xFFFF); i--) {
            if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('Not a ZIP/XLSX file');

        const count = view.getUint16(eocd + 10, true);
        if (count > MAX_ZIP_ENTRIES) throw new Error('Too many files inside XLSX');
        let p = view.getUint32(eocd + 16, true);

        const files = new Map(); let total = 0;
        for (let n = 0; n < count; n++) {
            if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt ZIP directory');
            const method  = view.getUint16(p + 10, true);
            const csize   = view.getUint32(p + 20, true);
            const usize   = view.getUint32(p + 24, true);
            const nameLen = view.getUint16(p + 28, true);
            const extra   = view.getUint16(p + 30, true);
            const comment = view.getUint16(p + 32, true);
            const local   = view.getUint32(p + 42, true);
            const name    = utf8d.decode(bytes.subarray(p + 46, p + 46 + nameLen));
            p += 46 + nameLen + extra + comment;

            total += usize;
            if (total > MAX_UNZIPPED) throw new Error('XLSX too large');

            const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
            const data  = bytes.subarray(start, start + csize);
            if (method === 0)      files.set(name, data);
            else if (method === 8) {
                const out = await pipeThrough(data, new DecompressionStream('deflate-raw'));
                if (out.length !== usize) throw new Error('Corrupt ZIP entry');
                files.set(name, out);
            }
            else throw new Error(`Unsupported ZIP compression (${method})`);
        }
        return files;
    }

    // ── XML helpers ─────────────────────────────────────────────
    // Caracteres que XML 1.0 no admite (Excel rechaza el archivo si aparecen).
    const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

    function xmlEscape(s) {
        return String(s).replace(INVALID_XML, '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function xmlUnescape(s) {
        return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
            const k = e.toLowerCase();
            if (k === 'amp') return '&';
            if (k === 'lt') return '<';
            if (k === 'gt') return '>';
            if (k === 'quot') return '"';
            if (k === 'apos') return "'";
            const code = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
            try { return String.fromCodePoint(code); } catch (_e) { return m; }
        });
    }

    function attrs(tagBody) {
        const out = {};
        for (const m of tagBody.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
            out[m[1]] = xmlUnescape(m[2] != null ? m[2] : m[3]);
        }
        return out;
    }

    // OOXML escapa caracteres no representables como `_xHHHH_` (p. ej. CR →
    // `_x000D_`) y un `_x` literal como `_x005F_x`.
    const decodeXstring = (s) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    const encodeXstring = (s) => s.replace(/_(x[0-9A-Fa-f]{4}_)/g, '_x005F_$1').replace(/\r/g, '_x000D_');

    /** Concatena todos los <t> (texto plano o rich text), ignorando fonética. */
    function textRuns(xml) {
        const clean = xml.replace(/<(\w+:)?rPh\b[\s\S]*?<\/(\w+:)?rPh>/g, '');
        let s = '';
        for (const m of clean.matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) {
            s += xmlUnescape(m[1] || '');
        }
        return decodeXstring(s);
    }

    function colName(i) {
        let s = ''; i++;
        while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
        return s;
    }

    function colIndex(ref) {
        const letters = (/^[A-Z]+/i.exec(ref) || [''])[0].toUpperCase();
        let n = 0;
        for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
        return n - 1;
    }

    // ── Nombres de hoja ─────────────────────────────────────────
    /** Excel: ≤31 chars, sin \ / ? * [ ] :, sin ' al borde, no "History", únicos (sin mayúsculas). */
    function sheetNames(names) {
        const taken = new Set(); const out = [];
        for (const raw of names) {
            let base = String(raw || '').replace(INVALID_XML, '').replace(/[\\/?*[\]:]/g, ' ')
                .replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').trim().slice(0, MAX_SHEET_NAME).trim();
            if (!base || base.toLowerCase() === 'history') base = base ? `${base}_` : 'Sheet';
            let name = base; let n = 2;
            while (taken.has(name.toLowerCase())) {
                const suffix = ` (${n++})`;
                name = base.slice(0, MAX_SHEET_NAME - suffix.length).trim() + suffix;
            }
            taken.add(name.toLowerCase());
            out.push(name);
        }
        return out;
    }

    // ── Escritura ───────────────────────────────────────────────
    const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS_MAIN}">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

    function sheetXml(rows, widths, counter) {
        const cols = (widths || []).map((w, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
        const nCols = rows.reduce((m, r) => Math.max(m, r.length), 1);

        const body = rows.map((row, r) => {
            const style = r === 0 ? 1 : 2;   // header en negrita, datos con ajuste de texto
            const cells = row.map((v, c) => {
                const ref = colName(c) + (r + 1);
                if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
                let s = v == null ? '' : String(v);
                if (s === '') return '';
                if (s.length > MAX_CELL_CHARS) { s = s.slice(0, MAX_CELL_CHARS); counter.truncated++; }
                return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(encodeXstring(s))}</t></is></c>`;
            }).join('');
            return `<row r="${r + 1}">${cells}</row>`;
        }).join('');

        const lastRef = colName(nCols - 1) + Math.max(rows.length, 1);
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}
<sheetData>${body}</sheetData>${rows.length > 1 ? `<autoFilter ref="A1:${lastRef}"/>` : ''}
</worksheet>`;
    }

    /**
     * @param {Array<{name:string, rows:Array<Array<string|number>>, widths?:number[]}>} sheets
     * @returns {Promise<{bytes:Uint8Array, truncated:number, names:string[]}>}
     */
    async function buildXlsx(sheets) {
        if (!sheets || sheets.length === 0) throw new Error('No sheets to export');
        const names   = sheetNames(sheets.map(s => s.name));
        const counter = { truncated: 0 };
        const n       = sheets.length;

        const files = [
            { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>` },
            { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
            { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView/></bookViews><sheets>${
                names.map((nm, i) => `<sheet name="${xmlEscape(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
            }</sheets></workbook>` },
            { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PKG}">${
                sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
            }<Relationship Id="rId${n + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>` },
            { name: 'xl/styles.xml', data: STYLES },
            ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows || [], s.widths, counter) })),
        ];

        return { bytes: await zip(files), truncated: counter.truncated, names };
    }

    // ── Lectura ─────────────────────────────────────────────────
    function resolvePath(baseDir, target) {
        if (target.startsWith('/')) return target.slice(1);
        const parts = (baseDir ? baseDir.split('/') : []).concat(target.split('/'));
        const out = [];
        for (const p of parts) {
            if (p === '..') out.pop();
            else if (p && p !== '.') out.push(p);
        }
        return out.join('/');
    }

    function relsOf(xml) {
        const map = {};
        for (const m of (xml || '').matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) {
            const a = attrs(m[1]);
            map[a.Id] = a;
        }
        return map;
    }

    function parseSheet(xml, shared) {
        const rows = [];
        for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
            const row = [];
            let next = 0;
            for (const cm of (rm[2] || '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
                const a     = attrs(cm[1]);
                const inner = cm[2] || '';
                const col   = a.r ? colIndex(a.r) : next;
                next = col + 1;
                const vm = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
                const v  = vm ? xmlUnescape(vm[1]) : '';
                let value;
                if      (a.t === 's')         value = shared[parseInt(v, 10)] ?? '';
                else if (a.t === 'inlineStr') value = textRuns(inner);
                else if (a.t === 'b')         value = v === '1' ? 'TRUE' : 'FALSE';
                else if (a.t === 'str')       value = decodeXstring(v);
                else                          value = v;
                // Fórmula sin resultado guardado (archivos no generados por
                // Excel): se conserva el texto de la fórmula.
                if (value === '' && !vm) {
                    const fm = /<(?:\w+:)?f\b[^>]*>([\s\S]*?)<\/(?:\w+:)?f>/.exec(inner);
                    if (fm) value = '=' + xmlUnescape(fm[1]);
                }
                while (row.length < col) row.push('');
                row[col] = value;
            }
            rows.push(row);
        }
        return rows;
    }

    /** @returns {Promise<Array<{name:string, rows:string[][]}>>} */
    async function readXlsx(input) {
        const files = await unzip(input);
        // XML normaliza CRLF/CR → LF (spec XML 1.0 §2.11); un &#13; explícito sobrevive.
        const text  = (p) => (files.has(p) ? utf8d.decode(files.get(p)).replace(/\r\n?/g, '\n') : null);

        const rootRels = relsOf(text('_rels/.rels'));
        const officeDoc = Object.values(rootRels).find(r => /\/officeDocument$/.test(r.Type || ''));
        const wbPath = officeDoc ? resolvePath('', officeDoc.Target) : 'xl/workbook.xml';
        const wbXml  = text(wbPath);
        if (!wbXml) throw new Error('Not an Excel workbook');

        const wbDir  = wbPath.includes('/') ? wbPath.slice(0, wbPath.lastIndexOf('/')) : '';
        const relsPath = `${wbDir ? wbDir + '/' : ''}_rels/${wbPath.slice(wbPath.lastIndexOf('/') + 1)}.rels`;
        const wbRels = relsOf(text(relsPath));

        const sstRel = Object.values(wbRels).find(r => /\/sharedStrings$/.test(r.Type || ''));
        const sstXml = sstRel ? text(resolvePath(wbDir, sstRel.Target)) : null;
        const shared = sstXml
            ? [...sstXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m => textRuns(m[1]))
            : [];

        const sheets = [];
        for (const m of wbXml.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
            const a   = attrs(m[1]);
            const rid = a[Object.keys(a).find(k => /(^|:)id$/.test(k) && k !== 'sheetId')];
            const rel = wbRels[rid];
            if (!rel) continue;
            const xml = text(resolvePath(wbDir, rel.Target));
            if (xml == null) continue;
            sheets.push({ name: a.name || `Sheet${sheets.length + 1}`, rows: parseSheet(xml, shared) });
        }
        if (sheets.length === 0) throw new Error('Workbook has no sheets');
        return sheets;
    }

    const DwarfXlsx = {
        MIME, MAX_CELL_CHARS, buildXlsx, readXlsx, zip, unzip, sheetNames, crc32,
    };

    root.DwarfXlsx = DwarfXlsx;
    if (typeof module !== 'undefined' && module.exports) module.exports = DwarfXlsx;
})(typeof self !== 'undefined' ? self : globalThis);
