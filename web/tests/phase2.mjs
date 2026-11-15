// Phase 2 UI checks. Needs the dev server: npx vite --port 5174 --strictPort
// Run: node tests/phase2.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');

const SHOT = '/tmp/claude-0/-home-user-Krita-Web-Port/65182417-9f70-5299-9ecc-ec5673875a37/scratchpad/phase2.png';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 420, height: 1500 }, deviceScaleFactor: 2 })).newPage();
const problems = [];
page.on('pageerror', e => problems.push(String(e)));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });

let passed = 0;
const check = async (name, fn) => {
    try { await fn(); passed++; console.log('ok   ', name); }
    catch (e) { problems.push(`${name}: ${e.message}`); console.log('FAIL ', name, '\n     ', e.message); }
};

await page.goto('http://localhost:5174/tests/phase2.html');
await page.waitForFunction(() => window.ready);
const buttons = page.locator('.presets-grid .preset');
const names = () => buttons.evaluateAll(b => b.map(x => x.getAttribute('aria-label')));
// Engine writes are coalesced for 80 ms by the editor.
const setting = async key => { await page.waitForTimeout(250); return page.evaluate(async k => (await window.engine.presetSettings()).values[k], key); };

await check('curve: parse/serialise round trip', () => page.evaluate(() => {
    const { parseCurve, serializeCurve } = window.curve;
    for (const s of ['0,0;1,1;', '0,0;0.25,0.8;0.5,0.5;1,1;']) if (serializeCurve(parseCurve(s)) !== s) throw new Error('round trip ' + s);
    if (serializeCurve(parseCurve('0,0;1,1')) !== '0,0;1,1;') throw new Error('trailing semicolon');
}));
await check('curve: malformed input gives default', () => page.evaluate(() => {
    const { parseCurve, serializeCurve } = window.curve;
    for (const s of ['', 'abc', '0,0;', '0,0;1;', '0,0;1,x;', '0,0;2,1;', '0,1;0.5,0.5;0.4,0.6;1,1;', '0,0;0,1;', '0,0;1,1,1;', ',;1,1;'])
        if (serializeCurve(parseCurve(s)) !== '0,0;1,1;') throw new Error('not rejected: ' + JSON.stringify(s));
}));
await check('curve: interpolation passes through points and stays in 0..1', () => page.evaluate(() => {
    const { parseCurve, curveAt } = window.curve;
    for (const s of ['0,0;0.1,0.9;0.2,0.95;1,1;', '0,0;0.5,1;1,0;', '0,0;0.3,0.1;0.4,0.9;0.7,0.2;1,1;', '0,0.5;1,0.5;']) {
        const pts = parseCurve(s);
        for (const p of pts) if (Math.abs(curveAt(pts, p.x) - p.y) > 1e-9) throw new Error('misses point in ' + s);
        for (let i = 0; i <= 1000; i++) { const y = curveAt(pts, i / 1000); if (!(y >= 0 && y <= 1)) throw new Error('overshoot in ' + s); }
    }
    const mono = parseCurve('0,0;0.1,0.9;0.2,0.95;1,1;'); // monotone data stays monotone
    let prev = 0;
    for (let i = 0; i <= 1000; i++) { const y = curveAt(mono, i / 1000); if (y < prev - 1e-9) throw new Error('not monotone'); prev = y; }
}));

await check('presets list and thumbnails appear', async () => {
    await buttons.first().waitFor();
    assert.equal(await buttons.count(), 6);
    assert.ok((await buttons.first().getAttribute('title')).length > 0);
    await page.waitForFunction(() => [...document.querySelectorAll('.preset img')].filter(i => i.complete && i.naturalWidth > 0).length === 6);
    assert.match(await page.locator('.preset img').first().getAttribute('src'), /^blob:/);
});
await check('search narrows the list (debounced)', async () => {
    await page.getByLabel('Search brush presets').fill('ink');
    await page.waitForFunction(() => document.querySelectorAll('.presets-grid .preset').length === 1);
    assert.deepEqual(await names(), ['Ink-2 Fineliner']);
});
await check('tag filter narrows the list', async () => {
    await page.getByLabel('Search brush presets').fill('');
    await page.waitForFunction(() => document.querySelectorAll('.presets-grid .preset').length === 6);
    await page.getByLabel('Filter by tag').selectOption('Erasers');
    await page.waitForFunction(() => document.querySelector('.presets-grid .preset')?.getAttribute('aria-label') === 'Eraser Circle');
    assert.deepEqual(await names(), ['Eraser Circle']);
    await page.getByLabel('Filter by tag').selectOption('');
    await page.waitForFunction(() => document.querySelectorAll('.presets-grid .preset').length === 6);
});
await check('selecting a preset highlights it and the editor reloads', async () => {
    await page.getByRole('button', { name: 'Ink-2 Fineliner' }).click();
    await page.waitForSelector('.preset.current');
    assert.deepEqual(await page.locator('.preset.current').evaluateAll(b => b.map(x => x.getAttribute('aria-label'))), ['Ink-2 Fineliner']);
    assert.equal(await page.locator('.preset[aria-pressed=true]').count(), 1);
    await page.getByRole('heading', { name: 'Ink-2 Fineliner' }).waitFor();
    assert.match(await page.locator('.be-engine').innerText(), /paintbrush/);
    await page.waitForFunction(() => document.querySelector('.brush-editor input[type=number]').value === '4');
    await page.getByRole('button', { name: 'Blender Blur' }).click();
    await page.getByRole('heading', { name: 'Blender Blur' }).waitFor();
    assert.match(await page.locator('.be-engine').innerText(), /colorsmudge/);
});
// The editor now lists option groups (Krita's layout); the mock engine's keys are not real Krita keys, so they all pass through under "Other".
await check('editor lists option groups; unknown keys pass through under Other', async () => {
    assert.deepEqual(await page.locator('.brush-editor .be-group').allInnerTexts(), ['Other']);
});
await check('editor changes reach the engine; numbers are clamped; empty is ignored', async () => {
    const diameter = page.locator('.brush-editor').getByRole('spinbutton', { name: 'Diameter' });
    await diameter.fill('33'); await diameter.blur();
    assert.equal(await setting('diameter'), 33);
    await diameter.fill('5000'); await diameter.blur();
    assert.equal(await setting('diameter'), 1000);
    assert.equal(await diameter.inputValue(), '1000');
    await diameter.fill(''); await diameter.blur();
    assert.equal(await setting('diameter'), 1000);
    await page.locator('.brush-editor').getByRole('slider', { name: 'Spacing' }).fill('0.5');
    assert.equal(await setting('spacing'), 0.5);
    await page.locator('.brush-editor').getByLabel('Pressure controls opacity').check();
    assert.equal(await setting('pressureOpacity'), true);
});
await check('import error path shows a message', async () => {
    await page.locator('.presets input[type=file]').setInputFiles({ name: 'x.bundle', mimeType: 'application/octet-stream', buffer: Buffer.from('abc') });
    const alert = page.locator('.presets-error');
    await alert.waitFor();
    assert.match(await alert.innerText(), /x\.bundle: .*cannot import/);
});
await check('drag and drop import passes files to the engine', async () => {
    await page.evaluate(() => { window.imported = []; const orig = window.engine.importResource; window.engine.importResource = async (n, b) => { window.imported.push([n, b.length]); }; window.__orig = orig; });
    const dt = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(['hello'], 'a.kpp')); return d; });
    await page.locator('.presets').dispatchEvent('drop', { dataTransfer: dt });
    await page.waitForFunction(() => window.imported.length === 1);
    assert.deepEqual(await page.evaluate(() => window.imported), [['a.kpp', 5]]);
    assert.equal(await page.locator('.presets-error').count(), 0);
});

// PropertyForm and the curve editor, in the harness form.
const form = page.locator('.property-form').last();
const emitted = () => page.evaluate(() => window.emitted);
const lastSensor = () => page.evaluate(() => { const e = window.emitted.filter(x => x[0] === 'sensor').at(-1); return e && e[1]; });
await check('form: number input clamps, integer rounds, NaN never emitted', async () => {
    const amount = form.getByRole('spinbutton', { name: 'Amount' });
    await amount.fill('99'); await amount.blur();
    await amount.fill('2.6'); await amount.blur();
    await amount.fill(''); await amount.blur();
    const vals = (await emitted()).filter(e => e[0] === 'amount').map(e => e[1]);
    assert.deepEqual(vals, [10, 3]);
    await form.getByRole('slider', { name: 'Amount' }).fill('7');
    assert.equal((await emitted()).filter(e => e[0] === 'amount').at(-1)[1], 7);
});
await check('form: colour is hex', async () => {
    assert.equal(await form.locator('.pf-color code').innerText(), '#336699');
});
await check('curve editor: keyboard nudge, add, delete, drag, double-click, endpoints locked', async () => {
    const pt = n => form.getByRole('slider', { name: new RegExp(`Pressure curve point ${n} of`) });
    await pt(1).focus();
    await page.keyboard.press('ArrowRight'); // endpoint x is fixed
    assert.equal(await lastSensor(), '0,0;1,1;');
    await page.keyboard.press('ArrowUp');
    assert.equal(await lastSensor(), '0,0.01;1,1;');
    await page.keyboard.press('ArrowDown');
    const svg = form.locator('.curve-svg');
    const box = await svg.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // on the curve
    assert.equal(await form.locator('.curve-point').count(), 3);
    assert.equal(window_pts(await lastSensor()), 3);
    await pt(2).focus(); await page.keyboard.press('Delete');
    assert.equal(await form.locator('.curve-point').count(), 2);
    await pt(1).focus(); await page.keyboard.press('Delete');
    assert.equal(await form.locator('.curve-point').count(), 2, 'never fewer than two');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const c = await pt(2).boundingBox();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.down(); await page.mouse.move(c.x + c.width / 2 + 20, c.y + c.height / 2 - 20, { steps: 4 }); await page.mouse.up();
    const dragged = await page.evaluate(s => window.curve.parseCurve(s), await lastSensor());
    assert.equal(dragged.length, 3);
    assert.ok(dragged[1].x > 0.5 && dragged[1].y > 0.5, JSON.stringify(dragged));
    assert.ok(dragged[0].x === 0 && dragged[2].x === 1);
    await pt(2).dblclick();
    assert.equal(await form.locator('.curve-point').count(), 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await form.getByRole('button', { name: 'Remove point' }).click();
    assert.equal(await form.locator('.curve-point').count(), 2);
});
function window_pts(s) { return s.split(';').filter(Boolean).length; }

await page.screenshot({ path: SHOT, fullPage: true });
await browser.close();
if (problems.length) { console.error(`\n${problems.length} problem(s):\n` + problems.join('\n')); process.exit(1); }
console.log(`\nall ${passed} checks passed`);
