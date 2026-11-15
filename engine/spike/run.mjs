// Runs the spike in headless Chromium and saves its output.
// Usage: node engine/spike/run.mjs <build bin dir> <output dir>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // resolves a globally installed Playwright too
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const [bin, out] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const server = spawn('node', [fileURLToPath(new URL('../serve.mjs', import.meta.url)), bin, '8765'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));

const browser = await chromium.launch();
const page = await browser.newPage();
const log = [];
page.on('console', m => log.push(m.text()));
page.on('pageerror', e => log.push('PAGEERROR ' + e.message));
let ok = false;
try {
    const start = Date.now();
    await page.goto('http://localhost:8765/kritaspike.html');
    await page.waitForFunction(() => window.kritaSpike?.report, null, { timeout: 180000 });
    const report = await page.evaluate(() => window.kritaSpike.report);
    report.wallMsFromNavigation = Date.now() - start;
    for (const [name, url] of Object.entries(await page.evaluate(() => window.kritaSpike.images))) {
        const b64 = await page.evaluate(async u => {
            const bytes = new Uint8Array(await (await fetch(u)).arrayBuffer());
            let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s);
        }, url);
        await writeFile(`${out}/${name}.png`, Buffer.from(b64, 'base64'));
    }
    await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    ok = true;
} catch (e) {
    console.log('FAILED: ' + e.message);
} finally {
    await writeFile(`${out}/console.log`, log.join('\n'));
    await browser.close();
    server.kill();
}
process.exit(ok ? 0 : 1);
