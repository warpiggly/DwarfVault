// Fixtures E2E: Chromium con la extensión real cargada + IndexedDB sembrado.
// Datos: "Work" (padre) → "Notes" (hija, 2 entries), "Solo" (padre vacío).
const path = require('node:path');
const { test: base, expect, chromium } = require('@playwright/test');

const EXT = path.resolve(__dirname, '../..');
const NOW = '2026-01-01T00:00:00.000Z';
const CSV = '#,text,url,favicon\n1,receta A,https://a.com,\n2,receta B,,\n';

const e = (text) => ({ text, url: '', favicon: '', date: NOW });
const SEED = [
    { name: 'Work',  parentDatabase: null,   entries: [e('w1')] },
    { name: 'Notes', parentDatabase: 'Work', entries: [e('n1'), e('n2')] },
    { name: 'Solo',  parentDatabase: null,   entries: [] },
];

function seedDb(records) {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('Dott-yDB', 2);
        req.onupgradeneeded = () => req.result.createObjectStore('databases', { keyPath: 'name' });
        req.onsuccess = () => {
            const tx = req.result.transaction('databases', 'readwrite');
            const store = tx.objectStore('databases');
            store.clear();
            records.forEach(r => store.put(r));
            tx.oncomplete = () => { req.result.close(); resolve(); };
            tx.onerror    = () => reject(tx.error);
        };
    });
}

const test = base.extend({
    /** Carpeta de la extensión a cargar (por defecto el repo; el smoke test usa el ZIP empaquetado). */
    extPath: [EXT, { option: true }],
    context: async ({ locale, extPath }, use) => {
        const ctx = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            locale,
            args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
        });
        await use(ctx);
        await ctx.close();
    },
    extId: async ({ context }, use) => {
        let [sw] = context.serviceWorkers();
        if (!sw) sw = await context.waitForEvent('serviceworker');
        await use(new URL(sw.url()).host);
    },
    /** Abre una página de la extensión con la BD sembrada y storage limpio. */
    openPage: async ({ context, extId }, use) => {
        await use(async (pagePath, storage = {}) => {
            const page = await context.newPage();
            const url  = `chrome-extension://${extId}/src/pages/${pagePath}`;
            await page.goto(url);
            await page.evaluate(seedDb, SEED);
            await page.evaluate((s) => new Promise(r => chrome.storage.local.clear(() => chrome.storage.local.set(s, r))), storage);
            await page.goto(url);
            return page;
        });
    },
});

async function readDb(page) {
    const rows = await page.evaluate(() => new Promise((resolve) => {
        openDatabase(db => {
            const r = db.transaction('databases').objectStore('databases').getAll();
            r.onsuccess = () => resolve(r.result);
        });
    }));
    return Object.fromEntries(rows.map(r => [r.name, r]));
}

const texts = (rec) => rec.entries.map(x => x.text);

async function expectNotesUntouched(page) {
    const db = await readDb(page);
    expect(db.Notes.parentDatabase).toBe('Work');
    expect(texts(db.Notes)).toEqual(['n1', 'n2']);
}

/** Full Vault que choca con "Work" y con su hija "Notes". */
const COLLIDING_VAULT = {
    version: '1.0',
    parentDatabase: { name: 'Work', parentDatabase: null, entries: [e('otro')] },
    childDatabases: [
        { name: 'Notes', parentDatabase: 'Work', entries: [e('pisado?')] },
        { name: 'Ideas', parentDatabase: 'Work', entries: [e('i1')] },
    ],
};

const csvFile  = (name = 'recetas.csv', body = CSV) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(body) });
const jsonFile = (data, name = 'Work_complete.json') => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });

module.exports = { test, expect, readDb, texts, expectNotesUntouched, csvFile, jsonFile, COLLIDING_VAULT, NOW };
