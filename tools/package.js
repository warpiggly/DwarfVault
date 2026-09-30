#!/usr/bin/env node
/**
 * Empaqueta la extensión para Chrome Web Store y Microsoft Edge Add-ons.
 *
 *   npm run package   →   dist/DwarfVault-<version>.zip
 *
 * Mete solo lo que la extensión usa: manifest.json, src/ y los assets que
 * src/ o el manifest referencian (más las licencias OFL de las fuentes).
 * Deja fuera .psd, imágenes sin usar, docs, tests, node_modules...
 * Antes de empaquetar revisa lo que las tiendas rechazan: código remoto,
 * eval, manifest sin campos obligatorios o assets referenciados que faltan.
 */
const fs = require('node:fs');
const path = require('node:path');
const { zip } = require('../src/scripts/xlsx.js');

const ROOT = path.resolve(__dirname, '..');
const TEXT_EXT = new Set(['.html', '.css', '.js', '.json']);
const MANIFEST_KEYS = new Set([
    'manifest_version', 'name', 'version', 'description', 'author', 'permissions', 'optional_permissions',
    'host_permissions', 'background', 'action', 'icons', 'commands', 'content_security_policy',
    'content_scripts', 'web_accessible_resources', 'options_page', 'options_ui', 'default_locale',
    'minimum_chrome_version', 'homepage_url', 'short_name', 'version_name', 'offline_enabled', 'incognito',
]);

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
        const abs = path.join(dir, d.name);
        return d.isDirectory() ? walk(abs) : [abs];
    });
}

/** Rutas `assets/...` citadas en HTML/CSS/JS/manifest (con `\ ` o %20 para espacios). */
function referencedAssets(files) {
    const refs = new Set();
    for (const f of files) {
        if (!TEXT_EXT.has(path.extname(f))) continue;
        const text = fs.readFileSync(f, 'utf8');
        for (const m of text.matchAll(/assets\/(?:[^"'`()\s\\]|\\ | (?=[^"'`()]*\.\w{2,5}["'`)]))+/g)) {
            refs.add(decodeURIComponent(m[0].replace(/\\ /g, ' ')));
        }
    }
    return refs;
}

function collect() {
    const problems = [];
    const warnings = [];
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

    if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');
    for (const k of ['name', 'version', 'description', 'icons']) if (!manifest[k]) problems.push(`manifest.${k} is missing`);
    if (!/^\d+(\.\d+){0,3}$/.test(manifest.version || '')) problems.push(`manifest.version "${manifest.version}" is not 1-4 dot-separated integers`);
    if ((manifest.description || '').length > 132) problems.push('manifest.description is longer than 132 characters');
    for (const k of Object.keys(manifest)) if (!MANIFEST_KEYS.has(k)) warnings.push(`manifest key "${k}" is not recognized by Chrome/Edge (shows a warning; remove it)`);
    for (const size of ['16', '48', '128']) if (!manifest.icons?.[size]) warnings.push(`manifest.icons has no ${size}px icon`);

    const srcFiles = walk(path.join(ROOT, 'src'));
    for (const f of srcFiles) {
        if (!TEXT_EXT.has(path.extname(f))) continue;
        const text = fs.readFileSync(f, 'utf8');
        if (/<script[^>]+src=["']https?:/i.test(text)) problems.push(`${rel(f)}: loads a remote <script> (forbidden in MV3)`);
        if (/\beval\s*\(|\bnew Function\s*\(/.test(text)) problems.push(`${rel(f)}: uses eval/new Function (blocked by MV3 CSP)`);
        if (/importScripts\(\s*["']https?:/.test(text)) problems.push(`${rel(f)}: imports a remote script`);
    }

    const manifestPath = path.join(ROOT, 'manifest.json');
    const assets = [...referencedAssets([manifestPath, ...srcFiles])].sort();
    for (const a of assets) if (!fs.existsSync(path.join(ROOT, a))) problems.push(`missing asset referenced by the code: ${a}`);

    // Las fuentes OFL exigen distribuir su licencia junto a ellas.
    const licenses = new Set();
    for (const a of assets.filter(a => /\.(ttf|otf|woff2?)$/i.test(a))) {
        for (const dir of [path.dirname(a), 'assets/fonts']) {
            const lic = `${dir}/OFL.txt`;
            if (fs.existsSync(path.join(ROOT, lic))) licenses.add(lic);
        }
    }

    const files = [
        'manifest.json',
        ...srcFiles.map(rel),
        ...assets.filter(a => fs.existsSync(path.join(ROOT, a))),
        ...licenses,
    ].filter((f, i, all) => all.indexOf(f) === i);

    const skipped = walk(path.join(ROOT, 'assets')).map(rel).filter(a => !files.includes(a));
    return { manifest, files, skipped, problems, warnings };
}

/** @returns {Promise<{bytes:Uint8Array} & ReturnType<typeof collect>>} */
async function buildPackage() {
    const result = collect();
    if (result.problems.length) return { ...result, bytes: null };
    const bytes = await zip(result.files.map(f => ({ name: f, data: fs.readFileSync(path.join(ROOT, f)) })));
    return { ...result, bytes };
}

async function main() {
    const { manifest, files, skipped, problems, warnings, bytes } = await buildPackage();
    warnings.forEach(w => console.warn(`⚠️  ${w}`));
    if (problems.length) {
        problems.forEach(p => console.error(`❌ ${p}`));
        process.exit(1);
    }

    const out = path.join(ROOT, 'dist', `DwarfVault-${manifest.version}.zip`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, bytes);

    const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
    const skippedBytes = skipped.reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0);
    console.log(`✅ ${rel(out)} — ${files.length} files, ${mb(bytes.length)}`);
    console.log(`   left out ${skipped.length} unused asset(s), ${mb(skippedBytes)}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { collect, buildPackage };
