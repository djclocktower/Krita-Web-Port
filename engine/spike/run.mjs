// Runs the spike in headless Chromium and saves its output.
// Usage: node engine/spike/run.mjs <build bin dir> <output dir>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // resolves a globally installed Playwright too
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [bin, out] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const server = spawn('node', [fileURLToPath(new URL('../serve.mjs', import.meta.url)), bin, '8765'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 500));

const browser = await chromium.launch();
const page = await browser.newPage();
// Log as lines arrive: if the page's main thread deadlocks, nothing below ever returns.
writeFileSync(`${out}/console.log`, '');
const log = line => appendFileSync(`${out}/console.log`, line + '\n');
page.on('console', m => log(m.text()));
page.on('pageerror', e => log('PAGEERROR ' + e.message));
const timeoutMs = Number(process.env.SPIKE_TIMEOUT_MS ?? 120000);
setTimeout(() => { console.log('FAILED: hard timeout (page hung)'); server.kill(); spawn('pkill', ['-9', '-f', 'chrom']); process.exit(2); },
           timeoutMs + 15000);
let ok = false;
try {
    const start = Date.now();
    await page.goto('http://localhost:8765/kritaspike.html');
    await page.waitForFunction(() => window.kritaSpike?.report, null, { timeout: timeoutMs });
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
    await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
    server.kill();
}
process.exit(ok ? 0 : 1);
