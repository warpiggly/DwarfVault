// Smoke test del ZIP que se sube a Chrome Web Store / Edge Add-ons: se arma
// con tools/package.js, se descomprime y se carga ESA carpeta como extensión.
// Si el empaquetador dejó fuera algo que una página usa, aquí falla.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test: base, expect } = require('./fixtures');
const { buildPackage } = require('../../tools/package.js');
const X = require('../../src/scripts/xlsx.js');

const PAGES = ['index.html', 'corporate.html', 'schema.html', 'guide.html', 'tables.html', 'tutorial.html'];

const test = base.extend({
    packagedExt: [async ({}, use) => {
        const { bytes, problems } = await buildPackage();
        if (!bytes) throw new Error(`package refused: ${problems.join('; ')}`);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dwarfvault-pkg-'));
        for (const [name, data] of await X.unzip(bytes)) {
            const out = path.join(dir, name);
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, data);
        }
        await use(dir);
        fs.rmSync(dir, { recursive: true, force: true });
    }, { scope: 'worker' }],
    extPath: async ({ packagedExt }, use) => use(packagedExt),
});

test('el paquete no incluye archivos de desarrollo', async ({ packagedExt }) => {
    const all = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
        .forEach(e => (e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(packagedExt, path.join(d, e.name)).split(path.sep).join('/'))));
    walk(packagedExt);
    expect(all).toContain('manifest.json');
    expect(all.filter(f => /(^|\/)(tests|node_modules|docs|tools|\.tmp-shots)\/|\.psd$|package(-lock)?\.json$/.test(f))).toEqual([]);
});

for (const page of PAGES) {
    test(`${page}: carga sin recursos faltantes ni errores`, async ({ context, extId }) => {
        const p = await context.newPage();
        const failed = [];
        const errors = [];
        p.on('requestfailed', r => r.url().startsWith('chrome-extension://') && failed.push(r.url()));
        p.on('response', r => r.url().startsWith('chrome-extension://') && r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
        p.on('pageerror', e => errors.push(e.message));
        await p.goto(`chrome-extension://${extId}/src/pages/${page}`);
        await p.waitForLoadState('networkidle');
        expect(failed).toEqual([]);
        expect(errors).toEqual([]);
    });
}

test('export Excel funciona desde el paquete', async ({ openPage }) => {
    const page = await openPage('corporate.html?open=Notes');
    await page.locator('.menu[data-menu=data] .menu-trigger').click();
    const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('.menu-item[data-action=export-xlsx]').click(),
    ]);
    const [sheet] = await X.readXlsx(fs.readFileSync(await dl.path()));
    expect(sheet.rows.slice(1).map(r => r[1])).toEqual(['n1', 'n2']);
});
