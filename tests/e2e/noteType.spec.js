// NOTE (usuario) + TYPE (deducido) en la vista dwarven: RELICS y TABLES.
const { test, expect, readDb, NOW } = require('./fixtures');

const ENTRIES = [
    { text: 'hola mundo',          url: '', favicon: '', date: NOW, note: 'saludo de prueba' },
    { text: 'https://a.com/x',     url: '', favicon: '', date: NOW },
    { text: 'dev@example.com',     url: '', favicon: '', date: NOW },
    { text: 'const x = 1;',        url: '', favicon: '', date: NOW },
    { text: '+57 300 123 4567',    url: '', favicon: '', date: NOW },
];

async function putEntries(page) {
    await page.evaluate((entries) => new Promise((resolve) => {
        openDatabase(db => {
            const tx = db.transaction('databases', 'readwrite');
            tx.objectStore('databases').put({ name: 'Notes', parentDatabase: 'Work', entries });
            tx.oncomplete = resolve;
        });
    }), ENTRIES);
    await page.reload();
}

test('RELICS: badge de tipo, nota visible, filtro y búsqueda por nota', async ({ openPage }) => {
    const page = await openPage('index.html', { dbName: 'Notes' });
    await putEntries(page);
    await page.locator('label[for="toggleReliquias"]').click();

    const items = page.locator('#entriesList li');
    await expect(items).toHaveCount(5);
    expect(await page.locator('#entriesList .entry-type').evaluateAll(els => els.map(e => e.title)))
        .toEqual(['Text', 'Link', 'Email', 'Code', 'Number']);
    await expect(items.first().locator('.entry-note')).toContainText('saludo de prueba');

    await page.selectOption('#typeFilter', 'email');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('dev@example.com');

    await page.selectOption('#typeFilter', '');
    await page.fill('#searchBar', 'saludo');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('hola mundo');
});

test('RELICS: editar nota la guarda, vaciarla la quita', async ({ openPage }) => {
    const page = await openPage('index.html', { dbName: 'Notes' });
    await putEntries(page);
    await page.locator('label[for="toggleReliquias"]').click();

    await page.locator('#entriesList li').nth(1).locator('.edit-btn').click();
    await page.fill('.edit-modal-note', '  link del cliente  ');
    await page.locator('.edit-modal .action-btn').click();
    await expect(page.locator('.edit-modal')).toHaveCount(0);
    await expect.poll(async () => (await readDb(page)).Notes.entries[1].note).toBe('link del cliente');

    await page.locator('#entriesList li').first().locator('.edit-btn').click();
    await page.fill('.edit-modal-note', '');
    await page.locator('.edit-modal .action-btn').click();
    await expect.poll(async () => 'note' in (await readDb(page)).Notes.entries[0]).toBe(false);
});

test('TABLES: columnas TYPE y NOTE', async ({ openPage }) => {
    const page = await openPage('tables.html');
    await putEntries(page);

    await expect(page.locator('thead').first().locator('th'))
        .toHaveText(['#', '', 'TYPE', 'TEXT', 'NOTE', 'SOURCE', 'DATE']);
    const rows = page.locator('.table-wrapper--child tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0).locator('.td-note')).toHaveText('saludo de prueba');
    await expect(rows.nth(1).locator('.td-note')).toHaveText('—');
    await expect(rows.nth(3).locator('.td-type__badge')).toHaveAttribute('title', 'Code');
});

test('CORPORATE: columnas Type y Note, filtro y búsqueda por nota', async ({ openPage }) => {
    const page = await openPage('corporate.html?open=Notes');
    await putEntries(page);
    await expect(page.locator('.sheet-tab.active')).toContainText('Notes');

    await expect(page.locator('#sheetGrid thead th')).toHaveText(['#', 'Icon', 'Text', 'URL', 'Note', 'Type']);
    const rows = page.locator('#sheetGridBody tr:not(.row-empty)');
    expect(await rows.locator('.cell-type-badge').evaluateAll(els => els.map(e => e.title)))
        .toEqual(['Text', 'Link', 'Email', 'Code', 'Number']);
    await expect(rows.nth(0).locator('.cell-note')).toHaveText('saludo de prueba');

    const visible = page.locator('#sheetGridBody tr:not(.row-hidden):not(.row-empty)');
    await page.selectOption('#typeFilter', 'code');
    await expect(visible).toHaveCount(1);
    await expect(visible.first()).toContainText('const x = 1;');

    await page.selectOption('#typeFilter', '');
    await page.fill('#searchInput', 'saludo');
    await expect(visible).toHaveCount(1);
    await expect(visible.first()).toContainText('hola mundo');
});

test('CORPORATE: doble clic en Note edita y guarda la nota', async ({ openPage }) => {
    const page = await openPage('corporate.html?open=Notes');
    await putEntries(page);

    await page.locator('#sheetGridBody tr').nth(2).locator('.cell-note').dblclick();
    await expect(page.locator('.edit-modal-note')).toBeFocused();
    await page.fill('.edit-modal-note', 'correo del dev');
    await page.locator('.edit-modal .save-btn').click();
    await expect.poll(async () => (await readDb(page)).Notes.entries[2].note).toBe('correo del dev');
    await expect(page.locator('#sheetGridBody tr').nth(2).locator('.cell-note')).toHaveText('correo del dev');
});

test('CORPORATE: # Icon Text URL llenan la vista; Note y Type salen con la barra horizontal', async ({ openPage }) => {
    const page = await openPage('corporate.html?open=Notes');
    await putEntries(page);
    const wrap = page.locator('.sheet-grid-wrapper');

    const layout = () => wrap.evaluate((w) => {
        const box = w.getBoundingClientRect();
        const r = (sel) => w.querySelector(sel).getBoundingClientRect();
        return {
            scrollable: w.scrollWidth > w.clientWidth,
            urlInside:  r('th.col-url').right  <= box.right + 1,
            noteInside: r('th.col-note').left  <  box.right - 20,
            typeInside: r('th.col-type').right <= box.right + 1,
        };
    });

    expect(await layout()).toEqual({ scrollable: true, urlInside: true, noteInside: false, typeInside: false });
    await wrap.evaluate((w) => { w.scrollLeft = w.scrollWidth; });
    const end = await layout();
    expect(end.noteInside && end.typeInside).toBe(true);
});
