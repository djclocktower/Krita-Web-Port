// Krita's own tools, windows and action search, against the mock's fake (?kritaMock=1).
// Needs a dev server. Run: URL=http://localhost:5190/ node tests/krita-ui.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = (process.env.URL ?? 'http://localhost:5190/').replace(/\?.*$/, '');
setTimeout(() => { console.log('FAILED: hard timeout'); process.exit(2); }, 240000);
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + JSON.stringify(detail)}`); if (!ok) failed++; };
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

const browser = await chromium.launch();
const errors = [];
const open = async (touch = false) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: touch });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '?kritaMock=1&ui=desktop');
    await page.waitForFunction(() => window.__engine && window.__view && /\d+\s*[x×]\s*\d+/.test(document.querySelector('.status-doc')?.textContent ?? ''), null, { timeout: 60000 });
    await page.waitForSelector('[data-krita-tool]');
    await page.waitForTimeout(300);
    return { ctx, page };
};
const log = (page, k) => page.evaluate(k => JSON.parse(JSON.stringify(__engine.__kritaLog[k])), k);
// Toolbox and Tool Options are stacked in the default workspace (no tabs); a tabbed layout still needs the click.
const tab = async n => { const t = page.getByRole('tab', { name: n }); if (await t.count()) await t.click(); };
const settle = page => page.waitForTimeout(150);

const { ctx, page } = await open();
const box = await page.locator('canvas.view').boundingBox();
const at = async (x, y) => { const s = await page.evaluate(([x, y]) => __view.toScreen(x, y), [x, y]); return [box.x + s.x, box.y + s.y]; };
// colour of the image canvas under an image point, 0-255
const shown = (x, y) => page.evaluate(([x, y]) => {
    const s = __view.toScreen(x, y), c = document.createElement('canvas'), v = document.querySelector('canvas.view');
    c.width = v.width; c.height = v.height; const g = c.getContext('2d'); g.drawImage(v, 0, 0);
    return [...g.getImageData(Math.round(s.x * devicePixelRatio), Math.round(s.y * devicePixelRatio), 1, 1).data];
}, [x, y]);
const layer = (sel, x, y) => page.evaluate(([sel, x, y]) => [...document.querySelector(sel).getContext('2d').getImageData(x, y, 1, 1).data], [sel, x, y]);

// ---- toolbox
const tools = await page.locator('[data-krita-tool]').evaluateAll(b => b.map(x => ({ id: x.dataset.kritaTool, title: x.title, label: x.getAttribute('aria-label'), pressed: x.getAttribute('aria-pressed'), text: x.textContent.trim() })));
check(tools.length === 4, 'toolbox lists the 4 Krita tools (Pan and Zoom hidden)', tools.map(t => t.id));
check(tools[0].label === 'Freehand Brush Tool' && tools[0].title.includes('(B)'), 'name is the tooltip, shortcut appended', tools[0]);
check(tools[0].pressed === 'true', 'the engine-active tool is pressed', tools[0]);
check(await page.locator('[data-krita-tool] .kicon').count() === 4 && !await page.locator('[data-krita-tool] .letters').count(), "every Krita tool has Krita's icon, no letter fallback", tools.map(t => t.text));
check(await page.locator('.toolbox .section').count() >= 5, 'tools grouped by section plus the page View group');
check(await page.getByRole('button', { name: 'Pan', exact: true }).count() === 1, "the page's own Pan stays in the toolbox");

// ---- pointer: mouse drag with the brush
await page.mouse.move(...await at(100, 100));
await page.mouse.down(); await page.mouse.move(...await at(160, 100), { steps: 5 }); await page.mouse.up();
await settle(page);
let ptr = await log(page, 'pointers');
const press = ptr.find(p => p.type === 'press'), rel = ptr.filter(p => p.type === 'release').pop();
check(press && near(press.x, 100) && near(press.y, 100) && press.button === 'left', 'press arrives in image pixels', press);
check(ptr.filter(p => p.type === 'move' && p.down).length >= 3, 'drag sends moves with down=true');
check(rel && near(rel.x, 160), 'release arrives', rel);
check(press.pressure === undefined, 'a mouse sends no pressure');
const px = await shown(100, 100);
check(px[0] < 200, 'the fake brush drew black on the canvas', px);

// overlay after pointer events
const ovAlpha = (x, y) => layer('canvas.krita-overlay', x, y);
const s0 = await page.evaluate(() => __view.toScreen(160, 100));
const o1 = await ovAlpha(Math.round(s0.x), Math.round(s0.y));
check(o1[0] === 255 && o1[2] === 255 && o1[3] === 255, 'Krita overlay is drawn at the pointer', o1);
check(await page.evaluate(() => { const k = document.querySelector('canvas.krita-overlay'), o = document.querySelector('canvas.overlay'); return !!(k.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(document.querySelector('canvas.view').compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'overlay layer sits above the image and below the page aids');

// ---- pen via CDP: pressure, tilt, rotation
const cdp = await ctx.newCDPSession(page);
const [px0, py0] = await at(200, 200);
const pen = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.6, tiltX: 20, tiltY: -10, twist: 30, ...extra });
await pen('mousePressed', px0, py0); await pen('mouseMoved', px0 + 20, py0); await pen('mouseReleased', px0 + 20, py0);
await settle(page);
ptr = await log(page, 'pointers');
const pp = ptr.filter(p => p.pressure !== undefined && p.type === 'press').pop();
check(pp && near(pp.pressure, 0.6, 0.05) && pp.xTilt === 20 && pp.yTilt === -10 && pp.rotation === 30, 'a pen sends pressure, tilt and rotation', pp);

// ---- right button and modifiers
await page.mouse.move(...await at(300, 300));
await page.keyboard.down('Shift');
await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
await page.keyboard.up('Shift');
ptr = await log(page, 'pointers');
const rp = ptr.filter(p => p.type === 'press').pop();
check(rp.button === 'right' && rp.shift === true, 'right button and Shift modifier are forwarded', rp);

// ---- line tool draws on release
await page.getByRole('button', { name: 'Line Tool' }).click();
await settle(page);
check(await page.evaluate(() => document.querySelector('canvas.view').style.cursor) === 'cell', 'kritaCursor is applied to the canvas');
check((await log(page, 'tools')).pop() === 'KritaShape/KisToolLine', 'selecting a tool calls setKritaTool');
check(await page.locator('[data-krita-tool="KritaShape/KisToolLine"]').getAttribute('aria-pressed') === 'true', 'toolbox follows kritaToolChanged');
const gone = await ovAlpha(Math.round(s0.x), Math.round(s0.y));
check(gone[3] === 0, 'overlay is cleared when the picture is null', gone);
await page.mouse.move(...await at(100, 300)); await page.mouse.down(); await page.mouse.move(...await at(200, 300), { steps: 4 }); await page.mouse.up();
await settle(page);
const lp = await shown(150, 300);
check(lp[0] < 200, 'line tool drew a line on release', lp);

// ---- viewport: once per frame, matching the page's view
const before = (await log(page, 'viewports')).length;
await page.evaluate(() => { for (let i = 0; i < 20; i++) __view.view.set({ scale: 0.3 + i * 0.01 }); });
await settle(page);
const vps = await log(page, 'viewports');
check(vps.length - before >= 1 && vps.length - before <= 2, 'twenty changes in one frame send at most two viewports', vps.length - before);
const lastVp = vps.pop(), exp = await page.evaluate(() => __view.toScreen(0, 0));
check(near(lastVp.zoom, 0.49, 0.001) && near(lastVp.offsetX, exp.x, 0.5) && near(lastVp.offsetY, exp.y, 0.5) && lastVp.width > 100, 'viewport carries zoom, offset (image 0,0 on screen) and size', lastVp);
await page.evaluate(() => __view.view.set({ rot: Math.PI / 2, mirror: true }));
await settle(page);
const rv = (await log(page, 'viewports')).pop();
check(near(rv.rotation, 90, 0.01) && rv.mirror === true, 'rotation (degrees) and mirror are sent', rv);
await page.evaluate(() => __view.view.set({ rot: 0, mirror: false, scale: 0.5, panX: 0, panY: 0 }));
await settle(page);

// ---- keys
await page.mouse.click(box.x + 5, box.y + 5, { button: 'middle' });   // focus nothing in particular
for (const k of ['Enter', 'Escape', 'ArrowLeft']) await page.keyboard.press(k);
await page.keyboard.down('Shift'); await page.keyboard.up('Shift');
const keys = await log(page, 'keys');
const has = (type, key) => keys.some(k => k.type === type && k.key === key);
check(has('keydown', 'Enter') && has('keyup', 'Enter') && has('keydown', 'Escape') && has('keydown', 'ArrowLeft') && has('keydown', 'Shift') && has('keyup', 'Shift'), 'Enter, Escape, arrows and Shift go to kritaKey', keys.map(k => k.key));
const nk = keys.length;
await page.keyboard.press('Delete');
check((await log(page, 'keys')).filter(k => k.key === 'Delete' && k.type === 'keydown').length === 0, "a key the page handles itself (Delete) is not forwarded");
void nk;

// ---- page navigation keeps working: wheel zoom and the page's Pan tool
const z0 = await page.evaluate(() => __view.view.get().scale), np = (await log(page, 'pointers')).length;
await page.mouse.move(...await at(400, 300)); await page.mouse.wheel(0, -300);
await settle(page);
check(await page.evaluate(() => __view.view.get().scale) > z0, 'wheel zoom stays with the page');
await page.getByRole('button', { name: 'Pan', exact: true }).click();
const pan0 = await page.evaluate(() => __view.view.get().panX);
await page.mouse.move(...await at(300, 300)); await page.mouse.down(); await page.mouse.move(box.x + 500, box.y + 300, { steps: 4 }); await page.mouse.up();
check(await page.evaluate(() => __view.view.get().panX) !== pan0, "the page's Pan tool pans");
const hover = (await log(page, 'pointers')).slice(np).filter(p => p.type !== 'move' || p.down);
check(hover.length === 0, 'no Krita press/drag while the page Pan tool is active', hover);
await tab('Tool Options');
check(await page.locator('.tool-options [data-kwin]').count() === 0, 'page tool shows the page tool options, not Krita\'s');
await tab('Toolbox');
await page.locator('[data-krita-tool="KritaShape/KisToolBrush"]').click();
await settle(page);

// ---- tool options window embedded in the panel
const opt = '.tool-options canvas[data-kwin="1"]';
await tab('Tool Options');
await page.waitForSelector(opt);
await page.waitForTimeout(500);   // the window resizes to the panel and repaints
const cb = await layer(opt, 20, 20);
check(cb[0] === 255 && cb[1] === 0, 'tool option window picture is shown (red checkbox)', cb);
const tint1 = await layer(opt, 100, 100);
const ob = await page.locator(opt).boundingBox();
await page.mouse.click(ob.x + 20, ob.y + 20);
await settle(page);
const cb2 = await layer(opt, 20, 20);
check(cb2[1] === 255 && cb2[0] === 0, 'click on the window is forwarded in window pixels and the picture repaints (green)', cb2);
const wi = (await log(page, 'windowInputs')).filter(w => w.id === 1 && w.type === 'press').pop();
check(wi && near(wi.x, 20) && near(wi.y, 20), 'window press coordinates', wi);
await tab('Toolbox');
await page.getByRole('button', { name: 'Transform Tool' }).click();
await tab('Tool Options');
await settle(page);
const tint2 = await layer(opt, 100, 100);
check(tint1.join() !== tint2.join(), 'the option picture changes with the tool', [tint1, tint2]);
const rs = await log(page, 'resizes');
const panelW = await page.locator('.tool-options .krita-options').evaluate(e => Math.floor(e.clientWidth));
check(rs.length > 0 && rs.at(-1)[0] === 1 && near(rs.at(-1)[1], panelW, 2), 'window follows the panel width (resizeKritaWindow)', [rs.at(-1), panelW]);
const bar = await layer(opt, panelW - 2, 50);
check(bar[0] === 255 && bar[1] === 255, 'repainted at the new size', bar);
await tab('Toolbox');
await page.getByRole('button', { name: 'Freehand Brush Tool' }).click();

// ---- action search
await page.mouse.click(box.x + 5, box.y + 5, { button: 'middle' });
await page.keyboard.press('Control+Enter');
await page.waitForSelector('.krita-search');
check(await page.locator('.krita-search [role=option]').count() === 3, 'action search lists all actions');
await page.locator('.krita-search input').fill('dis');
const dis = page.locator('.krita-search [role=option]');
check(await dis.count() === 1 && await dis.getAttribute('aria-disabled') === 'true', 'disabled action is shown greyed (aria-disabled)');
await dis.click({ force: true });
check(await page.locator('.krita-search').count() === 1 && (await log(page, 'actions')).length === 0, 'clicking a disabled action does nothing');
await page.locator('.krita-search input').fill('mock dialog');
await page.keyboard.press('Enter');
await page.waitForSelector('.krita-dialog');
await page.waitForTimeout(200);
check((await log(page, 'actions')).includes('mock_open_dialog'), 'Enter triggers the selected action');
check(await page.locator('.krita-search').count() === 0, 'search closes after running');

// ---- modal dialog
const dlg = await page.locator('.krita-dialog').boundingBox();
check(near(dlg.x + dlg.width / 2, 640, 3) && near(dlg.y + dlg.height / 2, 400, 3), 'dialog is centred', dlg);
check(await page.locator('.krita-title span').textContent() === 'Mock Dialog', 'title bar shows the window title');
check(await page.locator('.krita-backdrop').count() === 1, 'a modal dialog puts a backdrop over the app');
const dc = await layer('.krita-dialog canvas', 30, 30);
check(dc[2] > 150 && dc[0] < 80, 'dialog picture is painted (blue)', dc);
// drag by the title bar
const tb = await page.locator('.krita-title').boundingBox();
await page.mouse.move(tb.x + 30, tb.y + 10); await page.mouse.down(); await page.mouse.move(tb.x + 130, tb.y + 60, { steps: 4 }); await page.mouse.up();
const dlg2 = await page.locator('.krita-dialog').boundingBox();
check(near(dlg2.x - dlg.x, 100, 3) && near(dlg2.y - dlg.y, 50, 3), 'dialog drags by its title bar', [dlg, dlg2]);
// pop-up from the dialog
const dcv = await page.locator('.krita-dialog canvas').boundingBox();
await page.mouse.click(dcv.x + 50, dcv.y + 80);
await page.waitForSelector('.krita-popup canvas');
await settle(page);
const pop = await page.locator('.krita-popup').boundingBox();
check(near(pop.x, dcv.x + 20, 2) && near(pop.y, dcv.y + 100, 2), 'pop-up is placed relative to its parent window picture', [pop, dcv]);
const pc = await layer('.krita-popup canvas', 10, 10);
check(pc[0] === 255 && pc[1] > 100 && pc[2] === 0, 'pop-up picture is painted (orange)', pc);
// click outside -> Escape
await page.mouse.click(10, 10);
await settle(page);
const esc = (await log(page, 'windowInputs')).filter(w => w.id === 3 && w.key === 'Escape');
check(esc.length >= 1 && await page.locator('.krita-popup').count() === 0, 'click outside a pop-up sends it Escape and it closes', esc.length);
check(await page.locator('.krita-dialog').count() === 1, 'the dialog stays open');
// the canvas cannot be reached through the backdrop
const npb = (await log(page, 'pointers')).length;
await page.mouse.click(box.x + 300, box.y + 300);
check((await log(page, 'pointers')).length === npb, 'the backdrop blocks the canvas while a modal is open');
await page.locator('.krita-title button').click();
await page.waitForTimeout(200);
check(await page.locator('.krita-dialog').count() === 0 && await page.locator('.krita-backdrop').count() === 0, 'close button closes the dialog and removes the backdrop');
check(!(await page.evaluate(() => __engine.__kritaLog.windowInputs.some(w => w.id === 2 && w.type === 'keydown' && w.key === 'a'))), 'sanity');

// ---- the menu entry
await page.getByRole('menuitem', { name: 'Settings' }).click();
check(await page.getByRole('menuitem', { name: /Search Krita Actions/ }).isEnabled(), 'Settings menu has Search Krita Actions');
await page.keyboard.press('Escape');

// ---- touch: a tap with a finger reaches Krita's tool and its windows
await ctx.close();
const t = await open(true);
const tbox = await t.page.locator('canvas.view').boundingBox();
const tat = async (x, y) => { const s = await t.page.evaluate(([x, y]) => __view.toScreen(x, y), [x, y]); return { x: tbox.x + s.x, y: tbox.y + s.y }; };
const tp = await tat(120, 120);
await t.page.touchscreen.tap(tp.x, tp.y);
await t.page.waitForTimeout(200);
const tptr = await t.page.evaluate(() => __engine.__kritaLog.pointers);
check(tptr.some(p => p.type === 'press' && near(p.x, 120, 2)) && tptr.some(p => p.type === 'release'), 'a touch tap sends press and release', tptr.length);
await t.page.evaluate(() => __engine.triggerKritaAction('mock_open_dialog'));
await t.page.waitForSelector('.krita-dialog canvas');
await t.page.waitForTimeout(200);
const tdc = await t.page.locator('.krita-dialog canvas').boundingBox();
await t.page.touchscreen.tap(tdc.x + 50, tdc.y + 80);
await t.page.waitForSelector('.krita-popup canvas', { timeout: 3000 }).then(() => check(true, 'a tap on a dialog is forwarded; the pop-up opens'), () => check(false, 'a tap on a dialog is forwarded; the pop-up opens'));
await t.page.waitForTimeout(200);
await t.page.touchscreen.tap(8, 8);
await t.page.waitForTimeout(200);
check(await t.page.locator('.krita-popup').count() === 0, 'a tap outside closes the pop-up');
await t.ctx.close();

check(errors.length === 0, 'no page errors', errors);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
