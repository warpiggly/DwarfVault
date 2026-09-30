// Vista dwarven (index.html) con "Notes" seleccionada en DWARF CHAMBER.
const {
    test: base, expect, readDb, texts, expectNotesUntouched, csvFile, jsonFile, COLLIDING_VAULT,
} = require('./fixtures');

const test = base.extend({
    page: async ({ openPage }, use) => {
        const page = await openPage('index.html', { dbName: 'Notes' });
        await expect(page.locator('#databaseSelect')).toHaveValue('Notes');
        await use(page);
    },
});

async function uploadCsv(page, file = csvFile()) {
    await page.locator('#importCSV').setInputFiles(file);
    await expect(page.locator('.import-modal')).toBeVisible();
}

/** Responde en orden los alert/confirm/prompt que vaya abriendo la página. */
function answerDialogs(page, answers) {
    const seen = [];
    const handler = async (d) => {
        seen.push(d.message());
        const a = answers.shift();
        if (a === false) await d.dismiss();
        else await d.accept(typeof a === 'string' ? a : undefined);
        if (answers.length === 0) page.off('dialog', handler);
    };
    page.on('dialog', handler);
    return seen;
}

test('subir CSV pregunta destino y no escribe nada todavía', async ({ page }) => {
    await uploadCsv(page);
    await expect(page.locator('input[name=importDest][value=new-parent]')).toBeChecked();
    await expect(page.locator('#importDestName')).toHaveValue('recetas');
    await expect(page.locator('input[name=importDest][value=append]')).toBeVisible();
    expect(Object.keys(await readDb(page)).sort()).toEqual(['Notes', 'Solo', 'Work']);
});

test('tabla sola: se crea y queda seleccionada', async ({ page }) => {
    await uploadCsv(page);
    await page.locator('.import-modal .save-btn').click();
    await expect(page.locator('.import-modal')).toHaveCount(0);
    await expect(page.locator('#databaseSelect')).toHaveValue('recetas');

    const db = await readDb(page);
    expect(db.recetas.parentDatabase).toBeNull();
    expect(texts(db.recetas)).toEqual(['receta A', 'receta B']);
    await expectNotesUntouched(page);
});

test('hija de un padre: preselecciona el padre de la BD actual', async ({ page }) => {
    await uploadCsv(page);
    await page.locator('input[name=importDest][value=new-child]').check();
    await expect(page.locator('#importDestParent')).toHaveValue('Work');
    await page.locator('#importDestName').fill('Postres');
    await page.locator('.import-modal .save-btn').click();
    await expect(page.locator('#databaseSelect')).toHaveValue('Postres');

    expect((await readDb(page)).Postres.parentDatabase).toBe('Work');
    await expectNotesUntouched(page);
});

test('nombre repetido: avisa, no pisa, diálogo abierto', async ({ page }) => {
    await uploadCsv(page);
    await page.locator('#importDestName').fill('Notes');
    const seen = answerDialogs(page, [true]);
    await page.locator('.import-modal .save-btn').click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toContain('already exists');
    await expect(page.locator('.import-modal')).toBeVisible();
    await expectNotesUntouched(page);
});

test('append a la BD actual solo si se elige', async ({ page }) => {
    await uploadCsv(page);
    await page.locator('input[name=importDest][value=append]').check();
    await page.locator('.import-modal .save-btn').click();
    await expect(page.locator('.import-modal')).toHaveCount(0);
    expect(texts((await readDb(page)).Notes)).toEqual(['n1', 'n2', 'receta A', 'receta B']);
});

test('Escape cancela sin escribir', async ({ page }) => {
    await uploadCsv(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.import-modal')).toHaveCount(0);
    expect(Object.keys(await readDb(page)).sort()).toEqual(['Notes', 'Solo', 'Work']);
});

test('CSV exportado con saltos de línea se reimporta entero', async ({ page }) => {
    const body = 'Index,Text,URL,Favicon\n1,"linea 1\nlinea 2","https://a.com",""\n2,"otra","",""';
    await uploadCsv(page, csvFile('multi.csv', body));
    await page.locator('.import-modal .save-btn').click();
    await expect(page.locator('.import-modal')).toHaveCount(0);
    expect(texts((await readDb(page)).multi)).toEqual(['linea 1\nlinea 2', 'otra']);
});

test('Full Vault renombrado: hijas repetidas se renombran, originales intactas', async ({ page }) => {
    // confirm "already exists" → Cancel (renombrar), prompt → nombre, alert final.
    const seen = answerDialogs(page, [false, 'Work_imported', true]);
    await page.locator('#importParentFile').setInputFiles(jsonFile(COLLIDING_VAULT));
    await expect.poll(() => seen.length).toBe(3);
    expect(seen[2]).toContain('Import successful');
    expect(seen[2]).toContain('Notes → Notes (2)');

    const db = await readDb(page);
    await expectNotesUntouched(page);
    expect(texts(db.Work)).toEqual(['w1']);
    expect(db.Work_imported.parentDatabase).toBeNull();
    expect(db['Notes (2)'].parentDatabase).toBe('Work_imported');
    expect(db.Ideas.parentDatabase).toBe('Work_imported');
});

test('Full Vault sobrescribir: reemplaza padre e hijas del mismo vault', async ({ page }) => {
    const seen = answerDialogs(page, [true, true]);
    await page.locator('#importParentFile').setInputFiles(jsonFile(COLLIDING_VAULT));
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1]).toContain('Import successful');

    const db = await readDb(page);
    expect(texts(db.Work)).toEqual(['otro']);
    expect(texts(db.Notes)).toEqual(['pisado?']);
    expect(db.Ideas.parentDatabase).toBe('Work');
    expect(db.Solo).toBeTruthy();
});
