// Look and feel of Krita's parts in the page: toolbox icons, the Toolbox / Tool Options dock layout, Krita dockers as panels.
// Mock part (?kritaMock=1) and a real-engine part (?engine=wasm, ~6 s start-up; skip with NO_WASM=1).
// Run: URL=http://localhost:5190/ node tests/krita-look.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = (process.env.URL ?? 'http://localhost:5190/').replace(/\?.*$/, '');
setTimeout(() => { console.log('FAILED: hard timeout'); process.exit(2); }, 280000);
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + JSON.stringify(detail)}`); if (!ok) failed++; };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const errors = [];
const open = async (query, size = { width: 1280, height: 800 }) => {
    const ctx = await browser.newContext({ viewport: size });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + query);
    await page.waitForFunction(() => window.__engine && /\d+\s*[x×]\s*\d+/.test(document.querySelector('.status-doc')?.textContent ?? ''), null, { timeout: 150000 });
    await page.waitForSelector('[data-krita-tool]', { state: 'attached', timeout: 150000 });   // on a phone the toolbox is inside the closed sheet
    await page.waitForTimeout(500);
    return page;
};
const rect = (page, sel) => page.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const icons = page => page.locator('[data-krita-tool]').evaluateAll(bs => bs.map(b => {
    const k = b.querySelector('.kicon'), cs = k && getComputedStyle(k);
    return { id: b.dataset.kritaTool, letters: !!b.querySelector('.letters'), mask: cs ? (cs.maskImage || cs.webkitMaskImage) : '', bg: cs?.backgroundColor, text: getComputedStyle(b).color };
}));
const menu = async (page, title) => { await page.getByRole('menuitem', { name: 'Settings', exact: true }).click(); await page.getByRole('menuitem', { name: title }).click(); };

// ================= mock
{
    const page = await open('?kritaMock=1');
    // dock layout
    const tb = await rect(page, '.dock-left .stack-first'), to = await rect(page, '.dock-left .tool-options'), dock = await rect(page, '.dock-left');
    check(await page.locator('.dock-left [role=tab]').count() === 0, 'default left dock has no tabs (Toolbox and Tool Options are both shown)');
    check(tb.y < to.y && tb.h > 20 && to.h > 100, 'toolbox on top, tool options below it', { tb, to });
    check(tb.h < dock.h * 0.46, 'toolbox is compact (at most 45% of the dock)', { tb: tb.h, dock: dock.h });
    check(to.y + to.h >= dock.y + dock.h - 40, 'tool options fill the rest of the dock', { to, dock });
    // the option window follows the real height of its box
    const box = await page.locator('.krita-options').evaluate(e => ({ w: Math.floor(e.clientWidth), h: Math.floor(e.clientHeight) }));
    const resizes = () => page.evaluate(() => JSON.parse(JSON.stringify(__engine.__kritaLog.resizes)));
    let r = await resizes();
    check(r.length >= 1 && r.at(-1)[1] === box.w && r.at(-1)[2] === box.h, "option window is resized to the box's real width and height", { r: r.at(-1), box });
    await page.waitForTimeout(1200);
    const after = await resizes();
    check(after.length === r.length, 'no resize loop: nothing more is sent while the dock stays as it is', { before: r.length, after: after.length });
    // dragging the splitter changes the dock width -> exactly one new size
    await page.locator('[aria-label="Resize left dock"]').focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(800);
    const r2 = await resizes(), box2 = await page.locator('.krita-options').evaluate(e => ({ w: Math.floor(e.clientWidth), h: Math.floor(e.clientHeight) }));
    check(box2.w > box.w && r2.at(-1)[1] === box2.w && r2.length - after.length <= 2, 'a wider dock sends the new size once', { box, box2, n: r2.length - after.length });
    // the window picture is not smoothed and drawn at its own size
    const pic = await page.locator('.krita-options canvas').evaluate(c => ({ ir: getComputedStyle(c).imageRendering, cw: c.width, ch: c.height, w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height, x: c.getBoundingClientRect().x }));
    check(pic.ir === 'pixelated' && Math.abs(pic.w - pic.cw) < 0.01 && Math.abs(pic.h - pic.ch) < 0.01 && Number.isInteger(pic.x), 'Krita window picture: pixelated, CSS size = picture size, integer position', pic);

    // saved layouts without stacking still work: tabs come back
    await page.evaluate(() => { const l = structuredClone(__settings.get('dockLayout')); delete l.docks.left.stacked; __settings.set('dockLayout', l); });
    await page.waitForTimeout(200);
    check(await page.locator('.dock-left [role=tab]').count() === 2, 'a saved layout without "stacked" shows Toolbox and Tool Options as tabs');
    await page.evaluate(() => __settings.reset(['dockLayout']));
    await page.waitForTimeout(200);
    check(await page.locator('.dock-left [role=tab]').count() === 0, 'reset layout is stacked again');
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Workspace: Minimal' }).click();
    await page.waitForTimeout(200);
    check(await page.locator('.dock-left .toolbox').count() === 1 && await page.locator('.dock-left .tool-options').count() === 0, 'Minimal workspace (toolbox only) shows no tool options');
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Workspace: Default' }).click();
    await page.waitForTimeout(200);
    check(await page.locator('.dock-left .tool-options').count() === 1, 'Default workspace brings the stack back');

    // dockers as panels
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    const items = await page.getByRole('menuitem').allInnerTexts();
    check(items.some(t => t.includes('Krita Dockers › Mock Palette')) && items.some(t => t.includes('Krita Dockers › Mock Histogram')), 'Settings lists the Krita dockers', items.filter(t => /Docker/.test(t)));
    await page.keyboard.press('Escape');
    await menu(page, /Mock Palette/);
    await page.waitForSelector('section[aria-label="right panels"] [role=tab]:text-is("Mock Palette")');
    check(await page.locator('section[aria-label="right panels"] [role=tab][aria-selected=true]:text-is("Mock Palette")').count() === 1, 'choosing a docker adds a panel and selects it');
    const dw = await page.locator('[role=tabpanel][aria-label="Mock Palette"] .krita-options').evaluate(e => ({ w: Math.floor(e.clientWidth), h: Math.floor(e.clientHeight) }));
    await page.waitForTimeout(500);
    let rs = await resizes();
    check(rs.some(x => x[0] === 10 && x[1] === dw.w && x[2] === dw.h), "docker window is resized to its dock's box", { rs: rs.filter(x => x[0] === 10), dw });
    const px = await page.locator('[role=tabpanel][aria-label="Mock Palette"] canvas').evaluate(c => [...c.getContext('2d').getImageData(5, 5, 1, 1).data]);
    check(px[0] === 0x22 && px[1] === 0x55 && px[2] === 0x77, 'docker picture is shown', px);
    await menu(page, /Mock Histogram/);
    await page.waitForSelector('section[aria-label="right panels"] [role=tab]:text-is("Mock Histogram")');
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    const marked = await page.getByRole('menuitem').allInnerTexts();
    check(marked.some(t => t.startsWith('✓ Krita Dockers › Mock Palette')) && marked.some(t => t.startsWith('✓ Krita Dockers › Mock Histogram')), 'open dockers are marked in the menu', marked.filter(t => /Docker/.test(t)));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Close Mock Palette' }).click();
    await page.waitForTimeout(300);
    check(await page.locator('[role=tab]:text-is("Mock Palette")').count() === 0, 'closing the panel removes it');
    check(JSON.stringify(await page.evaluate(() => __engine.__kritaLog.dockers)) === JSON.stringify([['mockPalette', true], ['mockHistogram', true], ['mockPalette', false]]), 'closing calls showKritaDocker(id, false)');
    // choosing an open docker again closes it
    await menu(page, /Krita Dockers › Mock Histogram/);
    await page.waitForTimeout(300);
    check(await page.locator('[role=tab]:text-is("Mock Histogram")').count() === 0, 'choosing an open docker closes it');
    await page.context().close();

    // phone: dockers are in the panel sheet
    const phone = await open('?kritaMock=1', { width: 390, height: 780 });
    await phone.getByRole('button', { name: '☰ Menu' }).click();
    await phone.getByRole('button', { name: 'Settings', exact: true }).click();
    await phone.getByRole('button', { name: /Mock Palette/ }).click();
    await phone.getByRole('button', { name: 'Panels' }).click();
    check(await phone.locator('.sheet-bottom [role=tab]:text-is("Mock Palette")').count() === 1, 'phone: an opened docker is a tab of the panel sheet');
    await phone.context().close();
}

// ================= real engine
if (!process.env.NO_WASM) {
    const page = await open('?engine=wasm');
    const tools = await page.evaluate(() => __engine.kritaTools());
    const list = await icons(page);
    const hidden = /(^|\/)(PanTool|ZoomTool)$/;
    const expect = tools.filter(t => !hidden.test(t.id));
    check(list.length === expect.length && list.length >= 30, `toolbox has all ${expect.length} Krita tools`, [list.length, expect.length]);
    check(list.every(t => !t.letters), 'no tool has the two-letter placeholder', list.filter(t => t.letters).map(t => t.id));
    const urls = [...new Set(list.map(t => (t.mask.match(/url\("?([^")]+)/) ?? [])[1]))];
    check(list.every(t => /\.svg/.test(t.mask)) && urls.length === list.length, 'each tool has its own SVG icon', list.filter(t => !/\.svg/.test(t.mask)).map(t => t.id));
    const bad = [];
    for (const u of urls) { const r = await page.evaluate(async u => { const x = await fetch(u); return [x.status, x.headers.get('content-type')]; }, u); if (r[0] !== 200 || !/svg/.test(r[1] ?? '')) bad.push([u, r]); }
    check(!bad.length, 'every icon file loads as SVG', bad);
    // themes: the icon takes the text colour of the theme
    const colours = {};
    for (const t of ['dark', 'light']) { await page.evaluate(t => __settings.set('theme', t), t); await page.waitForTimeout(150); colours[t] = (await icons(page))[0]; }
    check(colours.dark.bg === colours.dark.text && colours.light.bg === colours.light.text && colours.dark.bg !== colours.light.bg, 'icons follow the theme colour', colours);
    await page.evaluate(() => __settings.set('theme', 'dark'));
    // layout with Krita's real option panel
    const tb = await rect(page, '.dock-left .stack-first'), to = await rect(page, '.dock-left .krita-options'), dock = await rect(page, '.dock-left');
    check(tb.y < to.y && to.h > 100 && to.y + to.h <= dock.y + dock.h + 1, 'real engine: toolbox above Krita tool options, both inside the dock', { tb, to, dock });
    await page.waitForTimeout(1500);
    const box = await page.locator('.krita-options').evaluate(e => [Math.floor(e.clientWidth), Math.floor(e.clientHeight)]);
    const w = await page.evaluate(() => __engine.kritaWindows().then(ws => ws.find(x => x.kind === 'toolOptions')));
    check(w && Math.abs(w.width - box[0]) <= 2 && Math.abs(w.height - box[1]) <= 2, "Krita's option window matches the dock box", { w, box });
    await page.screenshot({ path: process.env.SHOT ?? '/tmp/claude-0/look-wasm.png' });
    await page.context().close();
}

check(!errors.length, 'no page errors', errors);
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
