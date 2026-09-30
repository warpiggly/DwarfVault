// Vista corporate parada en la hoja "Notes": ningún import la pisa sin pedirlo.
const {
    test: base, expect, readDb, texts, expectNotesUntouched, csvFile, jsonFile, COLLIDING_VAULT,
} = require('./fixtures');

const test = base.extend({
    page: async ({ openPage }, use) => {
        const page = await openPage('corporate.html?open=Notes');
        await expect(page.locator('.sheet-tab.active')).toContainText('Notes');
        await use(page);
    },
});

async function uploadCsv(page, file = csvFile()) {
    await page.locator('#importInput').setInputFiles(file);
    await expect(page.locator('.import-modal')).toBeVisible();
}

test('subir CSV abre el diálogo de destino y no escribe nada todavía', async ({ page }) => {
    await uploadCsv(page);
    await expect(page.locator('.import-modal .edit-modal-title')).toContainText('2 row(s)');
    await expect(page.locator('input[name=importDest][value=new-parent]')).toBeChecked();
    await expect(page.locator('#importDestName')).toHaveValue('recetas');
    await expectNotesUntouched(page);
    expect(Object.keys(await readDb(page)).sort()).toEqual(['Notes', 'Solo', 'Work']);
});

test('por defecto crea tabla sola y deja la hoja actual intacta', async ({ page }) => {
    await uploadCsv(page);
    await page.locator('.import-modal .save-btn').click();
    await expect(page.locator('.import-modal')).toHaveCount(0);

    const db = await readDb(page);
    expect(db.recetas.parentDatabase).toBeNull();
    expect(texts(db.recetas)).toEqual(['receta A', 'receta B']);
    await expectNotesUntouched(page);
    await expect(page.locator('#vaultSelect')).toHaveValue('recetas');
});

test('como hija de un padre elegido', async ({ page }) => {
    await uploadCsv(page);
    await page.locator('input[name=importDest][value=new-child]').check();
    await expect(page.locator('#importDestParent')).toHaveValue('Work');
    await page.locator('#importDestParent').selectOption('Solo');
    await page.locator('#importDestName').fill('Postres');
    await page.locator('.import-modal .save-btn').click();

    const db = await readDb(page);
    expect(db.Postres.parentDatabase).toBe('Solo');
    await expectNotesUntouched(page);
    await expect(page.locator('.sheet-tab.active')).toContainText('Postres');
});

test('nombre repetido no sobrescribe: el diálogo sigue abierto', async ({ page }) => {
    await uploadCsv(page);
    await page.locator('#importDestName').fill('Notes');
    await page.locator('.import-modal .save-btn').click();
    await expect(page.locator('#sheetToast')).toContainText('already exists');
    await expect(page.locator('.import-modal')).toBeVisible();
    await expectNotesUntouched(page);
});

test('nombre por defecto evita choques', async ({ page }) => {
    await uploadCsv(page, csvFile('Notes.csv'));
    await expect(page.locator('#importDestName')).toHaveValue('Notes (2)');
});

test('append en la hoja actual solo si se elige', async ({ page }) => {
    await uploadCsv(page);
    await page.locator('input[name=importDest][value=append]').check();
    await expect(page.locator('#importDestName')).toBeHidden();
    await page.locator('.import-modal .save-btn').click();
    await expect(page.locator('.import-modal')).toHaveCount(0);
    expect(texts((await readDb(page)).Notes)).toEqual(['n1', 'n2', 'receta A', 'receta B']);
});

test('replace pide confirmación; cancelar no toca nada', async ({ page }) => {
    await uploadCsv(page);
    await page.locator('input[name=importDest][value=replace]').check();
    page.once('dialog', d => d.dismiss());
    await page.locator('.import-modal .save-btn').click();
    await expect(page.locator('.import-modal')).toBeVisible();
    await expectNotesUntouched(page);

    page.once('dialog', d => d.accept());
    await page.locator('.import-modal .save-btn').click();
    await expect(page.locator('.import-modal')).toHaveCount(0);
    expect(texts((await readDb(page)).Notes)).toEqual(['receta A', 'receta B']);
});

test('Cancel / Escape cierran sin escribir', async ({ page }) => {
    await uploadCsv(page);
    await page.locator('.import-modal .cancel-btn').click();
    await uploadCsv(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.import-modal')).toHaveCount(0);
    expect(Object.keys(await readDb(page)).sort()).toEqual(['Notes', 'Solo', 'Work']);
    await expectNotesUntouched(page);
});

test('Import Full Vault con nombres repetidos no roba ni pisa hijas', async ({ page }) => {
    page.once('dialog', d => d.accept());
    await page.locator('#importFullInput').setInputFiles(jsonFile(COLLIDING_VAULT));
    await expect(page.locator('#sheetToast')).toContainText('Work_imported');

    const db = await readDb(page);
    await expectNotesUntouched(page);
    expect(texts(db.Work)).toEqual(['w1']);
    expect(db['Notes (2)'].parentDatabase).toBe('Work_imported');
    expect(texts(db['Notes (2)'])).toEqual(['pisado?']);
    expect(db.Ideas.parentDatabase).toBe('Work_imported');
});
