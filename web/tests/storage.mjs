// Local persistence: autosave, recovery, Open Recent, resources. Mock engine scenarios, then the real engine.
// Needs a dev server: npx vite --port 5183 --strictPort
// Run: URL=http://localhost:5183/ node tests/storage.mjs        (REAL=0 skips the real-engine part, REAL=only runs just it)
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = (process.env.URL ?? 'http://localhost:5183/').replace(/\?.*$/, '');
const SHOTS = '/tmp/claude-0/-home-user-Krita-Web-Port/65182417-9f70-5299-9ecc-ec5673875a37/scratchpad';
const KPP = '/home/user/Krita-Web-Port/krita/krita/data/paintoppresets/b)_Basic-5_Size_default.kpp';
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL  timeout'); process.exit(1); }, 480000).unref();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAST = 'asIdle=300&asMax=1500';
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const errors = [];

/** One persistent browser context (so IndexedDB survives reloads) per scenario. */
async function scenario(name, fn, { init, real } = {}) {
    if ((process.env.REAL === 'only') !== !!real) return;
    console.log(`-- ${name}`);
    const dir = mkdtempSync(join(tmpdir(), 'kstore-'));
    const ctx = await chromium.launchPersistentContext(dir, { args: ARGS, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    if (init) await ctx.addInitScript(init);
    const page = ctx.pages()[0] ?? await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    try { await fn(page, ctx); } catch (e) { check(false, `${name}: threw`, e.stack); }
    await ctx.close(); rmSync(dir, { recursive: true, force: true });
}

const load = async (page, query = FAST) => {
    await page.goto(`${BASE}/?${query}`);
    await page.waitForFunction(() => /\d+ × \d+ px/.test(document.querySelector('.status-doc')?.textContent ?? ''), null, { timeout: 90000 });
    await page.waitForTimeout(200);
};
const dragPaint = async (page, y = 0) => {
    const b = await page.locator('canvas.view').boundingBox();
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.4 + y); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5 + y, { steps: 8 }); await page.mouse.up();
};
const saveText = page => page.locator('.status-save').innerText().catch(() => '');
const waitSaved = (page, timeout = 15000) => page.waitForFunction(() => /^Saved locally \d\d:\d\d/.test(document.querySelector('.status-save')?.textContent ?? ''), null, { timeout });
/** Instruments __engine.exportDocument: counts calls per format, concurrency, optional delay / failure. */
const instrument = page => page.evaluate(() => {
    const e = __engine, orig = e.exportDocument.bind(e);
    const x = window.__exp = { calls: { kra: 0, png: 0 }, running: 0, max: 0, delay: 0, fail: false, orig };
    e.exportDocument = async f => {
        x.calls[f] = (x.calls[f] ?? 0) + 1; x.running++; x.max = Math.max(x.max, x.running);
        try { if (x.delay) await new Promise(r => setTimeout(r, x.delay)); if (x.fail) throw new Error('disk on fire'); return await orig(f); }
        finally { x.running--; }
    };
});
const exp = (page, patch) => page.evaluate(p => Object.assign(__exp, p), patch);
const calls = page => page.evaluate(() => ({ ...__exp.calls }));
const pngCalls = async page => (await calls(page)).png;
/** FNV hash of the decoded RGBA pixels of the PNG export, plus its size. */
const hash = page => page.evaluate(async () => {
    const bmp = await createImageBitmap(new Blob([await (window.__exp?.orig ?? (f => __engine.exportDocument(f)))('png')]));
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d'); c.drawImage(bmp, 0, 0);
    const d = c.getImageData(0, 0, bmp.width, bmp.height).data; let h = 2166136261;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
    return `${bmp.width}x${bmp.height}:${h}`;
});
/** Stored documents straight from IndexedDB (without blobs' bytes). */
const stored = page => page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('krita-web');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => { const g = r.result.transaction('docs').objectStore('docs').getAll(); g.onsuccess = () => res(g.result.map(d => ({ id: d.id, name: d.name, format: d.format, savedAt: d.savedAt, size: d.blob.size, hasThumb: !!d.thumb }))); };
}));
const armed = page => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); dispatchEvent(e); return e.defaultPrevented; });
const menu = async (page, m, t) => { await page.locator(`button[data-menu="${m}"]`).click(); await page.locator('.menu-list [role=menuitem]').filter({ hasText: t }).click(); };
const newDoc = async (page, name) => {
    await menu(page, 'File', 'New…');
    await page.locator('dialog[open] input[name=name]').fill(name);
    await page.locator('dialog[open] button.primary').click();
    await page.waitForFunction(n => document.querySelector('.status-doc').textContent.startsWith(n), name);
};
const recentRows = async page => page.locator('dialog.recent li').count();
const openRecentDialog = async page => { await menu(page, 'File', 'Open Recent…'); await page.locator('dialog.recent h2').waitFor(); await page.waitForTimeout(150); };
const docName = page => page.locator('.status-doc').innerText();

// ------------------------------------------------------------------ mock engine
await scenario('autosave: one save after painting, none after', async page => {
    await load(page); await instrument(page);
    check((await saveText(page)) === '', 'no indicator before anything was saved');
    await dragPaint(page);
    await waitSaved(page);
    check(/^Saved locally \d\d:\d\d$/.test(await saveText(page)), 'status bar says "Saved locally HH:MM"', await saveText(page));
    await sleep(1800);   // longer than idle and max wait: nothing changed, so nothing more is saved
    const c = await calls(page), docs = await stored(page);
    check(c.png === 1 && c.kra === 1, 'exactly one save (.kra tried once, PNG fallback once)', JSON.stringify(c));
    check(docs.length === 1 && docs[0].format === 'png' && docs[0].hasThumb, 'snapshot stored as PNG with a thumbnail on the mock', JSON.stringify(docs));
    check(await page.evaluate(() => __engine.documentInfo().then(d => d.modified)) === true, 'document was modified (sanity)');
});

await scenario('autosave: not while a pointer is down', async page => {
    await load(page); await instrument(page);
    const b = await page.locator('canvas.view').boundingBox();
    await page.mouse.move(b.x + 100, b.y + 100); await page.mouse.down();
    await page.mouse.move(b.x + 160, b.y + 140, { steps: 4 });
    await page.evaluate(() => __engine.addNode({ type: 'paint', name: 'Dirty' }));   // unsaved changes exist while the pointer is down
    await sleep(1800);   // 6x the idle time, 1.2x the max wait
    check((await pngCalls(page)) === 0 && (await calls(page)).kra === 0, 'no export while the pointer is held', JSON.stringify(await calls(page)));
    await page.mouse.up();
    await waitSaved(page);
    check((await pngCalls(page)) >= 1, 'saved after the pointer is released');
});

await scenario('autosave: never two exports at once', async page => {
    await load(page); await instrument(page); await exp(page, { delay: 1200 });
    await dragPaint(page);
    await page.waitForFunction(() => __exp.running > 0);
    for (let i = 1; i <= 3; i++) { await dragPaint(page, i * 20); await sleep(250); }   // changes while an export runs
    await waitSaved(page, 30000); await sleep(2500);
    check((await page.evaluate(() => __exp.max)) === 1, 'at most one export ran at a time', String(await page.evaluate(() => __exp.max)));
    await page.waitForFunction(() => { const e = new Event('beforeunload', { cancelable: true }); dispatchEvent(e); return !e.defaultPrevented; }, null, { timeout: 15000 });
    check((await calls(page)).png >= 1, 'saved, nothing left unsaved');
});

await scenario('autosave: while changes keep coming, saves at most every max-wait', async page => {
    await load(page, 'asIdle=1500&asMax=2500'); await instrument(page);
    const t0 = Date.now();
    while (Date.now() - t0 < 4200) { await dragPaint(page, (Date.now() % 50)); await sleep(150); }   // never idle for 1.5 s
    const during = (await calls(page)).png;
    check(during >= 1, 'saved during continuous painting (before it went idle)', String(during));
});

await scenario('recovery: reload restores the drawing and shows the notice', async page => {
    await load(page);
    const blank = await hash(page);
    await dragPaint(page); await waitSaved(page);
    const painted = await hash(page);
    check(painted !== blank, 'painting changed the pixels (sanity)');
    await load(page);
    check(await page.locator('.notice').innerText().then(t => /Restored Untitled from \d/.test(t) && t.includes('Start new instead')), 'notice names the document and offers Start new instead');
    check((await hash(page)) === painted, 'restored pixels equal the saved drawing');
    check((await saveText(page)).startsWith('Saved locally'), 'indicator shows the restored snapshot time');
    await sleep(1200);
    check((await stored(page)).length === 1, 'restoring does not create another snapshot');
    await page.locator('.notice button[aria-label="Dismiss notice"]').click();
    check(await page.locator('.notice').count() === 0, 'notice can be dismissed');
    await load(page);
    check((await hash(page)) === painted, 'a second reload restores it again');
    await page.locator('.notice button', { hasText: 'Start new instead' }).click();
    await page.waitForFunction(() => document.querySelector('.status-doc').textContent.includes('1600 × 1200'));
    await page.waitForTimeout(300);
    check(await page.locator('.notice').count() === 0, 'Start new instead closes the notice');
    check((await hash(page)) === blank, 'Start new instead gives a blank document');
    check((await stored(page)).length === 1, 'the snapshot is kept');
    await openRecentDialog(page);
    check((await recentRows(page)) === 1 && (await page.locator('dialog.recent li').innerText()).includes('Untitled'), 'it appears in Open Recent');
    await page.keyboard.press('Escape');
    await load(page);
    check(await page.locator('.notice').count() === 0 && (await hash(page)) === blank, 'after Start new instead, the next start is blank too');
});

await scenario('Open Recent: list, open, delete, clear; New keeps the old one', async page => {
    await load(page);
    await dragPaint(page); await waitSaved(page);
    const a = await hash(page);
    await newDoc(page, 'Second');
    check((await stored(page)).length === 1, 'New saved the old document first');
    await dragPaint(page, 60); await waitSaved(page);
    const b = await hash(page);
    await openRecentDialog(page);
    check((await recentRows(page)) === 2, 'two recent documents listed');
    const rows = await page.locator('dialog.recent li').allInnerTexts();
    check(rows[0].includes('Second') && rows[0].includes('(open)') && rows[0].includes('1600 × 1200') && rows[1].includes('Untitled'), 'newest first, with name and size, open one marked', JSON.stringify(rows));
    check(await page.locator('dialog.recent li img.thumb').count() === 2, 'thumbnails shown');
    await page.screenshot({ path: `${SHOTS}/recent.png` });
    await page.locator('dialog.recent button[aria-label="Open Untitled"]').click();
    await page.waitForFunction(() => document.querySelector('dialog.recent') === null);
    await page.waitForTimeout(300);
    check((await hash(page)) === a, 'Open restores that document');
    check((await docName(page)).startsWith('Untitled'), 'status bar shows its name', await docName(page));
    await openRecentDialog(page);
    await page.locator('dialog.recent button[aria-label="Delete Second"]').click();
    await page.waitForFunction(() => document.querySelectorAll('dialog.recent li').length === 1);
    check((await stored(page)).length === 1 && (await stored(page))[0].name.startsWith('Untitled'), 'Delete removes only that snapshot');
    await page.locator('dialog.recent button', { hasText: 'Clear list' }).click();
    check((await stored(page)).length === 1, 'Clear list asks to confirm first');
    await page.locator('dialog.recent button', { hasText: 'Confirm clear' }).click();
    await page.waitForFunction(() => document.querySelectorAll('dialog.recent li').length === 0);
    check((await stored(page)).length === 0 && await page.locator('dialog.recent .empty').count() === 1, 'Clear list empties the store and says so');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    check(await page.locator('dialog.recent').count() === 0, 'Escape closes the dialog');
    void b;
});

await scenario('eviction: at most 10 recent documents, oldest first, never the open one', async page => {
    await load(page, 'asIdle=120&asMax=1000');
    for (let i = 1; i <= 11; i++) {
        if (i > 1) await newDoc(page, `Doc${i}`);
        await dragPaint(page, i); await waitSaved(page);
        await page.waitForFunction(() => !/Saving/.test(document.querySelector('.status-save')?.textContent ?? ''));
        await sleep(30);
    }
    await page.waitForTimeout(400);
    const docs = await stored(page);
    check(docs.length === 10, 'ten documents kept after eleven', String(docs.length));
    check(!docs.some(d => d.name.startsWith('Untitled')) && docs.some(d => d.name.startsWith('Doc11')), 'the oldest was evicted, the open one kept', docs.map(d => d.name).join());
    // directly: an open document whose snapshot is the oldest survives eviction
    const kept = await page.evaluate(async () => {
        const db = await import('/src/storage/db.ts');
        const rec = (id, savedAt) => ({ id, name: id, width: 1, height: 1, savedAt, format: 'png', blob: new Blob(['x']), thumb: null });
        await db.saveDoc(rec('open-but-oldest', 1), 10);
        const ids = (await db.listDocs()).map(d => d.id);
        return { n: ids.length, has: ids.includes('open-but-oldest') };
    });
    check(kept.n === 10 && kept.has, 'saveDoc keeps the document being saved even when it is the oldest', JSON.stringify(kept));
});

await scenario('failing save keeps the previous snapshot', async page => {
    await load(page); await instrument(page);
    await dragPaint(page); await waitSaved(page);
    const before = await stored(page);
    await exp(page, { fail: true });
    await dragPaint(page, 40);
    await page.waitForFunction(() => /^Not saved \(.*disk on fire/.test(document.querySelector('.status-save')?.textContent ?? ''), null, { timeout: 10000 });
    check(true, 'indicator says "Not saved (reason)"');
    const after = await stored(page);
    check(after.length === 1 && after[0].savedAt === before[0].savedAt && after[0].size === before[0].size, 'the previous snapshot is untouched');
    check(await armed(page), 'leaving is guarded while the changes are unsaved');
    await exp(page, { fail: false });
    await waitSaved(page, 15000);
    const later = await stored(page);
    check(later[0].savedAt > before[0].savedAt && !(await armed(page)), 'saves again once the engine recovers');
});

await scenario('storage unavailable: the app still works', async page => {
    await load(page);
    const blank = await hash(page);
    await dragPaint(page);
    check((await hash(page)) !== blank, 'painting works');
    await page.waitForFunction(() => /^Not saved \(storage unavailable\)/.test(document.querySelector('.status-save')?.textContent ?? ''), null, { timeout: 10000 });
    check(true, 'indicator says "Not saved (storage unavailable)"');
    const banner = await page.locator('.banner[role=alert]').innerText();
    check(/unavailable/i.test(banner), 'one banner explains it', banner);
    await newDoc(page, 'Still works');
    await dragPaint(page); await sleep(1500);
    check(await page.locator('.banner[role=alert]').count() === 1, 'no new banner per save');
    await openRecentDialog(page);
    check((await page.locator('dialog.recent .error').innerText()).length > 0 && (await recentRows(page)) === 0, 'Open Recent says storage is unavailable');
    await page.keyboard.press('Escape');
    check(await armed(page), 'leaving is guarded: the changes cannot be stored');
}, { init: () => Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }) });

await scenario('beforeunload guard only while changes are not stored', async page => {
    await load(page);
    check(!(await armed(page)), 'not armed on a fresh document');
    await dragPaint(page); await page.waitForTimeout(100);
    check(await armed(page), 'armed after painting');
    await waitSaved(page);
    check(!(await armed(page)), 'not armed once saved');
    await dragPaint(page, 30); await page.waitForTimeout(100);
    check(await armed(page), 'armed again after more painting');
    await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitSaved(page, 5000).catch(() => {});
    await page.waitForFunction(() => { const e = new Event('beforeunload', { cancelable: true }); dispatchEvent(e); return !e.defaultPrevented; }, null, { timeout: 3000 }).catch(() => {});
    check(!(await armed(page)), 'saving on visibilitychange (hidden) clears it');
});

await scenario('a resource-less proxy forwards everything (menus, undo)', async page => {
    await load(page);
    await dragPaint(page);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    check(await page.locator('button.undo').isDisabled(), 'undo through the proxy works');
    await menu(page, 'File', 'Open Recent…');
    check(await page.locator('dialog.recent').count() === 1, 'Open Recent opens from the File menu');
});

// ------------------------------------------------------------------ real engine
if (process.env.REAL !== '0') {
    await scenario('real engine: autosave .kra, restore, resources', async page => {
        const q = 'engine=wasm&asIdle=1000&asMax=8000';
        await load(page, q);
        await page.evaluate(() => __engine.addNode({ type: 'paint', name: 'Sketch layer' }));
        await dragPaint(page); await dragPaint(page, 50);
        const t0 = Date.now();
        await waitSaved(page, 120000);
        const total = Date.now() - t0;
        const t1 = Date.now();
        const kraBytes = await page.evaluate(async () => (await __engine.exportDocument('kra')).length);
        const exportMs = Date.now() - t1;
        const docs = await stored(page);
        check(docs.length === 1 && docs[0].format === 'kra', 'stored snapshot is a .kra', JSON.stringify(docs));
        const sig = await page.evaluate(() => new Promise(res => {
            const r = indexedDB.open('krita-web'); r.onsuccess = () => { const g = r.result.transaction('docs').objectStore('docs').getAll(); g.onsuccess = async () => res([...new Uint8Array(await g.result[0].blob.slice(0, 2).arrayBuffer())]); };
        }));
        check(sig[0] === 0x50 && sig[1] === 0x4b, 'zip signature PK', String(sig));
        console.log(`INFO  1600x1200: idle 1000 ms + save = ${total} ms after the last stroke; a bare .kra export takes ${exportMs} ms (${kraBytes} bytes); stored ${docs[0]?.size} bytes`);
        const names = () => page.evaluate(async () => { const w = (l) => l.flatMap(n => [n.name, ...w(n.children)]); return w(await __engine.layers()).join('|'); });
        const n1 = await names(), h1 = await hash(page);
        // a resource through the presets panel (the proxy stores it)
        const kpp = readFileSync(KPP);
        const before = await page.evaluate(() => __engine.presets({ search: 'Size_default' }).then(p => p.length));
        await page.locator('input[aria-label="Import resource files"]').setInputFiles({ name: 'b)_Basic-5_Size_default.kpp', mimeType: 'application/octet-stream', buffer: kpp });
        await page.waitForTimeout(1500);
        const mid = await page.evaluate(() => __engine.presets({ search: 'Size_default' }).then(p => p.length));
        const res = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('krita-web'); r.onsuccess = () => { const g = r.result.transaction('resources').objectStore('resources').getAll(); g.onsuccess = () => res(g.result.map(x => [x.name, x.bytes.length])); }; }));
        check(res.length === 1 && res[0][1] === kpp.length, 'imported file stored with its bytes', JSON.stringify(res));
        console.log(`INFO  presets matching "Size_default": before import ${before}, after ${mid}`);
        await load(page, q);
        check(await page.locator('.notice').count() === 1, 'real engine: restore notice shown');
        check((await names()) === n1, 'restored layer names match', `${n1} vs ${await names()}`);
        const h2 = await hash(page);
        check(h1 === h2, 'restored document renders identically (PNG pixels)', `${h1} vs ${h2}`);
        const after = await page.evaluate(() => __engine.presets({ search: 'Size_default' }).then(p => p.length));
        check(after === mid && after >= 1, 'resource re-imported after reload', `before ${before} mid ${mid} after ${after}`);
        check(await page.locator('.banner[role=alert]').count() === 0, 'no error banner');
        await dragPaint(page, 80); await waitSaved(page, 120000);
        check((await stored(page)).length === 1, 'editing the restored document updates its snapshot (no duplicate)');
    }, { real: true });
}

console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
