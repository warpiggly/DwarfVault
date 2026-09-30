// Export CSV listo para Excel en ambas vistas: BOM UTF-8 + separador según
// idioma (`;` en es-CO, `,` en en-US), y el archivo se reimporta idéntico.
const fs = require('node:fs/promises');
const { test, expect, readDb, csvFile, NOW } = require('./fixtures');

const TRICKY = {
    name: 'Notes', parentDatabase: 'Work',
    entries: [
        { text: 'ñandú, café; "citado"\nsegunda línea', url: 'https://a.com/?q=1,2', favicon: '', date: NOW },
        { text: 'simple', url: '', favicon: '', date: NOW },
    ],
};

async function putNotes(page) {
    await page.evaluate((rec) => new Promise((resolve) => {
        openDatabase(db => {
            const tx = db.transaction('databases', 'readwrite');
            tx.objectStore('databases').put(rec);
            tx.oncomplete = resolve;
        });
    }), TRICKY);
    await page.reload();
}

const VIEWS = {
    corporate: {
        path: 'corporate.html?open=Notes',
        storage: {},
        exportCsv: async (page) => {
            await page.locator('.menu[data-menu=data] .menu-trigger').click();
            await page.locator('.menu-item[data-action=export]').click();
        },
        importInput: '#importInput',
    },
    dwarven: {
        path: 'index.html',
        storage: { dbName: 'Notes' },
        exportCsv: (page) => page.locator('#export-csv').evaluate(b => b.click()),
        importInput: '#importCSV',
    },
};

for (const [locale, delim] of [['es-CO', ';'], ['en-US', ',']]) {
    test.describe(`locale ${locale}`, () => {
        test.use({ locale });

        for (const [view, v] of Object.entries(VIEWS)) {
            test(`${view}: export con BOM y "${delim}", reimporta idéntico`, async ({ openPage }) => {
                const page = await openPage(v.path, v.storage);
                await putNotes(page);

                const [download] = await Promise.all([page.waitForEvent('download'), v.exportCsv(page)]);
                expect(download.suggestedFilename()).toBe('Notes.csv');
                const buf = await fs.readFile(await download.path());

                expect([...buf.subarray(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
                const text = buf.toString('utf8').slice(1);
                expect(text.split('\r\n')[0]).toBe(['#', 'text', 'url', 'favicon'].join(delim));
                expect(text).toContain('ñandú');

                await page.locator(v.importInput).setInputFiles(csvFile('Notes.csv', buf));
                await expect(page.locator('#importDestName')).toHaveValue('Notes (2)');
                await page.locator('.import-modal .save-btn').click();
                await expect(page.locator('.import-modal')).toHaveCount(0);

                const back = (await readDb(page))['Notes (2)'].entries.map(({ text, url }) => ({ text, url }));
                expect(back).toEqual(TRICKY.entries.map(({ text, url }) => ({ text, url })));
            });
        }
    });
}
