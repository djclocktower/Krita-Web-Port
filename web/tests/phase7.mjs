// Phase 7 (animation timeline) check. Needs the dev server: npx vite --port 5183 --strictPort
// Run: node tests/phase7.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = 'http://localhost:5183/';
const SHOT = '/tmp/claude-0/-home-user-Krita-Web-Port/65182417-9f70-5299-9ecc-ec5673875a37/scratchpad/timeline.png';
const NAMEW = 170, HEAD = 24, RH = 28;   // geometry of the timeline grid, see src/panels/timeline/index.tsx
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };
setTimeout(() => { console.error('FAIL  hard timeout'); process.exit(2); }, 120000).unref();

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2, hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
// Real touch input: a finger path through page coordinates [[x, y], ...].
const touch = async (path, dwell = 0) => {
    const pt = ([x, y]) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(path[0]) });
    for (const p of path.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(p) }); if (dwell) await page.waitForTimeout(dwell); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const errors = [];
page.on('pageerror', e => errors.push(e.message));

const open = async (url) => {
    await page.goto(url);
    await page.waitForFunction(() => window.__engine);
    const tab = page.locator('[role=tab]:has-text("Timeline")');
    if (await tab.count()) await tab.first().click();
    await page.waitForSelector('.tl-grid');
    await page.waitForTimeout(300);
};
const E = (fn, arg) => page.evaluate(([src, a]) => (new Function('e', 'a', `return (${src})(e, a)`))(window.__engine, a), [fn.toString(), arg]);
const settle = () => page.waitForTimeout(150);
const anim = () => E(e => e.animation());
const names = () => page.locator('.tl-name .nm').allInnerTexts();
const alertText = async () => (await page.locator('.tl [role=alert] span').count()) ? page.locator('.tl [role=alert] span').innerText() : '';
const cw = () => page.locator('.tl-zoom input').inputValue().then(Number);
// Page coordinates of the centre of a grid cell (scrolled to the left).
const cell = async (row, frame) => {
    const r = await page.locator('.tl-grid').boundingBox();
    return [r.x + NAMEW + frame * await cw() + (await cw()) / 2, r.y + HEAD + row * RH + RH / 2];
};
const clickCell = async (row, frame) => { const [x, y] = await cell(row, frame); await page.mouse.click(x, y); await settle(); };
// Brightness of the canvas pixel at the centre of a cell.
const lum = async (row, frame) => {
    const [x, y] = await cell(row, frame), r = await page.locator('.tl-grid').boundingBox();
    return page.evaluate(([x, y]) => {
        const c = document.querySelector('.tl-grid'), k = c.width / c.getBoundingClientRect().width;
        const d = c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
        return d[0] + d[1] + d[2];
    }, [x - r.x - 4, y - r.y]);
};
const exportAt = (t) => E(async (e, t) => {
    await e.setAnimation({ currentTime: t });
    return btoa(String.fromCharCode(...new Uint8Array(await e.exportDocument('png'))));
}, t);
const click = name => page.getByRole('button', { name, exact: true }).click();
const field = (label) => page.locator(`.tl-field:has-text("${label}") input`);
const setField = async (label, value) => { await field(label).fill(value); await field(label).press('Enter'); await settle(); };
const dismiss = async () => { if (await page.locator('.tl [role=alert]').count()) await page.locator('.tl [role=alert] button').click(); };

await open(URL);

// --- rows follow the layer tree
const paintNames = async () => E(async e => {
    const walk = n => n.flatMap(x => [...(x.type === 'paint' ? [x.name] : []), ...walk(x.children)]);
    return walk(await e.layers());
});
check(JSON.stringify(await names()) === JSON.stringify(await paintNames()), 'rows match the layer tree', JSON.stringify(await names()));
const l1 = await E(e => e.addNode({ type: 'paint', name: 'Ink' }));
const grp = await E(e => e.addNode({ type: 'group', name: 'Grp' }));
const nested = await E((e, g) => e.addNode({ type: 'paint', name: 'Nested', parent: g }), grp);
await settle();
check(JSON.stringify(await names()) === JSON.stringify(await paintNames()) && (await names()).includes('Nested'), 'rows follow layer add, including nested layers', JSON.stringify(await names()));
await E((e, id) => e.removeNode(id), grp);
await settle();
check(!(await names()).includes('Nested') && (await names()).length === (await paintNames()).length, 'rows follow layer removal');
await page.locator('.tl-name .nm', { hasText: 'Ink' }).click();
await settle();
const inkRow = (await names()).indexOf('Ink'), bgRow = (await names()).indexOf('Background');
check((await page.locator('.tl-name.active .nm').innerText()) === 'Ink', 'clicking a row name makes it active');

// --- keyframes
await E(async (e, id) => {   // something to copy on frame 0
    e.beginStroke({ x: 100, y: 100, pressure: 1, timeMs: 0 });
    e.continueStroke([{ x: 300, y: 140, pressure: 1, timeMs: 10 }, { x: 500, y: 100, pressure: 1, timeMs: 20 }]);
    e.endStroke();
}, l1);
await settle();
await clickCell(inkRow, 5);
check((await anim()).currentTime === 5, 'clicking a cell moves the playhead');
const emptyLum = await lum(inkRow, 2);
await click('Add duplicate frame'); await settle();
check(JSON.stringify(await E((e, id) => e.keyframes(id), l1)) === '[0,5]', 'duplicate frame reaches the engine', JSON.stringify(await E((e, id) => e.keyframes(id), l1)));
const kfLum = await lum(inkRow, 5), holdLum = await lum(inkRow, 7), noneLum = await lum(bgRow, 5);
check(kfLum > holdLum && holdLum > noneLum, 'grid shows keyframe brighter than its hold, brighter than an empty cell', `${kfLum} ${holdLum} ${noneLum}`);
check(emptyLum !== kfLum, 'cell changed after adding a keyframe');
const a0 = await exportAt(0), a5 = await exportAt(5);
check(a0 === a5, 'duplicate frame is a real copy (frame 5 equals frame 0)');
await clickCell(inkRow, 8);
await click('Add blank frame'); await settle();
check(JSON.stringify(await E((e, id) => e.keyframes(id), l1)) === '[0,5,8]', 'blank frame reaches the engine');
check(await exportAt(8) !== a0, 'blank frame differs from frame 0');
check(await exportAt(0) === a0 && await exportAt(5) === a0, 'earlier frames unchanged');
await settle();
await click('Add blank frame');   // frame 0 is current again: occupied
await settle();
check(/already/i.test(await alertText()), 'engine error is shown in the panel', await alertText());
await dismiss();
check((await page.locator('.tl [role=alert]').count()) === 0, 'error can be dismissed');

// --- scrubbing
const grid = await page.locator('.tl-grid').boundingBox(), hy = grid.y + HEAD / 2, c = await cw();
await page.mouse.move(grid.x + NAMEW + 2 * c + 2, hy); await page.mouse.down();
await page.mouse.move(grid.x + NAMEW + 5 * c + 2, hy, { steps: 6 });
await page.mouse.move(grid.x + NAMEW + 9 * c + 2, hy, { steps: 6 });
await page.mouse.up(); await settle();
check((await anim()).currentTime === 9, 'dragging in the header scrubs', String((await anim()).currentTime));
await page.mouse.click(grid.x + NAMEW + 3 * c + 2, hy); await settle();
check((await anim()).currentTime === 3, 'clicking the header moves the playhead');
const img3 = await E(async e => btoa(String.fromCharCode(...new Uint8Array(await e.exportDocument('png')))));
await page.mouse.click(grid.x + NAMEW + 8 * c + 2, hy); await settle();
const img8 = await E(async e => btoa(String.fromCharCode(...new Uint8Array(await e.exportDocument('png')))));
check(img3 !== img8, 'scrubbing changes the composited image');
// scrubbing never queues: count setAnimation calls and in-flight overlap under a slow engine
await page.evaluate(() => {
    const e = window.__engine, orig = e.setAnimation.bind(e);
    window.__sa = { inflight: 0, max: 0, calls: 0 }; window.__orig = orig;
    e.setAnimation = async (s) => { const m = window.__sa; m.calls++; m.max = Math.max(m.max, ++m.inflight); await new Promise(r => setTimeout(r, 40)); try { return await orig(s); } finally { m.inflight--; } };
});
await touch(Array.from({ length: 40 }, (_, i) => [grid.x + NAMEW + 5 + i * 6, hy]), 5);
await page.waitForTimeout(300);
const overlap = await page.evaluate(() => { const m = window.__sa; delete window.__sa; return m; });
await page.evaluate(() => { window.__engine.setAnimation = window.__orig; });
check(overlap.max === 1 && overlap.calls > 1 && overlap.calls < 30, 'scrubbing has one setAnimation in flight and coalesces', JSON.stringify(overlap));

// --- drag a keyframe (touch-style pointer events dispatched directly would hide mouse bugs, so use the mouse here)
await clickCell(inkRow, 5);
let [sx, sy] = await cell(inkRow, 5), [tx] = await cell(inkRow, 12);
await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(tx, sy, { steps: 8 }); await page.mouse.up(); await settle();
let kf = await E((e, id) => e.keyframes(id), l1);
check(JSON.stringify(kf) === '[0,8,12]', 'dragging a selected keyframe moves it', JSON.stringify(kf));
check((await anim()).currentTime === 12, 'playhead follows the moved keyframe');
[sx, sy] = await cell(inkRow, 12); [tx] = await cell(inkRow, 8);
await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(tx, sy, { steps: 8 }); await page.mouse.up(); await settle();
kf = await E((e, id) => e.keyframes(id), l1);
check(JSON.stringify(kf) === '[0,8,12]' && /already has a keyframe/.test(await alertText()), 'dropping on an occupied frame is refused with a message', JSON.stringify(kf) + await alertText());
await dismiss();
// touch drag: pointer events with pointerType touch
{
    const [x0, y0] = await cell(inkRow, 12), [x1] = await cell(inkRow, 14);
    await touch([[x0, y0], ...Array.from({ length: 6 }, (_, i) => [x0 + (x1 - x0) * (i + 1) / 6, y0])], 20);
    await settle();
    check(JSON.stringify(await E((e, id) => e.keyframes(id), l1)) === '[0,8,14]', 'touch can drag a keyframe', JSON.stringify(await E((e, id) => e.keyframes(id), l1)));
}

// --- remove
await click('Remove frame'); await settle();   // playhead is on 14
check(JSON.stringify(await E((e, id) => e.keyframes(id), l1)) === '[0,8]', 'remove frame removes the keyframe at the playhead');

// --- transport
await setField('Frame', '3');
check((await anim()).currentTime === 3, 'current-frame field moves the playhead');
await click('Next keyframe'); await settle();
check((await anim()).currentTime === 8, 'next keyframe');
await click('Previous keyframe'); await settle();
check((await anim()).currentTime === 0, 'previous keyframe');
await click('Next frame'); await click('Next frame'); await settle();
check((await anim()).currentTime === 2, 'next frame');
await click('Previous frame'); await settle();
check((await anim()).currentTime === 1, 'previous frame');
await click('Last frame'); await settle();
check((await anim()).currentTime === 100, 'last frame goes to the end of the range');
await click('First frame'); await settle();
check((await anim()).currentTime === 0, 'first frame goes to the start of the range');
await page.locator('.tl').focus();
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await settle();
check((await anim()).currentTime === 1, 'arrow keys step one frame');
check(/Frame 1, (no )?keyframe on Ink/.test(await page.locator('.tl-sr').innerText()), 'live region announces frame and keyframe', await page.locator('.tl-sr').innerText());

// --- playback
await setField('Frame', '0');
const { played, dt } = await page.evaluate(async () => {
    const btn = l => [...document.querySelectorAll('.tl button')].find(b => b.getAttribute('aria-label') === l);
    const t0 = performance.now(); btn('Play').click();
    await new Promise(r => setTimeout(r, 1000));
    const played = Number(document.querySelector('.tl-field input').value), dt = (performance.now() - t0) / 1000;
    btn('Pause').click();
    return { played, dt };
});
await settle();
check((await anim()).currentTime === played || (await anim()).currentTime >= played, 'engine reaches the played frame after pause');
const expected = 24 * dt;
check(Math.abs(played - expected) <= 5 && played > 0, 'play advances at roughly 24 fps', `${played} vs ${expected.toFixed(1)}`);
const stopped = (await anim()).currentTime; await page.waitForTimeout(250);
check((await anim()).currentTime === stopped, 'pause stops playback');
await setField('End', '10'); await setField('Frame', '0');
await click('Play'); await page.waitForTimeout(900);
check((await anim()).currentTime === 10 && (await page.getByRole('button', { name: 'Play', exact: true }).count()) === 1, 'playback stops at the end without loop', String((await anim()).currentTime));
await click('Loop'); await setField('Frame', '0');
await click('Play');
const seen = [];
for (let i = 0; i < 30; i++) { seen.push((await anim()).currentTime); await page.waitForTimeout(50); }
await click('Pause'); await settle();
check(seen.some((t, i) => i && t < seen[i - 1]) && seen.every(t => t >= 0 && t <= 10), 'loop wraps at the end', seen.join(','));
await click('Loop');

// --- field validation
await setField('End', '100');
for (const [label, value, bad] of [['FPS', 'abc', 'whole'], ['FPS', '300', 'between'], ['FPS', '0', 'between'], ['Start', '500', 'after end'], ['Frame', '-2', 'whole'], ['End', '-1', 'whole']]) {
    const before = await anim();
    await setField(label, value);
    const after = await anim();
    check(new RegExp(bad).test(await alertText()) && JSON.stringify(before) === JSON.stringify(after), `${label} "${value}" is rejected`, await alertText());
    await dismiss();
}
await setField('FPS', '12'); await setField('Start', '2'); await setField('End', '50');
const ranged = await anim();
check(ranged.framesPerSecond === 12 && ranged.startTime === 2 && ranged.endTime === 50, 'valid fps / start / end reach the engine', JSON.stringify(ranged));
await setField('FPS', '24'); await setField('Start', '0'); await setField('End', '60');

// --- onion skin
await page.evaluate(() => { const e = window.__engine, o = e.setOnionSkin.bind(e); window.__onion = []; e.setOnionSkin = (id, on) => { window.__onion.push([id, on]); return o(id, on); }; });
await page.getByRole('button', { name: 'Onion skin on Ink' }).click(); await settle();
check(JSON.stringify(await page.evaluate(() => window.__onion)) === JSON.stringify([[l1, true]]), 'onion skin toggle calls setOnionSkin');
check((await page.getByRole('button', { name: 'Onion skin on Ink' }).getAttribute('aria-pressed')) === 'true', 'onion toggle shows pressed');

// --- zoom
const w0 = (await page.locator('.tl-body').boundingBox()).width;
await page.locator('.tl-zoom input').fill('30');
await settle();
check((await page.locator('.tl-body').boundingBox()).width > w0, 'zoom widens the frame columns');

// --- engine errors surface (wrap a call to reject)
await page.evaluate(() => { const e = window.__engine; e.moveKeyframe = () => Promise.reject(new Error('boom')); });
await clickCell(inkRow, 8);
{
    const [x, y] = await cell(inkRow, 8), [x2] = await cell(inkRow, 20);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x2, y, { steps: 5 }); await page.mouse.up(); await settle();
}
check((await alertText()) === 'boom', 'engine rejection is shown', await alertText());
await dismiss();

// --- screenshot: a few keyframes on a few layers
await open(URL);
const ids = await E(async e => {
    const a = await e.addNode({ type: 'paint', name: 'Colour' }), b = await e.addNode({ type: 'paint', name: 'Lines' });
    const g = await e.addNode({ type: 'group', name: 'Background group' });
    const c = await e.addNode({ type: 'paint', name: 'Shadow', parent: g });
    for (const [id, ts] of [[a, [0, 4, 9, 15, 22]], [b, [0, 2, 6, 12]], [c, [3, 10, 20]]])
        for (const t of ts.filter(t => t > 0)) await e.addKeyframe(id, t, { copy: t % 2 === 0 });
    await e.setAnimation({ endTime: 40, currentTime: 9 });
    await e.setActiveNode(b);
    await e.setOnionSkin(b, true);
    return [a, b, c];
});
await settle(); await page.waitForTimeout(300);
// the shell's bottom area is short; lift the panel out for a full-size picture
await page.addStyleTag({ content: '.tl { position: fixed; left: 0; top: 0; width: 1100px; height: 280px; z-index: 99; }' });
await settle();
await page.locator('.tl').screenshot({ path: SHOT });
check(JSON.stringify(await E((e, id) => e.keyframes(id), ids[0])) === '[0,4,9,15,22]', 'screenshot scene built');

check(errors.length === 0, 'no uncaught page errors (mock)', errors.join(' | '));

// --- real engine: the panel drives Krita's own animation
errors.length = 0;
await page.goto('http://localhost:5183/?engine=wasm');
await page.waitForFunction(() => window.__engine && __engine.documentInfo().then(Boolean), null, { timeout: 60000 });
const tab = page.locator('[role=tab]:has-text("Timeline")');
if (await tab.count()) await tab.first().click();
await page.waitForSelector('.tl-grid');
await page.waitForTimeout(1500);
check((await page.locator('.tl [role=alert]').count()) === 0, 'wasm engine: panel loads without an error', await alertText().catch(() => ''));
const before = await page.evaluate(async () => (await __engine.animation()).currentTime);
await page.getByRole('button', { name: 'Next frame', exact: true }).click(); await page.waitForTimeout(800);
check((await page.evaluate(async () => (await __engine.animation()).currentTime)) === before + 1, 'wasm engine: Next frame advances the engine\'s current time');
check((await page.locator('.tl-grid').count()) === 1, 'wasm engine: panel still renders after more calls');
check(errors.length === 0, 'wasm engine: no uncaught page errors', errors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
