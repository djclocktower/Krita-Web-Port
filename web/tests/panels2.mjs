// Overview, Color History, Specific Color and Color panels.
// Needs a dev server: npx vite --port 5183 --strictPort     Run: URL=http://localhost:5183/ node tests/panels2.mjs [mock|wasm|all]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = process.env.URL ?? 'http://localhost:5183/';
const SHOT = '/tmp/claude-0/-home-user-Krita-Web-Port/65182417-9f70-5299-9ecc-ec5673875a37/scratchpad/panels2.png';
const which = process.argv[2] ?? 'all';
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL  hard timeout'); process.exit(2); }, 280000).unref();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(w, h, query = '', touch = false) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL + query + (query.includes('?') || URL.includes('?') ? '&' : '?') + 'ui=desktop');
    await page.waitForFunction(() => window.__engine && window.__view && document.querySelector('.status-doc')?.textContent.match(/\d+ × \d+/), null, { timeout: 120000 });
    await page.waitForTimeout(500);
    return page;
}
const tab = async (page, title) => { await page.locator('section[aria-label="right panels"] [role=tab]', { hasText: new RegExp(`^${title}$`) }).click(); await page.waitForTimeout(150); };
const paint = (page, rgb, y = 300, x0 = 200, x1 = 600) => page.evaluate(async ([rgb, y, x0, x1]) => {
    const e = window.__engine;
    await e.setColors({ foreground: { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 } });
    e.beginStroke({ x: x0, y, pressure: 1, timeMs: 0 });
    const pts = []; for (let i = 1; i <= 20; i++) pts.push({ x: x0 + (x1 - x0) * i / 20, y, pressure: 1, timeMs: i * 10 });
    e.continueStroke(pts); e.endStroke();
}, [rgb, y, x0, x1]);
const thumbPx = (page, fx, fy) => page.evaluate(([fx, fy]) => {   // fractional position in the thumbnail canvas, max over a 3x3 block
    const c = document.querySelector('.ovw-canvas'), g = c.getContext('2d');
    const x = Math.round(fx * c.width), y = Math.round(fy * c.height);
    return [...g.getImageData(Math.max(0, x - 1), Math.max(0, y - 1), 3, 3).data];
}, [fx, fy]);
const reddest = d => { let best = [0, 0, 0, 0]; for (let i = 0; i < d.length; i += 4) if (d[i] - d[i + 1] > best[0] - best[1]) best = [d[i], d[i + 1], d[i + 2], d[i + 3]]; return best; };
const isRed = p => p[0] > 180 && p[1] < 90 && p[2] < 90;

if (which !== 'wasm') {
    // ---------- colour maths (pure module, run in the page through vite)
    {
        const page = await open(1280, 800);
        const r = await page.evaluate(async () => {
            const m = await import('/src/panels/specificColor/colorMath.ts');
            let worst = { hsv: 0, hsl: 0, lab: 0 }, n = 0;
            for (let R = 0; R < 256; R += 15) for (let G = 0; G < 256; G += 15) for (let B = 0; B < 256; B += 15) {
                const c = [R / 255, G / 255, B / 255]; n++;
                const d = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i]) * 255));
                worst.hsv = Math.max(worst.hsv, d(c, m.hsvToRgb(m.rgbToHsv(c))));
                worst.hsl = Math.max(worst.hsl, d(c, m.hslToRgb(m.rgbToHsl(c))));
                const back = m.labToRgb(m.rgbToLab(c)); worst.lab = Math.max(worst.lab, d(c, back.rgb));
                if (back.clamped) worst.labClamped = (worst.labClamped ?? 0) + 1;
            }
            return { worst, n, white: m.rgbToLab([1, 1, 1]), red: m.rgbToLab([1, 0, 0]), black: m.rgbToLab([0, 0, 0]),
                oog: m.labToRgb([50, 120, 0]), inGamut: m.labToRgb([50, 10, 10]), hsvRed: m.rgbToHsv([1, 0, 0]), hslGrey: m.rgbToHsl([.5, .5, .5], 77),
                viaChannels: m.fromChannels('lab', m.toChannels('lab', [.2, .4, .6])).rgb };
        });
        check(r.worst.hsv < 1e-9 && r.worst.hsl < 1e-9, 'RGB<->HSV and RGB<->HSL round-trip exactly', JSON.stringify(r.worst));
        check(r.worst.lab < 1 && !r.worst.labClamped, `RGB->Lab->RGB within 1/255 for ${r.n} in-gamut colours, none flagged clamped`, JSON.stringify(r.worst));
        check(Math.abs(r.white[0] - 100) < .01 && Math.abs(r.white[1]) < .01 && Math.abs(r.white[2]) < .01, 'white -> L 100, a 0, b 0', JSON.stringify(r.white));
        check(Math.abs(r.red[0] - 53.2) < .15 && Math.abs(r.red[1] - 80.1) < .3 && Math.abs(r.red[2] - 67.2) < .3, 'red -> L 53.2, a 80.1, b 67.2', JSON.stringify(r.red));
        check(Math.abs(r.black[0]) < .01, 'black -> L 0');
        check(r.oog.clamped && !r.inGamut.clamped, 'out-of-gamut Lab is flagged, in-gamut is not', JSON.stringify([r.oog, r.inGamut]));
        check(r.hsvRed[0] === 0 && r.hsvRed[1] === 1 && r.hslGrey[0] === 77, 'HSV of red; hue kept for grey');
        await page.context().close();
    }

    // ---------- desktop, mock engine
    const page = await open(1280, 800);
    await page.evaluate(() => {
        const e = window.__engine; window.__calls = { export: 0, thumb: 0, setColors: 0, refresh: 0 };
        for (const [k, name] of [['exportDocument', 'export'], ['nodeThumbnail', 'thumb'], ['setColors', 'setColors'], ['refresh', 'refresh']]) {
            const f = e[k].bind(e); e[k] = (...a) => { window.__calls[name]++; if (name === 'refresh' && /overview/.test(new Error().stack)) window.__calls.ovRefresh = (window.__calls.ovRefresh ?? 0) + 1; return f(...a); };
        }
    });
    const calls = () => page.evaluate(() => ({ ...window.__calls }));
    const V = () => page.evaluate(() => { const s = window.__view.view.get(); return { scale: s.scale, rot: s.rot, mirror: s.mirror, panX: s.panX, panY: s.panY, w: s.w, h: s.h, docW: s.docW, docH: s.docH }; });
    const viewFn = (fn, ...args) => page.evaluate(async ([fn, args]) => { const m = await import('/src/canvas/view.ts'); m[fn](...args); }, [fn, args]);

    await tab(page, 'Overview');
    await page.waitForFunction(() => document.querySelector('.ovw-canvas')?.width > 1);
    const c0 = await calls();
    await paint(page, [1, 0, 0]);
    await page.waitForTimeout(300);
    const dims = await page.evaluate(() => { const c = document.querySelector('.ovw-canvas'); return [c.width, c.height]; });
    const s0 = await V();
    check(isRed(reddest(await thumbPx(page, 400 / 1600, 300 / 1200))), 'overview shows the red stroke where it was painted', JSON.stringify(reddest(await thumbPx(page, .25, .25))));
    check(!isRed(reddest(await thumbPx(page, 400 / 1600, 900 / 1200))), 'overview is not red away from the stroke');
    const c1 = await calls();
    check(c1.export === c0.export && c1.thumb === c0.thumb && (c1.ovRefresh ?? 0) === (c0.ovRefresh ?? 0), 'no exportDocument / nodeThumbnail / refresh while painting', JSON.stringify([c0, c1]));

    // view rectangle: accent-coloured pixels at the middles of the viewport edges
    const accentAt = async (img) => page.evaluate(([ix, iy]) => {
        const c = document.querySelector('.ovw-canvas'), g = c.getContext('2d'), s = window.__view.view.get();
        const k = c.width / s.docW, x = Math.round(ix * k), y = Math.round(iy * k);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const d = g.getImageData(x + dx, y + dy, 1, 1).data;
            if (d[2] - d[0] > 40 && d[2] > 120) return true;   // accent blue, possibly blended on an antialiased edge
        }
        return false;
    }, img);
    const rectMatches = async (label) => {
        await page.waitForTimeout(150);
        const pts = await page.evaluate(() => { const { view, toImage } = window.__view, s = view.get();
            return [[s.w / 2, 0], [s.w, s.h / 2], [s.w / 2, s.h], [0, s.h / 2]].map(([x, y]) => toImage(x, y)); });
        const inside = pts.map(p => p.x > 4 && p.y > 4 && p.x < s0.docW - 4 && p.y < s0.docH - 4);
        const hits = [];
        for (const p of pts) hits.push(await accentAt([p.x, p.y]));
        check(inside.some(Boolean) && hits.every((h, i) => h || !inside[i]), `view rectangle matches the main view: ${label}`, JSON.stringify({ inside, hits }));
    };
    await viewFn('zoomTo', 2); await page.waitForTimeout(300); await rectMatches('zoom 200%');
    await viewFn('pan', 150, -80); await rectMatches('after pan');
    await viewFn('rotateBy', 0.5); await rectMatches('after rotate');
    await viewFn('toggleMirror'); await rectMatches('after mirror');
    await viewFn('toggleMirror'); await viewFn('resetRotation'); await viewFn('fit');

    // drag in the overview pans the main view: the dragged-to image point ends up at the viewport centre
    const box = await page.locator('.ovw-canvas').boundingBox();
    await viewFn('zoomTo', 1.5);
    await page.mouse.move(box.x + box.width * .2, box.y + box.height * .3); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .7, box.y + box.height * .6, { steps: 5 });
    await page.mouse.up();
    const centre = await page.evaluate(() => { const { view, toImage } = window.__view, s = view.get(); return toImage(s.w / 2, s.h / 2); });
    check(Math.abs(centre.x - s0.docW * .7) < 12 && Math.abs(centre.y - s0.docH * .6) < 12, 'dragging in the overview centres the main view on that image point', JSON.stringify(centre));
    // wheel zooms
    const before = (await V()).scale;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -300);
    await page.waitForTimeout(100);
    check((await V()).scale > before * 1.2, 'wheel on the overview zooms in', `${before} -> ${(await V()).scale}`);
    // sliders and mirror, two-way
    await page.locator('#ovw-zoom').fill(String(Math.log2(0.5)));
    check(Math.abs((await V()).scale - 0.5) < 0.01, 'zoom slider sets the view scale', String((await V()).scale));
    await viewFn('zoomTo', 3); await page.waitForTimeout(100);
    check(await page.locator('.ovw-row output').first().innerText() === '300%', 'zoom readout follows the view');
    await page.locator('#ovw-rot').fill('45');
    check(Math.abs((await V()).rot - Math.PI / 4) < 0.02, 'rotation slider rotates the view', String((await V()).rot));
    await viewFn('rotateBy', 0.2); await page.waitForTimeout(100);
    check(Number(await page.locator('#ovw-rot').inputValue()) === Math.round((Math.PI / 4 + 0.2) * 180 / Math.PI), 'rotation slider follows the view');
    await page.getByRole('button', { name: 'Mirror', exact: true }).click();
    check((await V()).mirror === true && await page.getByRole('button', { name: 'Mirror', exact: true }).getAttribute('aria-pressed') === 'true', 'mirror button toggles the view');
    await page.getByRole('button', { name: 'Mirror', exact: true }).click(); await viewFn('resetRotation'); await viewFn('fit');

    // document size change rebuilds the thumbnail and refreshes once
    const r0 = (await calls()).ovRefresh ?? 0;
    await page.evaluate(() => window.__engine.scaleImage({ width: 800, height: 800 }));
    await page.waitForTimeout(500);
    const d2 = await page.evaluate(() => { const c = document.querySelector('.ovw-canvas'), g = c.getContext('2d'); return { w: c.width, h: c.height, a: g.getImageData(c.width / 2, c.height / 2, 1, 1).data[3] }; });
    check(d2.w === d2.h && d2.h !== dims[1] && d2.a > 0, 'overview rebuilds after scaleImage and is repopulated', JSON.stringify([dims, d2]));
    check((await calls()).ovRefresh === r0 + 1, 'exactly one refresh() from the overview after the size change', String((await calls()).ovRefresh - r0));

    // ---------- colour history
    await page.evaluate(async () => { await window.__engine.newDocument({ width: 1600, height: 1200 }); });
    await page.waitForTimeout(300);
    await tab(page, 'Color History');
    const sw = () => page.locator('.chist-swatch');
    const order = () => page.evaluate(() => [...document.querySelectorAll('.chist-swatch')].map(b => b.title));
    await paint(page, [1, 0, 0], 100); await paint(page, [0, 1, 0], 200); await paint(page, [0, 0, 1], 300); await paint(page, [0, 1, 0], 400);
    await page.waitForTimeout(200);
    const o = await order();
    check(JSON.stringify(o) === JSON.stringify(['#00ff00', '#0000ff', '#ff0000']), 'history: most recent first, distinct', JSON.stringify(o));
    await paint(page, [0, 1, 0], 500); await paint(page, [0, 1, 0], 600);
    check((await order()).length === 3, 'history: no duplicates in a row');
    await sw().nth(2).click();
    const fg = await page.evaluate(async () => (await window.__engine.colors()).foreground);
    check(fg.r === 1 && fg.g === 0 && fg.b === 0, 'history: clicking a swatch restores that foreground colour', JSON.stringify(fg));
    await page.evaluate(async () => { await window.__engine.setColors({ foreground: { r: .2, g: .2, b: .2, a: 1 } }); });
    const n0 = (await order()).length;
    await page.evaluate(() => window.__engine.undo());   // undo/redo must not add entries
    await page.waitForTimeout(100);
    check((await order()).length === n0, 'history: undo does not record');
    await page.evaluate(() => { const e = window.__engine; for (let i = 0; i < 35; i++) { e.setColors({ foreground: { r: i / 40, g: .5, b: .5, a: 1 } }); e.beginStroke({ x: 10, y: 10 + i, pressure: 1, timeMs: 0 }); e.endStroke(); } });
    await page.waitForTimeout(300);
    check((await order()).length === 30, 'history: capped at 30', String((await order()).length));
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    check((await order()).length === 0, 'history: clear empties it');

    // ---------- specific colour selector + feedback loop
    await tab(page, 'Specific Color');
    await page.evaluate(() => window.__engine.setColors({ foreground: { r: 1, g: 0, b: 0, a: 1 } }));
    await page.waitForTimeout(150);
    const base = (await calls()).setColors;
    const slider = (name) => page.getByRole('slider', { name, exact: true });
    check(await slider('HSV S').inputValue() === '100' && await slider('HSV V').inputValue() === '100', 'selector shows the engine colour (red = HSV 0/100/100)');
    await slider('HSV S').fill('50');
    await page.waitForTimeout(200);
    const c = (await page.evaluate(async () => (await window.__engine.colors()).foreground));
    check(Math.abs(c.r - 1) < .01 && Math.abs(c.g - .5) < .01 && Math.abs(c.b - .5) < .01, 'slider edit reaches the engine', JSON.stringify(c));
    check((await calls()).setColors === base + 1, 'one slider edit = exactly one setColors (no feedback loop)', String((await calls()).setColors - base));
    const trackBg = await slider('HSV S').evaluate(el => el.style.background);
    check(/linear-gradient/.test(trackBg) && trackBg.includes('rgb(255, 0, 0)') && trackBg.includes('rgb(255, 255, 255)'), 'slider track is a gradient of the colours it would produce', trackBg.slice(0, 120));
    await page.evaluate(() => window.__engine.setColors({ foreground: { r: 0, g: 0, b: 1, a: 1 } }));
    await page.waitForTimeout(200);
    check(await slider('HSV H').inputValue() === '240' && await slider('HSV S').inputValue() === '100', 'engine change moves the sliders');
    check((await calls()).setColors === base + 2, 'the panel sent nothing back for an engine change', String((await calls()).setColors - base));
    await page.getByLabel('Hex colour').last().fill('#336699'); await page.getByLabel('Hex colour').last().press('Enter'); await page.getByLabel('Hex colour').last().blur();
    await page.waitForTimeout(200);
    const hexC = await page.evaluate(async () => (await window.__engine.colors()).foreground);
    check(Math.round(hexC.r * 255) === 0x33 && Math.round(hexC.b * 255) === 0x99, 'hex field sets the colour');
    await page.getByRole('tab', { name: 'RGB', exact: true }).click();
    await page.getByRole('button', { name: '0–255' }).click();
    check(await page.getByLabel('RGB R value').inputValue() === '20', 'RGB 0-100% toggle (0x33 = 20 %)', await page.getByLabel('RGB R value').inputValue());
    await page.getByLabel('RGB R value').fill('100'); await page.getByLabel('RGB R value').blur();
    await page.waitForTimeout(150);
    check((await page.evaluate(async () => (await window.__engine.colors()).foreground.r)) === 1, 'RGB percent field edits the colour');
    await page.getByRole('tab', { name: 'HSL', exact: true }).click();
    await page.evaluate(() => window.__engine.setColors({ foreground: { r: 1, g: 0, b: 0, a: 1 } }));
    await page.waitForTimeout(150);
    check(await slider('HSL L').inputValue() === '50', 'HSL model: red has L 50');
    await page.getByRole('tab', { name: 'Lab', exact: true }).click();
    check(await slider('Lab L*').inputValue() === '53', 'Lab model: red has L* 53', await slider('Lab L*').inputValue());
    await page.getByLabel('Lab a* value').fill('-120'); await page.getByLabel('Lab a* value').blur();
    await page.waitForTimeout(150);
    check(await page.locator('.spc-num.clamped').count() === 3 && await page.locator('.spc-warn').count() === 1, 'Lab: out-of-gamut edit is marked as clamped');
    await page.getByLabel('Lab a* value').fill('10'); await page.getByLabel('Lab a* value').blur();
    await page.getByLabel('Lab b* value').fill('10'); await page.getByLabel('Lab b* value').blur();
    await page.waitForTimeout(150);
    check(await page.locator('.spc-num.clamped').count() === 0, 'Lab: mark clears when back in gamut');

    // ---------- colour panel fg/bg toggle
    await tab(page, 'Color');
    await page.evaluate(() => window.__engine.setColors({ foreground: { r: 0, g: 0, b: 0, a: 1 }, background: { r: 1, g: 1, b: 1, a: 1 } }));
    await page.getByRole('button', { name: 'Edit background colour' }).click();
    await page.getByLabel('Hex colour').fill('#ff8000'); await page.getByLabel('Hex colour').blur();
    await page.waitForTimeout(150);
    const cc = await page.evaluate(() => window.__engine.colors());
    check(cc.background.r === 1 && Math.round(cc.background.g * 255) === 128 && cc.foreground.r === 0, 'colour panel: toggle to background edits only the background', JSON.stringify(cc));
    await page.getByRole('button', { name: 'Edit foreground colour' }).click();
    check(await page.getByLabel('Hex colour').inputValue() === '#000000', 'colour panel: toggle back shows the foreground');

    // ---------- screenshot of the three panels (stacked, from a tall viewport so each is visible at once)
    await page.evaluate(async () => {
        const e = window.__engine; await e.setColors({ foreground: { r: .9, g: .3, b: .1, a: 1 } });
        for (const [c, y] of [[[1, 0, 0], 100], [[0, .6, .2], 200], [[.1, .3, 1], 300]]) { await e.setColors({ foreground: { r: c[0], g: c[1], b: c[2], a: 1 } }); e.beginStroke({ x: 100, y: y + 300, pressure: 1, timeMs: 0 }); e.continueStroke([{ x: 700, y: y + 350, pressure: 1, timeMs: 20 }]); e.endStroke(); }
        await e.setColors({ foreground: { r: .9, g: .3, b: .1, a: 1 } });
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    // mount all three at once in a scratch container using the real components for the screenshot
    await page.evaluate(async () => {
        const { render, h } = await import('/node_modules/.vite/deps/preact.js').catch(() => import('preact'));
        const mods = await Promise.all(['overview', 'colorHistory', 'specificColor'].map(n => import(`/src/panels/${n}/index.tsx`)));
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;top:0;right:0;width:300px;height:100vh;overflow:auto;background:var(--panel);z-index:99999;color:var(--text)';
        document.body.append(host);
        const C = () => h('div', null, mods.map(m => h('div', { key: m.default.id }, h('div', { style: 'padding:4px 6px;background:var(--bg);font-weight:600' }, m.default.title), h(m.default.component, { engine: window.__engine }))));
        render(h(C, null), host);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: SHOT });
    console.log('screenshot ' + SHOT);
    await page.context().close();

    // ---------- touch, 390x844: through the shell's sheet
    const t = await open(390, 844, '', true);
    const small = root => t.evaluate(root => {
        const out = [];
        for (const el of document.querySelectorAll(`${root} :is(button, input, select, [role=button], [role=tab], [role=slider])`)) {
            const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
            if (!r.width || !r.height || cs.visibility === 'hidden') continue;
            if (Math.min(r.width, r.height) < 39.5) out.push(`${el.tagName.toLowerCase()}.${el.className}[${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return out;
    }, root);
    const show = async title => {
        if (!await t.locator('.sheet-bottom').count()) { await t.getByRole('button', { name: 'Panels', exact: true }).tap(); await t.locator('.sheet-bottom').waitFor(); }
        await t.locator('.sheet-bottom [role=tab]', { hasText: new RegExp(`^${title}$`) }).tap();
        await t.locator(`.sheet-bottom [role=tabpanel][aria-label="${title}"]`).waitFor();
        await t.waitForTimeout(400);
        return '.sheet-bottom [role=tabpanel]';
    };
    await t.evaluate(() => { window.__e = window.__engine; });
    let root = await show('Overview');
    let bad = await small(root); check(bad.length === 0, 'touch: Overview controls >= 40 px', bad.join('; '));
    await t.locator(`${root} button`, { hasText: 'Mirror' }).tap();
    check(await t.evaluate(() => window.__view.view.get().mirror), 'touch: tapping Mirror mirrors the view');
    root = await show('Color History');
    await t.evaluate(async () => { const e = window.__engine; await e.setColors({ foreground: { r: 1, g: 0, b: 0, a: 1 } }); e.beginStroke({ x: 50, y: 50, pressure: 1, timeMs: 0 }); e.endStroke(); await e.setColors({ foreground: { r: 0, g: 0, b: 1, a: 1 } }); });
    await t.waitForTimeout(200);
    bad = await small(root); check(bad.length === 0, 'touch: Color History controls >= 40 px', bad.join('; '));
    await t.locator(`${root} .chist-swatch`).first().tap();
    check(await t.evaluate(async () => (await window.__engine.colors()).foreground.r) === 1, 'touch: tapping a history swatch sets the foreground');
    root = await show('Specific Color');
    bad = await small(root); check(bad.length === 0, 'touch: Specific Color controls >= 40 px', bad.join('; '));
    await t.locator(`${root} [role=tab]`, { hasText: /^Lab$/ }).tap();
    check(await t.locator(`${root} [role=tab][aria-selected=true]`).innerText() === 'Lab', 'touch: tapping a model tab switches the model');
    root = await show('Color');
    bad = await small(root); check(bad.length === 0, 'touch: Color controls >= 40 px', bad.join('; '));
    await t.locator(`${root} .swatch`).nth(1).tap();
    check(await t.locator(`${root} .swatch`).nth(1).getAttribute('aria-pressed') === 'true', 'touch: tapping the background swatch selects it');
    await t.context().close();
}

if (which !== 'mock') {
    // ---------- real engine
    const page = await open(1280, 800, '?engine=wasm');
    await page.waitForTimeout(1500);
    await tab(page, 'Color History');
    await page.evaluate(async () => { window.__texts = []; window.__engine.on('historyChanged', h => window.__texts.push(h.undoText)); });
    await tab(page, 'Overview');
    await page.waitForFunction(() => document.querySelector('.ovw-canvas')?.width > 1, null, { timeout: 30000 });
    const info = await page.evaluate(() => window.__engine.documentInfo());
    await page.evaluate(async () => { const e = window.__engine; await e.setBrush({ size: 40, opacity: 1, flow: 1, eraser: false }).catch(() => {}); });
    // use the specific colour selector to choose the colour
    await tab(page, 'Specific Color');
    await page.getByRole('tab', { name: 'RGB', exact: true }).click();
    await page.getByLabel('Hex colour').fill('#1060c0'); await page.getByLabel('Hex colour').blur();
    await page.waitForTimeout(300);
    await tab(page, 'Overview');
    await page.evaluate(async () => {
        const e = window.__engine; e.beginStroke({ x: 200, y: 300, pressure: 1, timeMs: 0 });
        const pts = []; for (let i = 1; i <= 30; i++) pts.push({ x: 200 + 400 * i / 30, y: 300, pressure: 1, timeMs: i * 10 });
        e.continueStroke(pts); e.endStroke();
    });
    await page.waitForTimeout(2500);
    const px = await thumbPx(page, 400 / info.width, 300 / info.height);
    const blue = (() => { let best = null; for (let i = 0; i < px.length; i += 4) if (!best || px[i + 2] - px[i] > best[2] - best[0]) best = px.slice(i, i + 4); return best; })();
    check(blue[2] - blue[0] > 60 && blue[3] > 0, 'real engine: overview shows the real stroke', JSON.stringify(blue));
    const out = await page.evaluate(async () => {
        const bytes = await window.__engine.exportDocument('png');
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' })), c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
        g.drawImage(bmp, 0, 0);
        return { px: [...g.getImageData(400, 300, 1, 1).data], texts: window.__texts };
    });
    check(Math.abs(out.px[0] - 0x10) <= 3 && Math.abs(out.px[1] - 0x60) <= 3 && Math.abs(out.px[2] - 0xc0) <= 3, 'real engine: stroke painted with the colour set in the Specific Color selector (#1060c0)', JSON.stringify(out.px));
    console.log('  real engine undo texts seen: ' + JSON.stringify([...new Set(out.texts)]));
    await tab(page, 'Color History');
    const sw = await page.evaluate(() => [...document.querySelectorAll('.chist-swatch')].map(b => b.title));
    check(sw.includes('#1060c0'), 'real engine: history recorded the colour', JSON.stringify(sw));
    await page.context().close();
}

check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
await Promise.race([browser.close(), sleep(5000)]);
process.exit(failed ? 1 : 0);
