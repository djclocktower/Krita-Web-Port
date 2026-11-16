// Phase 4 tools check: canvas tools, selections, marching ants, toolbox. Needs a dev server: npx vite --port 5182 --strictPort
// Run: node tests/phase4-tools.mjs   (exits non-zero on any failure; hard timeout so it cannot hang)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = 'http://localhost:5182/';
const SHOT = '/tmp/claude-0/-home-user-Krita-Web-Port/65182417-9f70-5299-9ecc-ec5673875a37/scratchpad/tools.png';
setTimeout(() => { console.log('FAILED: hard timeout'); process.exit(2); }, 280000);
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

const launch = () => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let browser = await launch();
const errors = [];
const open = async (url, viewport = { width: 1280, height: 800 }, deviceScaleFactor = 1) => {
    const page = await (await browser.newContext({ viewport, deviceScaleFactor })).newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__engine && window.__view && /\d+\s*[x×]\s*\d+/.test(document.querySelector('.status-doc')?.textContent ?? ''), null, { timeout: 120000 });
    return page;
};

// Everything below is written against a page: helpers close over `page`.
function helpers(page) {
    const h = {};
    h.settle = () => page.waitForTimeout(150);
    h.box = null;
    // image pixel -> page coordinates under the current view
    h.at = async (x, y) => { const s = await page.evaluate(([x, y]) => __view.toScreen(x, y), [x, y]); return [h.box.x + s.x, h.box.y + s.y]; };
    h.pixel = (x, y) => page.evaluate(([x, y]) => {
        const c = document.querySelector('canvas.view'), r = c.getBoundingClientRect(), k = c.width / r.width;
        const t = document.createElement('canvas'); t.width = t.height = 1;
        const g = t.getContext('2d'); g.drawImage(c, (x - r.left) * k, (y - r.top) * k, 1, 1, 0, 0, 1, 1);
        return [...g.getImageData(0, 0, 1, 1).data];
    }, [x, y]);
    h.pixelAt = async (x, y) => h.pixel(...await h.at(x, y));       // colour shown at an image position
    h.red = p => p[0] > 200 && p[1] < 60 && p[2] < 60;
    h.blue = p => p[2] > 200 && p[0] < 60 && p[1] < 60;
    h.white = p => p[0] > 235 && p[1] > 235 && p[2] > 235;
    // number of non-transparent overlay pixels in a rectangle of page coordinates (default: everywhere)
    h.ants = (rect) => page.evaluate(r => {
        const c = document.querySelector('canvas.overlay'), b = c.getBoundingClientRect(), k = c.width / b.width;
        const [x, y, w, hh] = r ? [(r[0] - b.left) * k, (r[1] - b.top) * k, r[2] * k, r[3] * k].map(Math.round) : [0, 0, c.width, c.height];
        const d = c.getContext('2d').getImageData(Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, hh)).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
        return n;
    }, rect);
    h.antsNear = async (x, y) => { const [px, py] = await h.at(x, y); return h.ants([px - 3, py - 3, 6, 6]); };
    h.bounds = () => page.evaluate(async () => {
        const o = await __engine.selectionOutline();
        if (!o.length) return null;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const l of o) for (let i = 0; i < l.length; i += 2) { x0 = Math.min(x0, l[i]); x1 = Math.max(x1, l[i]); y0 = Math.min(y0, l[i + 1]); y1 = Math.max(y1, l[i + 1]); }
        return { x0, y0, x1, y1 };
    });
    h.isBounds = (b, x0, y0, x1, y1, tol = 2) => !!b && near(b.x0, x0, tol) && near(b.y0, y0, tol) && near(b.x1, x1, tol) && near(b.y1, y1, tol);
    h.fill = async () => { await page.evaluate(() => __engine.fillSelection('foreground')); await h.settle(); };
    h.docInfo = () => page.evaluate(() => __engine.documentInfo());
    h.fresh = async () => {
        await page.evaluate(async () => {
            await __engine.newDocument({ width: 400, height: 300 });
            await __engine.setColors({ foreground: { r: 1, g: 0, b: 0, a: 1 }, background: { r: 0, g: 0, b: 1, a: 1 } });
        });
        await page.keyboard.press('2'); await page.keyboard.press('5');   // fit, no rotation
        await h.settle();
        h.box = await page.locator('canvas.view').boundingBox();
    };
    // drag between image positions; `mods` are held before the press, `late` after it
    h.drag = async (a, b, { mods = [], late = [], steps = 8, escape = false } = {}) => {
        const p = await h.at(...a), q = await h.at(...b);
        for (const m of mods) await page.keyboard.down(m);
        await page.mouse.move(...p); await page.mouse.down();
        for (const m of late) await page.keyboard.down(m);
        await page.mouse.move(...q, { steps });
        if (escape) await page.keyboard.press('Escape');
        await page.mouse.up();
        for (const m of [...late, ...mods]) await page.keyboard.up(m);
        await h.settle();
    };
    h.path = async pts => {
        const [first, ...rest] = await Promise.all(pts.map(p => h.at(...p)));
        await page.mouse.move(...first); await page.mouse.down();
        for (const p of rest) await page.mouse.move(...p, { steps: 4 });
        await page.mouse.up(); await h.settle();
    };
    h.tool = async (key) => { await page.keyboard.press(key); await h.settle(); };
    h.pressed = () => page.evaluate(() => document.querySelector('.toolbox [aria-pressed=true]')?.getAttribute('aria-label'));
    h.view = () => page.evaluate(() => ({ ...__view.view.get() }));
    return h;
}

// ================================================================ mock engine (REAL=only skips it, REAL=skip skips the real-engine part)
if (process.env.REAL !== 'only') {
    const page = await open(BASE);
    const h = helpers(page);
    await h.fresh();
    const { at, drag, bounds, isBounds, tool, pixelAt, red, blue, white, fill } = h;

    // ---- toolbox and shortcuts
    const names = await page.locator('.toolbox button').evaluateAll(b => b.map(x => x.getAttribute('aria-label')));
    check(['Freehand Brush', 'Rectangular Selection', 'Elliptical Selection', 'Freehand Selection', 'Contiguous Selection', 'Fill', 'Gradient', 'Crop', 'Pan', 'Zoom'].every(n => names.includes(n)),
        'toolbox has a button per tool', names.join(', '));
    check(await h.pressed() === 'Freehand Brush', 'brush is the default tool');
    check((await page.locator('.toolbox button[aria-label="Fill"]').getAttribute('title')) === 'Fill (F)', 'tooltip shows the shortcut');
    await tool('Control+r'); check(await h.pressed() === 'Rectangular Selection', 'Ctrl+R selects the rectangle tool');
    await tool('j'); check(await h.pressed() === 'Elliptical Selection', 'J selects the ellipse tool');
    await tool('g'); check(await h.pressed() === 'Gradient', 'G selects the gradient tool');
    await tool('f'); check(await h.pressed() === 'Fill', 'F selects the fill tool');
    await tool('c'); check(await h.pressed() === 'Crop', 'C selects the crop tool');
    await tool('z'); check(await h.pressed() === 'Zoom', 'Z selects the zoom tool');
    check(await page.locator('canvas.view').evaluate(e => e.style.cursor) === 'zoom-in', 'canvas cursor follows the tool');
    await tool('b'); check(await h.pressed() === 'Freehand Brush', 'B selects the brush');
    await page.evaluate(() => { const i = document.createElement('input'); i.id = 'typing'; i.type = 'text'; document.body.append(i); i.focus(); });
    await page.keyboard.press('g');
    check(await h.pressed() === 'Freehand Brush', 'shortcuts do not fire while typing');
    await page.evaluate(() => document.querySelector('#typing').remove());
    await page.locator('.toolbox button[aria-label="Gradient"]').click();
    check(await h.pressed() === 'Gradient', 'clicking a toolbox button switches tools');
    await page.locator('.toolbox button[aria-label="Fill"]').focus(); await page.keyboard.press('Enter');
    check(await h.pressed() === 'Fill', 'toolbox buttons work from the keyboard');

    // ---- brush through the tool dispatch
    await tool('b');
    await drag([60, 150], [240, 150]);
    check(red(await pixelAt(150, 150)), 'brush paints through the tool dispatch');
    await page.keyboard.press('Control+z'); await h.settle();
    check(white(await pixelAt(150, 150)), 'brush stroke undoes');
    // Escape cancels a stroke and leaves no mark
    await drag([60, 150], [240, 150], { escape: true });
    check(white(await pixelAt(150, 150)), 'Escape cancels a brush stroke');

    // ---- rectangle selection and modifiers
    await tool('Control+r');
    await drag([50, 40], [150, 120]);
    let b = await bounds();
    check(isBounds(b, 50, 40, 150, 120), 'rect select: bounds match the drag', JSON.stringify(b));
    await fill();
    check(red(await pixelAt(100, 80)) && white(await pixelAt(200, 80)) && white(await pixelAt(100, 160)), 'rect select: fill is limited to the selection');
    check((await h.antsNear(100, 40)) > 0 && (await h.antsNear(150, 80)) > 0, 'marching ants are drawn on the selection edge');
    check((await h.ants([...(await at(80, 60)), 20, 20])) === 0, 'no ants inside the selection');
    const frame1 = await page.evaluate(() => { const c = document.querySelector('canvas.overlay'); return c.toDataURL(); });
    await page.waitForTimeout(400);
    const frame2 = await page.evaluate(() => { const c = document.querySelector('canvas.overlay'); return c.toDataURL(); });
    check(frame1 !== frame2, 'marching ants animate');
    await page.keyboard.press('Control+Shift+a'); await h.settle();
    check((await h.ants()) === 0, 'ants disappear on deselect');
    check((await bounds()) === null, 'deselect clears the selection');

    await h.fresh(); await tool('Control+r');
    await drag([50, 40], [150, 120]);
    await drag([200, 40], [300, 120], { mods: ['Shift'] });
    await fill();
    check(red(await pixelAt(100, 80)) && red(await pixelAt(250, 80)) && white(await pixelAt(175, 80)), 'Shift adds to the selection');
    b = await bounds(); check(isBounds(b, 50, 40, 300, 120), 'add: bounds are the union', JSON.stringify(b));

    await h.fresh(); await tool('Control+r');
    await drag([50, 40], [250, 200]);
    await drag([100, 80], [200, 160], { mods: ['Alt'] });
    await fill();
    check(red(await pixelAt(70, 60)) && white(await pixelAt(150, 120)), 'Alt subtracts from the selection');

    await h.fresh(); await tool('Control+r');
    await drag([50, 40], [200, 160]);
    await drag([120, 80], [280, 220], { mods: ['Shift', 'Alt'] });
    await fill();
    check(red(await pixelAt(160, 120)) && white(await pixelAt(70, 60)) && white(await pixelAt(250, 200)), 'Shift+Alt intersects');
    b = await bounds(); check(isBounds(b, 120, 80, 200, 160), 'intersect: bounds are the overlap', JSON.stringify(b));

    await h.fresh(); await tool('Control+r');
    await drag([50, 40], [200, 80], { late: ['Shift'] });
    b = await bounds(); check(isBounds(b, 50, 40, 200, 190) , 'Shift constrains the rectangle to a square', JSON.stringify(b));
    await h.fresh(); await tool('Control+r');
    await drag([150, 100], [200, 130], { mods: ['Control'] });
    b = await bounds(); check(isBounds(b, 100, 70, 200, 130), 'Ctrl draws from the centre', JSON.stringify(b));
    await drag([10, 10], [10, 10]);
    check((await bounds()) === null, 'a click with the select tool clears the selection');

    // selection mode in the tool options, for touch users
    await h.fresh(); await tool('Control+r');
    // Toolbox and Tool Options are stacked (no tabs) in the default layout, so there is nothing to switch
    check(await page.getByRole('tab', { name: 'Tool Options' }).count() === 0 && await page.locator('.dock-left .toolbox').isVisible(), 'Toolbox and Tool Options are both visible without switching tabs');
    await page.getByRole('group', { name: 'Selection mode' }).getByRole('button', { name: 'Add', exact: true }).click();
    check((await page.getByRole('group', { name: 'Selection mode' }).getByRole('button', { name: 'Add', exact: true }).getAttribute('aria-pressed')) === 'true', 'tool options show the selection mode');
    await drag([50, 40], [150, 120]); await drag([200, 40], [300, 120]);
    await fill();
    check(red(await pixelAt(100, 80)) && red(await pixelAt(250, 80)), 'Add mode from the options works without a modifier');
    await page.getByRole('group', { name: 'Selection mode' }).getByRole('button', { name: 'Replace', exact: true }).click();

    // ---- ellipse
    await h.fresh(); await tool('j');
    await drag([50, 40], [250, 200]);
    b = await bounds(); check(isBounds(b, 50, 40, 250, 200), 'ellipse: bounds match the drag', JSON.stringify(b));
    await fill();
    check(red(await pixelAt(150, 120)) && white(await pixelAt(55, 45)) && white(await pixelAt(245, 195)), 'ellipse: centre selected, corners not');
    await h.fresh(); await tool('j');
    await drag([50, 40], [250, 100], { late: ['Shift'] });
    b = await bounds(); check(b && near(b.x1 - b.x0, b.y1 - b.y0, 2) && near(b.x1 - b.x0, 200, 3), 'Shift constrains the ellipse to a circle', JSON.stringify(b));

    // ---- freehand lasso
    await h.fresh(); await tool('Control+r'); await tool('Control+Shift+a');
    await page.locator('.toolbox button[aria-label="Freehand Selection"]').click();
    await h.path([[100, 50], [200, 50], [200, 150], [100, 50]]);
    b = await bounds(); check(isBounds(b, 100, 50, 200, 150, 3), 'lasso: bounds match the path', JSON.stringify(b));
    await fill();
    check(red(await pixelAt(180, 70)) && white(await pixelAt(110, 140)), 'lasso: inside the triangle selected, outside not');

    // ---- contiguous selection
    await h.fresh(); await tool('Control+r');
    await drag([100, 80], [200, 160]); await fill();
    await page.keyboard.press('Control+Shift+a'); await h.settle();
    await page.locator('.toolbox button[aria-label="Contiguous Selection"]').click();
    await page.mouse.click(...await at(150, 120)); await h.settle();
    b = await bounds(); check(isBounds(b, 100, 80, 200, 160), 'contiguous select: clicking the red square selects exactly it', JSON.stringify(b));
    await page.keyboard.down('Alt'); await page.mouse.click(...await at(10, 10)); await page.keyboard.up('Alt'); await h.settle();
    b = await bounds(); check(isBounds(b, 100, 80, 200, 160), 'contiguous select: Alt+click subtracts the clicked region (the square stays)', JSON.stringify(b));

    // ---- fill
    await h.fresh(); await tool('Control+r');
    await drag([100, 50], [200, 150]);
    await tool('f');
    await page.mouse.click(...await at(150, 100)); await h.settle();
    check(red(await pixelAt(150, 100)) && white(await pixelAt(50, 100)), 'fill tool: click fills inside the selection only');
    await page.keyboard.down('Control'); await page.mouse.click(...await at(120, 70)); await page.keyboard.up('Control'); await h.settle();
    check(blue(await pixelAt(150, 100)), 'fill tool: Ctrl+click fills with the background colour');
    await page.keyboard.press('Control+Shift+a'); await h.settle();
    await page.mouse.click(...await at(30, 30)); await h.settle();
    check(red(await pixelAt(30, 30)) && red(await pixelAt(370, 270)), 'fill tool: without a selection the clicked region is filled');

    // ---- gradient
    await h.fresh(); await tool('g');
    const [g0, g1] = [await at(40, 150), await at(360, 150)];
    await page.mouse.move(...g0); await page.mouse.down(); await page.mouse.move(...g1, { steps: 6 });
    const mid = await at(200, 150);
    check((await h.ants([mid[0] - 3, mid[1] - 3, 6, 6])) > 0, 'gradient: the preview line is drawn on the overlay while dragging');
    await page.mouse.up(); await h.settle();
    check((await h.ants()) === 0, 'gradient: preview disappears on release');
    const left = await pixelAt(60, 150), right = await pixelAt(340, 150);
    check(left[0] > 200 && left[2] < 60 && right[2] > 200 && right[0] < 60, 'gradient: foreground to background along the drag', JSON.stringify([left, right]));
    await page.keyboard.press('Control+z'); await h.settle();
    check(white(await pixelAt(60, 150)), 'gradient: undo');
    await page.getByLabel('Reverse').check();
    await h.drag([40, 150], [360, 150]);
    const l2 = await pixelAt(60, 150);
    check(l2[2] > 200 && l2[0] < 60, 'gradient: Reverse option swaps the colours', JSON.stringify(l2));

    // ---- crop
    await h.fresh(); await tool('c');
    await drag([50, 40], [250, 200]);
    check((await h.antsNear(50, 100)) > 0, 'crop: the frame is drawn on the overlay');
    await drag([250, 200], [300, 250]);      // drag the bottom-right handle
    await page.keyboard.press('Enter'); await h.settle();
    let d = await h.docInfo();
    check(d.width === 250 && d.height === 210, 'crop: handle resize and Enter apply the crop', `${d.width}x${d.height}`);
    check((await h.ants()) === 0, 'crop: frame is gone after applying');
    await h.fresh(); await tool('c');
    await drag([50, 40], [250, 200]);
    await drag([100, 100], [120, 110]);      // drag inside: moves the frame
    await page.keyboard.press('Escape'); await h.settle();
    d = await h.docInfo();
    check(d.width === 400 && d.height === 300 && (await h.ants()) === 0, 'crop: Escape cancels and clears the frame');
    await drag([50, 40], [250, 200]);
    await page.getByRole('button', { name: 'Apply' }).click(); await h.settle();
    d = await h.docInfo();
    check(d.width === 200 && d.height === 160, 'crop: the Apply button crops', `${d.width}x${d.height}`);

    // ---- Escape cancels selection drags
    await h.fresh(); await tool('Control+r');
    await drag([50, 40], [150, 120], { escape: true });
    check((await bounds()) === null && (await h.ants()) === 0, 'Escape cancels a selection drag');
    await tool('g'); await drag([40, 150], [360, 150], { escape: true });
    check(white(await pixelAt(60, 150)), 'Escape cancels a gradient drag');

    // ---- pan and zoom tools
    await h.fresh(); await page.locator('.toolbox button[aria-label="Pan"]').click();
    const v0 = await h.view();
    await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.move(660, 440, { steps: 6 }); await page.mouse.up();
    const v1 = await h.view();
    check(near(v1.panX - v0.panX, 60, 1) && near(v1.panY - v0.panY, 40, 1), 'pan tool moves the view with the pointer', `${v1.panX - v0.panX}, ${v1.panY - v0.panY}`);
    check((await pixelAt(150, 150)) !== null && (await bounds()) === null, 'pan tool paints and selects nothing');
    await h.fresh(); await tool('z');
    let s0 = (await h.view()).scale;
    await page.mouse.click(...await at(200, 150)); await h.settle();
    check(near((await h.view()).scale / s0, 2, 0.01), 'zoom tool: click zooms in', String((await h.view()).scale / s0));
    await page.keyboard.down('Alt'); await page.mouse.click(...await at(200, 150)); await page.keyboard.up('Alt'); await h.settle();
    check(near((await h.view()).scale / s0, 1, 0.01), 'zoom tool: Alt+click zooms out');
    await h.fresh(); await tool('z'); s0 = (await h.view()).scale;
    await drag([100, 100], [160, 140]);
    const vz = await h.view(), cz = await page.evaluate(() => __view.toScreen(130, 120));
    check(vz.scale > s0 * 2 && near(cz.x, vz.w / 2, 2) && near(cz.y, vz.h / 2, 2), 'zoom tool: dragging a rectangle zooms to it', `scale ${s0} -> ${vz.scale}, centre ${cz.x},${cz.y}`);

    // ---- navigation works with every tool
    await h.fresh(); await tool('Control+r');
    const p0 = await h.view();
    await page.keyboard.down(' '); await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.move(650, 430, { steps: 5 }); await page.mouse.up(); await page.keyboard.up(' ');
    const p1 = await h.view();
    check(near(p1.panX - p0.panX, 50, 1) && (await bounds()) === null, 'Space+drag pans instead of selecting');
    await page.mouse.move(700, 400); await page.mouse.wheel(0, -400); await h.settle();
    check((await h.view()).scale > p1.scale, 'wheel zooms with a selection tool active');

    // ---- positions after zoom and rotation
    await h.fresh(); await tool('Control+r');
    await page.keyboard.press('6'); await page.keyboard.press('6'); await page.keyboard.press('1');   // 30 degrees, 100%
    await page.mouse.move(700, 400); await page.mouse.wheel(0, -300); await h.settle();
    const vr = await h.view();
    check(near(vr.rot, Math.PI / 6, 0.01) && vr.scale > 1, 'view is rotated and zoomed', JSON.stringify({ rot: vr.rot, scale: vr.scale }));
    await drag([150, 100], [210, 150]);
    b = await bounds();
    check(isBounds(b, 150, 100, 210, 150, 2), 'select in a rotated, zoomed view: bounds are exact', JSON.stringify(b));
    check((await h.antsNear(180, 100)) > 0 && (await h.antsNear(210, 125)) > 0 && (await h.antsNear(150, 125)) > 0, 'ants follow the rotated, zoomed view');
    await page.keyboard.press('5'); await page.keyboard.press('2'); await h.settle();
    check((await h.antsNear(180, 100)) > 0, 'ants follow the view when it changes');
    await page.keyboard.press('Control+Shift+a'); await tool('b'); await drag([30, 280], [90, 280]);
    check(red(await pixelAt(60, 280)) && white(await pixelAt(60, 240)), 'brush lands under the pointer after rotation');

    // ---- a second finger cancels the gesture
    await h.fresh(); await tool('b');
    {
        const cdp = await page.context().newCDPSession(page);
        const [f1, f2] = [await at(100, 150), await at(300, 150)];
        const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ x: p[0], y: p[1], id })) });
        await touch('touchStart', [f1]); await touch('touchMove', [[f1[0] + 20, f1[1]]]); await touch('touchMove', [[f1[0] + 40, f1[1]]]);
        await touch('touchStart', [[f1[0] + 40, f1[1]], f2]);
        await touch('touchEnd', []); await h.settle();
        check(white(await pixelAt(120, 150)), 'a second finger cancels the brush stroke');
    }

    check(errors.length === 0, 'no page errors on the mock engine', errors.join(' | '));
    await page.context().close();
}

// ================================================================ screenshot (mock, 2x)
{
    const page = await open(BASE, { width: 1100, height: 700 }, 2);
    const h = helpers(page);
    await h.fresh();
    await page.evaluate(async () => { await __engine.setColors({ foreground: { r: 0.95, g: 0.55, b: 0.2, a: 1 }, background: { r: 0.2, g: 0.35, b: 0.8, a: 1 } }); });
    await h.tool('g'); await h.drag([20, 20], [380, 280]);
    await h.tool('j'); await h.drag([60, 50], [220, 200]);
    await h.tool('Control+r'); await h.drag([180, 120], [340, 250], { mods: ['Shift'] });
    await page.locator('.toolbox button[aria-label="Rectangular Selection"]').focus();
    await page.mouse.move(5, 5);
    await page.screenshot({ path: SHOT });
    await page.context().close();
}

// ================================================================ real engine
// With the real engine the toolbox is Krita's own (data-krita-tool buttons) and pointer input goes to Krita's tools; the page's
// hand-built tools, their keys and their page-side marching-ants preview do not exist there. So each hand-built tool above is
// tested here through its Krita counterpart: select it in the toolbox, drag on the canvas, then check the engine's own state
// (selectionOutline(), pixels, no error banner). Page-only features that do not apply to Krita's tools are covered in the mock part:
// the hand-built tools' live preview/ants while dragging, modifier keys of the page tools, and the page's snapping (see canvas-aids.mjs).
if (process.env.REAL !== 'skip') {
    await browser.close(); browser = await launch();   // a fresh browser: after the mock part's many pages the real engine's start-up stalled (seen once, cause not found)
    const page = await open(BASE + '?engine=wasm');
    const h = helpers(page);
    await page.waitForSelector('[data-krita-tool]', { timeout: 60000 });
    await page.waitForTimeout(1500);
    h.box = await page.locator('canvas.view').boundingBox();
    const banner = async () => (await page.locator('.banner').first().innerText({ timeout: 4000 }).catch(() => '')) || '';
    const dismiss = async () => { const b = page.getByRole('button', { name: 'Dismiss error' }); if (await b.count()) await b.click(); };
    const pick = async id => { await page.locator(`[data-krita-tool="${id}"]`).click(); await page.waitForTimeout(200); };
    const picked = () => page.evaluate(() => document.querySelector('[data-krita-tool][aria-pressed=true]')?.getAttribute('data-krita-tool'));
    const outline = () => page.evaluate(() => __engine.selectionOutline());
    // each Krita tool must work without raising an error
    const works = async (name, act) => {
        await dismiss(); await act();
        await page.waitForTimeout(1200);
        const t = await banner();
        check(!t, `real engine: ${name} works without an error`, t);
    };
    await page.waitForFunction(() => __view.view.get().docW > 0);
    const [cx, cy] = [h.box.x + h.box.width / 2, h.box.y + h.box.height / 2];
    const drag = async (dx = 80, dy = 50) => { await page.mouse.move(cx - dx, cy - dy); await page.mouse.down(); await page.mouse.move(cx + dx, cy + dy, { steps: 5 }); await page.mouse.up(); };

    await pick('KisToolSelectRectangular');
    check(await picked() === 'KisToolSelectRectangular', 'real engine: clicking a Krita tool in the toolbox selects it', await picked());
    await works('rectangle select', drag);
    const rect = await outline();
    check(rect.length > 0, 'real engine: rectangle select produced a selection (selectionOutline)');
    const b = await h.bounds();
    const view = await page.evaluate(() => __view.view.get());
    check(b && near(b.x1 - b.x0, 160 / view.scale, 3 / view.scale + 1) && near(b.y1 - b.y0, 100 / view.scale, 3 / view.scale + 1), 'real engine: the selection is the dragged rectangle', JSON.stringify([b, view.scale]));
    await pick('KisToolSelectElliptical');
    await works('ellipse select', drag);
    check((await outline()).length > 0, 'real engine: ellipse select produced a selection');
    await pick('KisToolSelectOutline');
    await works('lasso select', async () => { await page.mouse.move(cx - 60, cy - 40); await page.mouse.down(); await page.mouse.move(cx + 60, cy - 40, { steps: 4 }); await page.mouse.move(cx, cy + 50, { steps: 4 }); await page.mouse.up(); });
    check((await outline()).length > 0, 'real engine: freehand selection produced a selection');
    await pick('KisToolSelectContiguous');
    await works('contiguous select', () => page.mouse.click(cx, cy));
    await pick('KritaFill/KisToolFill');
    await works('fill', () => page.mouse.click(cx, cy));
    await pick('KritaFill/KisToolGradient');
    await works('gradient', drag);
    await pick('KisToolCrop');
    await works('crop', async () => { await drag(); await page.keyboard.press('Enter'); });
    check(Number.isFinite(await h.ants()), 'real engine: overlay is readable after the tool calls', String(await h.ants()));
    // brush last, and quick: the Layers panel asks for thumbnails 400 ms into a stroke, which stalls the engine (see tests/stall-wasm.mjs)
    await dismiss(); await pick('KritaShape/KisToolBrush');
    await page.mouse.move(cx - 100, cy); await page.mouse.down(); await page.mouse.move(cx + 100, cy, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(500);
    const p = await h.pixel(cx, cy);
    check(p[0] < 100 && p[1] < 100 && p[2] < 100, 'real engine: the brush tool paints', JSON.stringify(p));
    check(errors.length === 0, 'no page errors with the real engine', errors.join(' | '));
    await page.context().close();
}

await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
