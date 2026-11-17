// Parity sweep: exercises every Krita action, tool and docker the real engine exposes and records what happens.
// Needs a dev server:  cd web && npx vite --port 5193 --strictPort      (PORT=... to change)
//   node web/tests/parity-sweep.mjs                 all parts, resuming from docs/parity/results/*.json
//   PART=actions|tools|menus|dockers|report         one part
//   ONLY=regex                                      only names/ids matching (re-runs them, overwriting their records)
//   FRESH=1                                         ignore earlier results
// Results: docs/parity/results/{inventory,actions,tools,dockers,menus}.json, pictures in docs/parity/pictures/,
// report in docs/parity/REPORT.md (PART=report rebuilds it from the JSON and docs/parity/NOTES.md).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/parity');
const RES = path.join(OUT, 'results');
const PIC = path.join(OUT, 'pictures');
for (const d of [RES, PIC + '/actions', PIC + '/tools', PIC + '/dockers']) fs.mkdirSync(d, { recursive: true });
const URL_ = `http://localhost:${process.env.PORT ?? 5193}/?engine=wasm`;
const PART = process.env.PART ?? 'all';
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const FRESH = !!process.env.FRESH;
const want = p => PART === 'all' || PART === p;
const safe = s => s.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 80);
const load = f => { try { return FRESH ? {} : JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8')); } catch { return {}; } };
const save = (f, o) => fs.writeFileSync(path.join(RES, f), JSON.stringify(o, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------- browser
let browser = null, page = null, consoleTail = [], pageErrors = [], crashed = false;
async function launch(tries = 3) {
    try { await launch1(); } catch (e) { if (tries <= 1) throw e; console.log('launch failed (' + String(e.message).split('\n')[0] + '), retrying'); await launch(tries - 1); }
}
async function launch1() {
    if (browser) { try { await Promise.race([browser.close(), sleep(5000)]); } catch {} }
    browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
    page = await browser.newPage();
    consoleTail = []; pageErrors = []; crashed = false;
    page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 300)));
    page.on('crash', () => { crashed = true; });
    page.on('console', m => { const t = m.text().trim(); if (t && !/migration|vite|kf\.i18n|RAM|start-up|instantiated/.test(t)) { consoleTail.push(t.slice(0, 240)); if (consoleTail.length > 40) consoleTail.shift(); } });
    // other people edit the app while this runs; a vite hot reload would reload the page under the sweep, so cut it off
    await page.route('**/@vite/client', r => r.fulfill({ contentType: 'text/javascript', body: 'export function createHotContext(){return{accept(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){}}};export function updateStyle(){};export function removeStyle(){};export function injectQuery(u){return u};export const ErrorOverlay=class{};' }));
    await page.goto(URL_);
    await page.waitForFunction(() => window.__engine && __engine.documentInfo().then(Boolean), null, { timeout: 180000 });
    await sleep(3000);
    await page.evaluate(install);
}
/** Runs fn(arg) in the page; a page that does not answer within `ms` counts as dead. */
async function inPage(fn, arg, ms = 90000) {
    let timer;
    try {
        return await Promise.race([page.evaluate(fn, arg), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('PAGE_TIMEOUT')), ms); })]);
    } finally { clearTimeout(timer); }
}
const gone = e => crashed || page.isClosed() || /closed|crash|Target|Execution context|navigation/i.test(String(e?.message));
const isDead = e => gone(e) || /PAGE_TIMEOUT/.test(String(e?.message));

// ---------------------------------------------------------------------------------------------- page helpers
function install() {
    const S = window.S = { win: new Map(), paint: new Map(), msgs: [], tools: [], hist: null, overlays: 0, overlayPx: 0, lastOverlay: null, imgUpd: 0, sel: null };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    S.sleep = sleep;
    S.race = (p, ms, v = 'TIMEOUT') => Promise.race([p, sleep(ms).then(() => v)]);
    const sum = px => { let h = 0, solid = 0; for (let i = 0; i < px.length; i += 4) { h = (h * 31 + px[i] + px[i + 1] * 3 + px[i + 2] * 7) | 0; if (px[i + 3]) solid++; } return { h, solid }; };
    __engine.on('kritaWindow', w => S.win.set(w.id, w));
    __engine.on('kritaWindowPaint', (id, width, height, px) => S.paint.set(id, { width, height, n: (S.paint.get(id)?.n ?? 0) + 1, px: new Uint8Array(px), ...sum(px) }));
    __engine.on('kritaWindowClosed', id => { S.win.delete(id); });
    __engine.on('kritaMessage', t => S.msgs.push(t));
    __engine.on('kritaToolChanged', id => S.tools.push(id));
    __engine.on('kritaOverlay', (rect, px) => { S.overlays++; if (px) { S.overlayPx++; S.lastOverlay = { rect, ...sum(px) }; } });
    __engine.on('imageUpdate', () => S.imgUpd++);
    __engine.on('historyChanged', h => { S.hist = h; });
    __engine.on('selectionChanged', b => { S.sel = b; });
    S.hash = async () => { try { const b = await __engine.exportDocument('png'); let h = 0; for (const x of b) h = (h * 31 + x) | 0; return h; } catch (e) { return 'ERR ' + String(e.message).slice(0, 60); } };
    S.snap = async name => {
        const acts = await S.race(__engine.kritaActions(), 8000, []);
        const me = acts.find(a => a.name === name);
        return {
            hash: await S.race(S.hash(), 10000, 'NOHASH'),
            layers: JSON.stringify(await S.race(__engine.layers(), 5000, 'x')),
            sel: JSON.stringify(await S.race(__engine.selectionOutline(), 5000, 'x')),
            hist: JSON.stringify(S.hist),
            info: JSON.stringify(await S.race(__engine.documentInfo(), 5000, 'x')),
            colors: JSON.stringify(await S.race(__engine.colors(), 5000, 'x')),
            brush: JSON.stringify(await S.race(__engine.brushState(), 5000, 'x')),
            anim: JSON.stringify(await S.race(__engine.animation(), 5000, 'x')),
            active: JSON.stringify(await S.race(__engine.activeNode(), 5000, 'x')) + JSON.stringify(await S.race(__engine.activeNode().then(id => id && __engine.keyframes(id)), 5000, 'x')),
            acts: acts.map(a => (a.enabled ? 1 : 0) + '' + (a.checked ? 1 : 0)).join(''),
            checked: me ? me.checked : null, enabled: me ? me.enabled : null,
        };
    };
    S.png = id => {   // latest picture of a window as base64 PNG
        const p = S.paint.get(id); if (!p) return null;
        const c = document.createElement('canvas'); c.width = p.width; c.height = p.height;
        c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.px.buffer, p.px.byteOffset, p.px.length), p.width, p.height), 0, 0);
        return c.toDataURL('image/png').split(',')[1];
    };
    S.stroke = async pts => {
        let t = 0;
        __engine.beginStroke({ x: pts[0][0], y: pts[0][1], pressure: 0.8, timeMs: t });
        __engine.continueStroke(pts.slice(1).map(p => ({ x: p[0], y: p[1], pressure: 0.8, timeMs: (t += 12) })));
        __engine.endStroke();
        await __engine.documentInfo();
    };
    /** A small document with paint: white background with a stroke, a second layer with strokes, a selection. */
    S.setup = async kind => {
        S.msgs.length = 0;
        await __engine.newDocument({ width: 400, height: 300, background: { r: 1, g: 1, b: 1, a: 1 } });
        await __engine.setKritaTool('KritaShape/KisToolBrush');
        await __engine.setColors({ foreground: { r: 0.8, g: 0.1, b: 0.1, a: 1 }, background: { r: 0.1, g: 0.2, b: 0.8, a: 1 } });
        await __engine.setBrush({ size: 20 });
        await S.stroke([[40, 40], [120, 90], [200, 60], [300, 140], [360, 220]]);
        const l2 = await __engine.addNode({ type: 'paint', name: 'Layer 2' });
        await __engine.setActiveNode(l2);
        await __engine.setColors({ foreground: { r: 0.1, g: 0.6, b: 0.2, a: 1 } });
        await S.stroke([[60, 250], [140, 180], [220, 230], [330, 120]]);
        await S.stroke([[100, 60], [100, 200]]);
        await __engine.selectRect({ x: 50, y: 40, width: 220, height: 160 }, 'replace');
        if (kind === 'vector') { const v = await __engine.addNode({ type: 'vector', name: 'Vector 1' }); await __engine.setActiveNode(v); }
        if (kind === 'group') { const g = await __engine.addNode({ type: 'group', name: 'Group 1' }); const c = await __engine.addNode({ type: 'paint', name: 'In group', parent: g }); await __engine.setActiveNode(c); await S.stroke([[150, 150], [250, 250]]); await __engine.setActiveNode(g); }
        if (kind === 'mask') { const m = await __engine.addNode({ type: 'transparencyMask', name: 'Mask 1', parent: l2 }); await __engine.setActiveNode(m); }
        if (kind === 'anim') { try { await __engine.addKeyframe(l2, 0); await __engine.addKeyframe(l2, 4, { copy: true }); await __engine.setAnimation({ endTime: 8 }); } catch (e) { S.animErr = String(e.message); } }
        if (kind === 'base') { try { await S.race(__engine.triggerKritaAction('edit_copy'), 4000); } catch {} }
        await S.sleep(300);
        S.msgs.length = 0; S.tools.length = 0;
    };
    S.enabledMap = async kind => { await S.setup(kind); const m = {}; for (const a of await __engine.kritaActions()) m[a.name] = a.enabled; return m; };
    const NOTBOX = w => w.kind !== 'toolOptions';
    S.newWins = known => [...S.win.values()].filter(w => !known.has(w.id) && NOTBOX(w));
    S.winRec = w => ({ id: w.id, title: w.title, kind: w.kind, width: w.width, height: w.height, modal: w.modal, docker: w.docker });
    S.pixHash = id => { const p = S.paint.get(id); return p ? `${p.h}:${p.solid}:${p.width}x${p.height}` : null; };
    const key = (id, k) => { __engine.kritaWindowInput(id, { type: 'keydown', key: k }); __engine.kritaWindowInput(id, { type: 'keyup', key: k }); };
    S.key = key;
    /** Closes the windows opened since `known`: Escape, then closeKritaWindow. Returns how each closed. */
    S.closeNew = async (known, isPending) => {
        const how = [];
        for (let round = 0; round < 8; round++) {
            const ws = S.newWins(known).sort((a, b) => b.id - a.id);
            if (!ws.length) break;
            const w = ws[0];
            key(w.id, 'Escape');
            const t0 = performance.now();
            while (S.win.has(w.id) && performance.now() - t0 < 2500) await sleep(50);
            if (!S.win.has(w.id)) { how.push('Escape'); continue; }
            await S.race(__engine.closeKritaWindow(w.id), 3000);
            await sleep(500);
            if (!S.win.has(w.id)) { how.push('closeKritaWindow'); continue; }
            how.push('STUCK'); break;
        }
        return how;
    };
    /** Waits until the new windows stop repainting and resizing (dialogs build their layout after they open). */
    S.settle = async known => {
        const sig = () => S.newWins(known).map(w => `${w.id}:${w.width}x${w.height}:${S.paint.get(w.id)?.n ?? 0}`).join(',');
        let last = sig(), still = 0;
        for (let i = 0; i < 40 && still < 5; i++) { await sleep(150); const c = sig(); still = c === last ? still + 1 : 0; last = c; }
    };
    S.runAction = async ({ name, fixture, timeout }) => {
        const rec = { fixture };
        await S.setup(fixture);
        const before = await S.snap(name);
        const known = new Set(S.win.keys());
        S.msgs.length = 0; S.tools.length = 0; S.overlayPx = 0; S.imgUpd = 0;
        let state = 'pending', err = null; const t0 = performance.now();
        const p = __engine.triggerKritaAction(name).then(() => { state = 'done'; }, e => { state = 'error'; err = String(e?.message ?? e); });
        while (state === 'pending' && performance.now() - t0 < timeout && !S.newWins(known).length) await sleep(40);
        rec.ms = Math.round(performance.now() - t0);
        await sleep(state === 'pending' ? 900 : 500);   // pictures and late windows
        const seen = new Map();
        const grab = () => { for (const w of S.newWins(known)) { const ph = S.pixHash(w.id), e = seen.get(w.id); if (!e || e.picture !== ph || e.width !== w.width) seen.set(w.id, { ...S.winRec(w), picture: ph, png: S.png(w.id) }); } };
        grab();
        if (seen.size) { await S.settle(known); grab(); rec.windows = [...seen.values()]; rec.closedBy = await S.closeNew(known); }
        if (state === 'pending') {            // waits on a window, or hangs
            const t1 = performance.now();
            while (state === 'pending' && performance.now() - t1 < (seen.size ? 25000 : 4000)) {
                grab();
                if (S.newWins(known).length) { await S.settle(known); grab(); rec.closedBy = (rec.closedBy ?? []).concat(await S.closeNew(known)); rec.windows = [...seen.values()]; }
                await sleep(100);
            }
            if (state === 'pending') { rec.pending = true; }
        }
        if (seen.size && !rec.windows) rec.windows = [...seen.values()];
        rec.windows = rec.windows ? [...new Map([...seen.values()].map(w => [w.id, w])).values()] : undefined;
        rec.alive = (await S.race(__engine.documentInfo(), 6000, null)) !== null;
        rec.state = state; if (err) rec.error = err;
        if (!rec.alive || rec.pending) { rec.needReload = true; return rec; }
        // leftover windows opened late
        if (S.newWins(known).length) { await S.settle(known); grab(); rec.windows = [...seen.values()]; rec.closedBy = (rec.closedBy ?? []).concat(await S.closeNew(known)); }
        let after = await S.snap(name);
        const diff = (b, a) => ({
            image: b.hash !== a.hash, layers: b.layers !== a.layers, selection: b.sel !== a.sel, history: b.hist !== a.hist,
            docinfo: b.info !== a.info, colors: b.colors !== a.colors, brush: b.brush !== a.brush, animation: b.anim !== a.anim, activeNode: b.active !== a.active, enabledSet: b.acts !== a.acts, checked: b.checked !== a.checked,
        });
        let d = diff(before, after);
        if (!Object.values(d).some(Boolean) && !S.msgs.length && !S.tools.length && !seen.size && state !== 'error') { await sleep(1800); after = await S.snap(name); d = diff(before, after); }
        rec.diff = d;
        rec.messages = [...S.msgs]; rec.toolChanged = [...S.tools]; rec.overlayPixels = S.overlayPx; rec.imageUpdates = S.imgUpd;
        rec.enabledAfter = after.enabled;
        // a toolOptions window may have changed too; not recorded here (see tools part)
        return rec;
    };
}

const classify = r => {
    if (r.crash) return 'crash';
    if (r.hang) return 'hang';
    if (r.state === 'error') return 'error';
    if (r.windows?.some(w => w.kind === 'dialog')) return 'opened dialog';
    if (r.windows?.some(w => w.kind === 'popup')) return 'opened popup';
    if (r.windows?.some(w => w.kind === 'docker')) return 'opened docker';
    const d = r.diff ?? {};
    if (d.image) return 'changed image';
    if (d.layers || d.selection || d.history || d.docinfo || d.colors || d.brush || d.animation || d.activeNode || d.checked || r.toolChanged?.length) return 'changed layers/selection/history/view';
    if (r.messages?.length) return 'message';
    return 'no visible effect';
};

const savePicture = (dir, base, b64, seenPics) => {
    if (!b64) return null;
    const key = b64.length + ':' + b64.slice(-64);
    if (seenPics[key]) return seenPics[key];
    const f = `${dir}/${safe(base)}.png`;
    fs.writeFileSync(path.join(PIC, f), Buffer.from(b64, 'base64'));
    seenPics[key] = f; return f;
};

// ---------------------------------------------------------------------------------------------- actions
const DANGER = /^(file_quit|file_close|file_close_all|file_open|file_open_recent|file_new|file_save|file_save_as|file_import_.*|file_export_.*|file_sessions|render_animation.*|import_layer.*|save_node_as_image|save_groups_as_images|save_vector_node_to_svg|create_template|create_copy|open_resources_directory|manage_bundles|manage_resources|split_alpha_save_merged|split_alpha_write|paste_as_reference|ToolReferenceImages|create_reference_image.*|view_print_size|switch_application_language|help_.*|tablet_debugger|samplescreencolor|view_detached_canvas|view_newwindow|windows_.*|fullscreen|reset_configurations|options_configure_toolbars|options_configure|save_incremental_version|save_incremental_backup|add_new_file_layer|convert_to_file_layer|file_documentinfo|command_bar_open|window|theme_menu|style_menu|settings_dockers_menu|view_toggledockers|view_toggledockertitlebars|lock_toolbars|mainToolBar|editToolBar|BrushesAndStuff|customToolBar[12]|expanding_spacer_[01])$/;
const FIXTURE_HINT = [
    [/^(add_new_shape_layer|stroke_shapes|convert_shapes_to_vector_selection|convert_selection_to_shape|object_.*|path.*|convert-to-path|save_vector_node_to_svg|svg_.*|text_type.*|.*flow.*|put_text_on_path|remove_shapes.*|calligraphy_.*)$/, 'vector'],
    [/^(quick_ungroup|flatten_layer|convert_group_to_animated|isolate_active_group|save_groups_as_images|LayerGroupSwitcher.*|create_quick_.*)/, 'group'],
    [/^(convert_to_.*mask|convert_to_selection_mask|convert_to_filter_mask|convert_to_transparency_mask|add_new_.*mask)$/, 'mask'],
    [/^(convert_to_animated|pin_to_timeline|render_animation.*)$/, 'anim'],
];

async function runActions() {
    const inv = JSON.parse(fs.readFileSync(path.join(RES, 'inventory.json'), 'utf8'));
    const results = load('actions.json');
    const all = inv.actions.map(a => a.name);
    const todo = all.filter(n => (!ONLY || ONLY.test(n)) && (ONLY || !results[n]));
    const normal = todo.filter(n => !DANGER.test(n)), danger = todo.filter(n => DANGER.test(n));
    console.log(`actions: ${all.length} total, ${normal.length} normal + ${danger.length} dangerous to run`);
    const pics = {};
    for (const r of Object.values(results)) for (const w of r.windows ?? []) if (w.file) pics[w.pkey ?? w.file] = w.file;
    const fixtures = ['base', 'vector', 'group', 'mask', 'anim'];
    let enabledBy = null;
    const record = (name, r) => {
        for (const w of r.windows ?? []) { w.file = savePicture('actions', `${name}__${w.title}`, w.png, pics); delete w.png; }
        r.outcome = classify(r); r.text = inv.actions.find(a => a.name === name)?.text; r.when = new Date().toISOString();
        if (results[name]) r.previous = { outcome: results[name].outcome, error: results[name].error, when: results[name].when };
        results[name] = r; save('actions.json', results);
        console.log(`${name.padEnd(44)} ${r.fixture ?? ''} ${r.outcome}${r.windows ? ' [' + r.windows.map(w => w.title + ' ' + w.width + 'x' + w.height).join('; ') + ']' : ''}${r.error ? ' ERR ' + r.error.slice(0, 80) : ''}`);
    };
    const batchRun = async (names, perBatch) => {
        let sinceLaunch = 1e9;
        for (const name of names) {
            if (sinceLaunch >= perBatch || !page || page.isClosed() || crashed) { await launch(); sinceLaunch = 0; enabledBy = null; }
            if (!enabledBy) { for (let k = 0; k < 3 && !enabledBy; k++) { try { enabledBy = {}; for (const f of fixtures) enabledBy[f] = await inPage(k => S.enabledMap(k), f, 60000); } catch (e) { enabledBy = null; console.log('enabled map failed, relaunching: ' + String(e.message).slice(0, 80)); await launch(); } } sinceLaunch = 0; }
            const a = inv.actions.find(x => x.name === name);
            const pref = FIXTURE_HINT.find(([re]) => re.test(name))?.[1];
            const order = [pref, ...fixtures].filter(Boolean);
            const fixture = order.find(f => enabledBy[f][name]);
            sinceLaunch++;
            if (!fixture) { sinceLaunch--; const r0 = { fixture: pref ?? 'base', enabled: false, enabledIn: [], outcome: 'disabled', text: a?.text, when: new Date().toISOString() }; results[name] = r0; save('actions.json', results); console.log(`${name.padEnd(44)} disabled`); continue; }
            const enabledIn = fixtures.filter(f => enabledBy[f][name]);
            consoleTail.length = 0; pageErrors.length = 0;
            let r, tries = [];
            for (let attempt = 0; attempt < 2; attempt++) {
                if (attempt) { await launch(); sinceLaunch = 1; enabledBy = null; }
                consoleTail.length = 0; pageErrors.length = 0;
                try { r = await inPage(o => S.runAction(o), { name, fixture, timeout: 9000 }, 90000); }
                catch (e) { r = { fixture, state: 'pending', [gone(e) ? 'crash' : 'hang']: true, error: String(e.message).slice(0, 200) }; sinceLaunch = 1e9; }
                if (r.needReload) { sinceLaunch = 1e9; r.hang = true; if (r.alive) r.note = 'call never returned; engine still answered'; }
                r.enabled = true; r.enabledIn = enabledIn;
                if (pageErrors.length) r.pageErrors = pageErrors.slice(0, 3);
                const aborted = consoleTail.some(l => /Aborted\(|RuntimeError|worker sent an error|memory access out of bounds/.test(l));
                if (consoleTail.length && (r.hang || r.crash || aborted || r.state === 'error' || pageErrors.length)) r.console = consoleTail.slice(-6);
                if (aborted && !r.crash) { r.crash = true; r.note = (r.note ?? '') + ' console shows a wasm trap'; sinceLaunch = 1e9; }
                tries.push(classify(r));
                if (!(r.hang || r.crash)) break;
            }
            if (tries.length > 1) { r.attempts = tries; r.reproduced = Boolean(r.hang || r.crash); }
            record(name, r);
        }
    };
    await batchRun(normal, process.env.ISOLATE ? 1 : 60);
    // dangerous ones: each in its own page, last
    for (const name of danger) await batchRun([name], 1);
    if (browser) { await browser.close(); browser = null; page = null; }
}

async function writeInventory() {
    await launch();
    const inv = await inPage(async () => ({
        actions: await __engine.kritaActions(), tools: await __engine.kritaTools(), dockers: await __engine.kritaDockers(), windows: await __engine.kritaWindows(),
    }), null, 60000);
    save('inventory.json', inv);
    console.log(`inventory: ${inv.actions.length} actions, ${inv.tools.length} tools, ${inv.dockers.length} dockers`);
}

// ---------------------------------------------------------------------------------------------- dockers
async function runDockers() {
    const inv = JSON.parse(fs.readFileSync(path.join(RES, 'inventory.json'), 'utf8'));
    const results = load('dockers.json'); const pics = {};
    for (const d of inv.dockers) {
        if ((ONLY && !ONLY.test(d.id)) || (!ONLY && results[d.id])) continue;
        if (!page || page.isClosed() || crashed || Object.keys(results).length % 8 === 7) await launch();
        let r;
        try {
            r = await inPage(async id => {
                const o = { id };
                await S.setup('base'); await S.sleep(300);
                const before = new Set(S.win.keys());
                const t0 = performance.now();
                let call = 'pending';
                const p = __engine.showKritaDocker(id, true).then(() => { call = 'ok'; }, e => { call = 'error: ' + e.message; });
                let w = null;
                while (performance.now() - t0 < 25000) { w = [...S.win.values()].find(x => x.kind === 'docker' && (x.docker === id || !before.has(x.id)) ); if (w && S.paint.get(w.id)) break; await S.sleep(50); }
                o.callReturned = call; o.openMs = Math.round(performance.now() - t0);
                if (!w) { o.noWindow = true; o.windows = [...S.win.values()].map(S.winRec); return o; }
                await S.sleep(800);
                w = S.win.get(w.id) ?? w;
                o.window = S.winRec(w); const pa = S.paint.get(w.id); o.paintEvents = pa?.n; o.solid = pa?.solid; o.total = pa ? pa.width * pa.height : 0; o.picture = S.pixHash(w.id);
                // sample colours: is it more than one flat colour?
                if (pa) { const set = new Set(); for (let i = 0; i < pa.px.length; i += 4 * 37) set.add((pa.px[i] << 16) | (pa.px[i + 1] << 8) | pa.px[i + 2]); o.distinctColours = set.size; }
                o.png = S.png(w.id);
                const n0 = pa?.n ?? 0, h0 = pa?.h;
                const cx = Math.round(w.width / 2), cy = Math.round(w.height / 2);
                __engine.kritaWindowInput(w.id, { type: 'move', x: cx, y: cy }); __engine.kritaWindowInput(w.id, { type: 'press', x: cx, y: cy }); __engine.kritaWindowInput(w.id, { type: 'release', x: cx, y: cy });
                await S.sleep(900);
                const pb = S.paint.get(w.id); o.repaintsAfterClick = (pb?.n ?? 0) - n0; o.changedAfterClick = pb?.h !== h0;
                o.popupsAfterClick = [...S.win.values()].filter(x => x.kind === 'popup').map(S.winRec);
                for (const x of o.popupsAfterClick) S.key(x.id, 'Escape');
                await S.sleep(300);
                const q = await S.race(__engine.documentInfo(), 5000, null); o.aliveAfter = q !== null;
                await S.race(__engine.showKritaDocker(id, false), 8000);
                await S.sleep(300);
                o.hidden = ![...S.win.values()].some(x => x.id === w.id);
                return o;
            }, d.id, 80000);
        } catch (e) { r = { id: d.id, [isDead(e) ? 'crash' : 'hang']: true, error: String(e.message).slice(0, 200) }; await launch(); }
        if (pageErrors.length) r.pageErrors = pageErrors.slice(0, 3);
        if (r.png) { r.file = savePicture('dockers', d.id, r.png, pics); delete r.png; }
        r.title = d.title;
        r.outcome = r.crash ? 'crash' : r.hang ? 'hang' : r.noWindow ? 'no window' : (r.distinctColours ?? 0) < 3 ? 'blank' : r.aliveAfter === false ? 'engine stopped answering' : r.changedAfterClick ? 'opens, repaints on click' : 'opens, no repaint on click';
        results[d.id] = r; save('dockers.json', results);
        console.log(`${d.id.padEnd(26)} ${r.outcome} ${r.openMs ?? ''}ms ${r.window ? r.window.width + 'x' + r.window.height : ''}`);
    }
}

// ---------------------------------------------------------------------------------------------- tools
// Gesture per tool. 'raster' runs on a painted paint layer, 'vector' on a vector layer (where it creates shapes).
const T = {
    drag: [[60, 60], [150, 100], [240, 80], [300, 160]],
};

function writeReport() {
    const R = f => load(f);
    const inv = JSON.parse(fs.readFileSync(path.join(RES, 'inventory.json'), 'utf8'));
    const A = R('actions.json'), Tl = R('tools.json'), D = R('dockers.json'), M = R('menus.json');
    const count = (o, f) => { const c = {}; for (const v of Object.values(o)) c[f(v)] = (c[f(v)] ?? 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]); };
    const esc = t => String(t ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const tbl = (head, rows) => rows.length ? `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map(r => `| ${r.map(esc).join(' | ')} |`).join('\n')}\n` : '_none_\n';
    const menuOf = {}; for (const r of M.rows ?? []) (menuOf[r.action] ??= []).push(r.path);
    const txt = n => (inv.actions.find(a => a.name === n)?.text ?? '').replace(/&(?!&)/g, '') || (M.rows?.find(r => r.action === n)?.text ?? '');
    let o = `# Krita parity sweep report\n\nGenerated ${new Date().toISOString()} by \`web/tests/parity-sweep.mjs\` from \`docs/parity/results/*.json\` (engine in \`web/public/engine\`, Chromium + swiftshader).\n\n`;
    o += `## Headline counts\n\n### Actions (${Object.keys(A).length} of ${inv.actions.length} swept)\n\n${tbl(['outcome', 'count'], count(A, v => v.outcome))}\n`;
    o += `### Tools (${Object.keys(Tl).length} of ${inv.tools.length})\n\n${tbl(['outcome (raster + vector gestures)', 'count'], count(Tl, v => v.outcome))}\nTool option window: ${Object.values(Tl).filter(t => t.optionBlank).length} blank, ${Object.values(Tl).filter(t => t.optionSameAsPrevious).length} identical to the previous tool's.\n\n`;
    o += `### Dockers (${Object.keys(D).length} of ${inv.dockers.length})\n\n${tbl(['outcome', 'count'], count(D, v => v.outcome))}\n`;
    try { o += '\n' + fs.readFileSync(path.join(OUT, 'NOTES.md'), 'utf8') + '\n'; } catch { o += '\n_(docs/parity/NOTES.md missing)_\n'; }
    o += `\n---\n# Appendix: generated tables\n\n## A1. Actions that hang, crash or error\n\n`;
    o += tbl(['action', 'text', 'menu', 'outcome', 'observed'], Object.entries(A).filter(([, v]) => ['hang', 'crash', 'error'].includes(v.outcome)).map(([n, v]) => [n, txt(n), (menuOf[n] ?? ['-']).join('; '), v.outcome, v.error ?? v.note ?? '']));
    o += `\n## A2. Actions that opened a dialog or popup (picture saved)\n\n`;
    o += tbl(['action', 'text', 'window title', 'size', 'closed by', 'returned', 'picture'], Object.entries(A).filter(([, v]) => v.windows?.length).flatMap(([n, v]) => v.windows.map(w => [n, txt(n), `${w.kind}: ${w.title}`, `${w.width}x${w.height}${w.modal ? ' modal' : ''}`, (v.closedBy ?? []).join(','), v.state, w.file ?? ''])));
    o += `\n## A3. Actions that were enabled but had no visible effect\n\n`;
    o += tbl(['action', 'text', 'menu', 'fixture', 'definition (.action)'], Object.entries(A).filter(([, v]) => v.outcome === 'no visible effect').map(([n, v]) => [n, txt(n), (menuOf[n] ?? ['-']).join('; '), v.fixture, M.rows?.find(r => r.action === n)?.definition?.category ?? '']));
    o += `\n## A4. Actions disabled in every fixture (base, vector layer, group, mask, animated)\n\n`;
    o += tbl(['action', 'text', 'menu'], Object.entries(A).filter(([, v]) => v.outcome === 'disabled').map(([n]) => [n, txt(n), (menuOf[n] ?? ['-']).join('; ')]));
    o += `\n## A5. Every action\n\n`;
    o += tbl(['action', 'text', 'fixture', 'outcome', 'detail'], Object.entries(A).map(([n, v]) => [n, txt(n), v.fixture, v.outcome, [v.windows?.map(w => w.title).join('/'), v.messages?.join('/'), v.error, v.diff && Object.entries(v.diff).filter(([, x]) => x).map(([k]) => k).join('+')].filter(Boolean).join(' ; ')]));
    o += `\n## T1. Tools\n\n`;
    const ch = s => s?.changed ? Object.entries(s.changed).filter(([k, v]) => v && k !== 'imageBeforeFinish').map(([k]) => k).join('+') || '-' : 'n/a';
    o += tbl(['tool', 'option window', 'picture', 'raster gesture', 'vector gesture', 'overlay px (raster/vector)', 'messages', 'outcome'], Object.entries(Tl).map(([id, t]) => [id, t.raster?.optionWindow ? `${t.raster.optionWindow.width}x${t.raster.optionWindow.height}` : 'none', t.optionBlank ? 'BLANK' : t.optionSameAsPrevious ? 'same as previous' : 'ok', ch(t.raster), ch(t.vector), `${t.raster?.overlayDuring?.withPixels ?? '-'}/${t.vector?.overlayDuring?.withPixels ?? '-'}`, [...(t.raster?.messages ?? []), ...(t.vector?.messages ?? [])].slice(0, 3).join(' / '), t.outcome + (t.raster?.error ? ' ' + t.raster.error : '')]));
    o += `\n## D1. Dockers\n\n`;
    o += tbl(['docker', 'title', 'open ms', 'size', 'colours', 'click repaint', 'outcome', 'picture'], Object.entries(D).map(([id, d]) => [id, d.title, d.openMs ?? '', d.window ? `${d.window.width}x${d.window.height}` : '', d.distinctColours ?? '', d.repaintsAfterClick ?? '', d.outcome, d.file ?? '']));
    if (M.rows) {
        o += `\n## M1. Krita menu entries versus the page\n\nColumns: \`page menu\` = the page's own menu offers it directly; \`search\` = only through Search Krita Actions (Ctrl+Enter); \`works\` = outcome from the action sweep.\n\n`;
        o += tbl(['Krita menu path', 'text', 'action', 'page menu', 'search', 'works'], M.rows.map(r => [r.path, r.text, r.action, r.pageMenu ?? '-', r.pageMenu ? '' : r.viaSearch ? 'search only' : 'not in engine', r.outcome ?? (r.inEngine ? '?' : 'n/a')]));
        const missing = M.rows.filter(r => !r.pageMenu && r.viaSearch);
        const prio = { Edit: 1, Layer: 1, Image: 1, Select: 1, Filter: 2, View: 2, File: 3, Tools: 3, Settings: 4, Help: 5 };
        const good = o2 => ['changed image', 'changed layers/selection/history/view', 'opened dialog', 'opened popup', 'message'].includes(o2);
        const order = r => (good(r.outcome) ? 0 : 10) + (prio[r.menu?.replace(/&/g, '')] ?? 6);
        o += `\n## M2. Menu entries the page lacks, prioritised (works first, core menus first)\n\n`;
        o += tbl(['priority', 'Krita menu path', 'text', 'action', 'engine outcome'], [...missing].sort((a, b) => order(a) - order(b)).map(r => [order(r) < 10 ? 'add' : 'add after engine fix / check', r.path, r.text, r.action, r.outcome ?? '?']));
        o += `\n## M3. Krita menu entries whose action is not in this engine's action list\n\n`;
        o += tbl(['Krita menu path', 'text', 'action', 'source'], M.rows.filter(r => !r.inEngine).map(r => [r.path, r.text, r.action, r.from]));
        o += `\n## M4. Dockers (Settings > Dockers in Krita)\n\n`;
        o += tbl(['docker', 'title', 'page menu'], M.dockerRows.map(r => [r.docker, r.title, r.pageMenu ?? '-']));
        o += `\n## M5. The page's own menu commands\n\n`;
        o += tbl(['menu', 'command', 'title', 'Krita action it corresponds to'], M.pageCommands.map(c => [c.menu, c.id, c.title, PAGE_TO_KRITA[c.id] ?? '']));
    }
    fs.writeFileSync(path.join(OUT, 'REPORT.md'), o);
    console.log('wrote docs/parity/REPORT.md');
}
async function runTools() {
    const inv = JSON.parse(fs.readFileSync(path.join(RES, 'inventory.json'), 'utf8'));
    const results = load('tools.json'); const pics = {};
    let prevHash = null;
    const retried = new Set();
    for (let ti = 0; ti < inv.tools.length; ti++) {
        const t = inv.tools[ti];
        if ((ONLY && !ONLY.test(t.id)) || (!ONLY && results[t.id])) continue;
        if (!page || page.isClosed() || crashed || !process.env.REUSE) { await launch(); }   // a fresh page per tool: one tool's leftovers must not decide the next one's result
        let r;
        try {
            r = await inPage(async ({ id, prev }) => {
                const o = { id };
                const sleep = S.sleep;
                const run = async scenario => {
                    const s = { scenario };
                    await S.setup(scenario === 'vector' ? 'vector' : 'base');
                    await __engineCall('krita.viewport', { width: 900, height: 700, zoom: 1, offsetX: 50, offsetY: 50 });
                    const known = new Set(S.win.keys());
                    S.msgs.length = 0; S.overlayPx = 0; S.lastOverlay = null; S.imgUpd = 0;
                    const tw0 = [...S.win.values()].find(w => w.kind === 'toolOptions');
                    if (scenario === 'vector' && /Path|Interaction|Knife/.test(id)) {   // give them a shape to work on
                        await __engine.setKritaTool('KritaShape/KisToolRectangle'); await sleep(300);
                        await P.drag({ x: 70, y: 70 }, { x: 200, y: 160 }); await sleep(500);
                    }
                    let state = 'ok';
                    try { await S.race(__engine.setKritaTool(id), 20000); } catch (e) { s.error = 'setKritaTool: ' + e.message; }
                    await sleep(900);
                    if (scenario === 'raster') {
                        const w = [...S.win.values()].find(x => x.kind === 'toolOptions');
                        if (w) { const pa = S.paint.get(w.id); s.optionWindow = { id: w.id, width: w.width, height: w.height, picture: S.pixHash(w.id), solid: pa?.solid, total: pa ? pa.width * pa.height : 0, title: w.title }; if (pa) { const set = new Set(); for (let i = 0; i < pa.px.length; i += 4 * 29) set.add((pa.px[i] << 16) | (pa.px[i + 1] << 8) | pa.px[i + 2]); s.optionWindow.distinctColours = set.size; } s.png = S.png(w.id); }
                        else s.optionWindow = null;
                    }
                    const before = await S.snap('x');
                    S.msgs.length = 0; S.overlayPx = 0; S.overlays = 0; S.imgUpd = 0; S.tools.length = 0;
                    const g = G[id] ?? G.drag;
                    const t0 = performance.now();
                    try {
                        await S.race(g(), 20000);
                    } catch (e) { s.error = 'gesture: ' + e.message; }
                    s.gestureMs = Math.round(performance.now() - t0);
                    s.overlayDuring = { events: S.overlays, withPixels: S.overlayPx, last: S.lastOverlay ? { rect: S.lastOverlay.rect } : null };
                    await sleep(700);
                    const mid = await S.snap('x');
                    s.overlayAfterGesture = S.overlayPx;
                    // finishing keys
                    const fin = FIN[id];
                    if (fin) { for (const k of fin) { __engine.kritaKey({ type: 'keydown', key: k }); __engine.kritaKey({ type: 'keyup', key: k }); await sleep(120); } await sleep(900); }
                    const after = await S.snap('x');
                    const wins = S.newWins(known).map(S.winRec);
                    if (wins.length) { s.windows = wins; s.windowPng = S.png(S.newWins(known)[0].id); await S.closeNew(known); }
                    s.changed = { image: before.hash !== after.hash, imageBeforeFinish: before.hash !== mid.hash, layers: before.layers !== after.layers, selection: before.sel !== after.sel, history: before.hist !== after.hist };
                    try { const L = JSON.parse(after.layers), B = JSON.parse(before.layers); const cnt = a => { let n = 0; const w = x => { for (const c of x) { n++; w(c.children ?? []); } }; w(a); return n; }; s.layerCount = [cnt(B), cnt(L)]; } catch {}
                    s.messages = [...S.msgs]; s.imageUpdates = S.imgUpd; s.hashes = [before.hash, mid.hash, after.hash];
                    s.alive = (await S.race(__engine.documentInfo(), 6000, null)) !== null;
                    try { __engine.kritaKey({ type: 'keydown', key: 'Escape' }); __engine.kritaKey({ type: 'keyup', key: 'Escape' }); } catch {}
                    return s;
                };
                // pointer helpers (page side)
                const P = window.P = {
                    pt: (x, y, extra = {}) => ({ x, y, ...extra }),
                    click: async (x, y, extra = {}) => { __engine.kritaPointer({ type: 'move', x, y, ...extra }); await sleep(15); __engine.kritaPointer({ type: 'press', x, y, ...extra }); await sleep(30); __engine.kritaPointer({ type: 'release', x, y, ...extra }); await sleep(120); },
                    drag: async (a, b, extra = {}, steps = 10) => {
                        __engine.kritaPointer({ type: 'move', x: a.x, y: a.y, ...extra }); await sleep(15);
                        __engine.kritaPointer({ type: 'press', x: a.x, y: a.y, pressure: 0.7, ...extra }); await sleep(20);
                        for (let i = 1; i <= steps; i++) { __engine.kritaPointer({ type: 'move', down: true, x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps, pressure: 0.7, ...extra }); await sleep(15); }
                        __engine.kritaPointer({ type: 'release', x: b.x, y: b.y, ...extra }); await sleep(250);
                    },
                    path: async (pts, extra = {}) => {
                        __engine.kritaPointer({ type: 'move', x: pts[0].x, y: pts[0].y, ...extra }); await sleep(15);
                        __engine.kritaPointer({ type: 'press', x: pts[0].x, y: pts[0].y, pressure: 0.7, ...extra }); await sleep(20);
                        for (const p of pts.slice(1)) { __engine.kritaPointer({ type: 'move', down: true, x: p.x, y: p.y, pressure: 0.7, ...extra }); await sleep(15); }
                        const l = pts[pts.length - 1]; __engine.kritaPointer({ type: 'release', x: l.x, y: l.y, ...extra }); await sleep(250);
                    },
                    dbl: async (x, y) => { await P.click(x, y); await P.click(x, y); },
                    type: async text => { for (const ch of text) { __engine.kritaKey({ type: 'keydown', key: ch, text: ch }); __engine.kritaKey({ type: 'keyup', key: ch }); await sleep(30); } },
                };
                // image (100,100) is at canvas (150,150) with offset 50
                const A = { x: 130, y: 130 }, B = { x: 330, y: 280 }, C = { x: 250, y: 300 }, D = { x: 160, y: 250 };
                const curve = [{ x: 110, y: 120 }, { x: 160, y: 170 }, { x: 220, y: 150 }, { x: 290, y: 230 }, { x: 330, y: 300 }];
                const G = {
                    drag: () => P.path(curve),
                    'KritaShape/KisToolLine': () => P.drag(A, B),
                    'KritaShape/KisToolRectangle': () => P.drag(A, B),
                    'KritaShape/KisToolEllipse': () => P.drag(A, B),
                    'KisToolPolyline': async () => { await P.click(A.x, A.y); await P.click(B.x, A.y); await P.click(C.x, C.y); await P.dbl(D.x, D.y); },
                    'KisToolPolygon': async () => { await P.click(A.x, A.y); await P.click(B.x, A.y); await P.click(C.x, C.y); },
                    'KisToolPath': async () => { await P.drag(A, { x: A.x + 40, y: A.y - 30 }); await P.drag({ x: B.x, y: A.y }, { x: B.x + 30, y: A.y + 30 }); await P.click(C.x, C.y); },
                    'KisToolSelectRectangular': () => P.drag(A, B),
                    'KisToolSelectElliptical': () => P.drag(A, B),
                    'KisToolSelectOutline': () => P.path([A, { x: B.x, y: A.y }, B, { x: A.x, y: B.y }, A]),
                    'KisToolSelectPolygonal': async () => { await P.click(A.x, A.y); await P.click(B.x, A.y); await P.click(C.x, C.y); await P.dbl(D.x, D.y); },
                    'KisToolSelectPath': async () => { await P.click(A.x, A.y); await P.click(B.x, A.y); await P.click(C.x, C.y); await P.dbl(A.x, A.y); },
                    'KisToolSelectMagnetic': async () => { await P.click(A.x, A.y); await P.click(B.x, A.y); await P.click(C.x, C.y); await P.dbl(A.x + 2, A.y + 2); },
                    'KisToolSelectContiguous': () => P.click(250, 220),
                    'KisToolSelectSimilar': () => P.click(250, 220),
                    'KritaFill/KisToolFill': () => P.click(300, 130),
                    'KritaFill/KisToolGradient': () => P.drag(A, B),
                    'KisToolEncloseAndFill': () => P.path([A, { x: B.x, y: A.y }, B, { x: A.x, y: B.y }, A]),
                    'KritaSelected/KisToolColorSampler': () => P.click(130 + 10, 130 + 10),
                    'KritaShape/KisToolMeasure': () => P.drag(A, B),
                    'ZoomTool': () => P.click(250, 250),
                    'PanTool': () => P.drag(A, B),
                    'KisToolCrop': () => P.drag(A, B),
                    'KritaTransform/KisToolMove': () => P.drag({ x: 200, y: 200 }, { x: 260, y: 240 }),
                    'KisToolTransform': () => P.drag({ x: 250, y: 220 }, { x: 290, y: 250 }),
                    'InteractionTool': () => P.drag({ x: 150, y: 120 }, { x: 190, y: 150 }),
                    'PathTool': () => P.click(150, 120),
                    'ToolReferenceImages': () => P.click(250, 250),
                    'KisAssistantTool': async () => { await P.click(A.x, A.y); await P.click(B.x, A.y); await P.click(C.x, C.y); },
                    'KritaShape/KisToolKnife': () => P.drag({ x: 100, y: 110 }, { x: 250, y: 190 }),
                    'KritaShape/KisToolSmartPatch': () => P.path(curve),
                    'KritaShape/KisToolLazyBrush': () => P.path(curve),
                    'SvgTextTool': async () => { await P.drag(A, B); await sleep(500); await P.type('Hello'); },
                };
                const FIN = {
                    'KisToolPolygon': ['Enter'], 'KisToolPath': ['Enter'], 'KisToolPolyline': ['Enter'], 'KisToolSelectPolygonal': ['Enter'], 'KisToolSelectPath': ['Enter'], 'KisToolSelectMagnetic': ['Enter'],
                    'KisToolCrop': ['Enter'], 'KisToolTransform': ['Enter'], 'KritaTransform/KisToolMove': [], 'SvgTextTool': ['Escape'], 'KisAssistantTool': ['Escape'],
                };
                o.raster = await run('raster');
                o.vector = await run('vector');
                if (o.raster.png) { o.png = o.raster.png; delete o.raster.png; }
                if (o.vector.png) delete o.vector.png;
                if (o.raster.windowPng) { o.rasterWindowPng = o.raster.windowPng; delete o.raster.windowPng; }
                if (o.vector.windowPng) delete o.vector.windowPng;
                return o;
            }, { id: t.id, prev: prevHash }, 150000);
        } catch (e) {
            r = { id: t.id, [isDead(e) ? 'crash' : 'hang']: true, error: String(e.message).slice(0, 200) };
            await launch(); prevHash = null;
        }
        if (pageErrors.length) r.pageErrors = pageErrors.slice(0, 3);
        r.name = t.name; r.section = t.section;
        if (r.png) { r.file = savePicture('tools', t.id, r.png, pics); delete r.png; }
        if (r.rasterWindowPng) { r.windowFile = savePicture('tools', t.id + '__window', r.rasterWindowPng, pics); delete r.rasterWindowPng; }
        const ow = r.raster?.optionWindow;
        r.optionBlank = !ow || (ow.distinctColours ?? 0) < 3 || (ow.solid ?? 0) < 1000;
        r.optionSameAsPrevious = Boolean(ow && prevHash && ow.picture === prevHash);
        if (ow) prevHash = ow.picture;
        const ch = s => s?.changed ? Object.entries(s.changed).filter(([k, v]) => v && k !== 'imageBeforeFinish').map(([k]) => k) : [];
        r.outcome = r.crash ? 'crash' : r.hang ? 'hang' : (r.raster?.error || r.vector?.error) ? 'error' : [r.raster, r.vector].some(s => s && !s.alive) ? 'engine stopped answering' : ch(r.raster).length || ch(r.vector).length ? 'changed ' + [...new Set([...ch(r.raster), ...ch(r.vector)])].join('/') : (r.raster?.overlayDuring?.withPixels || r.vector?.overlayDuring?.withPixels) ? 'overlay only' : (r.raster?.messages?.length || r.vector?.messages?.length) ? 'message' : 'no visible effect';
        if (r.outcome === 'no visible effect' && !retried.has(t.id)) { retried.add(t.id); ti--; console.log(t.id + ' no visible effect, trying once more on a fresh page'); continue; }
        if (retried.has(t.id)) r.note = r.outcome === 'no visible effect' ? 'retried on a fresh page: still no visible effect' : 'first attempt on a fresh page: no visible effect; second attempt changed something';
        results[t.id] = r; save('tools.json', results);
        console.log(`${t.id.padEnd(30)} ${r.outcome} option ${ow ? ow.width + 'x' + ow.height : 'none'}${r.optionBlank ? ' BLANK' : ''}${r.optionSameAsPrevious ? ' same-as-prev' : ''}`);
    }
}


// ---------------------------------------------------------------------------------------------- menus
const strip = t => t.replace(/&amp;/g, '\u0001').replace(/&(?!&)/g, '').replace(/\u0001/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function parseXmlgui(xml) {
    xml = xml.replace(/<!--[\s\S]*?-->/g, '');
    const out = [], stack = [];
    const re = /<(\/?)(Menu|Action|ToolBar|MenuBar|text|Text)\b([^>]*?)(\/?)>/g;
    let m, lastText = null;
    while ((m = re.exec(xml))) {
        const [, close, tag, attrs, selfClose] = m;
        if (tag === 'text' || tag === 'Text') {
            if (!close) { const end = xml.indexOf('</', re.lastIndex); const txt = strip(xml.slice(re.lastIndex, end)).trim(); if (stack.length && stack[stack.length - 1].kind === 'Menu') stack[stack.length - 1].text = txt; }
            continue;
        }
        if (tag === 'Menu') { if (close) stack.pop(); else { const e = { kind: 'Menu', name: /name="([^"]+)"/.exec(attrs)?.[1] }; stack.push(e); if (selfClose) stack.pop(); } }
        else if (tag === 'ToolBar') { if (close) stack.pop(); else stack.push({ kind: 'ToolBar' }); }
        else if (tag === 'Action' && !close) {
            if (stack.some(s => s.kind === 'ToolBar')) continue;
            const name = /name="([^"]+)"/.exec(attrs)?.[1];
            const menus = stack.filter(s => s.kind === 'Menu');
            if (menus.length && name) out.push({ path: menus.map(s => ({ name: s.name, text: s.text })), action: name });
        }
    }
    return out;
}
function parseActionFiles() {
    const defs = {};
    const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.action')) { const x = fs.readFileSync(p, 'utf8'); for (const m of x.matchAll(/<Action\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/Action>/g)) { const g = t => (new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(m[2])?.[1] ?? '').trim(); defs[m[1]] = { text: strip(g('text')), category: g('category'), toolTip: strip(g('toolTip')), shortcut: g('shortcut'), activationFlags: g('activationFlags'), activationConditions: g('activationConditions'), file: path.relative(ROOT, p) }; } } } };
    walk(path.join(ROOT, 'krita'));
    return defs;
}
// Which Krita action each of the page's own menu commands is the equivalent of (by command id; judged by reading commands.ts).
const PAGE_TO_KRITA = {
    'file.new': 'file_new', 'file.open': 'file_open', 'file.openRecent': 'file_open_recent', 'file.saveKra': 'file_save', 'file.export': 'file_export_file',
    'edit.undo': 'edit_undo', 'edit.redo': 'edit_redo', 'edit.fillFg': 'fill_selection_foreground_color', 'edit.fillBg': 'fill_selection_background_color', 'edit.clear': 'clear',
    'select.all': 'select_all', 'select.none': 'deselect', 'select.invert': 'invert_selection',
    'image.scale': 'imagesize', 'image.resizeCanvas': 'canvassize', 'image.trim': 'resizeimagetoselection', 'image.rotateRight': 'rotateImageCW90', 'image.rotateLeft': 'rotateImageCCW90', 'image.rotate180': 'rotateImage180', 'image.rotateCustom': 'rotateimage',
    'image.mirrorH': 'mirrorImageHorizontal', 'image.mirrorV': 'mirrorImageVertical', 'image.flatten': 'flatten_image', 'image.convert': 'imagecolorspaceconversion',
    'view.zoomIn': 'view_zoom_in', 'view.zoomOut': 'view_zoom_out', 'view.zoom100': 'zoom_to_100pct', 'view.fit': 'zoom_to_fit', 'view.rotateCcw': 'rotate_canvas_left', 'view.rotateCw': 'rotate_canvas_right', 'view.rotateReset': 'reset_canvas_rotation', 'view.mirror': 'mirror_canvas', 'view.canvasOnly': 'view_show_canvas_only',
    'tools.sizeDown': 'decrease_brush_size', 'tools.sizeUp': 'increase_brush_size', 'tools.opacityDown': 'decrease_opacity', 'tools.opacityUp': 'increase_opacity', 'tools.eraser': 'erase_action', 'tools.swapColors': 'toggle_fg_bg', 'tools.resetColors': 'reset_fg_bg',
    'settings.configure': 'options_configure',
    'layer.newPaint': 'add_new_paint_layer', 'layer.newGroup': 'add_new_group_layer', 'layer.duplicate': 'duplicatelayer', 'layer.mergeDown': 'merge_layer', 'layer.remove': 'remove_layer', 'layer.properties': 'layer_properties',
    'filter.gallery': 'filter_gallery',
    'view.rulers': 'view_ruler', 'view.grid': 'view_grid', 'view.guides': 'view_show_guides', 'view.lockGuides': 'view_lock_guides', 'view.snapGuides': 'view_snap_to_guides', 'view.snapGrid': 'view_snap_to_grid', 'view.snapBounds': 'view_snap_image_bounds', 'view.snapCenter': 'view_snap_image_center',
};
async function runMenus() {
    const inv = JSON.parse(fs.readFileSync(path.join(RES, 'inventory.json'), 'utf8'));
    const files = [path.join(ROOT, 'krita/krita/krita5.xmlgui'), ...(() => { const o = []; const w = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) w(p); else if (f.name.endsWith('.xmlgui') && !p.includes('ui_standards') && !p.endsWith('krita5.xmlgui')) o.push(p); } }; w(path.join(ROOT, 'krita')); return o; })()];
    const seen = new Set(), entries = [];
    for (const f of files) for (const e of parseXmlgui(fs.readFileSync(f, 'utf8'))) {
        const pathStr = e.path.map(p => p.text ?? p.name).join(' > ');
        const key = e.path.map(p => p.name).join('/') + '|' + e.action;
        if (seen.has(key)) continue; seen.add(key);
        entries.push({ menu: e.path[0].text ?? e.path[0].name, path: pathStr, action: e.action, from: path.relative(ROOT, f) });
    }
    // page side: the page's own menu commands, and the category of each filter (the Filter menu is built in code)
    await launch();
    const live = await inPage(async () => {
        const mod = await import('/src/shell/commands.ts');
        const cmds = mod.menuCommands().map(c => ({ id: c.id, title: c.title, menu: c.menu, shortcut: c.shortcut ?? null }));
        let filters = []; try { filters = await __engine.filters(); } catch {}
        return { cmds, filters };
    }, null, 60000).catch(e => ({ cmds: [], filters: [], error: String(e.message) }));
    // Filter menu: filter actions sit in category sub-menus
    const have = new Set(inv.actions.map(a => a.name));
    for (const f of live.filters) { const act = `krita_filter_${f.id}`; const cat = /_filters$/.test(f.category) ? f.category : `${f.category.toLowerCase()}_filters`; entries.push({ menu: 'Filter', path: `Filter > ${inv.actions.find(a => a.name === cat)?.text?.replace(/&/g, '') ?? f.category}`, action: act, from: 'built in code (KisFilterManager) from filters()' }); }
    const defs = parseActionFiles();
    const text = n => inv.actions.find(a => a.name === n)?.text?.replace(/&(?!&)/g, '') ?? defs[n]?.text ?? n;
    const pageActions = new Map(); for (const c of live.cmds) { const a = PAGE_TO_KRITA[c.id]; if (a) pageActions.set(a, c); }
    const actionsRes = load('actions.json');
    const rows = entries.map(e => ({
        ...e, text: text(e.action),
        inEngine: have.has(e.action) || /^(Next|Previous|Select) /.test(e.action),
        pageMenu: pageActions.get(e.action) ? `${pageActions.get(e.action).menu} > ${pageActions.get(e.action).title}` : null,
        viaSearch: have.has(e.action),
        outcome: actionsRes[e.action]?.outcome ?? null,
        definition: defs[e.action] ? { category: defs[e.action].category, conditions: defs[e.action].activationConditions, flags: defs[e.action].activationFlags } : null,
    }));
    const dockerRows = inv.dockers.map(d => ({ docker: d.id, title: d.title, pageMenu: live.cmds.find(c => c.id === `krita.docker.${d.id}`) ? `Settings > Krita Dockers > ${d.title}` : null }));
    save('menus.json', { rows, pageCommands: live.cmds, dockerRows, error: live.error ?? null, filtersCount: live.filters.length, actionDefsFound: Object.keys(defs).length });
    console.log(`menus: ${rows.length} Krita menu entries, ${live.cmds.length} page commands, ${rows.filter(r => r.pageMenu).length} matched directly`);
}

// ---------------------------------------------------------------------------------------------- main
(async () => {
    try {
        if (!fs.existsSync(path.join(RES, 'inventory.json')) || FRESH) await writeInventory();
        if (want('actions')) await runActions();
        if (want('tools')) await runTools();
        if (want('dockers')) await runDockers();
        if (want('menus')) await runMenus();
        if (want('report')) writeReport();
    } finally { if (browser) await browser.close().catch(() => {}); }
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
