// The page's menus: Krita's own menu structure (menus.generated.ts) merged with the page's commands. Mock part (?kritaMock=1, plus the plain
// mock) and a real-engine part (?engine=wasm, ~10 s start-up; skip with NO_WASM=1).
// Run: URL=http://localhost:5196/ node tests/krita-menus.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const pw = createRequire(import.meta.url)('playwright');
const { chromium, devices } = pw;
const BASE = (process.env.URL ?? 'http://localhost:5196/').replace(/\?.*$/, '');
const SHOTS = fileURLToPath(new URL('./screens/', import.meta.url));
setTimeout(() => { console.log('FAILED: hard timeout'); process.exit(2); }, 420000).unref();
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + JSON.stringify(detail).slice(0, 600)}`); if (!ok) failed++; };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = async (query, opts = { viewport: { width: 1280, height: 900 } }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + query);
    await page.waitForFunction(() => window.__engine && window.__view.view.get().docW > 0, null, { timeout: 150000 });
    await page.waitForTimeout(query.includes('wasm') ? 3500 : 400);
    return page;
};
const BLOCKED = ['add_new_fill_layer', 'add_new_fast_color_overlay_mask', 'convert_to_filter_mask'];
const closeAll = async page => { await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await sleep(60); };
const norm = s => s.replace(/✓/g, '').replace(/\s*(\.\.\.|…)$/, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Desktop: opens every menu and every submenu (by clicking down the path) and lists what is in them.
const LEAF = '.menubar .menu-list [role^=menuitem]:not([data-sub])';
const leavesNow = page => page.locator(LEAF).evaluateAll(bs => bs.map(b => ({
    key: b.closest('.menu-list').dataset.key, label: b.querySelector('span').textContent.replace(/✓/g, '').trim(), action: b.dataset.action ?? null,
    disabled: b.disabled, role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), kbd: b.querySelector('kbd')?.textContent ?? '', id: b.dataset.action ?? null,
})));
async function openPath(page, key) {
    const parts = key.split('>');
    await closeAll(page);
    await page.locator(`.menubar [data-menu="${parts[0]}"]`).click(); await sleep(80);
    for (let i = 1; i < parts.length; i++) { await page.locator(`.menubar [data-sub="${parts.slice(0, i + 1).join('>')}"]`).click({ timeout: 5000 }); await sleep(80); }
}
async function walkDesktop(page) {
    const tops = await page.locator('.menubar [data-menu]').evaluateAll(b => b.map(x => x.dataset.menu));
    const queue = [...tops], seen = new Set(), all = [], subs = [];
    while (queue.length) {
        const key = queue.shift();
        if (seen.has(key)) continue; seen.add(key);
        await openPath(page, key);
        for (const l of await leavesNow(page)) if (!all.some(x => x.key === l.key && x.label === l.label && x.action === l.action)) all.push(l);
        for (const s of await page.locator('.menubar [data-sub]').evaluateAll(b => b.map(x => x.dataset.sub))) { if (!subs.includes(s)) subs.push(s); if (!seen.has(s)) queue.push(s); }
    }
    await closeAll(page);
    return { tops, all, subs };
}
const topOf = e => e.key.split('>')[0];

// ============================================================== plain mock: the menus are as they were
{
    const page = await open('');
    const w = await walkDesktop(page);
    const cmds = await page.evaluate(async () => (await import('/src/shell/commands.ts')).menuCommands().map(c => ({ menu: c.menu, title: c.title })));
    check(w.subs.length === 0 && w.all.every(l => !l.action), 'plain mock: no submenus and no Krita actions', w.subs);
    const same = w.tops.every(t => JSON.stringify(w.all.filter(l => topOf(l) === t).map(l => l.label)) === JSON.stringify(cmds.filter(c => c.menu === t).map(c => c.title.replace(/^✓ /, ''))));
    check(same && w.tops.join() === 'File,Edit,View,Image,Layer,Select,Filter,Tools,Settings', 'plain mock: the menus list exactly the page commands, in the old order', w.tops.map(t => [w.all.filter(l => topOf(l) === t).map(l => l.label), cmds.filter(c => c.menu === t).map(c => c.title.replace(/^✓ /, ''))]).find(([a, b]) => JSON.stringify(a) !== JSON.stringify(b)));
    await page.context().close();
}

// ============================================================== mock with fake Krita actions
let desktopLabels;
{
    const page = await open('?kritaMock=1');
    const w = await walkDesktop(page);
    desktopLabels = w.all.map(l => `${topOf(l)}|${l.label}`).sort();
    check(['File', 'Edit', 'View', 'Image', 'Layer', 'Select', 'Filter', 'Tools', 'Settings'].every(t => w.tops.includes(t)), 'mock: top-level menus', w.tops);
    check(w.subs.includes('Layer>New') && w.subs.includes('Edit>Fill Special') && w.subs.includes('Layer>Select') && w.subs.includes('Settings>Dockers'), 'mock: Krita submenus (Layer > New, Edit > Fill Special, Layer > Select, Settings > Dockers)', w.subs);
    const by = (t, a) => w.all.find(l => topOf(l) === t && l.action === a);
    check(by('Edit', 'edit_cut')?.label === 'Cut' && by('Edit', 'edit_cut')?.kbd === 'Ctrl+X', 'mock: label from the engine ("Cu&t" -> "Cut") and its shortcut is shown', by('Edit', 'edit_cut'));
    check(w.all.find(l => l.key === 'Layer>Select' && l.action === 'select_all_layers')?.label === 'All Layers', 'mock: Layer > Select > All Layers');
    check(w.all.find(l => l.key === 'Edit>Fill Special')?.action === 'fill_selection_pattern_opacity', 'mock: Edit > Fill Special holds its entry');
    check(!w.all.some(l => BLOCKED.includes(l.action)) && !w.all.some(l => /fill layer/i.test(l.label)), 'mock: a BLOCKED action the engine lists is not offered');
    const mod = await page.evaluate(async () => (await import('/src/krita/menus.ts')).BLOCKED);
    check(JSON.stringify(mod) === JSON.stringify(BLOCKED), 'BLOCKED lists the five A1 actions', mod);
    check(by('Edit', 'copy_merged')?.disabled === true && !by('Edit', 'edit_cut').disabled, 'mock: a disabled action is greyed (disabled)');
    // duplicates: a page command and a Krita entry never share a label within a menu
    const dups = w.tops.flatMap(t => { const ls = w.all.filter(l => topOf(l) === t).map(l => norm(l.label)); return ls.filter((l, i) => ls.indexOf(l) !== i).map(l => `${t}: ${l}`); });
    check(dups.length === 0, 'mock: no duplicate labels within a menu', dups);
    // page commands keep working: New, Undo
    await openPath(page, 'File'); await page.getByRole('menuitem', { name: /^New…/ }).click();
    check(await page.evaluate(() => __app.get().newOpen), 'page command File > New… still opens the New dialog');
    await page.evaluate(() => __app.set({ newOpen: false }));
    const count = () => page.evaluate(async () => { const n = l => l.reduce((s, x) => s + 1 + n(x.children), 0); return n(await __engine.layers()); });
    const n0 = await count();
    await openPath(page, 'Layer>New'); await page.getByRole('menuitem', { name: 'New Group Layer' }).click(); await sleep(300);
    check(await count() === n0 + 1, 'page command Layer > New > New Group Layer adds a layer (in Krita\'s submenu)', [n0, await count()]);
    await openPath(page, 'Edit'); await page.getByRole('menuitem', { name: /^Undo/ }).click(); await sleep(300);
    check(await count() === n0, 'page command Edit > Undo takes it back');
    // disabled does nothing
    await openPath(page, 'Edit');
    await page.locator('[data-action=copy_merged]').click({ force: true }); await sleep(200);
    check(!(await page.evaluate(() => __engine.__kritaLog.actions)).includes('copy_merged'), 'mock: clicking a disabled action does nothing');
    // checkable action shows and keeps its state
    await openPath(page, 'View');
    const cb = page.locator('[data-action=wrap_around_mode]');
    check(await cb.getAttribute('role') === 'menuitemcheckbox' && await cb.getAttribute('aria-checked') === 'false', 'mock: a checkable action is a menuitemcheckbox, unchecked');
    await cb.click(); await sleep(200);
    await openPath(page, 'View');
    check(await page.locator('[data-action=wrap_around_mode]').getAttribute('aria-checked') === 'true' && (await page.evaluate(() => __engine.__kritaLog.actions)).includes('wrap_around_mode'), 'mock: triggering it runs the action and the menu shows it checked on the next open');
    // one kritaActions() call per bar open
    await page.evaluate(() => { const f = __engine.kritaActions.bind(__engine); window.__calls = 0; __engine.kritaActions = () => { window.__calls++; return f(); }; });
    await closeAll(page);
    await page.locator('.menubar [data-menu="Layer"]').click(); await page.locator('.menubar [data-menu="Image"]').hover(); await page.locator('.menubar [data-menu="Layer"]').hover(); await sleep(100);
    await page.locator('.menubar [data-sub]').first().click(); await sleep(300);
    check(await page.evaluate(() => window.__calls) === 1, 'mock: one kritaActions() call per menu-bar open', await page.evaluate(() => window.__calls));

    // keyboard: ArrowRight opens a submenu and focuses its first item; ArrowLeft and Escape go back
    await closeAll(page); await page.mouse.move(640, 880);   // the mouse must not rest where a menu will appear
    const active = () => page.evaluate(() => ({ t: document.activeElement?.textContent ?? '', sub: document.activeElement?.dataset?.sub ?? null, role: document.activeElement?.getAttribute('role') }));
    await page.locator('.menubar [data-menu="Layer"]').focus();
    await page.keyboard.press('ArrowDown'); await sleep(100);
    let a = await active();
    check(a.sub === 'Layer>New', 'keyboard: ArrowDown opens Layer and focuses its first item (a submenu)', a);
    await page.keyboard.press('ArrowRight'); await sleep(100); a = await active();
    check(/^New Paint Layer/.test(a.t) && await page.locator('.menu-list.sub').count() === 1, 'keyboard: ArrowRight opens the submenu and focuses its first item', a);
    await page.keyboard.press('ArrowDown'); await sleep(50); a = await active();
    check(/^New Group Layer/.test(a.t), 'keyboard: ArrowDown moves inside the submenu', a);
    await page.keyboard.press('ArrowLeft'); await sleep(100); a = await active();
    check(a.sub === 'Layer>New' && await page.locator('.menu-list.sub').count() === 0 && await page.locator('.menu-list').count() === 1, 'keyboard: ArrowLeft closes the submenu and focuses its parent item', a);
    await page.keyboard.press('ArrowRight'); await sleep(150); await page.keyboard.press('Escape'); await sleep(100); a = await active();
    check(a.sub === 'Layer>New' && await page.locator('.menu-list').count() === 1, 'keyboard: Escape in a submenu closes only the submenu', a);
    await page.keyboard.press('Escape'); await sleep(100);
    check(await page.locator('.menu-list').count() === 0 && (await active()).t === 'Layer', 'keyboard: Escape in the menu closes it and focuses its title');
    const aria = await page.evaluate(async () => { const b = document.querySelector('.menubar [data-menu="Layer"]'); b.click(); await new Promise(r => setTimeout(r, 100)); const s = document.querySelector('[data-sub="Layer>New"]'); return { menubar: !!document.querySelector('nav[role=menubar]'), menu: !!document.querySelector('.menu-list[role=menu]'), pop: s.getAttribute('aria-haspopup'), exp: s.getAttribute('aria-expanded'), sep: !!document.querySelector('.menu-list [role=separator]') }; });
    check(aria.menubar && aria.menu && aria.pop === 'menu' && aria.exp === 'false' && aria.sep, 'roles: menubar, menu, menuitem with aria-haspopup / aria-expanded, separators', aria);
    // mouse: hover opens a submenu, hover over another item closes it
    await closeAll(page); await page.mouse.move(640, 880);
    await page.locator('.menubar [data-menu="Layer"]').click();
    await page.locator('[data-sub="Layer>New"]').hover(); await sleep(100);
    check(await page.locator('.menu-list.sub').count() === 1, 'mouse: hovering a submenu item opens it');
    await page.locator('.menu-list:not(.sub) > [role=menuitem]:not([data-sub])').first().hover(); await sleep(100);
    check(await page.locator('.menu-list.sub').count() === 0, 'mouse: hovering a plain item closes the open submenu');
    // the submenu sits beside its parent, inside the window
    await page.locator('[data-sub="Layer>New"]').click();
    const pos = await page.evaluate(() => { const p = document.querySelector('[data-sub="Layer>New"]').getBoundingClientRect(), s = document.querySelector('.menu-list.sub').getBoundingClientRect(); return { p: [p.left, p.right, p.top], s: [s.left, s.right, s.top, s.bottom], w: innerWidth, h: innerHeight }; });
    check(Math.abs(pos.s[0] - pos.p[1]) < 3 && pos.s[3] <= pos.h && pos.s[1] <= pos.w, 'submenu is positioned beside its parent item and fits the window', pos);
    await page.screenshot({ path: `${SHOTS}krita-menus-layer.png` });
    await page.context().close();
}

// ---- touch pointers: nothing depends on hover (a touch pointer sends pointerenter too, then click)
{
    const page = await open('?kritaMock=1');
    const n = () => page.evaluate(async () => { const c = l => l.reduce((s, x) => s + 1 + c(x.children), 0); return c(await __engine.layers()); });
    const n0 = await n(), touch = (sel, type) => page.locator(sel).evaluate((el, type) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch' })), type);
    await touch('.menubar [data-menu="Layer"]', 'pointerdown'); await page.locator('.menubar [data-menu="Layer"]').evaluate(b => b.click()); await sleep(100);
    await touch('[data-sub="Layer>New"]', 'pointerenter'); await sleep(100);
    check(await page.locator('.menu-list.sub').count() === 0, 'touch: a touch pointer entering a submenu item does not open it (no hover-only behaviour)');
    await page.locator('[data-sub="Layer>New"]').evaluate(b => b.click()); await sleep(100);
    check(await page.locator('.menu-list.sub').count() === 1, 'touch: a tap (click) on a submenu item opens it');
    await page.getByRole('menuitem', { name: 'New Group Layer' }).evaluate(b => b.click()); await sleep(300);
    check(await page.locator('.menu-list').count() === 0 && await n() === n0 + 1, 'touch: tapping an entry in the submenu runs it and closes the menus');
    await page.context().close();
}

// ---- phone command list: the same tree
{
    const page = await open('?kritaMock=1', devices['Pixel 7']);
    await page.locator('.m-open-menu').tap(); await page.locator('.m-menu').waitFor();
    const tops = await page.locator('.m-menu-list > div > .group').evaluateAll(b => b.map(x => x.textContent.replace(/[▸▾]/g, '').trim()));
    const labels = [], subs = [], queue = tops.map(t => t);
    const phoneLeaves = () => page.locator('.m-menu-list [role^=menuitem]').evaluateAll(bs => bs.map(b => b.querySelector('span').textContent.replace(/✓/g, '').trim()));
    const seen = new Set();
    while (queue.length) {
        const key = queue.shift(); if (seen.has(key)) continue; seen.add(key);
        const parts = key.split('>');
        // reopen the path from the top
        if (await page.locator('.m-menu').count() === 0) { await page.locator('.m-open-menu').tap(); await page.locator('.m-menu').waitFor(); }
        const topBtn = page.locator('.m-menu-list > div > .group', { hasText: parts[0] }).first();
        if (await topBtn.getAttribute('aria-expanded') === 'true') await topBtn.tap();   // collapse, then open fresh
        await topBtn.tap();
        for (let i = 1; i < parts.length; i++) await page.locator(`.m-menu-list [data-sub="${parts.slice(0, i + 1).join('>')}"]`).tap();
        for (const l of await phoneLeaves()) labels.push(`${parts[0]}|${l}`);
        for (const s of await page.locator('.m-menu-list [data-sub]').evaluateAll(b => b.map(x => x.dataset.sub))) if (!subs.includes(s)) { subs.push(s); queue.push(s); }
    }
    const uniq = [...new Set(labels)].sort(), want = [...new Set(desktopLabels)].sort();
    check(JSON.stringify(uniq) === JSON.stringify(want), 'phone: the command list holds exactly the entries of the desktop menus', { onlyPhone: uniq.filter(x => !want.includes(x)), onlyDesktop: want.filter(x => !uniq.includes(x)) });
    check(subs.includes('Layer>New') && subs.includes('Edit>Fill Special'), 'phone: submenus are groups you tap open', subs);
    await page.locator('.m-menu input[type=search]').fill('wrap around');
    check(await page.locator('.m-menu [data-action=wrap_around_mode]').count() === 1 && /View/.test(await page.locator('.m-menu [data-action=wrap_around_mode]').textContent()), 'phone: search finds an entry and shows its menu path');
    await page.locator('.m-menu input[type=search]').fill('fill layer');
    check(await page.locator('.m-menu [data-action=add_new_fill_layer]').count() === 0, 'phone: a BLOCKED action is not offered, not even by search');
    await page.locator('.m-menu input[type=search]').fill('');
    await page.locator('.m-menu-list > div > .group', { hasText: 'Layer' }).first().tap();
    await page.screenshot({ path: `${SHOTS}krita-menus-phone.png` });
    await page.context().close();
}

// ============================================================== real engine
if (!process.env.NO_WASM) {
    const page = await open('?engine=wasm');
    await page.locator('.menubar [data-menu="Edit"]').click(); await sleep(1500);   // refreshes the action list
    const w = await walkDesktop(page);
    const acts = await page.evaluate(async () => (await __engine.kritaActions()).map(a => ({ ...a })));
    const byName = new Map(acts.map(a => [a.name, a]));
    const clean = t => t.replace(/&&/g, '\u0001').replace(/&/g, '').replace(/\u0001/g, '&').trim();
    const ka = w.all.filter(l => l.action);
    const per = {}; for (const l of ka) per[topOf(l)] = (per[topOf(l)] ?? 0) + 1;
    console.log('Krita entries per menu:', JSON.stringify(per), 'total', ka.length, 'submenus', w.subs.length);
    check(['File', 'Edit', 'View', 'Image', 'Layer', 'Select', 'Filter', 'Settings', 'Help'].every(t => w.tops.includes(t)), 'real: top-level menus', w.tops);
    check(ka.length >= 150, 'real: at least 150 Krita entries in the menus', ka.length);
    check(ka.every(l => byName.has(l.action)), 'real: every Krita entry is an action the engine has', ka.filter(l => !byName.has(l.action)).map(l => l.action));
    const bad = ka.filter(l => { const a = byName.get(l.action); return a && (l.label !== (clean(a.text) || l.label) || l.disabled === a.enabled || (a.shortcut && !a.shortcut.split(',').includes(l.kbd) && l.kbd !== a.shortcut)); });
    check(bad.length === 0, 'real: label, enabled state and shortcut of each entry come from the engine', bad.slice(0, 5));
    check(!w.all.some(l => BLOCKED.includes(l.action)), 'real: none of the BLOCKED actions is offered');
    const SAMPLE = [['File', 'create_copy'], ['File', 'file_documentinfo'], ['Edit', 'edit_cut'], ['Edit', 'edit_paste'], ['Edit', 'paste_new'], ['Edit', 'fill_selection_pattern'], ['Edit', 'fill_selection_pattern_opacity'],
        ['Edit', 'stroke_selection'], ['View', 'wrap_around_mode'], ['View', 'softProof'], ['View', 'view_pixel_grid'], ['View', 'view_snap_node'], ['View', 'mirror_canvas_around_cursor'], ['View', 'view_toggle_reference_images'],
        ['Image', 'image_properties'], ['Image', 'trim_to_image'], ['Image', 'shearimage'], ['Image', 'offsetimage'], ['Image', 'imagesplit'], ['Image', 'purge_unused_image_data'],
        ['Layer', 'add_new_clone_layer'], ['Layer', 'new_from_visible'], ['Layer', 'convert_to_paint_layer'], ['Layer', 'select_visible_layers'], ['Layer', 'quick_ungroup'],
        ['Layer', 'mirrorNodeX'], ['Layer', 'layersplit'], ['Layer', 'split_alpha_into_mask'], ['Layer', 'layer_style'], ['Select', 'reselect'], ['Select', 'growselection'], ['Select', 'colorrange'],
        ['Select', 'selectopaque_add'], ['Filter', 'filter_apply_again'], ['Filter', 'krita_filter_blur'], ['Filter', 'krita_filter_invert'], ['Settings', 'manage_resources'], ['Help', 'help_about_app']];
    const missing = SAMPLE.filter(([t, a]) => !ka.some(l => topOf(l) === t && l.action === a));
    check(SAMPLE.length >= 25 && missing.length === 0, `real: ${SAMPLE.length} sampled entries sit in the right menus`, missing);
    check(w.all.some(l => l.key === 'Layer>Transform>Rotate') || w.subs.some(s => s.startsWith('Layer>Transform>')), 'real: submenus nest more than one level (Layer > Transform > Rotate)', w.subs.filter(s => s.split('>').length > 2));
    check(w.all.filter(l => l.key === 'Settings>Dockers').length >= 20, 'real: Settings > Dockers lists the Krita dockers', w.all.filter(l => l.key === 'Settings>Dockers').length);
    check(w.all.filter(l => l.key === 'Filter>Blur' && l.action).length >= 3, 'real: Filter > Blur is filled from the filter list', w.all.filter(l => l.key === 'Filter>Blur').map(l => l.label));
    check(!w.all.some(l => /^Krita Dockers/.test(l.label)), 'real: no flat "Krita Dockers ›" entries any more');
    const dups = w.tops.flatMap(t => { const ls = w.all.filter(l => topOf(l) === t && !l.key.startsWith('Settings>Dockers')).map(l => norm(l.label)); return ls.filter((l, i) => ls.indexOf(l) !== i).map(l => `${t}: ${l}`); });
    check(dups.length === 0, 'real: no duplicate labels within a menu (page commands win)', dups);
    const disabled = ka.filter(l => l.disabled);
    check(disabled.length > 0, `real: ${disabled.length} entries are disabled (greyed)`);
    if (disabled.length) {
        await openPath(page, disabled[0].key); const before = await page.evaluate(() => document.querySelectorAll('.krita-dialog').length);
        await page.locator(`[data-action="${disabled[0].action}"]`).click({ force: true }); await sleep(300);
        check(await page.evaluate(() => document.querySelectorAll('.krita-dialog').length) === before, 'real: clicking a disabled entry does nothing');
    }
    // 1. Select > Select All (the page's own command) selects the whole image
    await openPath(page, 'Select'); await page.getByRole('menuitem', { name: /^Select All/ }).click(); await sleep(800);
    const cover = await page.evaluate(async () => { const o = await __engine.selectionOutline(), d = await __engine.documentInfo(), xs = [], ys = []; for (const c of o) for (let i = 0; i + 1 < c.length; i += 2) { xs.push(c[i]); ys.push(c[i + 1]); } return { w: d.width, h: d.height, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), n: o.length }; });
    check(cover.n > 0 && cover.x0 <= 1 && cover.y0 <= 1 && cover.x1 >= cover.w - 1 && cover.y1 >= cover.h - 1, 'real: Select > Select All selects the whole image', cover);
    // 2. Layer > New > New Layer From Visible (a Krita action) adds a layer
    const count = () => page.evaluate(async () => { const c = l => l.reduce((s, x) => s + 1 + c(x.children), 0); return c(await __engine.layers()); });
    const n0 = await count();
    await openPath(page, 'Layer>New'); await page.locator('[data-action=new_from_visible]').click(); await sleep(1200);
    check(await count() === n0 + 1, 'real: Layer > New > New Layer From Visible (Krita action) adds a layer', [n0, await count()]);
    // 3. Image > Shear Image... opens Krita's dialog; Escape closes it
    await openPath(page, 'Image'); await page.locator('[data-action=shearimage]').click(); await sleep(1500);
    const dlg = await page.locator('.krita-dialog').count();
    check(dlg === 1 && /Shear/.test(await page.locator('.krita-dialog').getAttribute('aria-label')), 'real: Image > Shear Image... shows Krita\'s dialog', await page.locator('.krita-dialog').evaluateAll(d => d.map(x => x.getAttribute('aria-label'))));
    await page.locator('.krita-dialog canvas').focus().catch(() => {}); await page.keyboard.press('Escape'); await sleep(800);
    check(await page.locator('.krita-dialog').count() === 0, 'real: Escape closes the dialog');
    // page's own commands still work: Edit > Undo takes the new layer back
    await openPath(page, 'Edit'); await page.getByRole('menuitem', { name: /^Undo/ }).click(); await sleep(1200);
    check(await count() === n0, 'real: page command Edit > Undo still works', [n0, await count()]);
    await openPath(page, 'File'); await page.getByRole('menuitem', { name: /^New…/ }).click();
    check(await page.evaluate(() => __app.get().newOpen), 'real: page command File > New… still opens its dialog');
    await page.evaluate(() => __app.set({ newOpen: false }));
    await openPath(page, 'Layer>Transform'); await page.screenshot({ path: `${SHOTS}krita-menus-real.png` });
    await page.context().close();
}
check(errors.length === 0, 'no page errors', errors.slice(0, 3));
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
