const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../../src/scripts/security.js');
const X = require('../../src/scripts/xlsx.js');
const { rowsToEntries, recordsToSheets } = require('../../src/scripts/importPlanner.js');

const dec = new TextDecoder();
const NOW = '2026-01-01T00:00:00.000Z';

async function partsOf(bytes) {
    const files = await X.unzip(bytes);
    return Object.fromEntries([...files].map(([k, v]) => [k, dec.decode(v)]));
}

describe('zip', () => {
    test('crc32 conocido', () => {
        assert.equal(X.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
    });

    test('ida y vuelta, comprimido y sin comprimir, nombres UTF-8', async () => {
        const big = 'a'.repeat(5000);
        const out = await X.unzip(await X.zip([{ name: 'ñ/big.txt', data: big }, { name: 'x', data: new Uint8Array([1]) }]));
        assert.equal(dec.decode(out.get('ñ/big.txt')), big);
        assert.deepEqual([...out.get('x')], [1]);
    });

    test('rechaza lo que no es ZIP', async () => {
        await assert.rejects(X.unzip(new TextEncoder().encode('hola, no soy zip')), /Not a ZIP/);
        await assert.rejects(X.readXlsx(await X.zip([{ name: 'a.txt', data: 'x' }])), /Not an Excel/);
    });
});

describe('nombres de hoja (reglas de Excel)', () => {
    test('caracteres prohibidos, 31 chars, History, duplicados sin mayúsculas', () => {
        assert.deepEqual(
            X.sheetNames(['a/b:c*?[x]', 'x'.repeat(40), 'History', 'Notes', 'NOTES', '', "'quoted'"]),
            ['a b c x', 'x'.repeat(31), 'History_', 'Notes', 'NOTES (2)', 'Sheet', 'quoted']
        );
    });

    test('sufijo de duplicado respeta 31 chars', () => {
        const [, second] = X.sheetNames(['y'.repeat(31), 'y'.repeat(31)]);
        assert.equal(second.length, 31);
        assert.ok(second.endsWith(' (2)'));
    });
});

describe('buildXlsx', () => {
    const tricky = [
        ['#', 'text', 'url', 'favicon'],
        [1, 'ñandú, café; "x"\nlínea 2 & <tag> 🧙', 'https://a.com/?q=1&b=2', ''],
        [2, '=HYPERLINK("http://evil")', '', ''],
        [3, 'CRLF\r\nfin', '', ''],
        [4, 'literal _x0041_ y \u0007control', '', ''],
    ];

    test('estructura OOXML mínima que Excel exige', async () => {
        const { bytes, names } = await X.buildXlsx([{ name: 'A', rows: tricky, widths: [6, 60] }, { name: 'B', rows: [['x']] }]);
        const p = await partsOf(bytes);
        assert.deepEqual(names, ['A', 'B']);
        for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
            'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
            assert.ok(p[part], `falta ${part}`);
        }
        assert.match(p['[Content_Types].xml'], /\/xl\/worksheets\/sheet2\.xml/);
        assert.match(p['xl/worksheets/sheet1.xml'], /state="frozen"/);
        assert.match(p['xl/worksheets/sheet1.xml'], /<autoFilter ref="A1:D5"\/>/);
        assert.match(p['xl/worksheets/sheet1.xml'], /<col min="2" max="2" width="60"/);
    });

    test('texto que parece fórmula queda como texto, nunca <f>', async () => {
        const p = await partsOf((await X.buildXlsx([{ name: 'A', rows: tricky }])).bytes);
        assert.doesNotMatch(p['xl/worksheets/sheet1.xml'], /<f>/);
        assert.match(p['xl/worksheets/sheet1.xml'], /t="inlineStr"><is><t xml:space="preserve">=HYPERLINK/);
    });

    test('ida y vuelta exacta (quita solo chars de control inválidos en XML)', async () => {
        const [sheet] = await X.readXlsx((await X.buildXlsx([{ name: 'A', rows: tricky }])).bytes);
        const expected = tricky.map(r => r.map(String)).map(r => { while (r.length && r[r.length - 1] === '') r.pop(); return r; });
        expected[4][1] = 'literal _x0041_ y control';
        assert.deepEqual(sheet.rows, expected);
    });

    test('corta celdas > 32767 chars y lo reporta', async () => {
        const { bytes, truncated } = await X.buildXlsx([{ name: 'A', rows: [['text'], ['z'.repeat(40000)]] }]);
        assert.equal(truncated, 1);
        const [sheet] = await X.readXlsx(bytes);
        assert.equal(sheet.rows[1][0].length, X.MAX_CELL_CHARS);
    });

    test('sin hojas → error', async () => {
        await assert.rejects(X.buildXlsx([]), /No sheets/);
    });
});

describe('readXlsx con XML estilo Excel real', () => {
    // Lo que escribe Excel: sharedStrings con rich text y fonética, prefijos
    // de namespace, celdas dispersas, booleanos, fórmulas con resultado,
    // `_x000D_` y rutas absolutas en las relaciones.
    async function excelLike() {
        const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
        const R  = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
        return X.zip([
            { name: '_rels/.rels', data: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="/xl/workbook.xml"/></Relationships>` },
            { name: 'xl/workbook.xml', data: `<x:workbook xmlns:x="${NS}" xmlns:r="${R}"><x:sheets><x:sheet name="Datos &amp; más" sheetId="7" r:id="rId3"/></x:sheets></x:workbook>` },
            { name: 'xl/_rels/workbook.xml.rels', data: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="${R}/worksheet" Target="worksheets/hoja.xml"/><Relationship Id="rId9" Type="${R}/sharedStrings" Target="/xl/sharedStrings.xml"/></Relationships>` },
            { name: 'xl/sharedStrings.xml', data: `<sst xmlns="${NS}" count="4" uniqueCount="4"><si><t>text</t></si><si><t>url</t></si><si><r><rPr><b/></rPr><t>Hola </t></r><r><t xml:space="preserve">mundo</t></r><rPh sb="0" eb="1"><t>ホラ</t></rPh></si><si><t>línea_x000D_\r\notra &lt;b&gt;</t></si></sst>` },
            { name: 'xl/worksheets/hoja.xml', data: `<x:worksheet xmlns:x="${NS}"><x:sheetData>
                <x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="s"><x:v>1</x:v></x:c></x:row>
                <x:row r="2" spans="1:3"><x:c r="A2" t="s"><x:v>2</x:v></x:c><x:c r="B2" t="b"><x:v>1</x:v></x:c><x:c r="C2" t="str"><x:f>A1&amp;"x"</x:f><x:v>textx</x:v></x:c></x:row>
                <x:row r="3"/>
                <x:row r="4"><x:c r="A4" t="s"><x:v>3</x:v></x:c><x:c r="C4" s="1"/></x:row>
            </x:sheetData></x:worksheet>` },
        ]);
    }

    test('lee hojas, textos compartidos, rich text, dispersas y escapes', async () => {
        const [sheet] = await X.readXlsx(await excelLike());
        assert.equal(sheet.name, 'Datos & más');
        assert.deepEqual(sheet.rows, [
            ['text', '', 'url'],
            ['Hola mundo', 'TRUE', 'textx'],
            [],
            ['línea\r\notra <b>', '', ''],
        ]);
    });

    test('→ entries: mapea por encabezado aunque falten celdas', async () => {
        const [sheet] = await X.readXlsx(await excelLike());
        assert.deepEqual(rowsToEntries(sheet.rows, NOW).map(e => [e.text, e.url]), [
            ['Hola mundo', ''],               // 'textx' no es URL segura → ''
            ['línea\r\notra <b>', ''],
        ]);
    });

    test('archivo generado por openpyxl (escritor independiente)', async () => {
        const bytes = fs.readFileSync(path.join(__dirname, '../fixtures/excel-made.xlsx'));
        const sheets = await X.readXlsx(bytes);
        assert.deepEqual(sheets.map(s => s.name), ['Clientes', 'Proveedores', 'Vacía']);
        assert.deepEqual(rowsToEntries(sheets[0].rows, NOW).map(e => [e.text, e.url]), [
            ['Señora Muñoz — café', 'https://ejemplo.co/ñ'],
            ['dos líneas\nsegunda', ''],
            ['=SUM(1,2)', ''],
        ]);
        assert.deepEqual(rowsToEntries(sheets[1].rows, NOW).map(e => e.text), ['Acme']);
    });
});

describe('export de registros → Excel → import', () => {
    test('vault completo: una hoja por tabla, reimporta idéntico', async () => {
        const records = [
            { name: 'Work',  entries: [{ text: 'w1', url: 'https://w.com', favicon: '', date: NOW }] },
            { name: 'Notes', entries: [{ text: 'multi\nlínea', url: '', favicon: 'https://f.com/i.png', date: NOW }] },
        ];
        const sheets = await X.readXlsx((await X.buildXlsx(recordsToSheets(records))).bytes);
        assert.deepEqual(sheets.map(s => s.name), ['Work', 'Notes']);
        sheets.forEach((s, i) => assert.deepEqual(rowsToEntries(s.rows, NOW), records[i].entries));
    });

    test('URLs peligrosas en un Excel importado se neutralizan', () => {
        const e = rowsToEntries([['text', 'url', 'favicon'], ['x', 'javascript:alert(1)', 'data:text/html,hi']], NOW);
        assert.deepEqual([e[0].url, e[0].favicon], ['', '']);
    });
});
