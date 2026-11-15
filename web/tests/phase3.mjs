// Phase 3 (layers, masks, filters) UI test. Needs the dev server: npx vite --port 5175 --strictPort
// Run: node tests/phase3.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = 'http://localhost:5175/';
const SHOT = '/tmp/claude-0/-home-user-Krita-Web-Port/65182417-9f70-5299-9ecc-ec5673875a37/scratchpad/phase3.png';
let failures = 0;
const check = (ok, msg) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 })).newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', e => { failures++; console.log('FAIL  page error:', e.message); });

// The app does not expose its engine, so hand the test a reference to the same instance the UI uses.
await page.route(/\/src\/engine\/index\.ts/, async route => {
    const res = await route.fetch(), body = await res.text();
    if (!body.includes('export async function createEngine()')) throw new Error('engine/index.ts changed shape');
    await route.fulfill({ response: res, body: body.replace('export async function createEngine()', 'async function __create()') +
        '\nexport async function createEngine() { const e = await __create(); window.__engine = e; return e; }' });
});

const until = async (fn, msg, ms = 12000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await fn()) return true; await page.waitForTimeout(50); }
    check(false, `timeout: ${msg}`); return false;
};
const names = () => page.$$eval('.lyr-row .lyr-name', els => els.map(e => e.textContent));
const row = name => page.locator('.lyr-row').filter({ has: page.locator('.lyr-name', { hasText: new RegExp(`^${name}$`) }) });
const selectRow = name => row(name).locator('.lyr-name').click();
const bar = label => page.locator('.lyr-bar button', { hasText: new RegExp(`^${label}$`) });
const composite = () => page.evaluate(async () => {
    const b = await window.__engine.exportDocument('png'); let h = 2166136261;
    for (const x of b) h = Math.imul(h ^ x, 16777619);
    return h >>> 0;
});
const nodes = () => page.evaluate(async () => {
    const flat = (l, out = []) => { for (const n of l) { out.push(n); flat(n.children, out); } return out; };
    return flat(await window.__engine.layers());
});
const addNode = async label => { await bar('Add').click(); await page.getByRole('menuitem', { name: label, exact: true }).click(); };
const dialogGone = () => page.locator('dialog[open]').count().then(n => n === 0);

async function drag(name, target, frac, release = true) {
    const g = await row(name).locator('.lyr-grip').boundingBox(), t = await row(target).boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + 60, t.y + t.height * frac, { steps: 8 });
    if (release) await page.mouse.up();
}

await page.goto(URL);
await page.waitForSelector('.lyr, .lyr-new');

// --- document and tree
await page.locator('.lyr').waitFor();
const create = page.locator('.lyr-new');
if (await create.count()) await create.click();   // the Layers panel offers this when no document is open
await until(async () => (await names()).length === 2, 'tree appears');
check(same(await names(), ['Paint Layer 1', 'Background']), 'tree shows the document layers top-most first');
check(await page.locator('.lyr-row.active .lyr-name').textContent() === 'Paint Layer 1', 'active node highlighted');
await selectRow('Background');
check(await page.locator('.lyr-row.active .lyr-name').textContent() === 'Background', 'clicking a row makes it active');
await selectRow('Paint Layer 1');

// --- adding every node type
const types = ['paint', 'group', 'filter', 'fill', 'clone', 'file', 'vector',
               'transparencyMask', 'filterMask', 'colorizeMask', 'transformMask', 'selectionMask'];
const labels = ['Paint Layer', 'Group Layer', 'Filter Layer', 'Fill Layer', 'Clone Layer', 'File Layer', 'Vector Layer',
                'Transparency Mask', 'Filter Mask', 'Colorize Mask', 'Transform Mask', 'Selection Mask'];
for (const [i, type] of types.entries()) {
    if (type === 'transparencyMask') await selectRow('Paint Layer 3');   // masks go under a layer
    await addNode(labels[i]);
    if (type === 'filter' || type === 'fill' || type === 'filterMask') {
        await page.locator('dialog.fd[open]').waitFor();
        await page.locator('dialog.fd[open] .fd-scroll li button').first().click();
        await page.locator('dialog.fd[open] button.primary').click();
        await until(dialogGone, 'filter dialog closes');
    }
    await until(async () => (await page.locator(`.lyr-row[data-type="${type}"]`).count()) >= 1, `${type} appears`);
}
check(true, `all ${types.length} node types were added and appear in the tree`);
const badges = await page.$$eval('.lyr-row .lyr-type', els => [...new Set(els.map(e => e.getAttribute('aria-label')))]);
check(badges.length === 12, `12 distinct type icons (${badges.length})`);
check(await page.locator('.lyr-row.mask').first().getAttribute('aria-level') === '2', 'masks are children of a layer (level 2)');

// back to the two original layers; also exercises the Delete button
while ((await names()).length > 2) { await row((await names())[0]).locator('.lyr-name').click(); await bar('Delete').click(); await page.waitForTimeout(80); }
check(same(await names(), ['Paint Layer 1', 'Background']), 'delete removes nodes (and their masks)');

// --- rename
await row('Paint Layer 1').locator('.lyr-name').dblclick();
await page.locator('.lyr-rename').fill('Sketch'); await page.keyboard.press('Enter');
await until(async () => (await names())[0] === 'Sketch', 'rename by double-click');
await page.locator('.lyr-tree').focus(); await page.keyboard.press('F2');
await page.locator('.lyr-rename').fill('Nope'); await page.keyboard.press('Escape');
check((await names())[0] === 'Sketch' && await page.locator('.lyr-rename').count() === 0, 'F2 then Escape cancels rename');
await page.keyboard.press('F2'); await page.locator('.lyr-rename').fill('Ink'); await page.keyboard.press('Enter');
await until(async () => (await names())[0] === 'Ink', 'rename by F2 + Enter');
await row('Ink').locator('.lyr-name').dblclick();
await page.locator('.lyr-rename').fill('Sketch'); await page.keyboard.press('Enter');
await until(async () => (await names())[0] === 'Sketch', 'renamed back');

// --- visibility changes the composite
const c0 = await composite();
await row('Background').getByRole('button', { name: 'Visible', exact: true }).click();
check(await until(async () => await composite() !== c0, 'composite changes'), 'hiding Background changes the composited image');
check(await row('Background').getByRole('button', { name: 'Visible', exact: true }).getAttribute('aria-pressed') === 'false', 'visible toggle reflects state');
await row('Background').getByRole('button', { name: 'Visible', exact: true }).click();
check(await until(async () => await composite() === c0, 'composite restored'), 'showing it again restores the image');
await row('Background').getByRole('button', { name: 'Locked', exact: true }).click();
check(await until(async () => (await nodes()).find(n => n.name === 'Background').locked, 'locked'), 'lock toggle reaches the engine');
await row('Background').getByRole('button', { name: 'Locked', exact: true }).click();
check(await row('Background').getByRole('button', { name: 'Alpha locked' }).count() === 1, 'alpha lock offered on paint layers');

// --- opacity and blend mode, read back after reselecting
await selectRow('Sketch');
await page.locator('.lyr').getByLabel('Blend mode').selectOption('multiply');
await page.locator('.lyr-opacity input').fill('50');
await until(async () => { const n = (await nodes()).find(n => n.name === 'Sketch'); return n.blendMode === 'multiply' && n.opacity === 0.5; }, 'engine has blend and opacity');
await selectRow('Background'); await selectRow('Sketch');
check(await page.locator('.lyr').getByLabel('Blend mode').inputValue() === 'multiply' && await page.locator('.lyr-opacity input').inputValue() === '50',
      'blend mode and opacity reach the engine and read back');
check(await page.$$eval('select[aria-label="Blend mode"] optgroup', g => g.map(x => x.label).join()) === 'Mix,Darken,Lighten', 'blend modes grouped by category');

// --- groups, drag and drop
await addNode('Group Layer');
await until(async () => (await names())[0] === 'Group Layer 1', 'group added');
await drag('Background', 'Group Layer 1', 0.5);
await until(async () => await row('Background').getAttribute('aria-level') === '2', 'dropped inside group');
check(same(await names(), ['Group Layer 1', 'Background', 'Sketch']), 'drag onto a group moves the node inside it');
await drag('Sketch', 'Group Layer 1', 0.1);
await until(async () => same(await names(), ['Sketch', 'Group Layer 1', 'Background']), 'sketch above group');
check(same(await names(), ['Sketch', 'Group Layer 1', 'Background']), 'drag above a row reorders');
// refuse to drop a group into itself / its own child
await drag('Group Layer 1', 'Background', 0.5, false);
check(await page.locator('.lyr-row[class*="drop-"]').count() === 0, 'no drop indicator over the dragged group\'s own child');
await page.mouse.up();
await drag('Group Layer 1', 'Group Layer 1', 0.5, false);
check(await page.locator('.lyr-row[class*="drop-"]').count() === 0, 'no drop indicator over itself');
await page.mouse.up(); await page.waitForTimeout(150);
check(same(await names(), ['Sketch', 'Group Layer 1', 'Background']), 'order unchanged after refused drops');
// below the last row
await drag('Sketch', 'Group Layer 1', 0.9);
await until(async () => (await nodes())[0].name === 'Group Layer 1', 'sketch below group');
check(same((await nodes()).map(n => n.name), ['Group Layer 1', 'Background', 'Sketch']), 'drag below a row reorders');

// collapse persists in the engine
await row('Group Layer 1').getByRole('button', { name: 'Collapse' }).click();
await until(async () => (await nodes()).find(n => n.name === 'Group Layer 1').collapsed, 'collapsed persisted');
check(same(await names(), ['Group Layer 1', 'Sketch']), 'collapsing hides children');
await row('Group Layer 1').getByRole('button', { name: 'Expand' }).click();
await until(async () => (await names()).length === 3, 'expanded');

// --- keyboard
await selectRow('Sketch');
await page.locator('.lyr-tree').focus();
await page.keyboard.press('Control+PageUp');
await until(async () => (await names())[0] === 'Sketch', 'Ctrl+PageUp');
check(same(await names(), ['Sketch', 'Group Layer 1', 'Background']), 'Ctrl+PageUp moves the active node up');
await page.keyboard.press('Control+PageDown');
await until(async () => (await names())[0] === 'Group Layer 1', 'Ctrl+PageDown');
check(same(await names(), ['Group Layer 1', 'Background', 'Sketch']), 'Ctrl+PageDown moves the active node down');
await page.keyboard.press('ArrowUp');
await until(async () => await page.locator('.lyr-row.active .lyr-name').textContent() === 'Background', 'arrow');
check(true, 'ArrowUp changes the active node');
await page.keyboard.press('ArrowLeft'); // Background has no children: nothing happens
await page.keyboard.press('Enter');
await page.locator('dialog.lyr-dialog[open]').waitFor();
check(await page.locator('dialog.lyr-dialog input').first().inputValue() === 'Background', 'Enter opens properties for the active row');
await page.keyboard.press('Escape');
await until(dialogGone, 'properties close on Escape');

// --- merge down error is shown (Background is the bottom of its group)
await selectRow('Background');
await bar('Merge down').click();
check(await until(async () => await page.locator('.lyr-error').count() === 1, 'error shown') &&
      /no paint layer below/i.test(await page.locator('.lyr-error').textContent()), 'merge down with nothing below shows the engine error');
await page.locator('.lyr-error button').click();
check(await page.locator('.lyr-error').count() === 0, 'error can be dismissed');

// --- filter dialog on the active layer
// through the shell's Filter menu, which exercises the panel's command
const open = async () => { await page.locator('[data-menu="Filter"]').click(); await page.getByRole('menuitem', { name: 'Filters…' }).click(); };
const dlg = page.locator('dialog.fd[open]');
// some grey paint on Background so thresholds have something to act on
await selectRow('Background');
await page.evaluate(async () => {
    const e = window.__engine, t = performance.now();
    await e.setColors({ foreground: { r: 0.5, g: 0.5, b: 0.5, a: 1 } }); await e.setBrush({ size: 200, opacity: 1, flow: 1, eraser: false });
    e.beginStroke({ x: 200, y: 600, pressure: 1, timeMs: t }); e.continueStroke([{ x: 1200, y: 600, pressure: 1, timeMs: t + 10 }]); e.endStroke();
});
await page.waitForTimeout(300);
const C = await composite();
await open(); await dlg.waitFor();
check(await dlg.locator('h3').allTextContents().then(a => a.includes('Adjust') && a.includes('Artistic')), 'filters grouped by category');
await dlg.getByRole('searchbox').fill('pix');
check(await dlg.locator('.fd-scroll li button').count() === 1, 'search narrows the filter list');
await dlg.getByRole('searchbox').fill('');
await dlg.getByRole('button', { name: 'Invert', exact: true }).click();
check(await until(async () => await composite() !== C, 'preview shows'), 'preview changes the image');
await dlg.getByLabel('Preview').uncheck();
check(await until(async () => await composite() === C, 'preview off'), 'turning Preview off clears it');
await dlg.getByLabel('Preview').check();
await until(async () => await composite() !== C, 'preview back');
await dlg.getByRole('button', { name: 'Cancel' }).click();
await until(dialogGone, 'dialog closed');
check(await until(async () => await composite() === C, 'restored'), 'Cancel restores the image exactly');
await open(); await dlg.waitFor();
await dlg.getByRole('button', { name: 'Threshold' }).click();
await dlg.getByRole('spinbutton', { name: 'Threshold' }).fill('100'); await dlg.getByRole('spinbutton', { name: 'Threshold' }).blur();
await until(async () => await composite() !== C, 'threshold preview');
await page.keyboard.press('Escape');
await until(dialogGone, 'closed by Escape');
check(await until(async () => await composite() === C, 'escape restores'), 'Escape also clears the preview');
await open(); await dlg.waitFor();
await dlg.getByRole('button', { name: 'Invert', exact: true }).click();
await until(async () => await composite() !== C, 'invert preview');
await dlg.getByRole('button', { name: 'OK' }).click();
await until(dialogGone, 'OK closes');
await page.waitForTimeout(300);
const applied = await composite();
check(applied !== C, 'OK applies the filter');
await page.evaluate(() => window.__engine.undo());
check(await until(async () => await composite() === C, 'undo'), 'applying is undoable');

// --- filter layer with settings, then edit through properties
await selectRow('Group Layer 1');   // the filter layer goes above the group, so it affects Background
await addNode('Filter Layer');
await dlg.waitFor();
check(await dlg.getByLabel('Preview').count() === 0, 'no preview in add mode');
await dlg.getByRole('button', { name: 'Threshold' }).click();
await dlg.getByRole('spinbutton', { name: 'Threshold' }).fill('200'); await dlg.getByRole('spinbutton', { name: 'Threshold' }).blur();
await dlg.getByRole('button', { name: 'OK' }).click();
await until(dialogGone, 'dialog closes');
await until(async () => (await names()).includes('Filter Layer 1'), 'filter layer in tree');
let f = (await nodes()).find(n => n.type === 'filter');
let cfg = await page.evaluate(id => window.__engine.nodeConfig(id), f.id);
check(f.configId === 'threshold' && cfg.values.threshold === 200, 'filter layer created with chosen filter and settings');
const withFilter = await composite();
await bar('Properties…').click();
await page.locator('dialog.lyr-dialog[open]').waitFor();
const field = page.locator('dialog.lyr-dialog').getByRole('spinbutton', { name: 'Threshold' });
check(await field.inputValue() === '200', 'properties show the filter layer settings');
await field.fill('5'); await field.blur();
await until(async () => (await page.evaluate(id => window.__engine.nodeConfig(id), f.id)).values.threshold === 5, 'config updated');
check(true, 'editing settings in properties reaches the engine');
check(await until(async () => await composite() !== withFilter, 'composite follows'), 'composite follows the edited settings');
await page.locator('dialog.lyr-dialog').getByLabel('Name').fill('Mono');
await page.locator('dialog.lyr-dialog').getByLabel('Name').blur();
await until(async () => (await names()).includes('Mono'), 'renamed in properties');
check(true, 'properties dialog renames');
await page.locator('dialog.lyr-dialog').getByRole('button', { name: 'Close' }).click();
await until(dialogGone, 'properties closed');

await page.screenshot({ path: SHOT });
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
