// Krita's own windows (tool options, dialogs), tool overlay, viewport and key input on the real engine.
// Needs a dev server on 5173. ENGINE_BASE=/engine-dev/ tests a build other than the default one.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const base = process.env.ENGINE_BASE ? `&engineBase=${process.env.ENGINE_BASE}` : '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage();
const log = [];
page.on('pageerror', e => log.push('PAGEERROR ' + e.message));
page.on('console', m => { const t = m.text().trim(); if (t && !/migration|vite|kf\.i18n|RAM|start-up|instantiated/.test(t)) log.push(t.slice(0, 300)); });
setTimeout(() => { console.log('FAILED: hard timeout'); console.log(log.slice(-12).join('\n')); process.exit(2); }, 420000);
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) failed++; };
const E = (fn, arg) => page.evaluate(({ fn, arg }) => Promise.race([eval(fn)(arg), new Promise((_, r) => setTimeout(() => r(new Error('engine call timed out')), 60000))]), { fn: fn.toString(), arg });
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, String(e.message).split('\n')[0] + ' | ' + log.slice(-4).join(' | ')); } };

await page.goto(`http://localhost:5173/?engine=wasm${base}`);
await page.waitForFunction(() => window.__engine && __engine.documentInfo().then(Boolean), null, { timeout: 150000 });
await page.waitForTimeout(1500);   // the app opens its own first document; let that finish
await E(async () => {
    window.sleep = ms => new Promise(r => setTimeout(r, ms));
    window.hash = async () => { const b = await __engine.exportDocument('png'); let h = 0; for (const x of b) h = (h * 31 + x) | 0; return h; };
    // Everything the engine says about its windows and overlay, kept for the checks below.
    window.W = { windows: new Map(), paints: new Map(), closed: [], overlays: [], tools: [], cursors: [] };
    const sum = px => { let h = 0, solid = 0; for (let i = 0; i < px.length; i += 4) { h = (h * 31 + px[i] + px[i + 1] * 3 + px[i + 2] * 7) | 0; if (px[i + 3]) solid++; } return { h, solid }; };
    __engine.on('kritaWindow', w => W.windows.set(w.id, w));
    __engine.on('kritaWindowClosed', id => { W.windows.delete(id); W.closed.push(id); });
    __engine.on('kritaWindowPaint', (id, width, height, px) => W.paints.set(id, { width, height, n: (W.paints.get(id)?.n ?? 0) + 1, ...sum(px) }));
    __engine.on('kritaOverlay', (rect, px) => W.overlays.push(px ? { rect, ...sum(px) } : null));
    __engine.on('kritaToolChanged', id => W.tools.push(id));
    __engine.on('kritaCursor', c => W.cursors.push(c));
    window.click = async (x, y, mods = {}) => { __engine.kritaPointer({ type: 'move', x, y, ...mods }); __engine.kritaPointer({ type: 'press', x, y, ...mods }); __engine.kritaPointer({ type: 'release', x, y, ...mods }); await sleep(150); };
    window.dragTo = async (a, b) => {
        __engine.kritaPointer({ type: 'move', ...a }); __engine.kritaPointer({ type: 'press', ...a });
        for (let i = 1; i <= 6; i++) __engine.kritaPointer({ type: 'move', down: true, x: a.x + (b.x - a.x) * i / 6, y: a.y + (b.y - a.y) * i / 6 });
        __engine.kritaPointer({ type: 'release', ...b }); await sleep(300);
    };
    await __engine.newDocument({ width: 600, height: 400 });
    for (const w of await __engine.kritaWindows()) W.windows.set(w.id, w);
    await sleep(500);
});

await step('new tools', async () => {
    const tools = (await E(() => __engine.kritaTools())).map(t => t.id);
    const want = ['KisToolPolygon', 'KisToolPolyline', 'KritaShape/KisToolDyna', 'KisAssistantTool', 'KarbonCalligraphyTool', 'KisToolEncloseAndFill', 'KritaShape/KisToolLazyBrush', 'KritaShape/KisToolSmartPatch', 'KisToolTransform', 'KisToolCrop'];
    const missing = want.filter(t => !tools.includes(t));
    check("Krita's remaining tools are present", missing.length === 0, missing.length ? `missing ${missing.join(', ')} | have ${tools.join(', ')}` : `${tools.length} tools`);
    const actions = new Set((await E(() => __engine.kritaActions())).map(a => a.name));
    const wantActions = ['rotateimage', 'imagesize', 'colorrange', 'offsetimage', 'shearimage', 'separate', 'waveletdecompose', 'layersplit', 'imagesplit', 'growselection'];
    const missingActions = wantActions.filter(a => !actions.has(a));
    check('extension actions are present', missingActions.length === 0, missingActions.length ? `missing ${missingActions.join(', ')}` : `${actions.size} actions`);
});

await step('tool options', async () => {
    const r = await E(async () => {
        const panel = [...W.windows.values()].find(w => w.kind === 'toolOptions');
        if (!panel) return { panel: null, all: [...W.windows.values()] };
        await __engine.setKritaTool('KritaShape/KisToolBrush'); await sleep(1500);
        const a = { ...W.paints.get(panel.id) };
        await __engine.setKritaTool('KisToolSelectRectangular'); await sleep(1500);
        const b = { ...W.paints.get(panel.id) };
        await __engine.resizeKritaWindow(panel.id, 260, 420); await sleep(400);
        const c = { ...W.paints.get(panel.id) };
        // a click in the panel should reach a widget and repaint something (focus ring, pressed button)
        __engine.kritaWindowInput(panel.id, { type: 'press', x: 60, y: 60 }); __engine.kritaWindowInput(panel.id, { type: 'release', x: 60, y: 60 }); await sleep(400);
        return { panel, a, b, c, d: { ...W.paints.get(panel.id) }, tools: W.tools };
    });
    check('tool option panel is a Krita window', Boolean(r.panel), JSON.stringify(r.panel ?? r.all));
    if (!r.panel) return;
    check('panel picture arrives and is not blank', r.a.n > 0 && r.a.solid > 1000, JSON.stringify(r.a));
    check('panel changes with the tool', r.a.h !== r.b.h, `${r.a.h} -> ${r.b.h}`);
    check('panel follows a resize', r.c.width === 260 && r.c.height === 420, `${r.c.width}x${r.c.height}`);
    check('kritaToolChanged is sent', r.tools.includes('KisToolSelectRectangular'), r.tools.join(','));
    console.log(`INFO  panel repaints after click: ${r.d.n - r.c.n}`);
});

await step('viewport and overlay', async () => {
    const r = await E(async () => {
        const o = {};
        o.view = await __engineCall('krita.viewport', { width: 900, height: 700, zoom: 2, offsetX: 120, offsetY: 80 });
        await __engine.setKritaTool('KisToolCrop'); await sleep(300);
        W.overlays.length = 0;
        await dragTo({ x: 100, y: 100 }, { x: 300, y: 250 });
        await sleep(400);
        o.overlay = W.overlays.filter(Boolean).at(-1) ?? null;
        o.count = W.overlays.length;
        __engine.kritaKey({ type: 'keydown', key: 'Escape' }); __engine.kritaKey({ type: 'keyup', key: 'Escape' });
        await sleep(400);
        await __engine.setKritaTool('KritaShape/KisToolBrush'); await sleep(400);
        o.after = W.overlays.at(-1);
        o.cursors = W.cursors;
        return o;
    });
    check('viewport is taken', Math.abs(r.view.shiftX) < 1.5 && Math.abs(r.view.shiftY) < 1.5, JSON.stringify(r.view));
    check('crop tool draws an overlay', Boolean(r.overlay) && r.overlay.solid > 200, JSON.stringify(r.overlay) + ` events ${r.count}`);
    // the crop frame spans image (100,100)-(300,250): on screen x 320..720, y 280..580 at zoom 2 with the offset
    if (r.overlay) check('overlay lines up with the page viewport', r.overlay.rect.x < 330 && r.overlay.rect.x + r.overlay.rect.width > 710 && r.overlay.rect.y < 290 && r.overlay.rect.y + r.overlay.rect.height > 570, JSON.stringify(r.overlay.rect));
    console.log(`INFO  cursors seen: ${[...new Set(r.cursors)].join(', ') || 'none'}; overlay after leaving the tool: ${JSON.stringify(r.after)}`);
});

await step('keys finish a tool', async () => {
    const r = await E(async () => {
        await __engineCall('krita.viewport', { width: 900, height: 700, zoom: 1, offsetX: 0, offsetY: 0 });
        await __engine.setKritaTool('KisToolPolygon');
        const h0 = await hash();
        await click(100, 100); await click(300, 120); await click(200, 300);
        __engine.kritaKey({ type: 'keydown', key: 'Enter' }); __engine.kritaKey({ type: 'keyup', key: 'Enter' });
        await sleep(800);
        return { drawn: (await hash()) !== h0 };
    });
    check('polygon tool: three clicks and Enter draw a shape', r.drawn);
});

await step('dialog', async () => {
    const r = await E(async () => {
        const o = {};
        const before = new Set(W.windows.keys());
        let done = false;
        const pending = __engine.triggerKritaAction('imagesize').then(() => { done = true; }, e => { done = 'error: ' + e.message; });
        await sleep(1500);
        const dialog = [...W.windows.values()].find(w => !before.has(w.id) && w.kind === 'dialog');
        o.dialog = dialog ?? null;
        o.others = [...W.windows.values()].filter(w => !before.has(w.id));
        if (!dialog) return o;
        o.paint = W.paints.get(dialog.id);
        o.blockedWhileOpen = done === false;
        o.infoWhileOpen = await Promise.race([__engine.documentInfo().then(i => i.width), sleep(5000).then(() => 'no answer')]);
        __engine.kritaWindowInput(dialog.id, { type: 'keydown', key: 'Escape' }); __engine.kritaWindowInput(dialog.id, { type: 'keyup', key: 'Escape' });
        await Promise.race([pending, sleep(5000)]);
        o.closed = W.closed.includes(dialog.id);
        o.done = done;
        return o;
    });
    check('Image > Scale opens a Krita dialog', Boolean(r.dialog), JSON.stringify(r.dialog ?? r.others));
    if (!r.dialog) return;
    check('dialog is modal and painted', r.dialog.modal && r.paint && r.paint.solid > 5000, `${r.dialog.title} ${r.dialog.width}x${r.dialog.height} ${JSON.stringify(r.paint)}`);
    check('engine still answers while the dialog is open', r.infoWhileOpen === 600, String(r.infoWhileOpen));
    check('Escape closes it and the action returns', r.closed && r.done === true, `closed ${r.closed} done ${r.done}`);
});

await step('action definitions', async () => {
    const a = await E(() => __engine.kritaActions());
    const blank = a.filter(x => !x.text).length;
    check('actions have their texts', blank < a.length / 10, `${blank} of ${a.length} blank`);
    const split = a.filter(x => /split_alpha_(write|save_merged)/.test(x.name));
    check('activation conditions apply (split alpha is off on a paint layer)', split.length === 2 && split.every(x => !x.enabled), JSON.stringify(split.map(x => [x.name, x.enabled])));
});

// Opens a dialog through an action, reports it, closes it with Escape.
const dialogOf = action => E(async action => {
    const o = {}, before = new Set(W.windows.keys());
    let done = false;
    const pending = __engine.triggerKritaAction(action).then(() => { done = true; }, e => { done = 'error: ' + e.message; });
    await sleep(2500);
    const dialog = [...W.windows.values()].filter(w => !before.has(w.id) && w.kind === 'dialog').pop();
    o.dialog = dialog ?? null; o.done0 = done;
    if (!dialog) return o;
    o.answers = await Promise.race([__engine.documentInfo().then(i => i.width), sleep(5000).then(() => 'no answer')]);
    __engine.kritaWindowInput(dialog.id, { type: 'keydown', key: 'Escape' }); __engine.kritaWindowInput(dialog.id, { type: 'keyup', key: 'Escape' });
    await Promise.race([pending, sleep(8000)]);
    o.closed = W.closed.includes(dialog.id); o.done = done;
    return o;
}, action);

await step('dialogs that used to break', async () => {
    for (const [action, minW, minH] of [['options_configure', 600, 400], ['file_documentinfo', 400, 300], ['add_new_fill_layer', 300, 200], ['convert_to_filter_mask', 300, 200]]) {
        const r = await dialogOf(action);
        check(`${action}: dialog has its real size`, Boolean(r.dialog) && r.dialog.width >= minW && r.dialog.height >= minH, JSON.stringify(r.dialog ?? r.done0));
        if (r.dialog) check(`${action}: engine answers, Escape closes`, r.answers === 600 && r.closed && r.done === true, JSON.stringify({ answers: r.answers, closed: r.closed, done: r.done }));
    }
});

await step('file dialogs go to the page', async () => {
    const r = await E(async () => {
        const o = {}, reqs = [], downloads = [];
        __engine.on('kritaFileDialog', q => reqs.push(q)); __engine.on('kritaDownload', (n, b) => downloads.push([n, b.length]));
        const png = await __engine.exportDocument('png');
        const count = async () => { const f = l => l.reduce((n, x) => n + 1 + f(x.children ?? []), 0); return f(await __engine.layers()); };
        const n0 = await count();
        let done = false;
        let p = __engine.triggerKritaAction('import_layer_from_file').then(() => { done = true; }, e => { done = e.message; });
        await sleep(1500);
        o.asked = reqs.length === 1 && !reqs[0].save;
        if (reqs[0]) await __engine.answerKritaFileDialog(reqs[0].id, [{ name: 'in.png', bytes: png }]);
        await Promise.race([p, sleep(10000)]);
        o.imported = done; o.added = (await count()) - n0;
        done = false;
        p = __engine.triggerKritaAction('file_open').then(() => { done = true; }, e => { done = e.message; });
        await sleep(1500);
        if (reqs[1]) await __engine.answerKritaFileDialog(reqs[1].id, []);
        await Promise.race([p, sleep(8000)]);
        o.cancelled = done; o.width = (await __engine.documentInfo()).width;
        return o;
    });
    check('import layer asks the page for a file', r.asked, JSON.stringify(r));
    check('the picked file becomes a layer', r.imported === true && r.added === 1, JSON.stringify(r));
    check('cancelling Open returns', r.cancelled === true && r.width === 600, JSON.stringify(r));
});

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
if (failed) console.log(log.slice(-10).join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
