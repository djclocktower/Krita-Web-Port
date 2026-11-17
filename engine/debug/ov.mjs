import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/user/Krita-Web-Port/web/tests/x.mjs')('playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.goto('http://localhost:5173/?engine=wasm');
await page.waitForFunction(() => window.__engine && __engine.documentInfo().then(Boolean), null, { timeout: 150000 });
await page.waitForTimeout(5000);
await page.evaluate(() => { window.ov = []; __engine.on('kritaOverlay', (r, px) => ov.push(px ? `${r.x},${r.y} ${r.width}x${r.height}` : 'clear')); });
const box = await page.locator('canvas.view').boundingBox();
await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 500, box.y + 350, { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(1500);
await page.locator('[data-krita-tool="KisToolTransform"]').click(); await page.waitForTimeout(3000);
await page.mouse.move(box.x + 400, box.y + 320); await page.waitForTimeout(800);
const r = await page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].find(c => /overlay/.test(c.className));
    let solid = -1; if (c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; solid = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) solid++; }
    return { events: ov.slice(-5), count: ov.length, canvas: c ? `${c.className} ${c.width}x${c.height}` : 'none', solid };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: `${process.argv[2]}/ov.png` });
await browser.close();
