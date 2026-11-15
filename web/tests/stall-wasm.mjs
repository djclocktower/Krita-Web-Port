// Regression test: painting with real pointer events on the real engine must leave the engine usable.
// Needs web/public/engine and a dev server on 5182. Hard timeout: the script can never hang.
// Cause it guards against: the Layers panel asks for thumbnails while the stroke is still open and the
// engine's nodeThumbnail waits for the stroke to finish, while endStroke is queued behind it (see report).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = process.env.URL ?? 'http://localhost:5182/?engine=wasm';
setTimeout(() => { console.log('FAILED: hard timeout'); process.exit(2); }, 240000);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let failed = false;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); failed ||= !ok; };
const within = (ms, p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`no answer in ${ms} ms`)), ms))]);

for (const name of ['Basic-5 Size', 'Bristles-2 Flat Rough', 'Watercolor Fringe']) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });   // a stalled engine cannot be reused: one page each
    try {
        page.on('pageerror', e => console.log('PAGEERROR', e.message));
        await page.goto(URL);
        await page.waitForFunction(() => window.__engine && /\d+\s*[x×]\s*\d+/.test(document.body.innerText), null, { timeout: 120000 });
        await page.waitForTimeout(1000);
        const preset = (await page.evaluate(() => __engine.presets())).find(x => x.name.includes(name));
        if (!preset) { check(name, false, 'preset not found'); continue; }
        await within(20000, page.evaluate(id => __engine.selectPreset(id), preset.id));
        const box = await page.locator('canvas.view').boundingBox();
        const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
        const t0 = Date.now();
        await within(30000, (async () => {
            await page.mouse.move(...at(0.2, 0.5)); await page.mouse.down();
            for (let i = 1; i <= 50; i++) { await page.mouse.move(...at(0.2 + 0.6 * i / 50, 0.5 - 0.2 * Math.sin(i / 50 * Math.PI))); await page.waitForTimeout(15); }
            await page.mouse.up();
        })());
        await page.waitForTimeout(1500);   // thumbnail refresh and any late image updates
        const layers = await within(15000, page.evaluate(() => __engine.layers().then(l => l.length)));
        await within(5000, page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(1)))));
        check(name, layers > 0, `${Date.now() - t0} ms`);
    } catch (e) { check(name, false, e.message); }
    await page.close().catch(() => {});
}
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
process.exit(failed ? 1 : 0);
