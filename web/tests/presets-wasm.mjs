// Paints one stroke with every bundled preset on Krita's real engine and reports the ones that
// fail to paint, hang or crash. Needs the dev server on 5173 and web/public/engine.
// Usage: node tests/presets-wasm.mjs [report.json]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const results = [];
let log = [];
async function boot() {
    const page = await browser.newPage();
    log = [];
    page.on('console', m => { const t = m.text().trim(); if (t && !/migration|\[vite\]/.test(t)) log.push(t); });
    page.on('pageerror', e => log.push('PAGEERROR ' + e.message));
    await page.goto('http://localhost:5173/?engine=wasm');
    await page.waitForFunction(() => window.__engine, null, { timeout: 150000 });
    await page.evaluate(() => __engine.newDocument({ width: 800, height: 600 }));
    return page;
}
let page = await boot();
const presets = await page.evaluate(() => __engine.presets());
const deadline = Date.now() + Number(process.env.BUDGET_MS ?? 20 * 60000);
for (const preset of presets) {
    if (Date.now() > deadline) { results.push({ ...preset, outcome: 'not run (time budget)' }); continue; }
    const mark = log.length;
    const outcome = await page.evaluate(id => Promise.race([
        (async () => {
            const hash = async () => { const b = await __engine.exportDocument('png'); let h = 0; for (const x of b) h = (h * 31 + x) | 0; return h; };
            const before = await hash();
            await __engine.selectPreset(id);
            __engine.beginStroke({ x: 100, y: 150, pressure: 0.8, timeMs: 0 });
            __engine.continueStroke([{ x: 300, y: 350, pressure: 1, timeMs: 30 }, { x: 500, y: 250, pressure: 0.9, timeMs: 60 }, { x: 700, y: 450, pressure: 0.6, timeMs: 90 }]);
            __engine.endStroke();
            const painted = (await hash()) !== before;
            await __engine.undo();
            return painted ? 'ok' : 'no visible change';
        })().catch(e => 'error: ' + e.message),
        new Promise(r => setTimeout(() => r('HANG'), 20000))]), preset.id).catch(e => 'page failed: ' + String(e.message).split('\n')[0]);
    const entry = { name: preset.name, engine: preset.engine, outcome };
    if (outcome !== 'ok') {
        entry.console = log.slice(mark).slice(-6);
        console.log(`${outcome.padEnd(18)} ${preset.engine.padEnd(16)} ${preset.name}  ${entry.console.join(' | ').slice(0, 200)}`);
    }
    results.push(entry);
    if (outcome === 'HANG' || outcome.startsWith('page failed')) { await page.close().catch(() => {}); page = await boot(); }
}
const count = o => results.filter(r => r.outcome === o).length;
console.log(`${count('ok')} of ${results.length} presets paint; ${results.filter(r => r.outcome !== 'ok').length} do not`);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(results, null, 1));
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
process.exit(results.every(r => r.outcome === 'ok') ? 0 : 1);
