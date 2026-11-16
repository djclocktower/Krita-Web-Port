// Settings, shortcut editor, themes, autosave settings, workspaces, About. Mock engine.
// Needs a dev server: npx vite --port 5181 --strictPort
// Run: URL=http://localhost:5181/ node tests/settings.mjs
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = (process.env.URL ?? 'http://localhost:5181/').replace(/\?.*$/, '');
const SHOTS = '/tmp/claude-0/-home-user-Krita-Web-Port/65182417-9f70-5299-9ecc-ec5673875a37/scratchpad';
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL  timeout'); process.exit(1); }, 420000).unref();
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const errors = [];

/** One persistent browser context (IndexedDB survives reloads) per scenario. */
async function scenario(name, fn, { init, ...opts } = {}) {
    console.log(`-- ${name}`);
    const dir = mkdtempSync(join(tmpdir(), 'kset-'));
    const ctx = await chromium.launchPersistentContext(dir, { args: ARGS, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, ...opts });
    if (init) await ctx.addInitScript(init);
    const page = ctx.pages()[0] ?? await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    try { await fn(page, ctx); } catch (e) { check(false, `${name}: threw`, e.stack); }
    await ctx.close(); rmSync(dir, { recursive: true, force: true });
}

const load = async (page, query = '') => {
    await page.goto(`${BASE}/?${query}`);
    await page.waitForFunction(() => /\d+ × \d+ px/.test(document.querySelector('.status-doc')?.textContent ?? ''), null, { timeout: 60000 });
    await page.waitForTimeout(200);
};
const reload = async page => { await page.evaluate(() => __settings.saved()); await page.reload(); await page.waitForFunction(() => /\d+ × \d+ px/.test(document.querySelector('.status-doc')?.textContent ?? ''), null, { timeout: 60000 }); await page.waitForTimeout(200); };
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const menuItem = (page, t) => page.locator('.menu-list [role=menuitem]').filter({ has: page.locator('span', { hasText: new RegExp(`^${esc(t)}$`) }) });
const menu = async (page, m, t) => { await page.locator(`button[data-menu="${m}"]`).click(); await menuItem(page, t).click(); await page.waitForTimeout(100); };
const dlg = page => page.locator('dialog[open]');
const openSettings = async (page, tab) => {
    if (!await dlg(page).count()) await menu(page, 'Settings', 'Configure Krita…');
    await dlg(page).waitFor();
    await dlg(page).getByRole('tab', { name: tab, exact: true }).click();
};
const closeDialog = async page => { await dlg(page).getByRole('button', { name: 'Close', exact: true }).click(); await page.waitForTimeout(100); };
const keyBtn = (page, id) => page.locator(`.sc-row[data-command="${id}"] .sc-key`);
const row = (page, id, name) => page.locator(`.sc-row[data-command="${id}"]`).getByRole('button', { name: new RegExp(`^${name}`) });
const record = async (page, id, ...keys) => { await keyBtn(page, id).click(); for (const k of keys) await page.keyboard.press(k); await page.waitForTimeout(60); };
const search = async (page, t) => { await dlg(page).getByLabel('Search shortcuts').fill(t); };
const setting = (page, k) => page.evaluate(k => __settings.get(k), k);
const rot = page => page.locator('.status-rot').innerText();
const zoom = page => page.locator('.status-zoom').innerText();
const kbdIn = async (page, m, t) => { await page.locator(`button[data-menu="${m}"]`).click(); const k = await menuItem(page, t).locator('kbd').allInnerTexts(); await page.keyboard.press('Escape'); return k; };
const stroke = async page => {
    const b = await page.locator('canvas.view').boundingBox();
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.4); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 6 }); await page.mouse.up();
};
const tabs = (page, area) => page.locator(`section[aria-label="${area} panels"] [role=tab]`).allInnerTexts();
const box = (page, area) => page.locator(`section[aria-label="${area} panels"]`).boundingBox();

// ------------------------------------------------------------------ shortcuts
await scenario('keyboard shortcuts editor', async page => {
    await load(page);
    await page.screenshot({ path: `${SHOTS}/shell-before.png` }).catch(() => {});
    await openSettings(page, 'Keyboard Shortcuts');
    check(await page.locator('.sc-row').count() > 50, 'the editor lists every command', `${await page.locator('.sc-row').count()}`);
    const groups = (await page.locator('.sc-list h3').allTextContents());
    check(['File', 'Edit', 'View', 'Image', 'Layer', 'Select', 'Tools'].every(g => groups.includes(g)) && groups.some(g => /Canvas shortcuts/.test(g)), 'grouped by menu, with a read-only canvas group', groups.join(','));
    check(await keyBtn(page, 'layer.duplicate').innerText() === 'Ctrl+J', 'panel commands are listed (Layer > Duplicate shows Ctrl+J)');
    await search(page, 'mirror');
    check(await page.locator('.sc-row').count() >= 3 && await keyBtn(page, 'view.mirror').count() === 1 && await keyBtn(page, 'file.new').count() === 0, 'search filters by name');
    await search(page, 'Ctrl+Alt+C');
    check(await keyBtn(page, 'image.resizeCanvas').count() === 1, 'search finds by shortcut');
    await search(page, 'mirror view');

    // recording: modifiers alone do not finish; Escape cancels and keeps the dialog open
    await keyBtn(page, 'view.mirror').click();
    check((await keyBtn(page, 'view.mirror').innerText()).includes('press keys'), 'click starts recording');
    await page.keyboard.down('Control'); await page.keyboard.down('Shift');
    check((await keyBtn(page, 'view.mirror').innerText()).startsWith('Ctrl+Shift+…'), 'modifiers alone are shown, not recorded', await keyBtn(page, 'view.mirror').innerText());
    await page.keyboard.up('Shift'); await page.keyboard.up('Control');
    check((await keyBtn(page, 'view.mirror').innerText()).includes('press keys') && await setting(page, 'shortcuts').then(m => !('view.mirror' in m)), 'releasing modifiers leaves recording going');
    await page.keyboard.press('Escape');
    check(await keyBtn(page, 'view.mirror').innerText() === 'M' && await dlg(page).count() === 1, 'Escape cancels recording, the shortcut stays and the dialog stays open');
    await keyBtn(page, 'view.mirror').click(); await page.keyboard.press('Tab'); await page.waitForTimeout(60);
    check(await keyBtn(page, 'view.mirror').innerText() === 'M', 'Tab leaves recording: focus is not trapped');
    // Backspace clears
    await search(page, 'Reset Rotation');
    await record(page, 'view.rotateReset', 'Backspace');
    check(await keyBtn(page, 'view.rotateReset').innerText() === 'None' && (await setting(page, 'shortcuts'))['view.rotateReset'] === '', 'Backspace clears a shortcut');
    await row(page, 'view.rotateReset', 'Restore default').click();
    check(await keyBtn(page, 'view.rotateReset').innerText() === '5' && !('view.rotateReset' in await setting(page, 'shortcuts')), 'Restore default brings the key back and drops the override');

    // remap Mirror View M -> Ctrl+Shift+M
    await search(page, 'mirror view');
    await record(page, 'view.mirror', 'Control+Shift+M');
    check(await keyBtn(page, 'view.mirror').innerText() === 'Ctrl+Shift+M', 'a recorded combination is shown');
    await closeDialog(page);
    await page.keyboard.press('m'); await page.waitForTimeout(100);
    check(!(await rot(page)).includes('mirrored'), 'the old key (M) no longer triggers the command');
    await page.keyboard.press('Control+Shift+M'); await page.waitForTimeout(100);
    check((await rot(page)).includes('mirrored'), 'the new key triggers it');
    check(JSON.stringify(await kbdIn(page, 'View', 'Mirror View')) === '["Ctrl+Shift+M"]', 'the menu shows the new shortcut');
    await page.keyboard.press('Control+Shift+M'); await page.waitForTimeout(100);

    await reload(page);
    await page.keyboard.press('Control+Shift+M'); await page.waitForTimeout(100);
    check((await rot(page)).includes('mirrored'), 'the remap survives a reload');
    await page.keyboard.press('Control+Shift+M'); await page.waitForTimeout(100);
    check(JSON.stringify(await kbdIn(page, 'View', 'Mirror View')) === '["Ctrl+Shift+M"]', 'and the menu still shows it');

    // conflicts
    await openSettings(page, 'Keyboard Shortcuts'); await search(page, 'Zoom to 100');
    await record(page, 'view.zoom100', 'Control+Shift+M');
    const c = dlg(page).locator('.sc-conflict');
    check(await c.count() === 1 && (await c.innerText()).includes('Mirror View') && (await c.innerText()).includes('Ctrl+Shift+M'), 'a conflict names the other command', await c.innerText().catch(() => ''));
    check(await keyBtn(page, 'view.zoom100').innerText() === '1', 'nothing changes until the choice is made');
    await c.getByRole('button', { name: 'Cancel' }).click();
    check(await c.count() === 0 && await keyBtn(page, 'view.zoom100').innerText() === '1', 'Cancel keeps both as they were');
    await record(page, 'view.zoom100', 'Control+Shift+M');
    await c.getByRole('button', { name: 'Reassign' }).click();
    check(await keyBtn(page, 'view.zoom100').innerText() === 'Ctrl+Shift+M', 'Reassign gives the combination to the new command');
    await search(page, 'Mirror View');
    check(await keyBtn(page, 'view.mirror').innerText() === 'None', 'and takes it from the other');
    await closeDialog(page);
    await page.keyboard.press('2'); await page.waitForTimeout(100);
    const fit = await zoom(page);
    await page.keyboard.press('Control+Shift+M'); await page.waitForTimeout(100);
    check(fit !== '100%' && await zoom(page) === '100%' && !(await rot(page)).includes('mirrored'), 'the reassigned key now runs Zoom to 100% only', `${fit} -> ${await zoom(page)}`);
    // conflict with a read-only canvas shortcut
    await openSettings(page, 'Keyboard Shortcuts'); await search(page, 'Mirror View');
    await record(page, 'view.mirror', 'B');
    const msg = await dlg(page).locator('.sc-msg').innerText();
    check(msg.includes('Freehand Brush') && msg.includes('canvas shortcut') && await keyBtn(page, 'view.mirror').innerText().then(t => t.includes('press keys')), 'a canvas shortcut conflict is reported and not assignable', msg);
    await page.keyboard.press('Escape');
    check(await keyBtn(page, 'view.mirror').innerText() === 'None', 'the command is unchanged after the refused key');
    await search(page, '');
    check(await dlg(page).locator('section[aria-label="Canvas shortcuts"] kbd').count() >= 6 && await dlg(page).locator('section[aria-label="Canvas shortcuts"] button').count() === 0, 'canvas shortcuts are listed read-only');
    // restore
    await row(page, 'view.mirror', 'Restore default').click();
    check(await keyBtn(page, 'view.mirror').innerText() === 'M', 'Restore default for one command');
    await search(page, '');
    await dlg(page).getByRole('button', { name: 'Restore all defaults' }).click();
    check(Object.keys(await setting(page, 'shortcuts')).length === 0 && await dlg(page).locator('.sc-key.edited').count() === 0, 'Restore all defaults clears every override');
    await search(page, 'Zoom to 100');
    check(await keyBtn(page, 'view.zoom100').innerText() === '1', 'and the defaults are back');
    // tab keys
    await dlg(page).getByRole('tab', { name: 'Keyboard Shortcuts' }).focus();
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    check(await dlg(page).getByRole('tab', { name: 'General' }).getAttribute('aria-selected') === 'true' && await page.evaluate(() => document.activeElement.textContent) === 'General', 'arrow keys move between dialog pages');
    await page.keyboard.press('End');
    check(await dlg(page).getByRole('tab', { name: 'Keyboard Shortcuts' }).getAttribute('aria-selected') === 'true', 'End goes to the last page');
    await page.evaluate(() => document.querySelector('dialog[open] input').blur());
    await page.screenshot({ path: `${SHOTS}/shortcuts-1x.png` });
});

// screenshot at 2x
await scenario('screenshot', async page => {
    await load(page);
    await openSettings(page, 'Keyboard Shortcuts');
    await keyBtn(page, 'edit.undo').scrollIntoViewIfNeeded();
    await record(page, 'tools.eraser', 'Control+E');
    await dlg(page).locator('.sc-list').evaluate(l => { l.scrollTop = 0; });
    await page.screenshot({ path: `${SHOTS}/shortcuts.png` });
}, { deviceScaleFactor: 2 });

// ------------------------------------------------------------------ themes
await scenario('themes and canvas colours', async page => {
    await load(page);
    const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    const panel = () => page.evaluate(() => getComputedStyle(document.querySelector('.menubar')).backgroundColor);
    const seen = { dark: await bg() };
    await openSettings(page, 'Display');
    for (const t of ['darker', 'neutral', 'light']) {
        await dlg(page).getByLabel('Theme').selectOption(t);
        seen[t] = await bg();
        check(await page.evaluate(() => document.documentElement.dataset.theme) === t, `theme ${t}: data-theme set`);
    }
    check(new Set(Object.values(seen)).size === 4, 'each theme has its own background colour', JSON.stringify(seen));
    check(await panel() !== 'rgb(53, 53, 53)', 'panels follow the theme');
    await dlg(page).getByLabel('Checkerboard colour 1').fill('#ff0000');
    await dlg(page).getByLabel('Canvas border colour').fill('#00ff00');
    const vars = () => page.evaluate(() => { const s = getComputedStyle(document.documentElement); return ['--canvas-border', '--checker-a', '--checker-b'].map(v => s.getPropertyValue(v).trim()); });
    check(JSON.stringify(await vars()) === '["#00ff00","#ff0000","#c0c0c0"]', 'canvas colours are exposed as CSS variables', JSON.stringify(await vars()));
    await reload(page);
    check(await page.evaluate(() => document.documentElement.dataset.theme) === 'light' && await bg() === seen.light, 'the theme persists across a reload');
    check(JSON.stringify(await vars()) === '["#00ff00","#ff0000","#c0c0c0"]', 'canvas colours persist');
    await openSettings(page, 'Display');
    await dlg(page).getByRole('button', { name: 'Restore defaults on this page' }).click();
    check(await bg() === seen.dark && (await vars())[1] === '#ffffff', 'restore defaults on the Display page');
});

// ------------------------------------------------------------------ autosave
await scenario('autosave settings', async page => {
    await load(page);
    await page.evaluate(() => { const e = __engine, o = e.exportDocument.bind(e); window.__n = 0; e.exportDocument = f => { __n++; return o(f); }; });
    const n = () => page.evaluate(() => __n);
    await openSettings(page, 'General');
    await dlg(page).getByLabel(/^Save this many seconds/).fill('20');
    check(await setting(page, 'autosaveSeconds') === 20, 'interval is stored');
    await dlg(page).getByLabel(/^Save this many seconds/).fill('0');
    check(await dlg(page).locator('.error').first().innerText() !== '' && await setting(page, 'autosaveSeconds') === 20, 'an invalid interval is refused with a message');
    await dlg(page).getByLabel(/^Save this many seconds/).fill('20');
    await closeDialog(page);
    await stroke(page);
    await page.waitForTimeout(5500);
    check(await n() === 0, 'with a 20 s interval nothing is saved after 5 s (the default would have)', `${await n()}`);
    await page.evaluate(() => __settings.set('autosaveSeconds', 1));
    await page.waitForFunction(() => __n > 0, null, { timeout: 15000 }).catch(() => {});
    check(await n() > 0, 'shortening the interval saves the pending change soon');
    await page.waitForFunction(() => /^Saved locally/.test(document.querySelector('.status-save')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    await openSettings(page, 'General');
    await dlg(page).getByLabel('Autosave to this browser').uncheck();
    check(await dlg(page).getByLabel(/^Save this many seconds/).isDisabled(), 'the interval is disabled while autosave is off');
    await closeDialog(page);
    await page.waitForTimeout(500);
    const base = await n();
    await stroke(page); await page.waitForTimeout(3500);
    check(await n() === base, 'with autosave off a change is not saved', `${base} -> ${await n()}`);
    await page.evaluate(() => __settings.set('autosave', true));
    await page.waitForFunction(b => __n > b, base, { timeout: 15000 }).catch(() => {});
    check(await n() > base, 'turning autosave on saves the pending change');
    await reload(page);
    check(await setting(page, 'autosaveSeconds') === 1 && await setting(page, 'autosave') === true, 'autosave settings persist');
});

// ------------------------------------------------------------------ workspaces
await scenario('workspaces and splitters', async page => {
    await load(page);
    const ws = t => menu(page, 'Settings', `Workspace: ${t}`);
    const defaults = { left: await tabs(page, 'left'), right: await tabs(page, 'right'), bottom: await tabs(page, 'bottom') };
    // the left dock is stacked (Toolbox above Tool Options), so it has no tabs: its panels are listed by their tabpanel labels
    defaults.left = await page.locator('section[aria-label="left panels"] [role=tabpanel]').evaluateAll(e => e.map(x => x.getAttribute('aria-label')));
    check(defaults.left.length >= 2 && defaults.right.length >= 4 && defaults.bottom.length === 1, 'default shows every panel', JSON.stringify(defaults));
    const b0 = await box(page, 'bottom');
    await ws('Minimal');
    check(JSON.stringify(await tabs(page, 'left')) === '["Toolbox"]' && JSON.stringify(await tabs(page, 'right')) === '["Layers"]' && await page.locator('section[aria-label="bottom panels"]').count() === 0, 'Minimal: only toolbox and layers');
    await ws('Animation');
    const b1 = await box(page, 'bottom');
    check(await page.locator('section[aria-label="bottom panels"] [role=tab][aria-selected=true]').innerText() === 'Timeline' && b1.height > b0.height + 80, 'Animation: timeline open and taller', `${b0.height} -> ${b1.height}`);
    await ws('Default');
    check(JSON.stringify(await tabs(page, 'right')) === JSON.stringify(defaults.right) && Math.abs((await box(page, 'bottom')).height - b0.height) < 2, 'Default restores the layout');

    // splitters: pointer
    const leftW = async () => Math.round((await box(page, 'left')).width);
    const sp = a => page.locator(`[role=separator][aria-label="Resize ${a} dock"]`);
    check(await leftW() === 240, 'left dock starts at 240 px', `${await leftW()}`);
    let s = await sp('left').boundingBox();
    await page.mouse.move(s.x + s.width / 2, s.y + 200); await page.mouse.down(); await page.mouse.move(s.x + s.width / 2 + 60, s.y + 200, { steps: 5 }); await page.mouse.up();
    check(await leftW() === 300, 'dragging the left splitter by 60 px widens the dock', `${await leftW()}`);
    s = await sp('right').boundingBox();
    const rw0 = Math.round((await box(page, 'right')).width);
    await page.mouse.move(s.x + s.width / 2, s.y + 200); await page.mouse.down(); await page.mouse.move(s.x + s.width / 2 - 40, s.y + 200, { steps: 5 }); await page.mouse.up();
    check(Math.round((await box(page, 'right')).width) === rw0 + 40, 'dragging the right splitter left widens that dock');
    s = await sp('bottom').boundingBox();
    const bh0 = Math.round((await box(page, 'bottom')).height);
    await page.mouse.move(s.x + 300, s.y + s.height / 2); await page.mouse.down(); await page.mouse.move(s.x + 300, s.y + s.height / 2 - 50, { steps: 5 }); await page.mouse.up();
    check(Math.round((await box(page, 'bottom')).height) === bh0 + 50, 'dragging the bottom splitter up makes it taller');
    // keyboard
    await sp('left').focus();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    check(await leftW() === 332 && await sp('left').getAttribute('aria-valuenow') === '332', 'arrow keys resize 16 px a step', `${await leftW()}`);
    await page.keyboard.press('ArrowLeft');
    check(await leftW() === 316, 'ArrowLeft shrinks it');
    await sp('bottom').focus(); await page.keyboard.press('ArrowUp');
    check(Math.round((await box(page, 'bottom')).height) === bh0 + 66, 'ArrowUp grows the bottom dock');
    // persists
    await reload(page);
    check(await leftW() === 316 && Math.round((await box(page, 'right')).width) === rw0 + 40, 'splitter sizes survive a reload');
    await sp('left').dblclick();
    check(await leftW() === 240, 'double-click resets the size');
    await sp('left').focus(); await page.keyboard.press('ArrowRight');   // 256

    // save a workspace: size + a different right-dock tab
    await page.locator('section[aria-label="right panels"] [role=tab]', { hasText: /^Color$/ }).click();
    await menu(page, 'Settings', 'Workspace: Save and Manage…');
    await dlg(page).getByPlaceholder('Workspace name').fill('Default'); await dlg(page).getByRole('button', { name: 'Save', exact: true }).click();
    check((await dlg(page).locator('.error').innerText()).includes('built-in'), 'a built-in name is refused');
    await dlg(page).getByPlaceholder('Workspace name').fill('Painting'); await dlg(page).getByRole('button', { name: 'Save', exact: true }).click();
    check(await dlg(page).locator('li', { hasText: 'Painting (current)' }).count() === 1, 'a workspace is saved and listed');
    await closeDialog(page);
    await ws('Minimal');
    await ws('Painting');
    check(await leftW() === 256 && (await tabs(page, 'right')).length >= 4 && await page.locator('section[aria-label="right panels"] [role=tab][aria-selected=true]').innerText() === 'Color', 'switching to the saved workspace restores sizes and the selected tab');
    await ws('Default');
    check(await leftW() === 240, 'Default resets the size the saved workspace changed');
    await reload(page);
    await page.locator('button[data-menu="Settings"]').click();
    check(await menuItem(page, 'Workspace: Painting').count() === 1, 'the saved workspace is in the menu after a reload');
    await menuItem(page, 'Workspace: Painting').click();
    check(await leftW() === 256, 'and it still switches correctly');
    await menu(page, 'Settings', 'Workspace: Save and Manage…');
    await dlg(page).getByRole('button', { name: 'Delete Painting' }).click();
    check(await dlg(page).locator('li', { hasText: 'Painting' }).count() === 0, 'a saved workspace can be deleted');
    await closeDialog(page);
});

// ------------------------------------------------------------------ storage unavailable
await scenario('storage unavailable: settings last for the session', async page => {
    await load(page);
    check(await page.locator('.banner[role=alert]').count() === 1, 'one notice that storage is unavailable', await page.locator('.banner').innerText().catch(() => ''));
    await openSettings(page, 'Display');
    await dlg(page).getByLabel('Theme').selectOption('light');
    check(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'theme switch works');
    await openSettings(page, 'Keyboard Shortcuts'); await search(page, 'mirror view');
    await record(page, 'view.mirror', 'Control+Shift+M');
    await closeDialog(page);
    await page.keyboard.press('Control+Shift+M'); await page.waitForTimeout(100);
    check((await rot(page)).includes('mirrored'), 'a remapped shortcut works');
    await menu(page, 'Settings', 'Workspace: Minimal');
    check(JSON.stringify(await tabs(page, 'right')) === '["Layers"]', 'workspace switch works');
    await menu(page, 'Settings', 'Workspace: Save and Manage…');
    await dlg(page).getByPlaceholder('Workspace name').fill('Temp'); await dlg(page).getByRole('button', { name: 'Save', exact: true }).click();
    check(await dlg(page).locator('li', { hasText: 'Temp' }).count() === 1, 'saving a workspace works');
    await closeDialog(page);
    check(await page.locator('.banner[role=alert]').count() === 1, 'still one banner');
}, { init: () => Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }) });

// ------------------------------------------------------------------ about
await scenario('about', async page => {
    await load(page);
    await menu(page, 'Settings', 'About Krita Web…');
    const d = dlg(page);
    const v = await d.locator('.about-version').innerText();
    check(v.trim().length > 0, 'About shows a version', v);
    check((await d.locator('.about-engine').innerText()).includes('Mock'), 'About names the engine in use (mock)');
    check((await d.innerText()).includes('GPL-3.0') && await d.locator('a[href]').count() === 1 && await d.locator('.about-notices li').count() >= 20, 'licence, source link and third-party notices');
    check((await d.locator('.about-notices').innerText()).includes('LittleCMS') && (await d.locator('.about-notices').innerText()).includes('see upstream'), 'notices name LittleCMS and mark unverified licences "see upstream"');
    await closeDialog(page);
    check(await dlg(page).count() === 0, 'About closes');
});

// ------------------------------------------------------------------ phone
await scenario('preferences dialog at 390x844 with touch', async page => {
    await load(page);
    await page.locator('.menu-toggle').tap();
    await page.locator('.menu-sheet .group', { hasText: 'Settings' }).tap();
    await page.locator('.menu-sheet .item', { hasText: 'Configure Krita' }).tap();
    await dlg(page).waitFor();
    const small = () => page.evaluate(() => {
        const out = [], d = document.querySelector('dialog[open]');
        for (const el of d.querySelectorAll('button, select, input, [role=tab]')) {
            const t = el.closest('label')?.contains(el) && /checkbox|radio/.test(el.type ?? '') ? el.closest('label') : el;
            const r = t.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const p = el.closest('.sc-list'), pr = p?.getBoundingClientRect();
            if (pr && (r.bottom < pr.top || r.top > pr.bottom)) continue;   // scrolled out of the list
            if (Math.min(r.width, r.height) < 39.5) out.push(`${el.tagName}[${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return out;
    });
    const fits = async () => { const b = await dlg(page).boundingBox(); return b.x >= 0 && b.y >= 0 && b.x + b.width <= 390 && b.y + b.height <= 844; };
    const noOverflow = () => page.evaluate(() => { const d = document.querySelector('dialog[open]'); return d.scrollWidth <= d.clientWidth + 1; });
    for (const tab of ['General', 'Display', 'Keyboard Shortcuts']) {
        await dlg(page).getByRole('tab', { name: tab, exact: true }).tap();
        const s = await small();
        check(s.length === 0, `phone ${tab}: controls >= 40 px`, s.join('; '));
        check(await fits() && await noOverflow(), `phone ${tab}: dialog fits 390x844 without sideways scroll`);
    }
    // touch: restore and clear buttons work without a keyboard
    await search(page, 'Mirror View');
    await keyBtn(page, 'view.mirror').scrollIntoViewIfNeeded();
    await row(page, 'view.mirror', 'Clear').tap();
    check(await keyBtn(page, 'view.mirror').innerText() === 'None', 'phone: Clear works by touch');
    await row(page, 'view.mirror', 'Restore default').tap();
    check(await keyBtn(page, 'view.mirror').innerText() === 'M', 'phone: Restore works by touch');
    await page.screenshot({ path: `${SHOTS}/phone-shortcuts.png` });
    await dlg(page).getByRole('button', { name: 'Close', exact: true }).tap();
    check(await dlg(page).count() === 0, 'phone: dialog closes');
}, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

check(errors.length === 0, 'no page errors', errors.join(' | '));
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
