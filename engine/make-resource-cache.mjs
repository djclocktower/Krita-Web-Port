// Builds Krita's resource database once, so the web app does not spend ~40 s importing the default
// bundle on every page load. Boots the engine in headless Chromium, lets it import the bundle, and
// saves the database files next to the engine as resource-cache/ (web/src/engine/wasm.ts restores them).
// Usage: node engine/make-resource-cache.mjs <engine bin dir>     (rerun after rebuilding the engine)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const bin = process.argv[2];
if (!bin) { console.error('usage: node engine/make-resource-cache.mjs <engine bin dir>'); process.exit(2); }
const out = `${bin}/resource-cache`;
rmSync(out, { recursive: true, force: true });   // the engine must start without a cache to build one
const blank = `${bin}/cache-builder.html`;          // an empty page on the isolated origin to load the engine into
writeFileSync(blank, '<!doctype html><title>cache builder</title>');

const server = spawn('node', [fileURLToPath(new URL('./serve.mjs', import.meta.url)), bin, '8766'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));
const browser = await chromium.launch();
const page = await browser.newPage();
try {
    await page.goto('http://localhost:8766/cache-builder.html');
    await page.addScriptTag({ url: '/kritaengine.js' });
    const dir = await page.evaluate(() => new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('engine did not start within 5 minutes')), 300000);
        window.engine = {
            kwOnMessage: json => { const m = JSON.parse(json); if (m.event === 'ready') resolve(m.dataDir); },
            print: () => {}, printErr: () => {},
        };
        kritaengine_entry(window.engine);
    }));
    const files = await page.evaluate(dir => engine.FS.readdir(dir).filter(n => engine.FS.isFile(engine.FS.stat(`${dir}/${n}`).mode)), dir);
    mkdirSync(out, { recursive: true });
    let total = 0;
    const copies = [];
    for (const name of [...files]) {
        const size = await page.evaluate(p => engine.FS.stat(p).size, `${dir}/${name}`);
        // Krita installs its default bundle into the data directory. The engine already carries that
        // file, so record "copy it" instead of shipping the same 17 MB twice.
        const shipped = `/share/krita/bundles/${name}`;
        if (await page.evaluate(({ p, size }) => { try { return engine.FS.stat(p).size === size; } catch { return false; } }, { p: shipped, size })) {
            copies.push({ from: shipped, name });
            files.splice(files.indexOf(name), 1);
            console.log(`${name}: copied from ${shipped} at start-up`);
            continue;
        }
        const chunks = [];
        for (let at = 0; at < size; at += 4 << 20) {       // 4 MB at a time keeps each transfer small
            chunks.push(Buffer.from(await page.evaluate(({ p, at, n }) => {
                const s = engine.FS.open(p, 'r'), buf = new Uint8Array(n);
                const got = engine.FS.read(s, buf, 0, n, at); engine.FS.close(s);
                let str = ''; for (let i = 0; i < got; i++) str += String.fromCharCode(buf[i]); return btoa(str);
            }, { p: `${dir}/${name}`, at, n: Math.min(4 << 20, size - at) }), 'base64'));
        }
        writeFileSync(`${out}/${name}`, Buffer.concat(chunks));
        total += size;
        console.log(`${name}: ${size} bytes`);
    }
    writeFileSync(`${out}/manifest.json`, JSON.stringify({ dir, files, copies }));
    console.log(`resource cache written to ${out} (${files.length} files, ${(total / 1e6).toFixed(1)} MB)`);
} finally {
    await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
    server.kill();
    rmSync(blank, { force: true });
}
