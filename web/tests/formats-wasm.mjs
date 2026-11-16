// File formats and brush engines added with the extra libraries (JPEG XL, AVIF, .krz, MyPaint), on the real engine.
// Needs a dev server on 5173. ENGINE_BASE=/engine-dev/ tests a build other than the default one.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const base = process.env.ENGINE_BASE ? `&engineBase=${process.env.ENGINE_BASE}` : '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage();
const log = [];
page.on('pageerror', e => log.push('PAGEERROR ' + e.message));
page.on('console', m => { const t = m.text().trim(); if (t && !/migration|vite|kf\.i18n|RAM|start-up|instantiated|KoShapeManager/.test(t)) log.push(t.slice(0, 300)); });
setTimeout(() => { console.log('FAILED: hard timeout'); console.log(log.slice(-12).join('\n')); process.exit(2); }, 280000);
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) failed++; };

await page.goto(`http://localhost:5173/?engine=wasm${base}`);
await page.waitForFunction(() => window.__engine && __engine.documentInfo().then(Boolean), null, { timeout: 150000 });
await page.waitForTimeout(1500);

for (const format of ['jxl', 'avif', 'krz', 'webp', 'exr', 'tif', 'tiff']) {
    const r = await page.evaluate(async format => {
        const within = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(what + ' did not return')), ms))]);
        try {
            await __engine.newDocument({ width: 320, height: 200 });
            __engine.beginStroke({ x: 40, y: 40, pressure: 1, timeMs: 0 }); __engine.continueStroke([{ x: 280, y: 160, pressure: 1, timeMs: 20 }]); __engine.endStroke();
            const bytes = await within(__engine.exportDocument(format), 60000, 'export');
            const info = await within(__engine.openDocument('roundtrip.' + format, bytes), 60000, 'open');
            // the stroke must survive: the middle of it is not the paper colour
            const png = await __engine.exportDocument('png');
            const img = await createImageBitmap(new Blob([png], { type: 'image/png' }));
            const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0);
            const mid = g.getImageData(160, 100, 1, 1).data, corner = g.getImageData(5, 195, 1, 1).data;
            return { size: bytes.length, w: info.width, h: info.height, mid: [...mid], corner: [...corner] };
        } catch (e) { return { error: e.message }; }
    }, format);
    const differs = r.mid && r.mid.some((v, i) => Math.abs(v - r.corner[i]) > 40);
    check(`${format}: export and reopen`, !r.error && r.w === 320 && r.h === 200 && differs, JSON.stringify(r));
}

const brushes = await page.evaluate(async () => {
    const within = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(what + ' did not return')), ms))]);
    try {
        const presets = await __engine.presets();
        const my = presets.filter(p => /mypaint/i.test(p.engine ?? p.paintop ?? '') || /mypaint/i.test(JSON.stringify(p)));
        if (!my.length) return { count: 0, sample: presets.slice(0, 2), total: presets.length };
        await __engine.newDocument({ width: 320, height: 200 });
        const hash = async () => { const b = await __engine.exportDocument('png'); let h = 0; for (const x of b) h = (h * 31 + x) | 0; return h; };
        const h0 = await hash();
        await within(__engine.selectPreset(my[0].id), 20000, 'selectPreset');
        __engine.beginStroke({ x: 40, y: 40, pressure: 1, timeMs: 0 }); __engine.continueStroke([{ x: 160, y: 100, pressure: 1, timeMs: 20 }, { x: 280, y: 160, pressure: 1, timeMs: 40 }]); __engine.endStroke();
        return { count: my.length, name: my[0].name, painted: (await within(hash(), 30000, 'stroke')) !== h0 };
    } catch (e) { return { error: e.message }; }
});
check('MyPaint presets are listed', brushes.count > 0, JSON.stringify(brushes).slice(0, 300));
if (brushes.count > 0) check('a MyPaint brush paints', brushes.painted === true, JSON.stringify(brushes));

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
if (failed) console.log(log.slice(-8).join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
