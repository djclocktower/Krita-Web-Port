// File import and export through the real engine (see docs/formats/RESULTS.md for the diagnoses).
//   URL=http://localhost:5192/?engine=wasm node web/tests/import-wasm.mjs        (ENGINE_BASE=/engine-dev/ for another build)
//   PROBE=1 node web/tests/import-wasm.mjs path/a.xyz path/b.abc                  (explore: open arbitrary files, print what happened)
//   SAMPLES=/opt/kw/samples/... overrides the sample folder; ONLY=regex filters cases by name.
// Every case runs against the page's own engine; after a crash or hang (a worker that never answers) the page is reloaded.
// Known failures are listed in KNOWN below with the reason: they are printed as XFAIL and do not change the exit code.
// A known failure that starts to work is printed as FIXED (also exit code 0): remove it from KNOWN.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLES = process.env.SAMPLES || join(here, 'samples');
const base = process.env.ENGINE_BASE ? `&engineBase=${process.env.ENGINE_BASE}` : '';
const URL_ = (process.env.URL || 'http://localhost:5173/?engine=wasm') + base;
const OPEN_MS = +(process.env.OPEN_MS || 120000), EXPORT_MS = +(process.env.EXPORT_MS || 60000);

// ---- expectations ------------------------------------------------------------------------------------------------------
// [file in samples/, width, height, what it is]
const OPEN = [
];
// Export round trip: engine's own 320x200 document with one stroke, written as `format`, reopened as `reopenAs`.
const EXPORT = ['kra', 'png', 'jpg', 'psd', 'ora', 'tga', 'bmp', 'webp', 'gif', 'exr', 'jxl', 'avif', 'krz', 'hdr', 'csv', 'r16',
    'tiff', 'heic', 'jp2', 'svg', 'gbr', 'qml'];
// name -> reason. Open cases are "open:<file>", export cases "export:<format>".
const KNOWN = {
};

// ---- harness -----------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let page, log = [];
const sampleBytes = new Map();
async function boot() {
    if (page) await page.close().catch(() => {});
    page = await browser.newPage();
    log = [];
    page.on('pageerror', e => log.push('PAGEERROR ' + e.message));
    page.on('console', m => { const t = m.text().trim(); if (t && !/migration|vite|kf\.i18n|RAM|start-up|instantiated|KoShapeManager/.test(t)) log.push(t.slice(0, 300)); });
    await page.route('**/__sample/**', route => {
        const bytes = sampleBytes.get(decodeURIComponent(new globalThis.URL(route.request().url()).pathname.split('/').pop()));
        return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(bytes) });
    });
    await page.goto(URL_);
    await page.waitForFunction(() => window.__engine && __engine.documentInfo().then(Boolean), null, { timeout: 150000 });
    await page.waitForTimeout(1500);
}

// Runs in the page. Opens `name` (bytes fetched from the route), reports size and sampled pixels of its PNG export.
const inPage = {
    async open(name, openMs, exportMs) {
        const within = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('HANG: ' + what + ' did not return in ' + ms / 1000 + ' s')), ms))]);
        try {
            const bytes = new Uint8Array(await (await fetch('/__sample/' + encodeURIComponent(name))).arrayBuffer());
            const info = await within(__engine.openDocument(name, bytes), openMs, 'open');
            const r = { w: info.width, h: info.height, model: info.colorModel, depth: info.colorDepth, profile: info.profile };
            let png;
            try { png = await within(__engine.exportDocument('png'), exportMs, 'png export'); }
            catch (e) { r.pngError = e.message; return r; }   // the document is open; only reading its pixels failed
            const img = await createImageBitmap(new Blob([png], { type: 'image/png' }));
            if (img.width !== info.width || img.height !== info.height) r.pngSize = [img.width, img.height];
            const c = new OffscreenCanvas(Math.min(img.width, 64), Math.min(img.height, 64)); const g = c.getContext('2d');
            g.drawImage(img, 0, 0, c.width, c.height);
            const d = g.getImageData(0, 0, c.width, c.height).data;
            const seen = new Set(); let amax = 0, amin = 255;
            for (let i = 0; i < d.length; i += 4) { seen.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4); amax = Math.max(amax, d[i + 3]); amin = Math.min(amin, d[i + 3]); }
            r.colours = seen.size; r.alphaMax = amax; r.alphaMin = amin;
            return r;
        } catch (e) { return { error: e.message }; }
    },
    async roundTrip(format, exportMs, openMs) {
        const within = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('HANG: ' + what + ' did not return in ' + ms / 1000 + ' s')), ms))]);
        const pixels = async () => {
            const png = await within(__engine.exportDocument('png'), exportMs, 'png export');
            const img = await createImageBitmap(new Blob([png], { type: 'image/png' }));
            const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0);
            return [[160, 100], [100, 70], [5, 195], [300, 20]].map(([x, y]) => [...g.getImageData(Math.min(x, img.width - 1), Math.min(y, img.height - 1), 1, 1).data]);
        };
        let stage = 'new';
        try {
            await __engine.newDocument({ width: 320, height: 200 });
            __engine.beginStroke({ x: 40, y: 40, pressure: 1, timeMs: 0 }); __engine.continueStroke([{ x: 280, y: 160, pressure: 1, timeMs: 20 }]); __engine.endStroke();
            const before = await pixels();
            stage = 'export';
            const bytes = await within(__engine.exportDocument(format), exportMs, 'export');
            stage = 'reopen';
            const info = await within(__engine.openDocument('roundtrip.' + format, bytes), openMs, 'reopen');
            stage = 'pixels';
            const after = await pixels();
            return { size: bytes.length, w: info.width, h: info.height, before, after };
        } catch (e) { return { error: e.message, stage }; }
    },
};

const PROBE = !!process.env.PROBE;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
let failed = 0, xfail = 0, fixed = 0, passed = 0;
const summary = [];
const hardStop = setTimeout(() => { console.log('FAILED: hard timeout'); process.exit(2); }, 3 * 3600 * 1000);

async function guarded(fn) {
    // the page-side timers catch a hung engine; this catches a page that died with it
    const r = await Promise.race([fn().catch(e => ({ error: 'PAGE: ' + e.message })), new Promise(res => setTimeout(() => res({ error: 'HANG: page did not answer' }), OPEN_MS + EXPORT_MS + 30000))]);
    if (r.pngError) { r.console = log.slice(-6); await boot(); }   // a hung export leaves the engine inside a nested event loop: start clean
    else if (r.error && /^(HANG|PAGE)|out of bounds|unreachable|abort|RuntimeError|Aborted|memory/i.test(r.error)) {
        r.crashed = true;
        r.console = log.slice(-6);
        await boot();
    } else if (r.error && /did not return/.test(r.error)) { r.crashed = true; r.console = log.slice(-6); await boot(); }
    return r;
}

function report(name, ok, detail) {
    const known = KNOWN[name];
    let tag;
    if (ok) { if (known) { tag = 'FIXED'; fixed++; } else { tag = 'PASS'; passed++; } }
    else if (known) { tag = 'XFAIL'; xfail++; } else { tag = 'FAIL'; failed++; }
    console.log(`${tag} ${name} ${detail}${!ok && known ? '\n       known: ' + known : ''}`);
    summary.push([tag, name]);
}

await boot();

async function evalPage(fn, args) {
    return page.evaluate(({ src, args }) => (0, eval)('(' + src + ')').apply(null, args), { src: fn.toString().replace(/^async /, 'async function '), args });
}

let present = new Set(); try { present = new Set(readdirSync(SAMPLES)); } catch {}
async function runOpen(name, w, h, what) {
    if (!present.has(name)) { console.log(`SKIP open:${name} (not in ${SAMPLES})`); return; }
    sampleBytes.set(name, readFileSync(join(SAMPLES, name)));
    const t0 = Date.now();
    const r = await guarded(() => evalPage(inPage.open, [name, OPEN_MS, EXPORT_MS]));
    const secs = ((Date.now() - t0) / 1000).toFixed(1) + 's';
    let verdict, ok = false;
    if (r.crashed) verdict = 'CRASH/HANG ' + r.error + (r.console?.length ? ' | console: ' + r.console.join(' / ').slice(0, 400) : '');
    else if (r.error) verdict = 'ERROR ' + r.error;
    else if (w && (r.w !== w || r.h !== h)) verdict = `WRONG SIZE ${r.w}x${r.h}, expected ${w}x${h}`;
    else if (r.pngError) verdict = `OPENS ${r.w}x${r.h} ${r.model}/${r.depth} but cannot be read back: PNG export: ${r.pngError}`;
    else if (r.pngSize) verdict = `WRONG SIZE png export is ${r.pngSize}`;
    else if (r.colours < 2 && !(r.alphaMax > 0 && r.alphaMin !== r.alphaMax)) verdict = `BLANK (${r.colours} colour, alpha ${r.alphaMin}..${r.alphaMax})`;
    else { verdict = `ok ${r.w}x${r.h} ${r.model}/${r.depth} colours=${r.colours} alpha=${r.alphaMin}..${r.alphaMax}`; ok = true; }
    report('open:' + name, ok, `[${what}] ${verdict} (${secs})`);
}

async function runExport(format) {
    const t0 = Date.now();
    const r = await guarded(() => evalPage(inPage.roundTrip, [format, EXPORT_MS, OPEN_MS]));
    const secs = ((Date.now() - t0) / 1000).toFixed(1) + 's';
    let verdict, ok = false;
    if (r.crashed) verdict = `CRASH/HANG at ${r.stage ?? '?'}: ${r.error}` + (r.console?.length ? ' | console: ' + r.console.join(' / ').slice(0, 400) : '');
    else if (r.error) verdict = `ERROR at ${r.stage}: ${r.error}`;
    else if (r.w !== 320 || r.h !== 200) verdict = `WRONG SIZE ${r.w}x${r.h} (${r.size} bytes)`;
    else {
        const [mid, , corner] = r.after;
        const differs = mid.some((v, i) => Math.abs(v - corner[i]) > 40);
        // same pixels as before at the four sample points, loosely (lossy codecs, colour management)
        const same = r.after.every((p, i) => p.every((v, k) => Math.abs(v - r.before[i][k]) <= (k === 3 ? 60 : 64)));
        if (!differs) verdict = `BLANK after reopen (${r.size} bytes)`;
        else if (!same) verdict = `LOOKS WRONG ${r.size} bytes; before ${JSON.stringify(r.before)} after ${JSON.stringify(r.after)}`;
        else { verdict = `ok ${r.size} bytes`; ok = true; }
    }
    report('export:' + format, ok, verdict + ` (${secs})`);
}

if (!PROBE) {
    for (const [n, w, h, what] of OPEN) if (!only || only.test('open:' + n)) await runOpen(n, w, h, what);
    for (const f of EXPORT) if (!only || only.test('export:' + f)) await runExport(f);
} else {
    for (const f of process.argv.slice(2)) {
        const name = basename(f); sampleBytes.set(name, readFileSync(f));
        const t0 = Date.now();
        const r = await guarded(() => evalPage(inPage.open, [name, OPEN_MS, EXPORT_MS]));
        console.log(name, JSON.stringify(r).slice(0, 600), ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
    for (const f of (process.env.PROBE_EXPORT || '').split(',').filter(Boolean)) await runExport(f);
}

clearTimeout(hardStop);
console.log(`\n${passed} passed, ${xfail} known failures (XFAIL), ${fixed} known failures now working (FIXED), ${failed} FAILED`);
for (const [t, n] of summary) if (t === 'XFAIL' || t === 'FIXED' || t === 'FAIL') console.log(' ', t, n);
await browser.close();
process.exit(failed ? 1 : 0);
