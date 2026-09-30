// Excel (.xlsx) en ambas vistas: export hoja, export vault (una hoja por
// tabla), import de un .xlsx de otra herramienta eligiendo la hoja, e ida y
// vuelta sin pérdidas.
const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect, readDb, texts, expectNotesUntouched, NOW } = require('./fixtures');
require('../../src/scripts/security.js');
const X = require('../../src/scripts/xlsx.js');
const { rowsToEntries } = require('../../src/scripts/importPlanner.js');

const EXCEL_MADE = path.join(__dirname, '../fixtures/excel-made.xlsx');
const TRICKY = [
    { text: 'ñandú, café; "citado"\nsegunda línea & <b>', url: 'https://a.com/?q=1,2', favicon: '', date: NOW },
    { text: '=1+1', url: '', favicon: 'https://a.com/f.ico', date: NOW },
];

async function setNotes(page) {
    await page.evaluate((entries) => new Promise((resolve) => {
        openDatabase(db => {
            const tx = db.transaction('databases', 'readwrite');
            tx.objectStore('databases').put({ name: 'Notes', parentDatabase: 'Work', entries });
            tx.oncomplete = resolve;
        });
    }), TRICKY);
    await page.reload();
}

const menu = (action) => async (page) => {
    await page.locator('.menu[data-menu=data] .menu-trigger').click();
    await page.locator(`.menu-item[data-action=${action}]`).click();
};
const button = (id) => (page) => page.locator(`#${id}`).evaluate(b => b.click());

const VIEWS = {
    corporate: {
        path: 'corporate.html?open=Notes', storage: {},
        exportSheet: menu('export-xlsx'), exportVault: menu('export-vault-xlsx'), importInput: '#importInput',
    },
    dwarven: {
        path: 'index.html', storage: { dbName: 'Notes' },
        exportSheet: button('export-xlsx'), exportVault: button('export-vault-xlsx'), importInput: '#importCSV',
    },
};

async function download(page, trigger) {
    const [dl] = await Promise.all([page.waitForEvent('download'), trigger(page)]);
    return { name: dl.suggestedFilename(), bytes: await fs.readFile(await dl.path()) };
}

for (const [view, v] of Object.entries(VIEWS)) {
    test.describe(view, () => {
        const vt = test.extend({
            page: async ({ openPage }, use) => {
                const page = await openPage(v.path, v.storage);
                await setNotes(page);
                await use(page);
            },
        });

        vt('export Excel de la hoja: .xlsx válido con los datos exactos', async ({ page }) => {
            const { name, bytes } = await download(page, v.exportSheet);
            expect(name).toBe('Notes.xlsx');
            expect([...bytes.subarray(0, 2)]).toEqual([0x50, 0x4B]);   // "PK" = ZIP

            const [sheet] = await X.readXlsx(bytes);
            expect(sheet.name).toBe('Notes');
            expect(sheet.rows[0]).toEqual(['#', 'text', 'url', 'favicon']);
            expect(rowsToEntries(sheet.rows, NOW)).toEqual(TRICKY);
        });

        vt('export Vault Excel: una hoja por tabla (padre + hijas)', async ({ page }) => {
            const { name, bytes } = await download(page, v.exportVault);
            expect(name).toBe('Work_vault.xlsx');
            const sheets = await X.readXlsx(bytes);
            expect(sheets.map(s => s.name)).toEqual(['Work', 'Notes']);
            expect(rowsToEntries(sheets[0].rows, NOW).map(e => e.text)).toEqual(['w1']);
        });

        vt('ida y vuelta: el Excel exportado se reimporta idéntico', async ({ page }) => {
            const { bytes } = await download(page, v.exportSheet);
            await page.locator(v.importInput).setInputFiles({ name: 'Notes.xlsx', mimeType: X.MIME, buffer: bytes });
            await expect(page.locator('.import-modal')).toBeVisible();
            await expect(page.locator('#importDestSheet')).toBeHidden();       // 1 hoja → sin selector
            await expect(page.locator('#importDestName')).toHaveValue('Notes (2)');
            await page.locator('.import-modal .save-btn').click();
            await expect(page.locator('.import-modal')).toHaveCount(0);

            const back = (await readDb(page))['Notes (2)'].entries.map(({ text, url, favicon }) => ({ text, url, favicon }));
            expect(back).toEqual(TRICKY.map(({ text, url, favicon }) => ({ text, url, favicon })));
        });

        vt('import de Excel ajeno con varias hojas: elige hoja, sin pisar nada', async ({ page }) => {
            await page.locator(v.importInput).setInputFiles(EXCEL_MADE);
            await expect(page.locator('.import-modal')).toBeVisible();

            const sheet = page.locator('#importDestSheet');
            await expect(sheet.locator('option')).toHaveText(['Clientes (3)', 'Proveedores (1)']);   // "Vacía" se omite
            await expect(page.locator('#importDestName')).toHaveValue('Clientes');
            await expect(page.locator('.import-modal .edit-modal-title')).toContainText('3 row(s)');

            await sheet.selectOption({ label: 'Proveedores (1)' });
            await expect(page.locator('#importDestName')).toHaveValue('Proveedores');
            await expect(page.locator('.import-modal .edit-modal-title')).toContainText('1 row(s)');

            await page.locator('input[name=importDest][value=new-child]').check();
            await page.locator('.import-modal .save-btn').click();
            await expect(page.locator('.import-modal')).toHaveCount(0);

            const db = await readDb(page);
            expect(db.Proveedores.parentDatabase).toBe('Work');
            expect(db.Proveedores.entries.map(e => [e.text, e.url])).toEqual([['Acme', 'https://acme.com']]);
            expect(db.Clientes).toBeUndefined();
            expect(texts(db.Notes)).toEqual(TRICKY.map(e => e.text));
        });

        vt('nombre editado a mano no se pisa al cambiar de hoja', async ({ page }) => {
            await page.locator(v.importInput).setInputFiles(EXCEL_MADE);
            await page.locator('#importDestName').fill('Mío');
            await page.locator('#importDestSheet').selectOption({ label: 'Proveedores (1)' });
            await expect(page.locator('#importDestName')).toHaveValue('Mío');
        });

        vt('archivo .xlsx corrupto: avisa y no escribe', async ({ page }) => {
            const seen = [];
            page.on('dialog', d => { seen.push(d.message()); d.accept(); });
            await page.locator(v.importInput).setInputFiles({ name: 'roto.xlsx', mimeType: X.MIME, buffer: Buffer.from('no soy excel') });
            if (view === 'corporate') await expect(page.locator('#sheetToast')).toContainText('unreadable');
            else await expect.poll(() => seen.join()).toContain('Could not read');
            await expect(page.locator('.import-modal')).toHaveCount(0);
            expect(Object.keys(await readDb(page)).sort()).toEqual(['Notes', 'Solo', 'Work']);
        });
    });
}

test('Notes original sigue intacto tras abrir y cancelar un import Excel', async ({ openPage }) => {
    const page = await openPage('corporate.html?open=Notes');
    await page.locator('#importInput').setInputFiles(EXCEL_MADE);
    await page.keyboard.press('Escape');
    await expectNotesUntouched(page);
});
