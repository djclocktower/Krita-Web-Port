// Spike: drive Krita's own actions and tools (not the hand-written bridge handlers) on the real engine.
// Needs a dev server on 5173. ENGINE_BASE=/engine-dev/ tests a build other than the default one.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const base = process.env.ENGINE_BASE ? `&engineBase=${process.env.ENGINE_BASE}` : '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage();
const errors = [], log = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { const t = m.text().trim(); if (t && !/migration|vite|kf\.i18n|RAM|start-up|instantiated/.test(t)) log.push(t.slice(0, 300)); });
setTimeout(() => { console.log('FAILED: hard timeout'); console.log(log.slice(-12).join('\n')); process.exit(2); }, 280000);
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) failed++; };
const E = (fn, arg) => page.evaluate(({ fn, arg }) => Promise.race([eval(fn)(arg), new Promise((_, r) => setTimeout(() => r(new Error('engine call timed out')), 150000))]), { fn: fn.toString(), arg });
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, String(e.message).split('\n')[0] + ' | ' + log.slice(-4).join(' | ')); } };

await page.goto(`http://localhost:5173/?engine=wasm${base}&settleMs=${process.env.SETTLE_MS ?? 0}`);
await page.waitForFunction(() => window.__engine && __engine.documentInfo().then(Boolean), null, { timeout: 150000 });
await page.waitForTimeout(1500);
await E(async () => {
    // Each call gets its own timeout so a hang names the call that caused it.
    window.K = (m, p) => Promise.race([__engineCall('krita.' + m, p ?? {}), new Promise((_, r) => setTimeout(() => r(new Error(`krita.${m} ${JSON.stringify(p ?? {})} did not return`)), 20000))]);
    window.hash = async () => { const b = await __engine.exportDocument('png'); let h = 0; for (const x of b) h = (h * 31 + x) | 0; return h; };
    window.bounds = o => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of o) for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); } return o.length ? [x0, y0, x1 - x0, y1 - y0] : null; };
    window.drag = async (pts, mods = {}) => {
        await K('pointer', { type: 'move', ...pts[0], ...mods });
        await K('pointer', { type: 'press', ...pts[0], ...mods });
        for (const p of pts.slice(1)) await K('pointer', { type: 'move', down: true, ...p, ...mods });
        const r = await K('pointer', { type: 'release', ...pts.at(-1), ...mods });
        await new Promise(res => setTimeout(res, Number(new URLSearchParams(location.search).get('settleMs') ?? 0)));
        return r;
    };
    await __engine.newDocument({ width: 600, height: 400 });
});

await step('window', async () => {
    const info = await E(() => K('info'));
    check('Krita main window, view and canvas exist', info.actions > 300 && info.tools.length > 20, `${info.actions} actions, ${info.tools.length} tools, canvas ${info.canvasWidget} ${info.canvasSize}`);
    const actions = await E(() => K('actions'));
    const names = new Set(actions.map(a => a.name));
    check('actions listed with names and shortcuts', ['select_all', 'deselect', 'invert_selection', 'edit_undo', 'flatten_image', 'mirrorAllNodesX'].filter(n => !names.has(n)).length === 0,
          ['select_all', 'deselect', 'invert_selection', 'edit_undo', 'flatten_image', 'mirrorAllNodesX'].filter(n => !names.has(n)).join(',') + ` | sample: ${actions.slice(0, 6).map(a => a.name).join(',')}`);
    check('unknown action is refused', (await E(() => K('trigger', { name: 'no_such_action' }).then(() => 'ok', e => e.message))) !== 'ok');
});
if (!process.env.SKIP_ACTIONS) await step('actions', async () => {
    const r = await E(async () => {
        const o = {};
        await K('trigger', { name: 'select_all' }); o.all = bounds(await __engine.selectionOutline());
        await K('trigger', { name: 'deselect' }); o.none = (await __engine.selectionOutline()).length;
        const h0 = await hash();
        __engine.beginStroke({ x: 50, y: 50, pressure: 1, timeMs: 0 }); __engine.continueStroke([{ x: 300, y: 200, pressure: 1, timeMs: 20 }]); __engine.endStroke();
        const h1 = await hash(); o.painted = h1 !== h0;
        await K('trigger', { name: 'mirrorAllNodesX' }); o.mirrored = (await hash()) !== h1;
        await K('trigger', { name: 'edit_undo' }); o.undoMirror = (await hash()) === h1;
        await K('trigger', { name: 'edit_undo' }); o.undoStroke = (await hash()) === h0;
        await K('trigger', { name: 'edit_redo' }); o.redo = (await hash()) === h1;
        return o;
    });
    check('action select_all', JSON.stringify(r.all) === '[0,0,600,400]', JSON.stringify(r.all));
    check('action deselect', r.none === 0);
    check('action mirrorAllNodesX', r.painted && r.mirrored);
    check("Krita's own undo undoes the action and the stroke", r.undoMirror && r.undoStroke, `${r.undoMirror} ${r.undoStroke}`);
    check("Krita's own redo", r.redo);
});
await step('tools', async () => {
    const r = await E(async () => {
        const o = {};
        await K('tool', { id: 'KisToolSelectRectangular' });
        o.ev = await drag([{ x: 100, y: 80 }, { x: 180, y: 140 }, { x: 300, y: 230 }]);
        o.rect = bounds(await __engine.selectionOutline());
        await drag([{ x: 250, y: 200 }, { x: 400, y: 300 }], { shift: true });
        o.added = bounds(await __engine.selectionOutline());
        await K('tool', { id: 'KisToolSelectElliptical' });
        await drag([{ x: 50, y: 50 }, { x: 150, y: 110 }, { x: 250, y: 170 }]);
        o.ellipse = bounds(await __engine.selectionOutline());
        await K('trigger', { name: 'deselect' });
        const h0 = await hash();
        await K('tool', { id: 'KritaShape/KisToolBrush' });
        await drag([{ x: 60, y: 300 }, { x: 150, y: 330 }, { x: 260, y: 300 }, { x: 380, y: 340 }]);
        const h1 = await hash(); o.brush = h1 !== h0;
        await K('tool', { id: 'KritaShape/KisToolLine' });
        await drag([{ x: 20, y: 20 }, { x: 200, y: 20 }, { x: 580, y: 380 }]);
        const h2 = await hash(); o.line = h2 !== h1;
        await K('tool', { id: 'KritaShape/KisToolRectangle' });
        await drag([{ x: 420, y: 250 }, { x: 500, y: 300 }, { x: 560, y: 360 }]);
        const h3 = await hash(); o.rectShape = h3 !== h2;
        await K('tool', { id: 'KritaFill/KisToolFill' });
        await drag([{ x: 500, y: 50 }]);
        o.fill = (await hash()) !== h3;
        // Pen input through the contract: the same stroke at light and at full pressure must differ.
        await __engine.setKritaTool('KritaShape/KisToolBrush');
        const pen = async pressure => {
            const before = await hash();
            __engine.kritaPointer({ type: 'move', x: 40, y: 200, pressure: 0 });
            __engine.kritaPointer({ type: 'press', x: 40, y: 200, pressure });
            for (let i = 1; i <= 12; i++) __engine.kritaPointer({ type: 'move', down: true, x: 40 + i * 40, y: 200 + 10 * Math.sin(i), pressure, xTilt: 20, yTilt: -10 });
            __engine.kritaPointer({ type: 'release', x: 520, y: 200, pressure: 0 });
            const after = await hash();
            await __engine.triggerKritaAction('edit_undo');
            return { painted: after !== before, undone: (await hash()) === before, after };
        };
        const light = await pen(0.15), full = await pen(1);
        o.pen = light.painted && full.painted; o.penUndo = light.undone && full.undone; o.penPressure = light.after !== full.after;
        o.toolList = (await __engine.kritaTools()).filter(t => t.active).map(t => t.id).join(',');
        o.actionCount = (await __engine.kritaActions()).length;
        o.badTool = await K('tool', { id: 'NoSuchTool' }).then(() => 'ok', e => e.message);
        return o;
    });
    const near = (a, b) => a && a.every((v, i) => Math.abs(v - b[i]) <= 1);
    check("Krita's rectangular selection tool", near(r.rect, [100, 80, 200, 150]), JSON.stringify(r.rect));
    check('Shift adds to the selection, handled by the tool itself', near(r.added, [100, 80, 300, 220]), JSON.stringify(r.added));
    check("Krita's elliptical selection tool", near(r.ellipse, [50, 50, 200, 120]), JSON.stringify(r.ellipse));
    check("Krita's freehand brush tool paints", r.brush);
    check("Krita's fill tool", r.fill);
    check("Krita's line tool", r.line);
    check("Krita's rectangle tool", r.rectShape);
    check('pen strokes through the contract paint', r.pen);
    check('pen strokes are undone by Krita\'s undo', r.penUndo);
    check('pen pressure changes the stroke', r.penPressure);
    check('tools and actions are listed through the contract', r.toolList === 'KritaShape/KisToolBrush' && r.actionCount > 300, `${r.toolList} ${r.actionCount}`);
    check('unknown tool is refused', r.badTool !== 'ok', r.badTool);
});
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failed ? `${failed} FAILED` : 'all passed');
if (failed) console.log(log.slice(-10).join('\n'));
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
process.exit(failed ? 1 : 0);
