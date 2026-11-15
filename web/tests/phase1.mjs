// Phase 1 UI check. Needs the dev server: npx vite --port 5173 --strictPort
// Run: node tests/phase1.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const SHOT = '/tmp/claude-0/-home-user-Krita-Web-Port/65182417-9f70-5299-9ecc-ec5673875a37/scratchpad/phase1.png';
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// Colour of the canvas at a CSS-pixel position (page coordinates), read back from the WebGL canvas.
const pixel = (x, y) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas.view'), r = c.getBoundingClientRect(), k = c.width / r.width;
    const t = document.createElement('canvas'); t.width = t.height = 1;
    const g = t.getContext('2d'); g.drawImage(c, (x - r.left) * k, (y - r.top) * k, 1, 1, 0, 0, 1, 1);
    return [...g.getImageData(0, 0, 1, 1).data];
}, [x, y]);
const dark = p => p[0] < 80 && p[1] < 80 && p[2] < 80;
const white = p => p[0] > 235 && p[1] > 235 && p[2] > 235;
const text = sel => page.locator(sel).innerText();
const pos = async () => (await text('.status-pos')).split(',').map(Number);
const hover = async (x, y) => { await page.mouse.move(x - 5, y - 5); await page.mouse.move(x, y); };
const drag = async (x0, y0, x1, y1) => {
    await page.mouse.move(x0, y0); await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 12 }); await page.mouse.up();
};
const settle = () => page.waitForTimeout(150);

await page.goto('http://localhost:5173/');
await page.waitForFunction(() => document.querySelector('.status-doc')?.textContent.includes('1600 × 1200'));
await settle();
const box = await page.locator('canvas.view').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

// 1. loads with a document, white where the image is
check((await text('.status-doc')).includes('Untitled · 1600 × 1200'), 'app opens with a 1600x1200 document');
check(white(await pixel(cx, cy)), 'document is displayed (white at centre)', JSON.stringify(await pixel(cx, cy)));
check(JSON.stringify(await pixel(box.x + 3, box.y + 3)) !== JSON.stringify([255, 255, 255, 255]), 'area outside the page is not page-white');

// 2. painting
await hover(cx, cy);
const [ix, iy] = await pos();
check(Math.abs(ix - 800) <= 1 && Math.abs(iy - 600) <= 1, 'pointer position maps to image pixels at fit zoom', `${ix},${iy}`);
await drag(cx - 100, cy, cx + 100, cy);
await settle();
check(dark(await pixel(cx, cy)), 'drag paints under the stroke');
check(dark(await pixel(cx - 90, cy)) && dark(await pixel(cx + 90, cy)), 'stroke reaches both ends');
check(white(await pixel(cx, cy + 60)), 'pixels away from the stroke are untouched');

// 3. undo
await page.keyboard.press('Control+z');
await settle();
check(white(await pixel(cx, cy)), 'Ctrl+Z restores the pixels');
await page.keyboard.press('Control+Shift+z');
await settle();
check(dark(await pixel(cx, cy)), 'Ctrl+Shift+Z redoes the stroke');
await page.keyboard.press('Control+z');
await settle();

// 4. view mapping after zoom, rotation, mirror
await page.keyboard.press('1');
await settle();
check((await text('.status-zoom')) === '100%', 'key 1 sets zoom to 100%');
await hover(cx + 50, cy + 30);
let [px, py] = await pos();
check(Math.abs(px - 850) <= 1.5 && Math.abs(py - 630) <= 1.5, 'mapping at 100% zoom', `${px},${py}`);
await page.keyboard.press('6');
await settle();
check((await text('.status-rot')).startsWith('15°'), 'key 6 rotates by 15 degrees', await text('.status-rot'));
await hover(cx + 50, cy);
[px, py] = await pos();
check(Math.abs(px - 848.3) <= 1.5 && Math.abs(py - 587.1) <= 1.5, 'mapping after rotation', `${px},${py}`);
await page.mouse.down(); await page.mouse.up();
await settle();
check(dark(await pixel(cx + 50, cy)), 'a dab after rotation lands under the cursor');
await page.keyboard.press('Control+z');
await page.keyboard.press('m');
await settle();
await hover(cx + 50, cy);
[px, py] = await pos();
check(Math.abs(px - 751.7) <= 1.5 && Math.abs(py - 587.1) <= 1.5, 'mapping after mirror', `${px},${py}`);
await page.keyboard.press('m');
await page.keyboard.press('5');
await settle();
check((await text('.status-rot')).startsWith('0°'), 'key 5 resets rotation');

// zoom about the cursor: the image point under the pointer stays put
const wx = cx + 120, wy = cy - 80;
await hover(wx, wy);
const before = await pos();
await page.mouse.wheel(0, -400);
await settle();
await page.mouse.move(wx + 30, wy + 30); await page.mouse.move(wx, wy);
const after = await pos();
check((await text('.status-zoom')) !== '100%', 'wheel changes zoom');
check(Math.abs(before[0] - after[0]) <= 1.5 && Math.abs(before[1] - after[1]) <= 1.5, 'wheel zoom is about the cursor', `${before} -> ${after}`);

// space + drag pans
await page.keyboard.press('2');
await settle();
await hover(cx, cy);
const p0 = await pos();
await page.keyboard.down('Space');
await drag(cx, cy, cx + 100, cy + 40);
await page.keyboard.up('Space');
await hover(cx, cy);
const p1 = await pos();
check(Math.abs(p0[0] - p1[0]) > 10, 'Space+drag pans instead of painting', `${p0} -> ${p1}`);
check(white(await pixel(cx + 100, cy + 40)), 'Space+drag leaves no paint');
await page.keyboard.press('2');
await settle();

await page.click('[role=tab]:has-text("Color")');   // the right dock is tabbed

// 5. brush shortcuts
const size = () => page.locator('input[aria-label="Brush size"]').inputValue().then(Number);
const s0 = await size();
await page.keyboard.press(']');
await settle();
const s1 = await size();
await page.keyboard.press('[');
await settle();
check(s1 > s0 && (await size()) === s0, '] grows and [ shrinks the brush', `${s0} ${s1} ${await size()}`);
const opacity = () => page.locator('input[aria-label="Brush opacity"]').inputValue().then(Number);
await page.keyboard.press('i');
await settle();
check((await opacity()) === 90, 'I lowers opacity');
await page.keyboard.press('o');
await page.keyboard.press('e');
await settle();
check((await page.locator('button:has-text("Eraser")').getAttribute('aria-pressed')) === 'true', 'E toggles eraser');
await page.keyboard.press('e');
// shortcuts are ignored while typing
await page.locator('input[aria-label="Hex colour"]').focus();
await page.keyboard.press(']');
check((await size()) === s0, 'shortcuts do not fire while typing');
await page.locator('input[aria-label="Hex colour"]').blur();

// 6. New dialog validation
await page.keyboard.press('Control+n');
await page.waitForSelector('dialog[open]');
await page.fill('input[name="w"]', '0');
await page.click('button:has-text("Create")');
check(await page.locator('dialog[open]').count() === 1 && (await text('dialog .error')).length > 0, 'New dialog rejects width 0 and stays open');
await page.fill('input[name="w"]', '300');
await page.fill('input[name="h"]', '99999');
await page.click('button:has-text("Create")');
check(await page.locator('dialog[open]').count() === 1 && (await text('dialog .error')).length > 0, 'New dialog rejects height 99999');
await page.fill('input[name="h"]', '200');
await page.fill('input[name="name"]', 'Small');
await page.click('button:has-text("Create")');
await page.waitForFunction(() => document.querySelector('.status-doc').textContent.includes('Small · 300 × 200'));
check(await page.locator('dialog[open]').count() === 0, 'valid New creates the document and closes the dialog');
await settle();

// 7. colour change affects the next stroke
const hexInput = page.locator('input[aria-label="Hex colour"]');
await hexInput.fill('#ff0000');
await hexInput.press('Enter');
await settle();
await drag(cx - 40, cy, cx + 40, cy);
await settle();
const red = await pixel(cx, cy);
check(red[0] > 200 && red[1] < 60 && red[2] < 60, 'new colour from the colour panel paints the next stroke', JSON.stringify(red));
await page.keyboard.press('Control+z');
await page.keyboard.press('x');   // swap: foreground becomes white
await page.keyboard.press('d');   // reset: black
await settle();
check((await page.locator('.swatches .swatch').first().evaluate(e => getComputedStyle(e).backgroundColor)) === 'rgb(0, 0, 0)', 'D resets colours');

// 8. export and open
const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+Shift+e')]);
const png = readFileSync(await download.path());
check(download.suggestedFilename() === 'Small.png' && png.subarray(1, 4).toString() === 'PNG', 'Ctrl+Shift+E downloads a PNG', download.suggestedFilename());
const bytes = Buffer.from(await page.evaluate(async () => {
    const c = new OffscreenCanvas(64, 48); const g = c.getContext('2d'); g.fillStyle = '#0a0'; g.fillRect(0, 0, 64, 48);
    return btoa(String.fromCharCode(...new Uint8Array(await (await c.convertToBlob()).arrayBuffer())));
}), 'base64');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Control+o')]);
await chooser.setFiles({ name: 'green.png', mimeType: 'image/png', buffer: bytes });
await page.waitForFunction(() => document.querySelector('.status-doc').textContent.includes('green.png · 64 × 48'));
check(true, 'Ctrl+O opens an image file');

// 9. menus by keyboard
await page.locator('button[data-menu="Edit"]').focus();
await page.keyboard.press('ArrowDown');
await page.waitForSelector('[role=menu] [role=menuitem]');
check(await page.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem'), 'menu opens by keyboard and focuses an item');
await page.keyboard.press('Escape');
check(await page.locator('[role=menu]').count() === 0, 'Escape closes the menu');

// screenshot: a fresh page with a few strokes
await page.keyboard.press('Control+n');
await page.waitForSelector('dialog[open]');
await page.fill('input[name="w"]', '1200'); await page.fill('input[name="h"]', '800');
await page.click('button:has-text("Create")');
await page.waitForFunction(() => document.querySelector('.status-doc').textContent.includes('1200 × 800'));
await settle();
for (const [hexv, dy] of [['#d33a3a', -90], ['#e8a33a', -30], ['#3a8fd3', 30], ['#3ad38f', 90]]) {
    await hexInput.fill(hexv); await hexInput.press('Enter');
    await page.keyboard.press(']'); await page.keyboard.press(']');
    await page.mouse.move(cx - 220, cy + dy); await page.mouse.down();
    for (let i = 0; i <= 40; i++) await page.mouse.move(cx - 220 + i * 11, cy + dy + Math.sin(i / 4) * 30);
    await page.mouse.up();
}
await settle();
await page.screenshot({ path: SHOT });

check(errors.length === 0, 'no uncaught page errors', errors.join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
