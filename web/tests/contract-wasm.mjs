// Exercises protocol.ts against Krita's real engine (dev server on 5173, web/public/engine present).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
setTimeout(() => { console.log('FAILED: hard timeout'); process.exit(2); }, 280000);
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) failed++; };
const E = (fn, arg) => page.evaluate(fn, arg);
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, String(e.message).split('\n')[0]); } };

const t0 = Date.now();
await page.goto('http://localhost:5173/?engine=wasm');
await page.waitForFunction(() => window.__engine, null, { timeout: 150000 });
// The app creates its own document on start; let that finish so it cannot replace the test's.
await page.waitForFunction(() => __engine.documentInfo().then(Boolean), null, { timeout: 60000 });
await page.waitForTimeout(2500);
console.log(`engine ready after ${Date.now() - t0} ms`);
// A hash of the composited image, via PNG export.
await E(() => { window.hash = async () => { const b = await __engine.exportDocument('png'); let h = 0; for (const x of b) h = (h * 31 + x) | 0; return h; }; });

await step('document', async () => {
    const info = await E(() => __engine.newDocument({ width: 640, height: 480, name: 'contract' }));
    check('newDocument', info.width === 640 && info.height === 480 && info.colorModel === 'RGBA', JSON.stringify(info));
    const bad = await E(() => __engine.newDocument({ width: 0, height: 10 }).then(() => 'ok', e => e.message));
    check('newDocument rejects bad size', bad !== 'ok', bad);
});
await step('lists', async () => {
    const n = await E(async () => ({ blend: (await __engine.blendModes()).length, filters: (await __engine.filters()).map(f => f.id),
        gens: (await __engine.generators()).map(g => g.id), presets: await __engine.presets(), tags: await __engine.presetTags() }));
    check('blend modes', n.blend > 100, `${n.blend}`);
    check('filters', n.filters.length > 40 && n.filters.includes('invert') && n.filters.includes('blur'), `${n.filters.length}`);
    check('generators', n.gens.length >= 5, n.gens.join(','));
    check('presets from the default bundle', n.presets.length > 100, `${n.presets.length}`);
    check('preset engines', new Set(n.presets.map(p => p.engine)).size > 5, [...new Set(n.presets.map(p => p.engine))].join(','));
    check('preset tags', n.tags.length > 3, n.tags.slice(0, 6).join(','));
    const png = await E(async id => Array.from((await __engine.presetThumbnail(id)).slice(0, 4)), n.presets[0].id);
    check('preset thumbnail is a PNG', png.join() === '137,80,78,71');
    const filtered = await E(async () => (await __engine.presets({ search: 'ink' })).length);
    check('preset search narrows', filtered > 0 && filtered < n.presets.length, `${filtered}`);
});
await step('painting and undo', async () => {
    const before = await E(() => hash());
    const stroke = () => E(async () => {
        __engine.beginStroke({ x: 100, y: 100, pressure: 1, timeMs: 0 });
        __engine.continueStroke([{ x: 300, y: 200, pressure: 0.5, timeMs: 20 }, { x: 500, y: 100, pressure: 1, timeMs: 40 }]);
        __engine.endStroke();
        return hash();
    });
    const painted = await stroke();
    check('stroke changes the image', painted !== before);
    await E(() => __engine.undo());
    check('undo restores the image', await E(() => hash()) === before);
    await E(() => __engine.redo());
    check('redo repaints', await E(() => hash()) === painted);
    await E(() => __engine.undo());
    await E(() => __engine.setColors({ foreground: { r: 1, g: 0, b: 0, a: 1 } }));
    check('colour changes the stroke', await stroke() !== painted);
    const brush = await E(async () => { await __engine.setBrush({ size: 80, opacity: 0.5, eraser: true }); return __engine.brushState(); });
    check('setBrush reads back', Math.abs(brush.size - 80) < 0.01 && Math.abs(brush.opacity - 0.5) < 0.01 && brush.eraser === true, JSON.stringify(brush));
    await E(() => __engine.setBrush({ eraser: false, opacity: 1 }));
    const engines = await E(async () => {
        const out = {}; const all = await __engine.presets(); const seen = new Set();
        for (const p of all) {
            if (seen.has(p.engine)) continue; seen.add(p.engine);
            const h0 = await hash();
            try {
                await __engine.selectPreset(p.id);
                __engine.beginStroke({ x: 50, y: 300, pressure: 1, timeMs: 0 });
                __engine.continueStroke([{ x: 300, y: 400, pressure: 1, timeMs: 30 }, { x: 600, y: 300, pressure: 1, timeMs: 60 }]);
                __engine.endStroke();
                out[p.engine] = (await hash()) !== h0;
            } catch (e) { out[p.engine] = String(e.message); }
        }
        return out;
    });
    for (const [engine, ok] of Object.entries(engines)) check(`brush engine paints: ${engine}`, ok === true, ok === true ? '' : String(ok));
});
await step('layers', async () => {
    const r = await E(async () => {
        const a = await __engine.addNode({ type: 'paint', name: 'A' });
        const g = await __engine.addNode({ type: 'group', name: 'G' });
        await __engine.moveNode(a, { parent: g });
        await __engine.setNodeProperties(a, { opacity: 0.25, blendMode: 'multiply', name: 'renamed', visible: false });
        const self = await __engine.moveNode(g, { parent: g }).then(() => 'ok', e => e.message);
        const tree = await __engine.layers();
        const copy = await __engine.duplicateNode(a);
        const after = await __engine.layers();
        await __engine.removeNode(copy);
        const png = Array.from((await __engine.nodeThumbnail(a, 64)).slice(0, 4));
        return { tree, self, after, png, a, g };
    });
    const group = r.tree.find(n => n.id === r.g), child = group?.children.find(n => n.id === r.a);
    check('group contains moved layer', Boolean(child), JSON.stringify(r.tree.map(n => n.name)));
    check('properties read back', child && Math.abs(child.opacity - 0.25) < 0.01 && child.blendMode === 'multiply' && child.name === 'renamed' && child.visible === false, JSON.stringify(child));
    check('cannot move a group into itself', r.self !== 'ok', r.self);
    check('duplicate adds a sibling', r.after.find(n => n.id === r.g).children.length === 2);
    check('node thumbnail is a PNG', r.png.join() === '137,80,78,71');
    const types = await E(async () => {
        const out = {};
        for (const type of ['clone', 'vector', 'transparencyMask', 'colorizeMask', 'selectionMask']) {
            out[type] = await __engine.addNode({ type }).then(async id => { const found = JSON.stringify(await __engine.layers()).includes(id); await __engine.removeNode(id); return found; }, e => e.message);
        }
        return out;
    });
    for (const [type, ok] of Object.entries(types)) check(`add ${type}`, ok === true, ok === true ? '' : String(ok));
    for (const type of ['transformMask', 'file']) {   // not supported yet: must fail cleanly, not crash
        const r = await E(t => __engine.addNode({ type: t }).then(() => 'ok', e => e.message), type);
        check(`add ${type} is refused cleanly`, r !== 'ok', r);
    }
});
await step('filters', async () => {
    const r = await E(async () => {
        const tree = await __engine.layers();
        const bottom = tree[tree.length - 1].id;
        await __engine.setActiveNode(bottom);
        const h0 = await hash();
        // Exports drop an active preview (it must never reach a saved file), so look at the layer itself.
        const thumb = async () => { const b = await __engine.nodeThumbnail(bottom, 256); let h = 0; for (const x of b) h = (h * 31 + x) | 0; return h; };
        const t0 = await thumb();
        await __engine.previewFilter(bottom, 'invert', {});
        const hPreview = (await thumb()) === t0 ? h0 : h0 + 1;
        const exportedDuringPreview = await hash();
        await __engine.previewFilter(bottom, 'invert', {});
        await __engine.previewFilter(bottom, null);
        const hCleared = await hash();
        const treeAfterPreview = JSON.stringify(await __engine.layers()) === JSON.stringify(tree);
        await __engine.applyFilter(bottom, 'invert', {});
        const hApplied = await hash();
        await __engine.undo();
        const hUndone = await hash();
        const cfg = await __engine.filterConfig('pixelize');
        const layer = await __engine.addNode({ type: 'filter', configId: 'pixelize', config: { pixelWidth: 20, pixelHeight: 20 } });
        const hLayer = await hash();
        const nodeCfg = await __engine.nodeConfig(layer);
        await __engine.setNodeConfig(layer, { pixelWidth: 60, pixelHeight: 60 });
        const hEdited = await hash();
        const fill = await __engine.addNode({ type: 'fill', configId: 'color' }).then(() => true, e => e.message);
        await new Promise(r => setTimeout(r, 1500));
        const mask = await __engine.addNode({ type: 'filterMask', configId: 'invert' }).then(() => true, e => e.message);
        return { h0, hPreview, hCleared, exportedDuringPreview, treeAfterPreview, hApplied, hUndone, cfg, hLayer, nodeCfg, hEdited, fill, mask };
    });
    check('preview changes the image', r.hPreview !== r.h0);
    check('clearing preview restores it exactly', r.hCleared === r.h0);
    check('an export during preview does not contain the preview', r.exportedDuringPreview === r.h0);
    check('preview never appears in the layer tree', r.treeAfterPreview);
    check('applyFilter changes the image', r.hApplied !== r.h0);
    check('filter is undoable', r.hUndone === r.h0);
    check('filter settings described', r.cfg.specs.some(s => s.key === 'pixelWidth'), r.cfg.specs.map(s => s.key).join(','));
    check('filter layer affects the image', r.hLayer !== r.h0);
    check('filter layer settings read back', r.nodeCfg.configId === 'pixelize' && r.nodeCfg.values.pixelWidth === 20, JSON.stringify(r.nodeCfg));
    check('editing filter layer settings changes the image', r.hEdited !== r.hLayer);
    check('add fill layer', r.fill === true, String(r.fill));
    check('add filter mask', r.mask === true, String(r.mask));
});
await step('files', async () => {
    const r = await E(async () => {
        const kra = await __engine.exportDocument('kra');
        const h = await hash();
        const tree = await __engine.layers();
        const info = await __engine.openDocument('roundtrip.kra', kra);
        return { size: kra.length, zip: kra[0] === 80 && kra[1] === 75, same: (await hash()) === h, info,
                 names: JSON.stringify((await __engine.layers()).map(n => n.name)) === JSON.stringify(tree.map(n => n.name)) };
    });
    check('export .kra', r.zip && r.size > 1000, `${r.size} bytes`);
    check('reopened .kra renders identically', r.same);
    check('reopened .kra has the same layers', r.names);
});
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failed ? `${failed} FAILED` : 'all passed');
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
process.exit(failed ? 1 : 0);
