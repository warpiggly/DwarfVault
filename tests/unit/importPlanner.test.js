const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

require('../../src/scripts/security.js');
const {
    parseCsvEntries, baseNameFromFile, uniqueName, planCsvImport, planFullImport,
} = require('../../src/scripts/importPlanner.js');

const NOW = '2026-01-01T00:00:00.000Z';
const entry = (text) => ({ text, url: '', favicon: '', date: NOW });

const DBS = [
    { name: 'Work',    parentDatabase: null,   entries: [entry('w1')] },
    { name: 'Notes',   parentDatabase: 'Work', entries: [entry('n1'), entry('n2')] },
    { name: 'Solo',    parentDatabase: null,   entries: [] },
];
const clone = () => structuredClone(DBS);

describe('parseCsvEntries', () => {
    test('formato del export propio (#,text,url,favicon)', () => {
        const csv = '#,text,url,favicon\n1,hola,https://a.com,https://a.com/f.ico\n2,"con, coma","",';
        assert.deepEqual(parseCsvEntries(csv, NOW), [
            { text: 'hola', url: 'https://a.com', favicon: 'https://a.com/f.ico', date: NOW },
            { text: 'con, coma', url: '', favicon: '', date: NOW },
        ]);
    });

    test('layouts 3, 2 y 1 columna sin header', () => {
        assert.deepEqual(parseCsvEntries('a,https://x.com,', NOW)[0].url, 'https://x.com');
        assert.deepEqual(parseCsvEntries('a,https://x.com', NOW)[0], { text: 'a', url: 'https://x.com', favicon: '', date: NOW });
        assert.deepEqual(parseCsvEntries('solo', NOW)[0].text, 'solo');
    });

    test('multilínea entre comillas y CRLF', () => {
        const rows = parseCsvEntries('text,url\r\n"linea1\nlinea2",https://a.com\r\n', NOW);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].text, 'linea1\nlinea2');
    });

    test('descarta filas vacías y neutraliza URLs peligrosas', () => {
        const rows = parseCsvEntries('text,url\n,\nx,javascript:alert(1)', NOW);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].url, '');
    });

    test('CSV vacío → []', () => {
        assert.deepEqual(parseCsvEntries('', NOW), []);
    });
});

describe('nombres', () => {
    test('baseNameFromFile', () => {
        assert.equal(baseNameFromFile('Recetas.CSV'), 'Recetas');
        assert.equal(baseNameFromFile('.csv'), 'Imported');
    });

    test('uniqueName busca el primer sufijo libre', () => {
        assert.equal(uniqueName(['A'], 'B'), 'B');
        assert.equal(uniqueName(['A', 'A (2)'], 'A'), 'A (3)');
    });
});

describe('planCsvImport — no pisa la tabla actual', () => {
    const rows = [entry('nuevo')];

    test('sin modo elegido → error (nunca escribe por defecto)', () => {
        assert.equal(planCsvImport(clone(), rows, {}).ok, false);
        assert.equal(planCsvImport(clone(), rows, undefined).ok, false);
    });

    test('new-parent crea tabla sola', () => {
        const plan = planCsvImport(clone(), rows, { mode: 'new-parent', name: 'Nueva' });
        assert.equal(plan.ok, true);
        assert.deepEqual(plan.record, { name: 'Nueva', parentDatabase: null, entries: rows });
        assert.deepEqual(plan.select, { parent: 'Nueva', sheet: 'Nueva' });
    });

    test('new-child cuelga del padre elegido', () => {
        const plan = planCsvImport(clone(), rows, { mode: 'new-child', name: 'Hija', parent: 'Solo' });
        assert.equal(plan.ok, true);
        assert.equal(plan.record.parentDatabase, 'Solo');
        assert.deepEqual(plan.select, { parent: 'Solo', sheet: 'Hija' });
    });

    test('new-child rechaza padre inexistente o que es hija', () => {
        assert.equal(planCsvImport(clone(), rows, { mode: 'new-child', name: 'H', parent: 'Nope' }).ok, false);
        assert.equal(planCsvImport(clone(), rows, { mode: 'new-child', name: 'H', parent: 'Notes' }).ok, false);
    });

    test('nombre existente o vacío → error, no sobrescribe', () => {
        for (const mode of ['new-parent', 'new-child']) {
            assert.equal(planCsvImport(clone(), rows, { mode, name: 'Notes', parent: 'Work' }).ok, false);
            assert.equal(planCsvImport(clone(), rows, { mode, name: '  ', parent: 'Work' }).ok, false);
        }
    });

    test('append conserva lo existente', () => {
        const plan = planCsvImport(clone(), rows, { mode: 'append', target: 'Notes' });
        assert.deepEqual(plan.record.entries.map(e => e.text), ['n1', 'n2', 'nuevo']);
        assert.equal(plan.record.parentDatabase, 'Work');
        assert.deepEqual(plan.select, { parent: 'Work', sheet: 'Notes' });
    });

    test('replace solo cuando se pide explícitamente', () => {
        const plan = planCsvImport(clone(), rows, { mode: 'replace', target: 'Notes' });
        assert.deepEqual(plan.record.entries.map(e => e.text), ['nuevo']);
    });

    test('no muta allDbs', () => {
        const dbs = clone();
        planCsvImport(dbs, rows, { mode: 'append', target: 'Notes' });
        assert.deepEqual(dbs, DBS);
    });

    test('sin filas → error', () => {
        assert.equal(planCsvImport(clone(), [], { mode: 'new-parent', name: 'X' }).ok, false);
    });
});

describe('planFullImport — hijas con nombre repetido no se roban', () => {
    const file = {
        version: '1.0',
        parentDatabase: { name: 'Work', parentDatabase: null, entries: [entry('p')] },
        childDatabases: [
            { name: 'Notes', parentDatabase: 'Work', entries: [entry('x')] },
            { name: 'Ideas', parentDatabase: 'Work', entries: [] },
        ],
    };

    test('padre renombrado + hija que choca renombrada, la original intacta', () => {
        const plan = planFullImport(clone(), file, 'Work_imported');
        assert.equal(plan.ok, true);
        assert.deepEqual(plan.records.map(r => [r.name, r.parentDatabase]), [
            ['Work_imported', null],
            ['Notes (2)',     'Work_imported'],
            ['Ideas',         'Work_imported'],
        ]);
        assert.deepEqual(plan.renamed, [{ from: 'Notes', to: 'Notes (2)' }]);
    });

    test('nombre de padre ya tomado → error', () => {
        assert.equal(planFullImport(clone(), file, 'Work').ok, false);
    });

    test('archivo inválido → error', () => {
        assert.equal(planFullImport(clone(), {}, 'X').ok, false);
        assert.equal(planFullImport(clone(), { parentDatabase: { name: 'a', parentDatabase: 'b' } }).ok, false);
    });

    test('store vacío → nombres originales', () => {
        const plan = planFullImport([], file);
        assert.deepEqual(plan.records.map(r => r.name), ['Work', 'Notes', 'Ideas']);
        assert.deepEqual(plan.renamed, []);
    });
});
