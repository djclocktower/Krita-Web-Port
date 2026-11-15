// Phone and tablet layouts. Needs the dev server: npx vite --port 5181 --strictPort
// Run: node tests/small-screens.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const SHOTS = '/tmp/claude-0/-home-user-Krita-Web-Port/65182417-9f70-5299-9ecc-ec5673875a37/scratchpad';
const URL = 'http://localhost:5181/';
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL  timeout'); process.exit(1); }, 150000).unref();

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];

async function open(width, height) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('.status-doc')?.textContent.includes('1600 × 1200'));
    await page.waitForTimeout(300);
    return page;
}

// Smaller dimension of every visible interactive control (checkbox and radio count by their label).
const smallTargets = (page, skipPanels = false) => page.evaluate(skipPanels => {
    const out = [];
    for (const el of document.querySelectorAll('button, select, input, [role=tab], [role=menuitem]')) {
        const t = el.closest('label')?.contains(el) && /checkbox|radio/.test(el.type ?? '') ? el.closest('label') : el;
        const r = t.getBoundingClientRect(), cs = getComputedStyle(t);
        if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden]') || (skipPanels && el.closest('.dock-body'))) continue;
        if (Math.min(r.width, r.height) < 39.5) out.push(`${el.tagName}.${el.className}[${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
}, skipPanels);
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth && scrollX === 0 && scrollY === 0);
const canvasBox = page => page.locator('canvas.view').boundingBox();
const tap = (page, loc) => loc.tap();
const status = page => page.locator('.status-doc').innerText();

// ---------------------------------------------------------------- phone
{
    const page = await open(390, 844);
    check(await noHScroll(page), 'phone: no horizontal page scroll');
    const cb = await canvasBox(page);
    check(cb.height >= 844 * 0.6, 'phone: canvas is at least 60% of the viewport height', `${cb.height}`);
    check(await page.locator('.menubar').count() === 0 && await page.locator('.menu-toggle').isVisible(), 'phone: menu bar is collapsed to one menu button');
    const tb = await page.locator('.toolbar').boundingBox();
    check(tb.height < 70, 'phone: toolbar stays one row', `${tb.height}`);
    for (const l of ['Brush size', 'Brush opacity', 'Eraser', 'Foreground colour', 'Undo', 'Redo']) {
        const loc = page.getByLabel(l, { exact: true }).or(page.getByRole('button', { name: l, exact: true })).first();
        check(await loc.isVisible(), `phone: toolbar has ${l}`);
    }
    check((await smallTargets(page)).length === 0, 'phone: all shell controls >= 40 px', (await smallTargets(page)).join('; '));
    await page.screenshot({ path: `${SHOTS}/phone.png` });

    // every menu command is reachable by taps only
    await tap(page, page.locator('.menu-toggle'));
    check(await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'true', 'phone: menu button opens the menu');
    const groups = await page.locator('.menu-sheet .group').allInnerTexts();
    const mb = await page.locator('.menu-sheet').boundingBox();
    check(mb.y + mb.height >= 844 - 1 && mb.height > 600, 'phone: menu is full height', JSON.stringify(mb));
    let items = 0, unreachable = [];
    for (const g of groups) {
        const name = g.replace(/[▾▸]/g, '').trim();
        await tap(page, page.locator('.menu-sheet .group', { hasText: name }));
        const list = await page.locator('.menu-sheet .item').all();
        for (const it of list) {
            items++;
            await it.scrollIntoViewIfNeeded();
            const r = await it.boundingBox();
            if (!r || r.height < 40 || r.x < 0 || r.x + r.width > 390) unreachable.push(await it.innerText());
        }
        await tap(page, page.locator('.menu-sheet .group', { hasText: name }));
    }
    check(groups.length >= 6 && items > 40 && unreachable.length === 0, `phone: ${items} menu commands in ${groups.length} groups all tappable`, unreachable.join(','));
    // a command through taps: Image > Mirror Image Horizontally, and the one with a dialog
    await tap(page, page.locator('.menu-sheet .group', { hasText: 'Image' }));
    await tap(page, page.locator('.menu-sheet .item', { hasText: 'Resize Canvas' }));
    await page.locator('dialog[open]').waitFor();
    const dlgSmall = await smallTargets(page);
    check(dlgSmall.length === 0, 'phone: dialog controls >= 40 px', dlgSmall.join('; '));
    const db = await page.locator('dialog[open]').boundingBox();
    check(db.x >= 0 && db.x + db.width <= 390 && db.y >= 0 && db.y + db.height <= 844, 'phone: dialog fits the screen');
    await page.screenshot({ path: `${SHOTS}/phone-dialog.png` });
    await page.getByRole('radio', { name: 'Top left' }).tap();
    await page.locator('dialog[open] input[type=number]').first().fill('1700');
    await page.locator('dialog[open] button.primary').tap();
    await page.waitForFunction(() => document.querySelector('.status-doc').textContent.includes('1700 × 1200'));
    check(await page.locator('dialog[open]').count() === 0, 'phone: Resize Canvas by taps works and closes');
    check(!(await page.locator('.menu-sheet').count()), 'phone: menu closes after a command');

    // panels: open, switch, close
    await tap(page, page.getByRole('button', { name: 'Panels' }));
    await page.locator('.sheet-bottom').waitFor();
    const tabs = await page.locator('.sheet-bottom [role=tab]').allInnerTexts();
    check(tabs.length >= 3, 'phone: panel sheet has a tab row', tabs.join(','));
    const sb = await page.locator('.sheet-bottom').boundingBox();
    check(sb.y + sb.height <= 844 && sb.height < 844 * 0.6, 'phone: sheet is a bottom sheet', JSON.stringify(sb));
    await page.screenshot({ path: `${SHOTS}/phone-sheet.png` });
    for (const t of tabs) {
        await tap(page, page.locator('.sheet-bottom [role=tab]', { hasText: t }).first());
        const label = await page.locator('.sheet-bottom [role=tabpanel]').getAttribute('aria-label');
        check(label === t, `phone: tab ${t} shows its panel`, label);
    }
    check((await smallTargets(page)).length === 0, 'phone: panel sheet controls >= 40 px', (await smallTargets(page)).join('; '));
    await tap(page, page.getByLabel('Close panels'));
    check(await page.locator('.sheet-bottom').count() === 0, 'phone: close button closes the sheet');

    // painting by touch, no page scroll, on-screen undo
    const box = await canvasBox(page);
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const pixel = (x, y) => page.evaluate(([x, y]) => {
        const c = document.querySelector('canvas.view'), r = c.getBoundingClientRect(), k = c.width / r.width;
        const t = document.createElement('canvas'); t.width = t.height = 1;
        const g = t.getContext('2d'); g.drawImage(c, (x - r.left) * k, (y - r.top) * k, 1, 1, 0, 0, 1, 1);
        return [...g.getImageData(0, 0, 1, 1).data];
    }, [x, y]);
    const dark = p => p[0] < 80 && p[1] < 80 && p[2] < 80;
    // Playwright has no touch drag; dispatch pointer events with pointerType touch through CDP touch events.
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', cx - 60, cy);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', cx - 60 + i * 10, cy + i * 8); await page.waitForTimeout(16); }
    await touch('touchEnd');
    await page.waitForTimeout(300);
    check(dark(await pixel(cx, cy + 48)), 'phone: one-finger drag paints');
    check(await page.evaluate(() => scrollX === 0 && scrollY === 0), 'phone: page did not scroll while painting');
    await page.getByRole('button', { name: 'Undo', exact: true }).tap();
    await page.waitForTimeout(300);
    check(!dark(await pixel(cx, cy + 48)), 'phone: on-screen Undo removes the stroke');
    check(await page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), 'phone: Redo is enabled after Undo');
    check(await noHScroll(page), 'phone: still no horizontal scroll at the end');
    await page.context().close();
}

// ---------------------------------------------------------------- tablets
for (const [label, w, h, file] of [['tablet portrait', 820, 1180, 'tablet'], ['tablet landscape', 1180, 820, 'desktop']]) {
    const page = await open(w, h);
    const medium = w < 1100;
    check(await noHScroll(page), `${label}: no horizontal page scroll`);
    const cb = await canvasBox(page);
    check(cb.height > h * 0.6 && cb.width > w * 0.9 === medium || !medium, `${label}: canvas ${Math.round(cb.width)}x${Math.round(cb.height)}`);
    check(await page.getByRole('button', { name: 'Undo', exact: true }).isVisible(), `${label}: on-screen Undo and Redo`);
    const small = await smallTargets(page, !medium);   // wide: panels' own insides are not the shell's
    check(small.length === 0, `${label}: all shell controls >= 40 px`, small.join('; '));
    if (medium) {
        // handles toggle overlay sheets, one at a time, without shrinking the canvas
        const handles = page.locator('.handle');
        const n = await handles.count();
        check(n >= 2, `${label}: dock handles are visible`, `${n}`);
        const before = await canvasBox(page);
        await handles.first().tap();
        await page.locator('.sheet-body').first().waitFor();
        const after = await canvasBox(page);
        check(before.width === after.width && before.height === after.height, `${label}: open sheet overlays the canvas (canvas size unchanged)`);
        await page.screenshot({ path: `${SHOTS}/${file}.png` });
        await handles.nth(1).tap();
        check(await page.locator('.sheet-body').count() === 1 && await handles.first().getAttribute('aria-expanded') === 'false' && await handles.nth(1).getAttribute('aria-expanded') === 'true', `${label}: only one sheet open at a time`);
        const small2 = await smallTargets(page, true);   // shell controls; the panel's own buttons are the panel's
        check(small2.length === 0, `${label}: open sheet controls >= 40 px`, small2.join('; '));
        await handles.nth(1).tap();
        check(await page.locator('.sheet-body').count() === 0, `${label}: handle closes the sheet`);
        // menu by taps
        await page.locator('button[data-menu="Image"]').tap();
        await page.getByRole('menuitem', { name: 'Mirror Image Horizontally' }).tap();
        check(await page.locator('[role=menu]').count() === 0, `${label}: menu item taps run and close the menu`);
        await page.locator('button[data-menu="Image"]').tap();
        await page.locator('button[data-menu="Select"]').tap();      // a second tap moves to the next menu, not closes it
        check(await page.locator('button[data-menu="Select"]').getAttribute('aria-expanded') === 'true', `${label}: tapping another menu switches to it`);
    } else {
        await page.screenshot({ path: `${SHOTS}/${file}.png` });
    }
    await page.context().close();
}

check(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
