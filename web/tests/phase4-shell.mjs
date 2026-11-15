// Phase 4 shell check: menus, dialogs, enabled state, error banner (mock engine).
// Needs the dev server: npx vite --port 5181 --strictPort
// Run: node tests/phase4-shell.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL  timeout'); process.exit(1); }, 120000).unref();

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(process.env.URL ?? 'http://localhost:5181/');
await page.waitForFunction(() => document.querySelector('.status-doc')?.textContent.includes('1600 × 1200'));

const settle = () => page.waitForTimeout(120);
const info = () => page.evaluate(() => __engine.documentInfo().then(d => `${d.width}x${d.height}`));
const fresh = async (w = 40, h = 30) => {
    await page.evaluate(([w, h]) => __engine.newDocument({ width: w, height: h, name: 'Test' }), [w, h]);
    await page.waitForFunction(([w, h]) => document.querySelector('.status-doc').textContent.includes(`${w} × ${h}`), [w, h]);
    await settle();
};
// colour of one pixel of the PNG export; null alpha shown as [.,.,.,0]
const px = (x, y) => page.evaluate(async ([x, y]) => {
    const bmp = await createImageBitmap(new Blob([await __engine.exportDocument('png')]));
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d'); c.drawImage(bmp, 0, 0);
    return [...c.getImageData(x, y, 1, 1).data];
}, [x, y]);
const is = (p, r, g, b, a = 255) => p[3] === a && (a === 0 || (Math.abs(p[0] - r) < 4 && Math.abs(p[1] - g) < 4 && Math.abs(p[2] - b) < 4));
const setColors = (fg, bg) => page.evaluate(([fg, bg]) => __engine.setColors({ foreground: fg, background: bg }), [fg, bg]);
const rect = (x, y, width, height) => page.evaluate(r => __engine.selectRect(r, 'replace'), { x, y, width, height });
const item = t => page.locator('.menu-list [role=menuitem]').filter({ has: page.locator('span', { hasText: new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
const menu = async (m, t) => { await page.locator(`button[data-menu="${m}"]`).click(); await item(t).click(); await settle(); };
const dlg = page.locator('dialog[open]');
const submit = async () => { await dlg.locator('button.primary').click(); await settle(); };
const dlgOpen = async () => (await dlg.count()) === 1;
const err = () => dlg.locator('.error').innerText();
const R = [255, 0, 0], B = [0, 0, 255];
const red = { r: 1, g: 0, b: 0, a: 1 }, blue = { r: 0, g: 0, b: 1, a: 1 };

// ---- selection commands
await fresh();
await page.keyboard.press('Control+a'); await settle();
check((await page.locator('.status-sel').innerText()) === 'Selection 40 × 30', 'Ctrl+A selects all (status shows the selection size)');
await page.keyboard.press('Control+Shift+i'); await settle();
check(await page.locator('.status-sel').count() === 0, 'Invert of select-all leaves nothing selected');
await page.keyboard.press('Control+a'); await page.keyboard.press('Control+Shift+a'); await settle();
check(await page.locator('.status-sel').count() === 0, 'Ctrl+Shift+A deselects');
await rect(0, 0, 10, 10); await settle();
check((await page.locator('.status-sel').innerText()) === 'Selection 10 × 10', 'selection size shown in the status bar');
await menu('Select', 'Invert Selection');
check((await page.locator('.status-sel').innerText()) === 'Selection 40 × 30', 'Select > Invert Selection from the menu');
await menu('Select', 'Deselect');
await menu('Select', 'Select All');
check((await page.locator('.status-sel').innerText()) === 'Selection 40 × 30', 'Select > Select All and Deselect from the menu');
check((await page.locator('.status-cs').innerText()).startsWith('RGBA U8'), 'status bar shows colour model and depth');

// ---- fill and clear
await fresh();
await setColors(red, blue); await rect(0, 0, 10, 10); await settle();
await page.keyboard.press('Shift+Backspace'); await settle();
check(is(await px(5, 5), ...R) && is(await px(20, 20), 255, 255, 255), 'Shift+Backspace fills the selection with the foreground colour only');
await page.keyboard.press('Backspace'); await settle();
check(is(await px(5, 5), ...B), 'Backspace fills with the background colour');
await menu('Edit', 'Fill with Foreground Color');
check(is(await px(5, 5), ...R), 'Edit > Fill with Foreground Color');
await page.keyboard.press('Delete'); await settle();
check(!is(await px(5, 5), ...R) && is(await px(20, 20), 255, 255, 255), 'Delete clears the selection');
await page.evaluate(() => __engine.undo()); await settle();
await menu('Edit', 'Clear');
check(!is(await px(5, 5), ...R), 'Edit > Clear');

// ---- scale
await fresh();
await page.keyboard.press('Control+Alt+i');
await dlg.waitFor();
await dlg.getByLabel(/^Width/).fill('80');
check(await dlg.getByLabel(/^Height/).inputValue() === '60', 'scale: keep aspect ratio updates height');
await dlg.getByLabel(/^Width/).fill('0'); await submit();
check(await dlgOpen() && (await err()).length > 0 && await info() === '40x30', 'scale: width 0 rejected, dialog stays open');
await dlg.getByLabel('Keep aspect ratio').uncheck();
await dlg.getByLabel(/^Width/).fill('99999'); await submit();
check(await dlgOpen() && (await err()).includes('16384'), 'scale: width 99999 rejected');
await dlg.getByLabel(/^Width/).fill('10.5'); await submit();
check(await dlgOpen() && (await err()).includes('whole'), 'scale: fractional width rejected');
await dlg.getByLabel(/^Width/).fill('16000'); await dlg.getByLabel(/^Height/).fill('16000'); await submit();
check(await dlgOpen() && (await err()).includes('megapixels'), 'scale: more than 64 megapixels rejected');
await dlg.getByLabel(/^Width/).fill('80'); await dlg.getByLabel(/^Height/).fill('60');
await dlg.getByLabel('Filter').selectOption('Lanczos3'); await submit();
check(!(await dlgOpen()) && await info() === '80x60', 'scale: valid input scales to 80x60 and closes');
await menu('Image', 'Scale Image To New Size…');
await dlg.getByLabel('Unit').selectOption('%');
check(await dlg.getByLabel(/^Width/).inputValue() === '100', 'scale: switching to percent shows 100');
await dlg.getByLabel(/^Width/).fill('50'); await submit();
check(await info() === '40x30', 'scale: 50 percent halves the size');

// ---- resize canvas, every anchor
const names = ['Top left', 'Top', 'Top right', 'Left', 'Center', 'Right', 'Bottom left', 'Bottom', 'Bottom right'];
let anchorsOk = [];
for (let i = 0; i < 9; i++) {
    await fresh();
    await setColors(red, blue); await page.evaluate(() => __engine.deselect());
    await page.evaluate(() => __engine.fillSelection('foreground')); await settle();
    await page.keyboard.press('Control+Alt+c'); await dlg.waitFor();
    await dlg.getByLabel(/^Width/).fill('60'); await dlg.getByLabel(/^Height/).fill('50');
    await dlg.getByRole('radio', { name: names[i], exact: true }).click(); await submit();
    const ox = (20 * (i % 3)) / 2, oy = (20 * Math.floor(i / 3)) / 2;
    const ok = await info() === '60x50' && is(await px(ox + 1, oy + 1), ...R) && is(await px(ox + 38, oy + 28), ...R)
        && (await px(ox > 0 ? ox - 1 : ox + 41, oy + 1))[3] === 0 && (await px(ox + 1, oy > 0 ? oy - 1 : oy + 31))[3] === 0;
    anchorsOk.push(ok);
}
check(anchorsOk.every(Boolean), 'resize canvas: all 9 anchors place the old image correctly', JSON.stringify(anchorsOk));
await fresh();
await menu('Image', 'Resize Canvas…');
await dlg.getByLabel(/^Height/).fill('-5'); await submit();
check(await dlgOpen() && (await err()).length > 0 && await info() === '40x30', 'resize canvas: negative height rejected, dialog stays open');
await dlg.getByRole('button', { name: 'Cancel' }).click(); await settle();
check(!(await dlgOpen()), 'Cancel closes the dialog');

// ---- rotate, mirror, flatten
await fresh();
await menu('Image', 'Rotate Image › 90° Right'); check(await info() === '30x40', 'rotate 90 right swaps the size');
await menu('Image', 'Rotate Image › 90° Left'); check(await info() === '40x30', 'rotate 90 left swaps back');
await menu('Image', 'Rotate Image › 180°'); check(await info() === '40x30', 'rotate 180 keeps the size');
await menu('Image', 'Rotate Image › Custom…');
await dlg.getByLabel(/^Degrees/).fill(''); await submit();
check(await dlgOpen() && (await err()).includes('number'), 'rotate: empty degrees rejected');
await dlg.getByLabel(/^Degrees/).fill('45'); await submit();
check(await dlgOpen() && (await err()).includes('90-degree'), 'rotate: engine error is shown in the dialog and the dialog stays open', await err());
await dlg.getByLabel(/^Degrees/).fill('90'); await submit();
check(!(await dlgOpen()) && await info() === '30x40', 'rotate custom 90 works and closes');
await fresh();
await setColors(red, blue); await rect(0, 0, 10, 30); await page.evaluate(() => __engine.fillSelection('foreground')); await page.evaluate(() => __engine.deselect());
await menu('Image', 'Mirror Image Horizontally');
check(is(await px(35, 15), ...R) && is(await px(5, 15), 255, 255, 255), 'mirror horizontally moves the left strip to the right');
await rect(0, 0, 40, 10); await page.evaluate(() => __engine.fillSelection('background')); await page.evaluate(() => __engine.deselect());
await menu('Image', 'Mirror Image Vertically');
check(is(await px(20, 25), ...B) && is(await px(20, 5), 255, 255, 255), 'mirror vertically moves the top strip to the bottom');
const layerCount = () => page.evaluate(async () => { const n = l => l.reduce((a, x) => a + 1 + n(x.children), 0); return n(await __engine.layers()); });
check(await layerCount() >= 2, 'document has several layers before flatten', `${await layerCount()}`);
await menu('Image', 'Flatten Image');
check(await layerCount() === 1, 'Flatten Image leaves one layer');

// ---- trim to selection
await fresh();
await page.locator('button[data-menu="Image"]').click();
check(await item('Trim to Current Selection').isDisabled(), 'trim is disabled with no selection');
await page.keyboard.press('Escape');
await rect(5, 5, 10, 8); await settle();
await menu('Image', 'Trim to Current Selection');
check(await info() === '10x8', 'trim crops to the selection bounds');
check(await page.locator('.status-sel').count() === 0, 'selection is gone after trim');

// ---- convert colour space
await fresh();
await menu('Image', 'Convert Image Color Space…');
const sel = l => dlg.getByLabel(l);
const opts = async l => sel(l).locator('option').evaluateAll(o => o.map(x => x.value));
const cur = await page.evaluate(() => __engine.documentInfo());
check(await sel('Model').inputValue() === cur.colorModel && await sel('Depth').inputValue() === cur.colorDepth, 'convert: current model and depth preselected', `${await sel('Model').inputValue()} ${await sel('Depth').inputValue()}`);
check(JSON.stringify(await opts('Depth')) === '["U8","U16","F32"]', 'convert: RGBA offers three depths');
await sel('Depth').selectOption('U16');
check((await opts('Profile')).length === 2, 'convert: profiles follow the depth');
await sel('Profile').selectOption('Rec2020-elle-V4-g10.icc'); await submit();
let d = await page.evaluate(() => __engine.documentInfo());
check(!(await dlgOpen()) && d.colorDepth === 'U16' && d.profile === 'Rec2020-elle-V4-g10.icc', 'convert: depth and profile applied', JSON.stringify(d));
await menu('Image', 'Convert Image Color Space…');
await sel('Model').selectOption('GRAYA');
check(JSON.stringify(await opts('Depth')) === '["U8"]' && (await opts('Profile'))[0].startsWith('Gray'), 'convert: depths and profiles follow the model');
await submit();
d = await page.evaluate(() => __engine.documentInfo());
check(d.colorModel === 'GRAYA' && (await page.locator('.status-cs').innerText()).startsWith('GRAYA U8'), 'convert: model applied and shown in the status bar', JSON.stringify(d));

// ---- export
await fresh();
await page.keyboard.press('Control+Shift+e'); await dlg.waitFor();
check(await sel('File name').inputValue() === 'Test', 'export: file name defaults to the document name');
await sel('File name').fill('a/b'); await submit();
check(await dlgOpen() && (await err()).length > 0, 'export: bad file name rejected');
const download = async fmt => {
    if (!(await dlgOpen())) { await page.keyboard.press('Control+Shift+e'); await dlg.waitFor(); }
    await sel('Format').selectOption(fmt); await sel('File name').fill('pic');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), dlg.locator('button.primary').click()]);
    await settle();
    return dl?.suggestedFilename();
};
for (const f of ['png', 'jpg']) check(await download(f) === `pic.${f}`, `export: ${f} downloads pic.${f}`);
check(!(await dlgOpen()), 'export: dialog closes after a download');
await menu('File', 'Export…');
await sel('Format').selectOption('kra'); await submit();
check(await dlgOpen() && (await err()).includes('.kra'), 'export: engine error shown in the dialog, dialog stays open', await err());
await dlg.getByRole('button', { name: 'Cancel' }).click(); await settle();

// ---- error banner from a rejecting command (the mock cannot write .kra)
await page.keyboard.press('Control+s'); await settle();
const banner = page.locator('.banner[role=alert]');
check(await banner.count() === 1 && (await banner.innerText()).includes('.kra'), 'a rejecting command shows the error banner', await banner.innerText().catch(() => ''));
check(await dlg.count() === 0 && await page.evaluate(() => document.activeElement?.tagName) !== 'DIALOG', 'banner does not block the page');
await banner.getByRole('button', { name: 'Dismiss error' }).click();
check(await page.locator('.banner').count() === 0, 'banner can be dismissed');

// ---- disabled commands
await fresh();
const hist = () => page.evaluate(() => __app.get().history);
const spy = name => page.evaluate(n => { window.__calls ??= {}; const f = __engine[n].bind(__engine); __engine[n] = (...a) => { __calls[n] = (__calls[n] ?? 0) + 1; return f(...a); }; }, name);
for (const n of ['undo', 'selectAll', 'fillSelection']) await spy(n);
const calls = n => page.evaluate(n => window.__calls[n] ?? 0, n);
await page.evaluate(() => __engine.undo()); await settle();   // reach a state with nothing to undo, if there is history
await page.evaluate(async () => { while ((await window.__app.get().history).canUndo) { await __engine.undo(); await new Promise(r => setTimeout(r, 30)); } });
const base = await calls('undo');
check(!(await hist()).canUndo, 'history has nothing to undo');
await page.locator('button[data-menu="Edit"]').click();
check(await item('Undo').isDisabled(), 'Undo is disabled in the menu when there is nothing to undo');
await page.keyboard.press('Escape');
await page.keyboard.press('Control+z'); await settle();
check(await calls('undo') === base, 'Ctrl+Z does nothing when Undo is disabled');
await page.locator('button[data-menu="Image"]').click();
check(await item('Trim to Current Selection').isDisabled(), 'Trim is disabled in the menu');
await page.keyboard.press('Escape');
// no document: everything that works on a document is disabled, menu and shortcuts
await page.evaluate(() => __app.set({ doc: null }));
await settle();
let enabledDocCommands = [];
for (const m of ['File', 'Edit', 'Image', 'Layer', 'Select', 'Filter']) {
    await page.locator(`button[data-menu="${m}"]`).click();
    const items = await page.locator('.menu-list [role=menuitem]').evaluateAll(b => b.map(x => [x.querySelector('span').textContent, x.disabled]));
    enabledDocCommands.push(...items.filter(([t, dis]) => !dis && !['New…', 'Open…', 'Open Recent…'].includes(t)).map(([t]) => `${m}:${t}`));
    await page.keyboard.press('Escape');
}
check(enabledDocCommands.length === 0, 'with no document every document command is disabled in the menus', enabledDocCommands.join(', '));
await page.keyboard.press('Control+a'); await page.keyboard.press('Shift+Backspace'); await settle();
check(await calls('selectAll') === 0 && await calls('fillSelection') === 0, 'with no document Ctrl+A and Shift+Backspace do nothing');
await page.locator('button[data-menu="File"]').click();
check(await item('New…').isEnabled() && await item('Open…').isEnabled(), 'New and Open stay enabled with no document');
await page.keyboard.press('Escape');
await page.evaluate(async () => __app.set({ doc: await __engine.documentInfo() }));
await page.keyboard.press('Control+a'); await settle();
check(await calls('selectAll') === 1, 'shortcut works again once a document is open');

check(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
