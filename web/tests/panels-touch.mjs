// Touch usability of the Layers, Filters, Brush Presets, Timeline and Color panels inside the shell's sheets.
// Needs the dev server: npx vite --port 5181 --strictPort     Run: URL=http://localhost:5181/ node tests/panels-touch.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = process.env.URL ?? 'http://localhost:5181/';
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL  hard timeout'); process.exit(2); }, 240000).unref();

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

// Controls inside `root` whose smaller dimension is under 40 px (checkboxes and radios count by their label).
const small = (page, root) => page.evaluate(root => {
    const out = [];
    for (const el of document.querySelectorAll(`${root} :is(button, input, select, [role=button], [role=tab])`)) {
        const t = /checkbox|radio/.test(el.type ?? '') && el.closest('label') ? el.closest('label') : el;
        const r = t.getBoundingClientRect(), cs = getComputedStyle(t);
        if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
        if (Math.min(r.width, r.height) < 39.5) out.push(`${el.tagName.toLowerCase()}.${el.className}[${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
}, root);
const E = (page, fn, arg) => page.evaluate(([src, a]) => (new Function('e', 'a', `return (${src})(e, a)`))(window.__engine, a), [fn.toString(), arg]);

async function open(w, h) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.__engine && document.querySelector('.status-doc')?.textContent.includes('1600 × 1200'));
    await page.waitForTimeout(300);
    return page;
}

// Opens a panel by taps only: phone = Panels button + tab; tablet = the dock's handle (+ tab when it has several).
async function show(page, label, title, phone, area) {
    if (phone) {
        if (!await page.locator('.sheet-bottom').count()) { await page.getByRole('button', { name: 'Panels', exact: true }).tap(); await page.locator('.sheet-bottom').waitFor(); }
        await page.locator('.sheet-bottom [role=tab]', { hasText: new RegExp(`^${title}$`) }).tap();
        await page.locator(`.sheet-bottom [role=tabpanel][aria-label="${title}"]`).waitFor();
        return '.sheet-bottom [role=tabpanel]';
    }
    const dock = `section[aria-label="${area} panels"]`;
    if (!await page.locator(`${dock} .sheet-body`).count()) await page.locator(`${dock} .handle`).tap();
    await page.locator(`${dock} .sheet-body`).waitFor();
    await page.locator(`${dock} .sheet-body [role=tab]`, { hasText: new RegExp(`^${title}$`) }).tap();
    await page.locator(`${dock} [role=tabpanel][aria-label="${title}"]`).waitFor();
    return `${dock} [role=tabpanel]`;
}

for (const [label, w, h, phone] of [['phone 390x844', 390, 844, true], ['tablet 820x1180', 820, 1180, false]]) {
    const page = await open(w, h);
    const panelCheck = async (title, area, act) => {
        const root = await show(page, label, title, phone, area);
        await page.waitForTimeout(700);   // thumbnails and lists load
        const bad = await small(page, root);
        check(bad.length === 0, `${label}: ${title} controls >= 40 px`, bad.join('; '));
        await act(root);
    };

    await panelCheck('Layers', 'right', async root => {
        const before = await E(page, async e => (await e.layers())[0].visible);
        await page.locator(`${root} .lyr-row`).first().locator('[aria-label=Visible]').tap();
        await page.waitForTimeout(300);
        check(await E(page, async e => (await e.layers())[0].visible) === !before, `${label}: tapping the eye toggles visibility`);
        await page.locator(`${root} .lyr-row`).first().locator('[aria-label=Visible]').tap();
        await page.waitForTimeout(300);
        check(await page.locator(`${root} .lyr-row.active`).count() === 1, `${label}: Layers highlights the active row`);
        // Layer properties dialog: opened by tap, controls measured
        await page.locator(`${root} .lyr-bar`).getByRole('button', { name: 'Properties…' }).tap();
        await page.locator('dialog.lyr-dialog[open]').waitFor();
        const bad = await small(page, 'dialog.lyr-dialog[open]');
        check(bad.length === 0, `${label}: layer properties dialog controls >= 40 px`, bad.join('; '));
        await page.locator('dialog.lyr-dialog[open]').getByRole('button', { name: 'Close' }).tap();
    });

    await panelCheck('Brush Presets', 'right', async root => {
        const ids = await E(page, async e => (await e.presets()).map(p => p.id));
        const cur = await E(page, async e => (await e.brushState()).presetId);
        const other = ids.find(i => i !== cur);
        const name = await E(page, async (e, id) => (await e.presets()).find(p => p.id === id).name, other);
        await page.locator(`${root} .preset[aria-label="${name}"]`).tap();
        await page.waitForTimeout(400);
        check(await E(page, async e => (await e.brushState()).presetId) === other, `${label}: tapping a preset selects it`);
    });

    await panelCheck('Color', 'right', async root => {
        const before = await E(page, async e => (await e.colors()).foreground);
        const r = await page.locator(`${root} .sv`).boundingBox();
        await page.touchscreen.tap(r.x + r.width * 0.2, r.y + r.height * 0.3);
        await page.waitForTimeout(300);
        const after = await E(page, async e => (await e.colors()).foreground);
        check(JSON.stringify(before) !== JSON.stringify(after), `${label}: tapping the colour square changes the foreground`, JSON.stringify(after));
    });

    await panelCheck('Filters', 'right', async root => {
        await E(page, e => { window.__applied = []; const o = e.applyFilter.bind(e); e.applyFilter = (...a) => { window.__applied.push(a[1]); return o(...a); }; });
        await page.locator(`${root} .filters-panel`).getByRole('button', { name: 'Filters…' }).tap();
        await page.locator('dialog.fd[open]').waitFor();
        await page.waitForTimeout(500);
        const bad = await small(page, 'dialog.fd[open]');
        check(bad.length === 0, `${label}: filter dialog controls >= 40 px`, bad.join('; '));
        await page.locator('dialog.fd[open] footer').getByRole('button', { name: 'OK', exact: true }).tap();
        await page.waitForTimeout(500);
        check((await page.evaluate(() => window.__applied)).length === 1 && !await page.locator('dialog.fd[open]').count(), `${label}: tapping OK applies the filter`);
    });

    await panelCheck('Timeline', 'bottom', async root => {
        for (let i = 0; i < 3; i++) await page.locator(root).getByRole('button', { name: 'Next frame', exact: true }).tap();
        await page.waitForTimeout(300);
        await page.locator(root).getByRole('button', { name: 'Add blank frame', exact: true }).tap();
        await page.waitForTimeout(500);
        const keys = await E(page, async e => { const t = await e.layers(); return e.keyframes(t[0].id); });
        check(keys.includes(3), `${label}: tapping Add blank frame adds a keyframe at frame 3`, JSON.stringify(keys));
    });
    await page.context().close();
}

check(errors.length === 0, 'no uncaught page errors', errors.join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
