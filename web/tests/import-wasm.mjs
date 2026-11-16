// File import and export through the real engine (see docs/formats/RESULTS.md for the diagnoses).
//   URL=http://localhost:5192/?engine=wasm node web/tests/import-wasm.mjs        (ENGINE_BASE=/engine-dev/ for another build)
//   PROBE=1 node web/tests/import-wasm.mjs path/a.xyz path/b.abc                  (explore: open arbitrary files, print what happened)
//   SAMPLES=/opt/kw/samples/... overrides the sample folder; ONLY=regex filters cases by name.
// Every case runs against the page's own engine; after a crash or hang (a worker that never answers) the page is reloaded.
// Known failures are listed in KNOWN below with the reason: they are printed as XFAIL and do not change the exit code.
// A known failure that starts to work is printed as FIXED (also exit code 0): remove it from KNOWN.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
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
    // PNG, JPEG, WebP, GIF, BMP, TGA (Qt image plugins and libpng/libjpeg/libwebp)
    ['png-rgb8.png', 96, 64, 'PNG 8-bit RGB'],
    ['png-rgb16.png', 96, 64, 'PNG 16-bit RGB'],
    ['png-grey16.png', 96, 64, 'PNG 16-bit greyscale'],
    ['png-icc.png', 57, 57, 'PNG with ICC profile (sRGB IEC61966-2.1)'],
    ['jpg-rgb8.jpg', 96, 64, 'JPEG RGB'],
    ['jpg-grey8.jpg', 96, 64, 'JPEG greyscale'],
    ['jpg-cmyk.jpg', 96, 64, 'JPEG CMYK'],
    ['jpg-cmyk-adobe.jpg', 100, 100, 'JPEG CMYK, Adobe marker'],
    ['jpg-icc.jpg', 96, 64, 'JPEG with ICC profile'],
    ['jpg-exif.jpg', 20, 20, 'JPEG with Exif (orientation 6)'],
    ['webp-lossless.webp', 96, 64, 'WebP lossless'],
    ['webp-anim.webp', 256, 256, 'WebP animated'],
    ['gif-rgb8.gif', 96, 64, 'GIF'],
    ['gif-anim.gif', 64, 48, 'GIF animated, 5 frames'],
    ['bmp-rgb8.bmp', 96, 64, 'BMP 24-bit'],
    ['bmp-rle8.bmp', 128, 128, 'BMP RLE8'],
    ['tga-rgb8.tga', 96, 64, 'TGA uncompressed'],
    ['tga-rle-alpha.tga', 199, 199, 'TGA RLE with alpha'],
    ['ico-16.ico', 16, 16, 'ICO (Qt image plugin)'],
    // TIFF (libtiff 4.7 without lzma/zstd/webp/jbig/lerc)
    ['tif-rgb8.tif', 96, 64, 'TIFF 8-bit RGB, no extra tags'],
    ['tif-deflate-predictor.tif', 96, 64, 'TIFF deflate + horizontal predictor, WhitePoint/Primaries tags'],
    ['tif-rgb16.tif', 96, 64, 'TIFF 16-bit RGB'],
    ['tif-grey16.tif', 96, 64, 'TIFF 16-bit greyscale'],
    ['tif-float32.tif', 96, 64, 'TIFF 32-bit float RGB'],
    ['tif-cmyk.tif', 96, 64, 'TIFF CMYK'],
    ['tif-webp.tif', 128, 128, 'TIFF with WebP compression'],
    ['tif-jpeg-tiled.tif', 512, 384, 'TIFF tiled, JPEG compression'],
    // PSD
    ['psd-rgb8.psd', 96, 64, 'PSD RGB 8-bit'],
    ['psd-rgb16.psd', 96, 64, 'PSD RGB 16-bit'],
    ['psd-grey8.psd', 96, 64, 'PSD greyscale'],
    ['psd-cmyk8.psd', 96, 64, 'PSD CMYK 8-bit'],
    ['psd-cmyk16.psd', 100, 104, 'PSD CMYK 16-bit (Krita test file)'],
    ['psd-layers.psd', 128, 128, 'PSD two layers', { layers: 2 }],
    ['psd-groups.psd', 100, 100, 'PSD layer groups'],
    ['psd-indexed.psd', 100, 104, 'PSD indexed colour'],
    // Krita's own and OpenRaster
    ['ora-two-layers.ora', 96, 64, 'ORA two layers', { layers: 2 }],
    ['kra-two-layers.kra', 96, 64, 'KRA two layers (written by the engine)', { layers: 2 }],
    ['kra-load-test.kra', 1000, 753, 'KRA from Krita\'s tests'],
    ['krz-two-layers.krz', 96, 64, 'KRZ two layers (written by the engine)', { layers: 2 }],
    // HDR formats
    ['exr-half.exr', 800, 800, 'EXR half float'],
    ['exr-float32.exr', 500, 500, 'EXR 32-bit float'],
    ['exr-memorial.exr', 512, 768, 'EXR half float, photo'],
    ['hdr-objects.hdr', 512, 512, 'Radiance RGBE'],
    ['hdr-256box.hdr', 256, 256, 'Radiance RGBE, small'],
    ['hdr-rgb8.hdr', 96, 64, 'Radiance RGBE (ImageMagick)'],
    // JPEG XL, HEIF family
    ['jxl-rgb.jxl', 512, 384, 'JPEG XL RGB'],
    ['jxl-cmyk.jxl', 128, 128, 'JPEG XL CMYK'],
    ['jxl-anim.jxl', 256, 256, 'JPEG XL animated'],
    ['jxl-hdr.jxl', 512, 215, 'JPEG XL HDR (PQ/Rec2020, float)'],
    ['heic-rainbow.heic', 451, 461, 'HEIC (HEVC)'],
    ['heic-example.heic', 1280, 854, 'HEIC (HEVC), photo'],
    ['avif-example.avif', 800, 533, 'AVIF, photo'],
    ['avif-rgba10.avif', 64, 64, 'AVIF 10-bit with alpha'],
    ['heif-rgba10.heif', 64, 64, 'HEIF 10-bit with alpha'],
    // JPEG 2000
    ['jp2-rgb8.jp2', 96, 64, 'JP2 RGB 8-bit'],
    ['jp2-grey16.jp2', 96, 64, 'JP2 greyscale 16-bit'],
    ['jp2-testcard.jp2', 640, 480, 'JP2 photo, lossless'],
    ['jp2-4comp.jp2', 64, 64, 'JP2 sRGB with 4 components'],
    ['jp2-subsampled.jp2', 480, 640, 'JP2 with chroma sub-sampling'],
    ['j2k-codestream.j2k', 96, 64, 'raw JPEG 2000 codestream (.j2k)'],
    // RAW (LibRaw through KDcraw). The exiftool files are metadata-only stubs with no sensor data.
    // (their PNG read-back is skipped: whether it hangs depends on state that was not pinned down, see RESULTS.md)
    ['raw-kodak.kdc', 768, 512, 'RAW Kodak DC50 .kdc', { noPng: true }],
    ['raw-test.dng', 64, 48, 'DNG, hand-made 64x48 Bayer RGGB 16-bit (tiny, so not a camera file)', { noPng: true }],
    // PDF: Krita always shows its "PDF Import Options" dialog; the test answers it (Enter, after choosing "All pages" where noted)
    ['pdf-text.pdf', 2480, 3500, 'PDF one page with text, first page only'],
    ['pdf-3pages.pdf', 1250, 834, 'PDF three pages (text + rectangle), all pages', { allPages: true, layers: 3 }],
    ['pdf-image.pdf', 2480, 3500, 'PDF with an image'],
    // vector, heightmaps, brushes
    ['svg-units.svg', 400, 200, 'SVG'],
    ['svg-gnu.svg', 625, 625, 'SVG (GNU head)'],
    ['heightmap-512.r16', 512, 512, 'heightmap 16-bit (.r16)'],
    ['heightmap-512.r8', 512, 512, 'heightmap 8-bit (.r8)'],
    ['brush-grey.gbr', 7, 7, 'GIMP brush, greyscale'],
    ['brush-rgba.gbr', 49, 61, 'GIMP brush, RGBA'],
    ['brush-animated.gih', 64, 64, 'GIMP brush pipe (.gih), opened as an image'],
];
// Big files that are not copied into the repository; looked up in EXTRA_DIR and skipped when absent (see docs/formats/SOURCES.md).
const EXTRA_DIR = process.env.EXTRA || '/opt/kw/samples';
const EXTRA = [
    ['rawpy/test/iss030e122639.NEF', 4284, 2844, 'RAW Nikon .nef, 10 MB (NASA)', { noPng: true }],
    ['rawpy/test/M0054341_01_00005.cr2', 3906, 2602, 'RAW Canon .cr2, 9 MB', { noPng: true }],
    ['oexr/ScanLines/Blobbies.exr', 0, 0, 'EXR with RGBA and a Z (depth) channel, 6 MB'],
];
// Several samples are the same 96x64 picture (a gradient with a red rectangle and a blue disc); these pixels of it, at 20%/30%,
// 50%/50%, 80%/70% and 10%/90% of the size, are compared after opening (tolerance: lossy codecs, palettes, colour management).
const GRADIENT = [[255, 0, 0], [128, 129, 189], [0, 0, 255], [24, 230, 233]];
const SAME_PICTURE = { 'png-rgb8.png': 8, 'png-rgb16.png': 8, 'jpg-rgb8.jpg': 24, 'webp-lossless.webp': 8, 'gif-rgb8.gif': 40, 'bmp-rgb8.bmp': 8, 'tga-rgb8.tga': 8,
    'tif-rgb8.tif': 8, 'tif-deflate-predictor.tif': 8, 'tif-rgb16.tif': 8, 'tif-float32.tif': 8, 'psd-rgb8.psd': 8, 'jp2-rgb8.jp2': 8 };
// not psd-rgb16.psd: a 16-bit PSD without an ICC profile is assigned Krita's linear 16-bit profile (sRGB-elle-V2-g10), so it displays lighter (as on desktop).
// Export round trip: engine's own 320x200 document with one stroke, written as `format`, reopened as `reopenAs`.
const EXPORT = ['kra', 'png', 'jpg', 'psd', 'ora', 'tga', 'bmp', 'webp', 'gif', 'exr', 'jxl', 'avif', 'krz', 'hdr', 'csv', 'r16',
    'tiff', 'tif', 'heic', 'jp2', 'svg', 'gbr', 'gih', 'r8', 'qml'];
// name -> reason. Open cases are "open:<file>", export cases "export:<format>".
// csv and qml cannot be reopened through the bridge/by Krita; for them an export that returns bytes is the result.
const EXPORT_ONLY = { csv: 'Krita writes the frames next to the .csv; the bridge returns only the .csv, which cannot be opened alone', qml: 'Krita has no QML importer' };
// Exports of a document that is not the engine's own white 320x200 one: [sample, format, expected byte length or 0].
const EXPORT_FROM = [['heightmap-512.r16', 'r16', 524288], ['heightmap-512.r8', 'r8', 262144]];
const META = 'the document carries Exif/TIFF metadata on its layer; PNG, JPEG, KRA, ORA and KRZ export then never return (suspected: XMP serializer), RESULTS.md section 1';
const KNOWN = {
    'png-after-open:jpg-cmyk-adobe.jpg': META,
    'png-after-open:jpg-exif.jpg': META,
    'png-after-open:tif-deflate-predictor.tif': META,
    'png-after-open:tif-rgb16.tif': META,
    'png-after-open:tif-float32.tif': META,
    'open:tif-webp.tif': 'libtiff is built with -Dwebp=OFF (engine/build-deps.sh s_tiff): the WebP-compressed strips decode to nothing and Krita shows a blank image without an error',
    'open:tif-jpeg-tiled.tif': 'libtiff reports that the JPEG tables of this tiled TIFF cannot be loaded (libjpeg-turbo 3.0.4 built with TIFF JPEG-in-TIFF tables?), see RESULTS.md',
    'open:psd-indexed.psd': 'Krita does not support indexed-colour PSD (upstream excludes this file in kis_psd_test.cpp:46); it opens blank',
    'open:jp2-4comp.jp2': 'Krita JP2 plugin: sRGB images must have exactly 3 components (jp2_converter.cc:272); same on desktop',
    'open:jp2-subsampled.jp2': 'Krita JP2 plugin refuses sub-sampled components (jp2_converter.cc:240); same on desktop',
    'open:j2k-codestream.j2k': 'the plugin registers only jp2,jpx,jpf (krita_jp2_import.json); .j2k/.j2c/.jpc have no importer',
    'open:Blobbies.exr': 'five top-level channels (RGBA + Z): exr_converter.cc treats Z as an XYZ channel and cannot map them; same on desktop',
    'export:avif': 'HeifExport.cpp:224 creates a HEVC encoder first, even for AVIF; libheif has no HEVC encoder (x265 off), so it throws Unsupported_filetype -> "Export failed"',
    'export:heic': 'no HEVC encoder in libheif (WITH_X265=OFF in engine/build-deps.sh s_heif) -> Unsupported_filetype -> "Export failed"',
    'export:tiff': 'refused by name in engine/bridge/main.cpp (the "tif" spelling is not refused and works, see export:tif)',
    'export:jp2': 'no JPEG 2000 export plugin exists in Krita (only kritajp2import)',
    'export:svg': 'no SVG export plugin exists for raster documents',
    'export:r16': 'KisImportExportFilter::verify (KisImportExportFilter.cpp:182) tests "ba.at(i) > 0" on a signed char, so a file whose first 1000 bytes are all >= 0x80 (a white canvas) is rejected as "only zero bytes"; upstream bug',
    'export:r8': 'same as export:r16',
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

// Runs in the page. Opens `name` (bytes fetched from the route), clicks through the PDF import dialog if one appears
// (Krita shows it even in batch mode and waits for OK), then reads the pixels back through an 8-bit BMP export (BMP carries no
// metadata, so it works even where the PNG export hangs; see RESULTS.md) and, separately, through a PNG export.
const inPage = {
    async open(name, openMs, exportMs, opts) {
        const within = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('HANG: ' + what + ' did not return in ' + ms / 1000 + ' s')), ms))]);
        const stats = async (fmt, ms) => {
            const bytes = await within(__engine.exportDocument(fmt), ms, fmt + ' export');
            const img = await createImageBitmap(new Blob([bytes], { type: 'image/' + fmt }));
            const c = new OffscreenCanvas(Math.min(img.width, 64), Math.min(img.height, 64)); const g = c.getContext('2d');
            g.drawImage(img, 0, 0, c.width, c.height);
            const d = g.getImageData(0, 0, c.width, c.height).data;
            const seen = new Set(); let amax = 0, amin = 255;
            for (let i = 0; i < d.length; i += 4) { seen.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4); amax = Math.max(amax, d[i + 3]); amin = Math.min(amin, d[i + 3]); }
            const px = [[0.2, 0.3], [0.5, 0.5], [0.8, 0.7], [0.1, 0.9]].map(([fx, fy]) => {
                const p = new OffscreenCanvas(1, 1).getContext('2d'); p.drawImage(img, Math.floor(fx * img.width), Math.floor(fy * img.height), 1, 1, 0, 0, 1, 1);
                return [...p.getImageData(0, 0, 1, 1).data].slice(0, 3);
            });
            return { size: [img.width, img.height], colours: seen.size, alphaMax: amax, alphaMin: amin, px };
        };
        try {
            const bytes = new Uint8Array(await (await fetch('/__sample/' + encodeURIComponent(name))).arrayBuffer());
            let pdfDialog = null;
            const opening = __engine.openDocument(name, bytes);
            const poll = setInterval(async () => {
                if (pdfDialog) return;
                const d = (await __engine.kritaWindows()).find(w => w.kind === 'dialog' && w.modal);
                if (!d) return;
                pdfDialog = d.title;
                const click = (x, y) => { for (const type of ['move', 'press', 'release']) __engine.kritaWindowInput(d.id, { type, x, y, button: 'left' }); };
                if (/PDF Import/.test(d.title)) {
                    if (opts && opts.allPages) { click(30, 57); await new Promise(r => setTimeout(r, 400)); }   // "All pages" radio button
                    __engine.kritaWindowInput(d.id, { type: 'keydown', key: 'Enter' }); __engine.kritaWindowInput(d.id, { type: 'keyup', key: 'Enter' });
                }
            }, 400);
            let info;
            try { info = await within(opening, openMs, 'open' + (pdfDialog ? ' (a "' + pdfDialog + '" dialog is waiting for input)' : '')); } finally { clearInterval(poll); }
            const r = { w: info.width, h: info.height, model: info.colorModel, depth: info.colorDepth, profile: info.profile, dialog: pdfDialog };
            r.layers = (await within(__engine.layers(), 10000, 'layers')).length;
            const bmp = await within(stats('bmp', exportMs), exportMs, 'bmp read-back');
            r.colours = bmp.colours; r.bmpSize = bmp.size; r.px = bmp.px;
            if (!opts || !opts.noPng) {
                try { const png = await stats('png', exportMs); r.pngSize = png.size; r.alphaMin = png.alphaMin; r.alphaMax = png.alphaMax; r.pngColours = png.colours; }
                catch (e) { r.pngError = e.message; }
            }
            return r;
        } catch (e) { return { error: e.message }; }
    },
    async roundTrip(format, exportMs, openMs, exportOnly) {
        const within = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('HANG: ' + what + ' did not return in ' + ms / 1000 + ' s')), ms))]);
        const pixels = async () => {
            const png = await within(__engine.exportDocument('bmp'), exportMs, 'bmp read-back');
            const img = await createImageBitmap(new Blob([png], { type: 'image/bmp' }));
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
            if (exportOnly) return { size: bytes.length };
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
    const run = () => Promise.race([fn().catch(e => ({ error: 'PAGE: ' + e.message })), new Promise(res => setTimeout(() => res({ error: 'HANG: page did not answer' }), OPEN_MS + EXPORT_MS + 30000))]);
    let r = await run();
    // the dev server reloads the page when someone edits web/src while the suite runs: start over once, that is not an engine result
    if (r.error && /Execution context was destroyed|navigation/.test(r.error)) { await boot(); r = await run(); }
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
    let src = fn.toString();
    if (/^async\s+[A-Za-z_$][\w$]*\s*\(/.test(src)) src = src.replace(/^async /, 'async function ');   // object-method shorthand -> function expression
    return page.evaluate(({ src, args }) => (0, eval)('(' + src + ')').apply(null, args), { src, args });
}

async function runOpen(file, w, h, what, opts = {}, dir = SAMPLES) {
    const name = basename(file);
    if (!existsSync(join(dir, file))) { console.log(`SKIP open:${name} (not in ${dir})`); return; }
    sampleBytes.set(name, readFileSync(join(dir, file)));
    const t0 = Date.now();
    if (process.env.NO_PNG) opts = { ...opts, noPng: true };
    const r = await guarded(() => evalPage(inPage.open, [name, OPEN_MS, EXPORT_MS, opts]));
    const secs = ((Date.now() - t0) / 1000).toFixed(1) + 's';
    let verdict, ok = false;
    const dlg = r.dialog ? ` (dialog "${r.dialog}" answered)` : '';
    if (r.crashed) verdict = 'CRASH/HANG ' + r.error + (r.console?.length ? ' | console: ' + r.console.join(' / ').slice(0, 400) : '');
    else if (r.error) verdict = 'ERROR ' + r.error;
    else if (w && (r.w !== w || r.h !== h)) verdict = `WRONG SIZE ${r.w}x${r.h}, expected ${w}x${h}`;
    else if (r.bmpSize && (r.bmpSize[0] !== r.w || r.bmpSize[1] !== r.h)) verdict = `WRONG SIZE the pixel read-back is ${r.bmpSize}`;
    else if (opts.layers && r.layers !== opts.layers) verdict = `WRONG LAYER COUNT ${r.layers}, expected ${opts.layers}`;
    else if (SAME_PICTURE[name] && !r.px.every((p, i) => p.every((v, k) => Math.abs(v - GRADIENT[i][k]) <= SAME_PICTURE[name]))) verdict = `WRONG PIXELS ${JSON.stringify(r.px)}, expected about ${JSON.stringify(GRADIENT)}`;
    else if (r.colours < 2 && !opts.flat) verdict = `BLANK (read-back has ${r.colours} colour)`;
    else { verdict = `ok ${r.w}x${r.h} ${r.model}/${r.depth} layers=${r.layers} colours=${r.colours}${dlg}`; ok = true; }
    report('open:' + name, ok, `[${what}] ${verdict} (${secs})`);
    // Saving the opened document as PNG is what a user does next; it is checked on its own.
    if (ok && !opts.noPng) report('png-after-open:' + name, !r.pngError, r.pngError ? r.pngError : 'ok');
}

async function runExport(format) {
    const t0 = Date.now();
    const r = await guarded(() => evalPage(inPage.roundTrip, [format, EXPORT_MS, OPEN_MS, !!EXPORT_ONLY[format]]));
    const secs = ((Date.now() - t0) / 1000).toFixed(1) + 's';
    let verdict, ok = false;
    if (r.crashed) verdict = `CRASH/HANG at ${r.stage ?? '?'}: ${r.error}` + (r.console?.length ? ' | console: ' + r.console.join(' / ').slice(0, 400) : '');
    else if (r.error) verdict = `ERROR at ${r.stage}: ${r.error}`;
    else if (EXPORT_ONLY[format]) { verdict = `ok ${r.size} bytes (not reopened: ${EXPORT_ONLY[format]})`; ok = true; }
    else if (r.w !== 320 || r.h !== 200) verdict = `WRONG SIZE ${r.w}x${r.h} (${r.size} bytes)`;
    else {
        const [mid, , corner] = r.after;
        const differs = mid.some((v, i) => Math.abs(v - corner[i]) > 40);
        // same pixels as before at the four sample points, loosely (lossy codecs, colour management)
        const same = r.after.every((p, i) => p.every((v, k) => k === 3 || Math.abs(v - r.before[i][k]) <= 64));
        if (!differs) verdict = `BLANK after reopen (${r.size} bytes)`;
        else if (!same) verdict = `LOOKS WRONG ${r.size} bytes; before ${JSON.stringify(r.before)} after ${JSON.stringify(r.after)}`;
        else { verdict = `ok ${r.size} bytes`; ok = true; }
    }
    report('export:' + format, ok, verdict + ` (${secs})`);
}

// Opens a sample and exports it, for formats the engine's own white test document cannot exercise.
async function runExportFrom(sample, format, expectedLength) {
    sampleBytes.set(sample, readFileSync(join(SAMPLES, sample)));
    const r = await guarded(() => evalPage(async (name, fmt, ms) => {
        const within = (p, t, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('HANG: ' + what + ' did not return in ' + t / 1000 + ' s')), t))]);
        try {
            const bytes = new Uint8Array(await (await fetch('/__sample/' + encodeURIComponent(name))).arrayBuffer());
            await within(__engine.openDocument(name, bytes), ms, 'open');
            return { size: (await within(__engine.exportDocument(fmt), ms, 'export')).length };
        } catch (e) { return { error: e.message }; }
    }, [sample, format, EXPORT_MS]));
    const ok = !r.error && (!expectedLength || r.size === expectedLength);
    report('export-from:' + sample + ':' + format, ok, r.error ? 'ERROR ' + r.error : `${r.size} bytes${expectedLength && r.size !== expectedLength ? ', expected ' + expectedLength : ''}`);
}

if (!PROBE) {
    for (const [n, w, h, what, opts] of OPEN) if (!only || only.test('open:' + n)) await runOpen(n, w, h, what, opts);
    for (const [n, w, h, what, opts] of EXTRA) if (!only || only.test('open:' + n)) await runOpen(n, w, h, what, opts, EXTRA_DIR);
    for (const [n, f, len] of EXPORT_FROM) if (!only || only.test('export-from:' + n + ':' + f)) await runExportFrom(n, f, len);
    for (const f of EXPORT) if (!only || only.test('export:' + f)) await runExport(f);
} else {
    for (const f of process.argv.slice(2)) {
        const name = basename(f); sampleBytes.set(name, readFileSync(f));
        const t0 = Date.now();
        const r = await guarded(() => evalPage(inPage.open, [name, OPEN_MS, EXPORT_MS, { allPages: !!process.env.ALL_PAGES, noPng: !!process.env.NO_PNG }]));
        console.log(name, JSON.stringify(r).slice(0, 600), ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
    for (const f of (process.env.PROBE_EXPORT || '').split(',').filter(Boolean)) await runExport(f);
}

clearTimeout(hardStop);
console.log(`\n${passed} passed, ${xfail} known failures (XFAIL), ${fixed} known failures now working (FIXED), ${failed} FAILED`);
for (const [t, n] of summary) if (t === 'XFAIL' || t === 'FIXED' || t === 'FAIL') console.log(' ', t, n);
await browser.close();
process.exit(failed ? 1 : 0);
