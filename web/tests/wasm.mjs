// Integration check: the real interface driving Krita's real engine (needs web/public/engine and a dev server on 5173).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const shot = process.argv[2] ?? 'wasm.png';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const log = [];
page.on('console', m => log.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', e => log.push('PAGEERROR ' + e.message));
setTimeout(() => { console.log('FAILED: hard timeout'); writeFileSync(shot + '.log', log.join('\n')); process.exit(2); }, 170000);
let failed = false;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); failed ||= !ok; };
try {
    const t0 = Date.now();
    await page.goto('http://localhost:5173/?engine=wasm');
    await page.waitForSelector('canvas', { timeout: 120000 });
    await page.waitForFunction(() => /\d+\s*[x×]\s*\d+/.test(document.body.innerText), null, { timeout: 120000 });
    check('app starts with the real engine', true, `${Date.now() - t0} ms`);
    await page.waitForTimeout(1500);
    const box = await page.locator('canvas').first().boundingBox();
    const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
    await page.mouse.move(...at(0.3, 0.6)); await page.mouse.down();
    for (let i = 1; i <= 40; i++) await page.mouse.move(...at(0.3 + 0.4 * i / 40, 0.6 - 0.25 * Math.sin(i / 40 * Math.PI)));
    await page.mouse.up();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot });
    const text = await page.evaluate(() => document.body.innerText);
    check('no page errors', !log.some(l => l.startsWith('PAGEERROR')), log.filter(l => l.startsWith('PAGEERROR')).slice(0, 3).join(' | '));
    check('layers panel lists layers', /Background|Paint Layer|Layer 1/.test(text));
} catch (e) {
    check('run', false, e.message);
    await page.screenshot({ path: shot }).catch(() => {});
}
writeFileSync(shot + '.log', log.join('\n'));
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
process.exit(failed ? 1 : 0);
