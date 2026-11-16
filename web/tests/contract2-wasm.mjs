// Selections, fills, image operations, colour spaces, animation and formats against Krita's real engine.
// Needs a dev server on 5173. ENGINE_BASE=/engine-dev/ tests a build other than the default one.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const base = process.env.ENGINE_BASE ? `&engineBase=${process.env.ENGINE_BASE}` : '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage();
const errors = [], log = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { const t = m.text().trim(); if (t && !/migration|vite/.test(t)) log.push(t.slice(0, 200)); });
setTimeout(() => { console.log('FAILED: hard timeout'); console.log(log.slice(-8).join('\n')); process.exit(2); }, 280000);
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) failed++; };
// Every engine call gets a timeout so a hang is reported as a failure with the engine's last output.
const E = (fn, arg) => page.evaluate(({ fn, arg }) => Promise.race([eval(fn)(arg), new Promise((_, r) => setTimeout(() => r(new Error('engine call timed out')), 30000))]), { fn: fn.toString(), arg });
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, String(e.message).split('\n')[0] + ' | ' + log.slice(-3).join(' | ')); } };

await page.goto(`http://localhost:5173/?engine=wasm${base}`);
await page.waitForFunction(() => window.__engine, null, { timeout: 150000 });
// The app creates its own document on start; let that finish so it cannot replace ours.
await page.waitForFunction(() => __engine.documentInfo().then(Boolean), null, { timeout: 60000 });
await page.waitForTimeout(1500);
await E(async () => {
    window.hash = async () => { const b = await __engine.exportDocument('png'); let h = 0; for (const x of b) h = (h * 31 + x) | 0; return h; };
    // A hash of the pixels, not of the PNG file (whose metadata differs between formats).
    window.pixelHash = async () => { const bmp = await createImageBitmap(new Blob([await __engine.exportDocument('png')])); const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0); let h = 0; for (const x of g.getImageData(0, 0, bmp.width, bmp.height).data) h = (h * 31 + x) | 0; return h; };
    window.bounds = o => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of o) for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); } return o.length ? [x0, y0, x1 - x0, y1 - y0] : null; };
    window.events = [];
    for (const name of ['selectionChanged', 'documentChanged', 'animationChanged', 'keyframesChanged']) __engine.on(name, (...a) => events.push([name, a[0]]));
    await __engine.newDocument({ width: 400, height: 300 });
});

await step('selections', async () => {
    const r = await E(async () => {
        const e = __engine, o = {};
        await e.selectRect({ x: 50, y: 40, width: 100, height: 80 }, 'replace'); o.rect = bounds(await e.selectionOutline());
        await e.selectRect({ x: 100, y: 40, width: 100, height: 80 }, 'add'); o.add = bounds(await e.selectionOutline());
        await e.selectRect({ x: 50, y: 40, width: 50, height: 80 }, 'subtract'); o.sub = bounds(await e.selectionOutline());
        await e.selectRect({ x: 0, y: 0, width: 150, height: 60 }, 'intersect'); o.inter = bounds(await e.selectionOutline());
        await e.undo(); o.undo = bounds(await e.selectionOutline());
        await e.selectEllipse({ x: 100, y: 100, width: 80, height: 40 }, 'replace'); o.ellipse = bounds(await e.selectionOutline());
        await e.selectPolygon([{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 60, y: 90 }], 'replace'); o.poly = bounds(await e.selectionOutline());
        await e.selectAll(); o.all = bounds(await e.selectionOutline());
        await e.invertSelection(); o.inverted = bounds(await e.selectionOutline());
        await e.selectRect({ x: 10, y: 10, width: 20, height: 20 }, 'replace'); await e.invertSelection(); o.invertRect = bounds(await e.selectionOutline());
        await e.deselect(); o.none = (await e.selectionOutline()).length;
        o.badMode = await e.selectRect({ x: 0, y: 0, width: 5, height: 5 }, 'nonsense').then(() => 'ok', x => x.message);
        o.event = events.filter(x => x[0] === 'selectionChanged').length;
        return o;
    });
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    check('rect selection', eq(r.rect, [50, 40, 100, 80]), JSON.stringify(r.rect));
    check('add', eq(r.add, [50, 40, 150, 80]), JSON.stringify(r.add));
    check('subtract', eq(r.sub, [100, 40, 100, 80]), JSON.stringify(r.sub));
    check('intersect', eq(r.inter, [100, 40, 50, 20]), JSON.stringify(r.inter));
    check('selection change is undoable', eq(r.undo, [100, 40, 100, 80]), JSON.stringify(r.undo));
    check('ellipse selection', eq(r.ellipse, [100, 100, 80, 40]), JSON.stringify(r.ellipse));
    check('polygon selection', r.poly && Math.abs(r.poly[0] - 10) <= 1 && Math.abs(r.poly[2] - 100) <= 2 && Math.abs(r.poly[3] - 80) <= 2, JSON.stringify(r.poly));
    check('select all', eq(r.all, [0, 0, 400, 300]), JSON.stringify(r.all));
    check('invert of everything is nothing', r.inverted === null, JSON.stringify(r.inverted));
    check('invert of a rectangle covers the image', eq(r.invertRect, [0, 0, 400, 300]), JSON.stringify(r.invertRect));
    check('deselect', r.none === 0);
    check('bad mode is refused', r.badMode !== 'ok', r.badMode);
    check('selectionChanged events', r.event >= 8, `${r.event}`);
});
await step('fill and gradient', async () => {
    const r = await E(async () => {
        const e = __engine, o = {};
        const h0 = await hash();
        await e.setColors({ foreground: { r: 1, g: 0, b: 0, a: 1 }, background: { r: 0, g: 0, b: 1, a: 1 } });
        await e.selectRect({ x: 50, y: 50, width: 100, height: 100 }, 'replace');
        await e.fillSelection('foreground'); o.filled = (await hash()) !== h0; const hFill = await hash();
        // painting outside the selection must do nothing
        e.beginStroke({ x: 300, y: 200, pressure: 1, timeMs: 0 }); e.continueStroke([{ x: 350, y: 250, pressure: 1, timeMs: 20 }]); e.endStroke();
        o.strokeOutside = (await hash()) === hFill;
        await e.clearSelection(); o.cleared = (await hash()) !== hFill;
        await e.undo(); o.undoClear = (await hash()) === hFill;
        await e.deselect();
        await e.floodFill({ x: 100, y: 100 }, 'background', { threshold: 10 }); const hFlood = await hash(); o.flood = hFlood !== hFill;
        await e.undo(); o.undoFlood = (await hash()) === hFill;
        await e.drawGradient({ x: 0, y: 0 }, { x: 400, y: 0 }, { shape: 'linear' }); const hGrad = await hash(); o.gradient = hGrad !== hFill;
        await e.undo();
        await e.drawGradient({ x: 200, y: 150 }, { x: 400, y: 150 }, { shape: 'radial', repeat: 'alternating', reverse: true }); o.radial = (await hash()) !== hGrad;
        o.badShape = await e.drawGradient({ x: 0, y: 0 }, { x: 1, y: 1 }, { shape: 'wobbly' }).then(() => 'ok', x => x.message);
        return o;
    });
    for (const k of ['filled', 'strokeOutside', 'cleared', 'undoClear', 'flood', 'undoFlood', 'gradient', 'radial']) check(`fill/gradient: ${k}`, r[k] === true);
    check('bad gradient shape is refused', r.badShape !== 'ok', r.badShape);
});
await step('image operations', async () => {
    const r = await E(async () => {
        const e = __engine, o = {};
        await e.newDocument({ width: 400, height: 300 });
        e.beginStroke({ x: 50, y: 50, pressure: 1, timeMs: 0 }); e.continueStroke([{ x: 200, y: 120, pressure: 1, timeMs: 20 }]); e.endStroke();
        const h0 = await hash();
        const size = i => `${i.width}x${i.height}`;
        o.scale = size(await e.scaleImage({ width: 200, height: 150 })); o.scaleInfo = size(await e.documentInfo());
        await e.undo(); o.undoScale = size(await e.documentInfo()); o.undoScalePixels = (await hash()) === h0;
        o.canvas = size(await e.resizeCanvas({ width: 500, height: 400, offsetX: 50, offsetY: 50 }));
        await e.undo();
        o.crop = size(await e.cropImage({ x: 20, y: 20, width: 250, height: 150 }));
        await e.undo();
        o.rot90 = size(await e.rotateImage(90)); await e.undo();
        o.rot45 = await e.rotateImage(45).then(size, x => 'error: ' + x.message); await e.undo();
        await e.mirrorImage('horizontal'); const hm = await hash(); o.mirror = hm !== h0;
        await e.mirrorImage('horizontal'); o.mirrorTwice = (await hash()) === h0;
        await e.addNode({ type: 'paint' }); await e.addNode({ type: 'group' });
        await e.flattenImage(); o.flat = (await e.layers()).length; o.flatSame = (await hash()) === h0;
        o.bad = await e.scaleImage({ width: 0, height: 10 }).then(() => 'ok', x => x.message);
        o.docEvents = events.filter(x => x[0] === 'documentChanged').length;
        return o;
    });
    check('scale image', r.scale === '200x150' && r.scaleInfo === '200x150', r.scale);
    check('scale is undoable (size and pixels)', r.undoScale === '400x300' && r.undoScalePixels, `${r.undoScale} ${r.undoScalePixels}`);
    check('resize canvas', r.canvas === '500x400', r.canvas);
    check('crop', r.crop === '250x150', r.crop);
    check('rotate 90', r.rot90 === '300x400', r.rot90);
    check('rotate 45 grows the canvas', /^\d+x\d+$/.test(r.rot45) && r.rot45 !== '400x300', r.rot45);
    check('mirror changes the image', r.mirror);
    check('mirroring twice restores it', r.mirrorTwice);
    check('flatten leaves one layer with the same picture', r.flat === 1 && r.flatSame, `${r.flat} ${r.flatSame}`);
    check('bad size is refused', r.bad !== 'ok', r.bad);
    check('documentChanged events', r.docEvents >= 5, `${r.docEvents}`);
});
await step('colour spaces', async () => {
    const r = await E(async () => {
        const e = __engine, o = {};
        const spaces = await e.colorSpaces();
        o.count = spaces.length; o.models = [...new Set(spaces.map(s => s.model))].join(',');
        o.depths = [...new Set(spaces.filter(s => s.model === 'RGBA').map(s => s.depth))].join(',');
        o.profiles = spaces.find(s => s.model === 'RGBA' && s.depth === 'U8').profiles.length;
        const to = async (model, depth) => { const i = await e.convertColorSpace({ model, depth }); return `${i.colorModel} ${i.colorDepth} ${i.profile}`; };
        o.u16 = await to('RGBA', 'U16'); o.paintU16 = await (async () => { const h = await hash(); e.beginStroke({ x: 10, y: 10, pressure: 1, timeMs: 0 }); e.continueStroke([{ x: 200, y: 200, pressure: 1, timeMs: 20 }]); e.endStroke(); return (await hash()) !== h; })();
        o.f32 = await to('RGBA', 'F32').catch(x => 'error: ' + x.message);
        o.gray = await to('GRAYA', 'U8').catch(x => 'error: ' + x.message);
        o.cmyk = await to('CMYKA', 'U8').catch(x => 'error: ' + x.message);
        o.lab = await to('LABA', 'U16').catch(x => 'error: ' + x.message);
        o.back = await to('RGBA', 'U8');
        o.bad = await e.convertColorSpace({ model: 'NOPE', depth: 'U8' }).then(() => 'ok', x => x.message);
        return o;
    });
    check('colour spaces listed', r.count >= 10, `${r.count}: ${r.models}`);
    check('RGB depths', ['U8', 'U16', 'F16', 'F32'].every(d => r.depths.split(',').includes(d)), r.depths);
    check('profiles listed', r.profiles >= 1, `${r.profiles}`);
    check('convert to RGBA U16 and paint', r.u16.startsWith('RGBA U16') && r.paintU16, r.u16);
    for (const [k, want] of [['f32', 'RGBA F32'], ['gray', 'GRAYA U8'], ['cmyk', 'CMYKA U8'], ['lab', 'LABA U16']]) check(`convert to ${want}`, r[k].startsWith(want), r[k]);
    check('convert back to RGBA U8', r.back.startsWith('RGBA U8'), r.back);
    check('unknown colour space is refused', r.bad !== 'ok', r.bad);
});
await step('animation', async () => {
    const r = await E(async () => {
        const e = __engine, o = {};
        await e.newDocument({ width: 300, height: 200 });
        const id = (await e.layers())[0].id;
        o.initial = JSON.stringify(await e.animation());
        e.beginStroke({ x: 20, y: 20, pressure: 1, timeMs: 0 }); e.continueStroke([{ x: 250, y: 150, pressure: 1, timeMs: 20 }]); e.endStroke();
        const hDrawn = await hash();
        o.before = (await e.keyframes(id)).join(',');
        await e.addKeyframe(id, 5, { copy: true }); await e.addKeyframe(id, 8);
        o.keys = (await e.keyframes(id)).join(',');
        const at = async t => { await e.setAnimation({ currentTime: t }); return hash(); };
        o.f0 = (await at(0)) === hDrawn; o.f5 = (await at(5)) === hDrawn; o.f8 = (await at(8)) !== hDrawn; o.f7 = (await at(7)) === hDrawn;
        o.time = (await e.animation()).currentTime;
        await e.moveKeyframe(id, 8, 12); o.moved = (await e.keyframes(id)).join(','); o.f8after = (await at(8)) === hDrawn; o.f12 = (await at(12)) !== hDrawn;
        await e.removeKeyframe(id, 12); o.removed = (await e.keyframes(id)).join(',');
        await e.undo(); o.undoRemove = (await e.keyframes(id)).join(',');
        await e.setAnimation({ framesPerSecond: 12, startTime: 2, endTime: 30 }); o.state = JSON.stringify(await e.animation());
        o.dup = await e.addKeyframe(id, 5).then(() => 'ok', x => x.message);
        o.badFps = await e.setAnimation({ framesPerSecond: 0 }).then(() => 'ok', x => x.message);
        o.badTime = await e.setAnimation({ currentTime: -1 }).then(() => 'ok', x => x.message);
        o.onion = await e.setOnionSkin(id, true).then(() => 'ok', x => x.message);
        o.events = events.filter(x => x[0] === 'keyframesChanged').length + ',' + events.filter(x => x[0] === 'animationChanged').length;
        const kra = await e.exportDocument('kra'); await e.openDocument('anim.kra', kra);
        const id2 = (await e.layers())[0].id; o.reopened = (await e.keyframes(id2)).join(','); o.reopenedState = JSON.stringify(await e.animation());
        return o;
    });
    check('animation state', /"framesPerSecond":\d+/.test(r.initial), r.initial);
    check('keyframes added (existing content becomes frame 0)', r.keys === '0,5,8', `before "${r.before}" after "${r.keys}"`);
    check('frame 0 shows the drawing', r.f0); check('duplicate frame copies the drawing', r.f5);
    check('blank frame is blank', r.f8); check('a frame holds until the next keyframe', r.f7);
    check('current time reads back', r.time === 7, `${r.time}`);
    check('move keyframe', r.moved === '0,5,12' && r.f8after && r.f12, r.moved);
    check('remove keyframe', r.removed === '0,5', r.removed);
    check('keyframe removal is undoable', r.undoRemove === '0,5,12', r.undoRemove);
    check('frame rate and range read back', /"framesPerSecond":12/.test(r.state) && /"startTime":2/.test(r.state) && /"endTime":30/.test(r.state), r.state);
    check('duplicate keyframe is refused', r.dup !== 'ok', r.dup);
    check('bad frame rate is refused', r.badFps !== 'ok', r.badFps);
    check('negative time is refused', r.badTime !== 'ok', r.badTime);
    check('onion skin toggle', r.onion === 'ok', r.onion);
    check('animation events', !r.events.startsWith('0,') && !r.events.endsWith(',0'), r.events);
    check('animation survives a .kra round trip', r.reopened === '0,5,12' && /"framesPerSecond":12/.test(r.reopenedState), `${r.reopened} ${r.reopenedState}`);
});
await step('formats', async () => {
    const r = await E(async () => {
        const e = __engine, o = {};
        await e.newDocument({ width: 200, height: 150 });
        await e.setColors({ foreground: { r: 0.9, g: 0.2, b: 0.1, a: 1 } });
        e.beginStroke({ x: 20, y: 20, pressure: 1, timeMs: 0 }); e.continueStroke([{ x: 180, y: 120, pressure: 1, timeMs: 20 }]); e.endStroke();
        await e.addNode({ type: 'paint', name: 'second' });
        e.beginStroke({ x: 20, y: 120, pressure: 1, timeMs: 0 }); e.continueStroke([{ x: 180, y: 20, pressure: 1, timeMs: 20 }]); e.endStroke();
        const h0 = await pixelHash(); const names = (await e.layers()).map(n => n.name).join('|');
        for (const format of ['psd', 'ora', 'tga', 'bmp', 'png', 'tiff', 'webp', 'gif', 'exr', 'jpg']) {
            try {
                const bytes = await e.exportDocument(format);
                const info = await e.openDocument('file.' + format, bytes);
                o[format] = { size: bytes.length, magic: Array.from(bytes.slice(0, 4)), dims: `${info.width}x${info.height}`,
                              same: (await pixelHash()) === h0, layers: (await e.layers()).map(n => n.name).join('|') === names };
                await e.undo().catch(() => {});
            } catch (x) { o[format] = { error: x.message }; }
            // restore the two-layer document for the next format
            if (format !== 'jpg') { await e.newDocument({ width: 200, height: 150 }); e.beginStroke({ x: 20, y: 20, pressure: 1, timeMs: 0 }); e.continueStroke([{ x: 180, y: 120, pressure: 1, timeMs: 20 }]); e.endStroke(); await e.addNode({ type: 'paint', name: 'second' }); e.beginStroke({ x: 20, y: 120, pressure: 1, timeMs: 0 }); e.continueStroke([{ x: 180, y: 20, pressure: 1, timeMs: 20 }]); e.endStroke(); }
        }
        return o;
    });
    for (const format of ['psd', 'ora']) check(`${format}: round trip keeps pixels and layers`, r[format].same && r[format].layers, JSON.stringify(r[format]));
    for (const format of ['tga', 'bmp', 'png']) check(`${format}: round trip keeps pixels (flattened)`, r[format].same === true, JSON.stringify(r[format]));
    check('tiff: export is refused cleanly (known crash in the TIFF writer)', /does not work/.test(r.tiff.error ?? ''), JSON.stringify(r.tiff));
    check('webp: lossless-enough round trip opens at the same size', !r.webp.error && r.webp.dims === '200x150', JSON.stringify(r.webp));
    check('gif: exports and reopens at the same size', !r.gif.error && r.gif.dims === '200x150', JSON.stringify(r.gif));
    check('exr: exports and reopens at the same size', !r.exr.error && r.exr.dims === '200x150', JSON.stringify(r.exr));
    check('jpg: exports a JPEG and reopens at the same size', !r.jpg.error && r.jpg.magic[0] === 255 && r.jpg.magic[1] === 216 && r.jpg.dims === '200x150', JSON.stringify(r.jpg));
});
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failed ? `${failed} FAILED` : 'all passed');
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
process.exit(failed ? 1 : 0);
