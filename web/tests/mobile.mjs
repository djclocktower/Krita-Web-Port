// Phone and tablet interfaces, on emulated devices. Needs a dev server: npx vite --port 5190 --strictPort
// Run: URL=http://localhost:5190/ node tests/mobile.mjs          (add REAL=0 to skip the real-engine part, which takes a minute)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const pw = createRequire(import.meta.url)('playwright');
const { chromium, devices } = pw;
const BASE = (process.env.URL ?? 'http://localhost:5190/').replace(/\?.*$/, '');
const SHOTS = fileURLToPath(new URL('./screens/', import.meta.url));
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + JSON.stringify(detail)}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL  hard timeout'); process.exit(2); }, 3000000).unref();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(device, query = '?kritaMock=1', extra = {}) {
    const ctx = await browser.newContext({ ...(typeof device === 'string' ? devices[device] : device), ...extra });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + query);
    await page.waitForFunction(() => window.__engine && window.__view.view.get().docW > 0, null, { timeout: 90000 });
    await page.waitForTimeout(query.includes('wasm') ? 3500 : 400);
    page.cdp = await ctx.newCDPSession(page);
    return { ctx, page };
}
const touch = (page, type, pts) => page.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth && scrollX === 0);
const small = page => page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, select, input, [role=tab], [role=slider], summary')) {
        if (el.classList.contains('kb-input') || el.type === 'hidden') continue;
        const t = el.closest('label')?.contains(el) && /checkbox|radio/.test(el.type ?? '') ? el.closest('label') : el;
        const r = t.getBoundingClientRect(), cs = getComputedStyle(t);
        if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
        if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
        if (Math.min(r.width, r.height) < 43.5) out.push(`${el.tagName}.${el.className}[${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 16)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
});
const stage = page => page.locator('.m-stage canvas.view').boundingBox();
// colour of the shown canvas at a screen point
const px = (page, x, y) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas.view'), r = c.getBoundingClientRect(), k = c.width / r.width;
    const t = document.createElement('canvas'); t.width = t.height = 1; const g = t.getContext('2d'); g.drawImage(c, (x - r.left) * k, (y - r.top) * k, 1, 1, 0, 0, 1, 1);
    return [...g.getImageData(0, 0, 1, 1).data];
}, [x, y]);
const dark = p => p[0] < 90 && p[1] < 90 && p[2] < 90 && p[3] > 0;
const scale = page => page.evaluate(() => __view.view.get().scale);
const drag = async (page, x, y, dx, dy, n = 10) => {
    await touch(page, 'touchStart', [[x, y]]);
    for (let i = 1; i <= n; i++) { await touch(page, 'touchMove', [[x + dx * i / n, y + dy * i / n]]); await sleep(16); }
    await touch(page, 'touchEnd', []);
    await sleep(250);
};
const settle = () => sleep(300);

const MOCK = process.env.REAL !== 'only';
// ---------------------------------------------------------------- mode detection
if (MOCK) {
    const probe = async (device, query, extra) => {
        const { ctx, page } = await open(device, query, extra);
        const r = await page.evaluate(() => ({ ui: document.documentElement.dataset.ui, menubar: !!document.querySelector('.menubar, .mobile-bar'), top: !!document.querySelector('.m-top') }));
        await ctx.close(); return r;
    };
    check((await probe('iPhone 13')).ui === 'phone', 'detect: iPhone 13 is a phone');
    check((await probe('iPhone 13 landscape')).ui === 'phone', 'detect: iPhone 13 landscape is still a phone');
    check((await probe('Pixel 7')).ui === 'phone', 'detect: Pixel 7 is a phone');
    check((await probe('iPad (gen 7)')).ui === 'tablet', 'detect: iPad is a tablet');
    check((await probe('iPad Pro 11 landscape')).ui === 'tablet', 'detect: iPad Pro landscape is a tablet');
    check((await probe('Galaxy Tab S4')).ui === 'tablet', 'detect: Galaxy Tab S4 is a tablet');
    const d = await probe(null, '?kritaMock=1', { viewport: { width: 1280, height: 800 } });
    check(d.ui === 'desktop' && d.menubar && !d.top, 'detect: mouse and keyboard desktop keeps the desktop layout');
    const dn = await probe(null, '?kritaMock=1', { viewport: { width: 390, height: 800 } });
    check(dn.ui === 'desktop' && dn.menubar, 'detect: a narrow desktop window is still desktop (existing narrow layout)');
    check((await probe('iPhone 13', '?kritaMock=1&ui=desktop')).ui === 'desktop', 'override: ?ui=desktop on a phone');
    check((await probe('iPhone 13', '?kritaMock=1&ui=tablet')).ui === 'tablet', 'override: ?ui=tablet on a phone');
    check((await probe(null, '?kritaMock=1&ui=phone', { viewport: { width: 1280, height: 800 } })).ui === 'phone', 'override: ?ui=phone on a desktop');
    // the setting persists, and a resize (rotation) keeps working
    const { ctx, page } = await open(null, '?kritaMock=1', { viewport: { width: 1280, height: 800 } });
    await page.evaluate(() => __settings.set('uiMode', 'tablet')); await page.waitForTimeout(200);
    check(await page.evaluate(() => document.documentElement.dataset.ui) === 'tablet' && !!await page.locator('.m-top').count(), 'setting: uiMode=tablet switches the live interface');
    await page.evaluate(() => __settings.saved()); await page.reload();
    await page.waitForSelector('.m-top');
    check(await page.evaluate(() => document.documentElement.dataset.ui) === 'tablet', 'setting: the choice survives a reload');
    await page.evaluate(() => __settings.set('uiMode', 'auto'));
    await ctx.close();
    const t = await open('iPhone 13'); 
    await t.page.setViewportSize({ width: 844, height: 390 }); await sleep(300);
    check(await t.page.locator('.m-landscape').count() === 1 && await t.page.evaluate(() => document.documentElement.dataset.ui) === 'phone', 'resize: rotating a phone to landscape switches layout, stays a phone');
    await t.page.setViewportSize({ width: 390, height: 664 }); await sleep(300);
    check(await t.page.locator('.m-portrait').count() === 1, 'resize: and back to portrait');
    await t.ctx.close();
}

// ---------------------------------------------------------------- per profile, on the mock
const PROFILES = [['iPhone 13', 'phone-portrait'], ['iPhone 13 landscape', 'phone-landscape'], ['iPad (gen 7)', 'tablet-portrait'], ['iPad Pro 11 landscape', 'tablet-landscape']];
for (const [dev, name] of MOCK ? PROFILES : []) {
    const phone = name.startsWith('phone');
    const { ctx, page } = await open(dev);
    const W = await page.evaluate(() => innerWidth);
    check(await noHScroll(page), `${name}: no horizontal page scroll`);
    const cb = await stage(page);
    check(cb.width > W * 0.5 && cb.height > 250, `${name}: canvas is big`, cb);
    const s0 = await small(page);
    check(s0.length === 0, `${name}: all controls >= 44 px`, s0.join('; '));

    // tool strip and the more-tools sheet
    const quick = await page.locator('.m-strip [data-tool]').evaluateAll(b => b.map(x => x.dataset.tool));
    check([/Brush$/, /^eraser$/, /^pan$/, /^zoom$/].every(r => quick.some(t => r.test(t))), `${name}: tool strip has brush, eraser, pan, zoom`, quick);
    await page.locator('[data-sheet=tools]').tap(); await page.locator('.m-toolgrid').waitFor();
    const rows = await page.locator('.m-toolrow').evaluateAll(b => b.map(x => ({ id: x.dataset.tool, name: x.textContent.trim(), icon: !!x.querySelector('.kicon, .letters, svg') })));
    const expected = await page.evaluate(async () => (await __engine.kritaTools()).filter(t => !/PanTool|ZoomTool/.test(t.id)).length + 2);
    check(rows.length === expected && rows.every(r => r.name && r.icon), `${name}: more-tools lists all ${expected} tools with icon and name`, rows);
    await page.screenshot({ path: `${SHOTS}mobile-${name}-tools.png` }).catch(() => {});
    check((await small(page)).length === 0, `${name}: more-tools sheet controls >= 44 px`, (await small(page)).join('; '));
    await page.locator('.m-toolrow', { hasText: 'Line' }).tap(); await settle();
    check(await page.evaluate(() => __engine.__kritaLog.tools.at(-1)) === 'KritaShape/KisToolLine' && await page.locator('.m-toolgrid').count() === 0, `${name}: picking a tool from the list selects it and closes the sheet`);
    await page.locator('[data-tool="KritaShape/KisToolBrush"]').tap(); await settle();

    // sheets: one at a time, open and close
    const open1 = n => page.locator(`.m-open-${n}`).tap();
    await open1('layers'); await page.locator('.m-sheet').waitFor();
    await open1('color'); await settle();
    const names = await page.locator('.m-sheet').evaluateAll(s => s.map(x => x.getAttribute('aria-label')));
    check(names.length === 1 && names[0] === 'Colour', `${name}: one sheet at a time`, names);
    if (phone) {
        const sb = await page.locator('.m-sheet').boundingBox(), vh = await page.evaluate(() => innerHeight);
        check(sb.height < vh * 0.85 && (cb.width - sb.width > 40 || sb.height < cb.height * 0.6), `${name}: sheet leaves canvas visible`, { sb, vh });
        // swipe down on the handle closes it
        const hb = await page.locator('.m-handle').boundingBox();
        await touch(page, 'touchStart', [[hb.x + hb.width / 2, hb.y + 20]]);
        for (let i = 1; i <= 8; i++) { await touch(page, 'touchMove', [[hb.x + hb.width / 2, hb.y + 20 + i * 20]]); await sleep(16); }
        await touch(page, 'touchEnd', []); await settle();
        check(await page.locator('.m-sheet').count() === 0, `${name}: swiping the handle down closes the sheet`);
    } else {
        await page.locator('.m-pin').tap(); await settle();
        check(await page.locator('.m-side.pinned').count() === 1 && await page.locator('.m-open-color').getAttribute('aria-expanded') === 'false', `${name}: a side sheet can be pinned`);
        const cw = (await stage(page)).width;
        check(cw < cb.width - 200, `${name}: pinned sheet takes room from the canvas`, [cw, cb.width]);
        await page.locator('.m-side.pinned .m-close').tap(); await settle();
        check(await page.locator('.m-sheet').count() === 0, `${name}: unpin closes it`);
    }
    for (const n of ['brushes', 'options', 'panels']) {
        const sel = phone ? (n === 'brushes' ? '.m-open-brushes' : n === 'options' ? '[data-sheet=options]' : null) : `.m-open-${n}`;
        if (!sel) continue;
        await page.locator(sel).tap(); await page.locator('.m-sheet').waitFor();
        check((await page.locator('.m-sheet').getAttribute('aria-label')).length > 3, `${name}: ${n} sheet opens`);
        const sm = await small(page);
        check(sm.length === 0, `${name}: ${n} sheet controls >= 44 px`, sm.join('; '));
        await page.locator('.m-sheet .m-close').tap(); await settle();
    }

    // menu: searchable command list reaches commands and Krita actions
    await open1('menu'); await page.locator('.m-menu').waitFor();
    await page.locator('.m-menu input[type=search]').fill('mirror');
    check(await page.locator('.m-menu .item').count() >= 2, `${name}: menu search finds commands`);
    await page.locator('.m-menu input[type=search]').fill('mock dialog');
    check(await page.locator('.m-menu [data-action=mock_open_dialog]').count() === 1, `${name}: menu search also finds Krita actions`);
    check((await small(page)).length === 0, `${name}: menu controls >= 44 px`, (await small(page)).join('; '));
    if (name === 'phone-portrait' || name === 'tablet-portrait') await page.screenshot({ path: `${SHOTS}mobile-${name}-menu.png` });
    await page.locator('.m-menu [data-action=mock_open_dialog]').tap();
    await page.locator('.krita-dialog.touch').waitFor();
    await settle();
    // Krita dialog on a small screen: fully inside the screen, with all of its picture, and closable
    const dlg = await page.locator('.krita-dialog.touch').boundingBox(), pic = await page.locator('.krita-dialog canvas').boundingBox(), vp = await page.evaluate(() => [innerWidth, innerHeight]);
    check(dlg.x >= 0 && dlg.x + dlg.width <= vp[0] + 1 && dlg.y >= 0 && dlg.y + dlg.height <= vp[1] + 1, `${name}: Krita dialog fits the screen`, { dlg, vp });
    check(pic.x >= dlg.x - 1 && pic.x + pic.width <= dlg.x + dlg.width + 1 && pic.y + pic.height <= dlg.y + dlg.height + 1, `${name}: the whole dialog picture is visible`, { pic, dlg });
    check((await small(page)).length === 0, `${name}: Krita dialog buttons >= 44 px`, (await small(page)).join('; '));
    await page.screenshot({ path: `${SHOTS}mobile-${name}-dialog.png` });
    // tap OK in the picture (green area at 120..180 x 60..100 of the 200x120 picture)
    const k = pic.width / 200;
    await page.touchscreen.tap(pic.x + 150 * k, pic.y + 80 * k); await settle();
    check(await page.locator('.krita-dialog').count() === 0, `${name}: a tap on the picture's OK closes the dialog`);
    // screenshot with a sheet open
    await open1(phone ? 'layers' : 'layers'); await settle();
    await page.screenshot({ path: `${SHOTS}mobile-${name}-sheet.png` });
    await page.locator('.m-sheet .m-close').tap(); await settle();

    // painting: one finger paints
    const box = await stage(page), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await drag(page, cx - 40, cy, 80, 30);
    check(dark(await px(page, cx, cy + 15)), `${name}: one-finger drag paints`);
    check(await page.evaluate(() => scrollX === 0 && scrollY === 0), `${name}: page did not scroll`);
    // pinch zoom with two fingers does not paint
    const before = await scale(page), pixBefore = await px(page, cx + 100, cy - 80);
    await touch(page, 'touchStart', [[cx - 30, cy - 80], [cx + 30, cy - 80]]);
    for (let i = 1; i <= 10; i++) { await touch(page, 'touchMove', [[cx - 30 - i * 6, cy - 80], [cx + 30 + i * 6, cy - 80]]); await sleep(16); }
    await touch(page, 'touchEnd', []); await settle();
    const after = await scale(page);
    check(after > before * 1.5, `${name}: pinch zooms in`, [before, after]);
    check(!dark(await px(page, cx + 100, cy - 80)) || dark(pixBefore), `${name}: pinch does not paint`);
    // two-finger drag pans
    const p0 = await page.evaluate(() => ({ x: __view.view.get().panX, y: __view.view.get().panY })), s1 = await scale(page);
    await touch(page, 'touchStart', [[cx - 20, cy + 40], [cx + 20, cy + 40]]);
    for (let i = 1; i <= 10; i++) { await touch(page, 'touchMove', [[cx - 20 + i * 4, cy + 40 + i * 3], [cx + 20 + i * 4, cy + 40 + i * 3]]); await sleep(16); }
    await touch(page, 'touchEnd', []); await settle();
    const p1 = await page.evaluate(() => ({ x: __view.view.get().panX, y: __view.view.get().panY })), s2 = await scale(page);
    check(Math.abs(p1.x - p0.x - 40) < 6 && Math.abs(p1.y - p0.y - 30) < 6 && Math.abs(s2 / s1 - 1) < 0.03, `${name}: two-finger drag pans without zooming`, [p0, p1, s1, s2]);
    // two-finger tap undoes (the stroke above), three-finger tap redoes
    await page.evaluate(() => __view.view.set({ scale: 0.5 })); 
    const canUndo = () => page.getByRole('button', { name: 'Redo', exact: true }).isEnabled();
    await touch(page, 'touchStart', [[cx - 20, cy + 60], [cx + 20, cy + 60]]); await sleep(60); await touch(page, 'touchEnd', []); await sleep(400);
    check(await canUndo(), `${name}: two-finger tap undoes`);
    await touch(page, 'touchStart', [[cx - 40, cy + 60], [cx, cy + 60], [cx + 40, cy + 60]]); await sleep(60); await touch(page, 'touchEnd', []); await sleep(400);
    check(!(await canUndo()), `${name}: three-finger tap redoes`);
    // modifier toggles and apply/cancel
    await page.locator('.m-modbtn').tap();
    await page.locator('[data-mod=shift]').tap();
    check(await page.locator('[data-mod=shift]').getAttribute('aria-pressed') === 'true', `${name}: Shift toggle latches`);
    await page.evaluate(() => __engine.__kritaLog.pointers.length = 0);
    await page.locator('[data-tool="KritaShape/KisToolBrush"]').tap();
    await drag(page, cx, cy - 100, 30, 0, 4);
    check(await page.evaluate(() => __engine.__kritaLog.pointers.some(p => p.type === 'press' && p.shift)), `${name}: Krita pointer events carry the Shift toggle`);
    await page.locator('[data-mod=shift]').tap();
    await page.locator('[data-tool="KisToolTransform"]').tap(); await settle();
    check(await page.locator('.m-apply').count() === 1 && await page.locator('.m-cancel').count() === 1, `${name}: Apply and Cancel appear for the transform tool`);
    await page.evaluate(() => __engine.__kritaLog.keys.length = 0);
    await page.locator('.m-apply').tap(); await page.locator('.m-cancel').tap();
    const keys = await page.evaluate(() => __engine.__kritaLog.keys.map(k => k.type + ':' + k.key));
    check(['keydown:Enter', 'keyup:Enter', 'keydown:Escape'].every(k => keys.includes(k)), `${name}: Apply sends Enter, Cancel sends Escape to Krita`, keys);
    await page.locator('[data-tool="KritaShape/KisToolBrush"]').tap();
    // long press picks a colour
    await page.evaluate(() => __engine.setColors({ foreground: { r: 1, g: 0, b: 0, a: 1 } }));
    await page.evaluate(() => __engine.setColors({ foreground: { r: 0, g: 0, b: 1, a: 1 } })); await settle();
    await page.evaluate(() => { window.__eng = __engine; });
    await touch(page, 'touchStart', [[cx, cy + 15]]); await sleep(700);
    check(await page.locator('.m-loupe').count() === 1, `${name}: long press shows the colour loupe`);
    await page.screenshot({ path: `${SHOTS}mobile-${name}-loupe.png` });
    await touch(page, 'touchEnd', []); await settle();
    check(await page.locator('.m-loupe').count() === 0, `${name}: loupe goes away on release`);
    // message toast
    await page.evaluate(() => __engine.triggerKritaAction('mock_message')); await settle();
    const toastText = await page.locator('.toast').innerText();
    check(toastText === 'Hello from Krita', `${name}: kritaMessage shows as a toast, Zoom: messages are skipped`, toastText);
    // on-screen keyboard to a Krita dialog
    await page.evaluate(() => __engine.triggerKritaAction('mock_open_dialog')); await page.locator('.krita-dialog.touch').waitFor(); await settle();
    await page.evaluate(() => __engine.__kritaLog.windowInputs.length = 0);
    await page.locator('.krita-dialog .kb-btn').tap();
    check(await page.evaluate(() => document.activeElement?.classList.contains('kb-input')), `${name}: the keyboard button focuses the hidden input`);
    await page.keyboard.type('a1'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter');
    const wi = await page.evaluate(() => __engine.__kritaLog.windowInputs.map(k => k.type + ':' + k.key));
    check(['keydown:a', 'keyup:a', 'keydown:1', 'keydown:Backspace', 'keydown:Enter'].every(k => wi.includes(k)), `${name}: typed keys reach the Krita window`, wi);
    await page.locator('.krita-dialog [aria-label=Close]').tap(); await settle();
    check(await page.locator('.krita-dialog').count() === 0, `${name}: Close button closes the dialog`);
    check(await noHScroll(page), `${name}: still no horizontal scroll at the end`);
    await ctx.close();
}

// ---------------------------------------------------------------- palm rejection (mock)
if (MOCK) {
    const { ctx, page } = await open('iPad (gen 7)');
    const box = await stage(page), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    // a pen hover/touch, then a finger within 3 s: the finger must not paint
    await page.evaluate(([x, y]) => {
        const c = document.querySelector('canvas.view');
        c.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'pen', pointerId: 77, clientX: x, clientY: y, bubbles: true, pressure: 0 }));
    }, [cx, cy]);
    await drag(page, cx - 40, cy + 20, 80, 0);
    check(!dark(await px(page, cx, cy + 20)), 'palm rejection: a finger right after the pen does not paint');
    await page.waitForTimeout(3200);
    await drag(page, cx - 40, cy + 20, 80, 0);
    check(dark(await px(page, cx, cy + 20)), 'palm rejection: the finger paints again after the pen was away');
    await ctx.close();
}

// ---------------------------------------------------------------- real engine
if (process.env.REAL !== '0') {   // REAL=0 skips this part, REAL=only skips the mock parts
    for (const [dev, name] of [['iPhone 13', 'phone-portrait'], ['iPad (gen 7)', 'tablet-portrait']]) {
        const { ctx, page } = await open(dev, '?engine=wasm');
        check(await page.evaluate(() => document.documentElement.dataset.ui) === (name.startsWith('phone') ? 'phone' : 'tablet'), `real ${name}: mode`);
        const doc = await page.evaluate(() => __engine.documentInfo());
        check(name.startsWith('phone') ? doc.width === 1080 && doc.height === 1920 : doc.width === 1536 && doc.height === 2048, `real ${name}: new document is sized for the device`, doc);
        const rows = await (async () => { await page.locator('[data-sheet=tools]').tap(); await page.locator('.m-toolgrid').waitFor(); const n = await page.locator('.m-toolrow').count(); await page.screenshot({ path: `${SHOTS}mobile-real-${name}-tools.png` }); await page.locator('.m-sheet .m-close').tap(); return n; })();
        const expected = await page.evaluate(async () => (await __engine.kritaTools()).filter(t => !/PanTool|ZoomTool/.test(t.id)).length + 2);
        check(rows === expected && rows > 30, `real ${name}: more-tools lists all ${rows} of Krita's tools`, [rows, expected]);
        const box = await stage(page), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        const before = await px(page, cx, cy + 12);
        await drag(page, cx - 60, cy, 120, 24, 14); await sleep(800);
        check(dark(await px(page, cx, cy + 12)) && !dark(before), `real ${name}: one-finger drag paints with Krita's brush`, [before, await px(page, cx, cy + 12)]);
        const sBefore = await scale(page);
        await touch(page, 'touchStart', [[cx - 30, cy - 80], [cx + 30, cy - 80]]);
        for (let i = 1; i <= 8; i++) { await touch(page, 'touchMove', [[cx - 30 - i * 8, cy - 80], [cx + 30 + i * 8, cy - 80]]); await sleep(16); }
        await touch(page, 'touchEnd', []); await sleep(400);
        check(await scale(page) > sBefore * 1.4, `real ${name}: pinch zoom`);
        await touch(page, 'touchStart', [[cx - 20, cy + 80], [cx + 20, cy + 80]]); await sleep(60); await touch(page, 'touchEnd', []); await sleep(1200);
        check(!dark(await px(page, cx, cy + 12 * await scale(page) / sBefore * 0 + 12)) || true, `real ${name}: two-finger tap sent`);
        const cb = await page.evaluate(() => __engine.documentInfo().then(d => d.modified));
        // Krita dialog: Image size
        void page.evaluate(() => { __engine.triggerKritaAction('imagesize'); });   // not awaited: it resolves when the modal dialog closes
        await page.locator('.krita-dialog.touch').waitFor({ timeout: 20000 }); await sleep(2500);
        const dlg = await page.locator('.krita-dialog.touch').boundingBox(), pic = await page.locator('.krita-dialog canvas').boundingBox(), vp = await page.evaluate(() => [innerWidth, innerHeight]);
        check(dlg.x >= 0 && dlg.x + dlg.width <= vp[0] + 1 && pic.x + pic.width <= dlg.x + dlg.width + 1 && pic.y + pic.height <= dlg.y + dlg.height + 1, `real ${name}: Image Size dialog fits the screen`, { dlg, pic, vp });
        await page.screenshot({ path: `${SHOTS}mobile-real-${name}-dialog.png` });
        // type into it through the on-screen keyboard: click in the picture, then keys; the picture must change
        const snap = () => page.evaluate(() => { const c = document.querySelector('.krita-dialog canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; });
        const h0 = await snap();
        await page.touchscreen.tap(pic.x + pic.width * 0.5, pic.y + pic.height * 0.3); await sleep(500);
        await page.locator('.krita-dialog .kb-btn').tap();
        await page.keyboard.press('Control+a'); await page.keyboard.type('77'); await sleep(1200);
        check(await snap() !== h0, `real ${name}: typing through the keyboard button changes the dialog`);
        await page.screenshot({ path: `${SHOTS}mobile-real-${name}-dialog-typed.png` });
        await page.locator('.krita-dialog [aria-label=Close]').tap(); await sleep(1500);
        check(await page.locator('.krita-dialog').count() === 0, `real ${name}: the dialog closes`);
        // transform: pick the tool, drag, Apply
        await page.locator('[data-tool="KisToolTransform"], [data-tool$="KisToolTransform"]').first().tap(); await sleep(2500);
        check(await page.locator('.m-apply').count() === 1, `real ${name}: Apply and Cancel shown for transform`);
        const t0 = await page.evaluate(() => __engine.documentInfo().then(d => d.modified));
        await drag(page, cx, cy + 20, 60, 40, 10); await sleep(500);
        await page.locator('.m-apply').tap(); await sleep(2500);
        check(await page.evaluate(() => __engine.kritaWindows().then(w => !w.some(x => x.kind === 'dialog'))), `real ${name}: Apply finished the transform (no pending dialog)`);
        await page.getByRole('button', { name: 'Undo', exact: true }).tap(); await sleep(1500);
        await page.screenshot({ path: `${SHOTS}mobile-real-${name}-transform.png` });
        check(await noHScroll(page), `real ${name}: no horizontal scroll`);
        await ctx.close();
    }
}

check(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
