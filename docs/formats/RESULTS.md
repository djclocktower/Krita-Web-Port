# File formats in the browser engine: what opens, what saves, and why the failures happen

Tested on the promoted engine (`web/public/engine`, 101 MB wasm, no symbol names), headless Chromium, 16 November 2026.
Repeat with `web/tests/import-wasm.mjs` (see the end). Sample files: `web/tests/samples/` (sources and licences in
`SOURCES.md`; the three files too big for the repository are looked up in `/opt/kw/samples`).

How a result is decided. **Open**: the call returns, the reported size is the expected one, and the pixels are read back through
an 8-bit BMP export (BMP carries no metadata, which matters, see problem 1): not blank, and for the files that are the same
96x64 picture, four sample pixels match within a tolerance. **Save**: the engine's own 320x200 document with one stroke is
exported, reopened and compared (size, four pixels). "Refused" is a message that comes back; "hangs" is a call that never returns
(waited 60 s, one case 150 s) while the engine still answers other calls; "crash" would be a WebAssembly trap (none happened).
Pixel values were compared only for the generated picture; for the other files "ok" means right size and not blank.

## Summary

* **Almost every import format opens with the right size**; opening is quick (1 to 9 s, a 12 MP RAW 8 s). The exceptions are
  limits of Krita itself or of the libraries linked (problem 6). RAW, JPEG 2000, PDF, HEIF/HEIC (HEVC), JPEG XL, AVIF, EXR and
  16-bit/float/CMYK variants all work, which `STATUS.md` listed as untested.
* **Biggest problem: after opening any file that carries Exif or other metadata (every camera JPEG, RAW, most TIFFs), saving it as
  PNG, JPEG, KRA, ORA or KRZ never returns** (problem 1). Saving as TGA, BMP, WebP, GIF, PSD, EXR, TIFF, HDR, GBR works.
* **TIFF export works** (when asked for as `tif`; the bridge refuses the spelling `tiff`) (problem 3).
* AVIF and HEIC export fail with "Export failed" (problem 4); `.r8`/`.r16` export fails for bright images (problem 5); JPEG 2000 and
  SVG have no export plugin; PDF import always waits for an answer to Krita's dialog (problem 2).

## Open

| Format | Sample | Result |
|---|---|---|
| PNG 8-bit RGB | `png-rgb8.png` | ok, pixels match |
| PNG 16-bit RGB | `png-rgb16.png` | ok, opens as 16-bit integer, pixels match |
| PNG 16-bit grey | `png-grey16.png` | ok (GRAYA/U16) |
| PNG with ICC | `png-icc.png` | ok, profile "sRGB IEC61966-2.1" kept |
| APNG | Pillow `iss634.apng` | refused: "Could not open" (no `.apng` suffix known); `single_frame.png` (same data as `.png`) opens one frame |
| JPEG RGB / grey / CMYK / ICC | `jpg-rgb8.jpg`, `jpg-grey8.jpg`, `jpg-cmyk.jpg`, `jpg-icc.jpg` | ok (grey opens as GRAYA, CMYK as CMYKA with Krita's "Chemical proof" profile) |
| JPEG with Exif, CMYK with Adobe marker | `jpg-exif.jpg`, `jpg-cmyk-adobe.jpg` | opens ok; **PNG/JPEG/KRA export afterwards hangs** (problem 1) |
| WebP lossless | `webp-lossless.webp` | ok, pixels match |
| WebP animated | `webp-anim.webp` | opens, 1 layer (frames not checked) |
| GIF / GIF animated | `gif-rgb8.gif`, `gif-anim.gif` | ok (animated: 1 layer, frames not checked) |
| BMP 24-bit, RLE8 | `bmp-rgb8.bmp`, `bmp-rle8.bmp` | ok |
| TGA, TGA RLE+alpha | `tga-rgb8.tga`, `tga-rle-alpha.tga` | ok |
| ICO | `ico-16.ico` | ok |
| TIFF 8-bit, 16-bit RGB, 16-bit grey, 32-bit float, CMYK | `tif-rgb8.tif`, `tif-rgb16.tif`, `tif-grey16.tif`, `tif-float32.tif` (F32), `tif-cmyk.tif` | ok, pixels match; those with metadata tags (all but `tif-rgb8`, `tif-grey16`, `tif-cmyk`) hang on PNG export (problem 1) |
| TIFF WebP-compressed | `tif-webp.tif` | **blank, no error** (problem 6a) |
| TIFF tiled JPEG | `tif-jpeg-tiled.tif` | **refused**: "...libjpeg-turbo could not load its coefficient quantization and/or Huffman coding tables" (problem 6b) |
| PSD RGB 8, grey, CMYK 8, CMYK 16, layers, groups | `psd-rgb8.psd`, `psd-grey8.psd`, `psd-cmyk8.psd`, `psd-cmyk16.psd`, `psd-layers.psd` (2 layers), `psd-groups.psd` | ok |
| PSD RGB 16-bit | `psd-rgb16.psd` | opens, but lighter than the 8-bit one: no ICC profile in the file, Krita assigns its linear 16-bit profile (`sRGB-elle-V2-g10`); expected, not an engine fault |
| PSD indexed | `psd-indexed.psd` | **blank**, no error (problem 6c) |
| ORA / KRA / KRZ | `ora-two-layers.ora`, `kra-two-layers.kra`, `kra-load-test.kra` (4 layers), `krz-two-layers.krz` | ok, layer counts right |
| EXR half / float32 / photo | `exr-half.exr`, `exr-float32.exr`, `exr-memorial.exr` | ok (F16, F32) |
| EXR with Z channel | `Blobbies.exr` (6 MB, in /opt) | **refused**: "Could not open" (problem 6d) |
| RGBE / .hdr | `hdr-objects.hdr`, `hdr-256box.hdr`, `hdr-rgb8.hdr` | ok (opens as F32) |
| JPEG XL RGB / CMYK / animated / HDR | `jxl-rgb.jxl`, `jxl-cmyk.jxl`, `jxl-anim.jxl`, `jxl-hdr.jxl` (F32, Rec2020) | ok (animated: 1 layer) |
| HEIC (HEVC) | `heic-rainbow.heic`, `heic-example.heic` (1280x854) | ok (HEVC is decoded by libde265) |
| AVIF, HEIF 10-bit with alpha | `avif-example.avif`, `avif-rgba10.avif`, `heif-rgba10.heif` | ok (10-bit opens as U16) |
| JPEG 2000 | `jp2-rgb8.jp2`, `jp2-grey16.jp2`, `jp2-testcard.jp2` | ok |
| JPEG 2000, 4 components / sub-sampled / codestream | `jp2-4comp.jp2`, `jp2-subsampled.jp2`, `j2k-codestream.j2k` | **refused** (problem 6e) |
| RAW | `raw-kodak.kdc` (768x512), `iss030e122639.NEF` (4284x2844), `M0054341_01_00005.cr2` (3906x2602), `raw-test.dng` (hand-made 64x48) | ok, all open as 16-bit RGBA, not blank. No options dialog (skipped in batch mode). PNG export after RAW: see problem 1 |
| PDF one page, text | `pdf-text.pdf` | ok, 2480x3500 (A4 at 300 dpi), text rendered; **only after the "PDF Import Options" dialog is answered** (problem 2) |
| PDF three pages | `pdf-3pages.pdf` | ok with "All pages": 3 layers "Page 1".."Page 3", 1250x834 |
| PDF with an image | `pdf-image.pdf` | ok after the dialog |
| SVG | `svg-units.svg`, `svg-gnu.svg` | ok (400x200, 625x625) |
| CSV (Krita animation) | none | **cannot be tested through the bridge** (problem 7) |
| Heightmap | `heightmap-512.r16`, `.r8` | ok (GRAYA U16/U8, 512x512) |
| Brushes opened as images | `brush-grey.gbr`, `brush-rgba.gbr`, `brush-animated.gih` | ok (the .gih opens as 5 layers) |

## Save (round trip)

Each row: export the engine's 320x200 document with a stroke, reopen the bytes, compare.

| Format asked for | Result |
|---|---|
| kra, png, jpg, psd, ora, tga, bmp, webp, gif, exr, jxl, krz, hdr, gbr, gih | ok, reopens at 320x200 with the stroke in place (jpg/webp/jxl/gif within tolerance) |
| `tif` | ok (201 kB, reopens as RGBA U8 with the stroke). Also ok with 16-bit, grey 16, F16, F32, CMYK, layered and alpha documents, and for a document with Exif |
| `tiff` | refused: "TIFF export does not work in this build yet" (`engine/bridge/main.cpp:880`) (problem 3) |
| avif | error "Export failed" (problem 4) |
| heic | error "Export failed" (problem 4) |
| jp2 | refused: "This build of the engine cannot write .jp2 files" (no export plugin in Krita) |
| svg | refused: "cannot write .svg files" (no export plugin for raster documents) |
| csv | export ok (3.5 kB), cannot be reopened alone (problem 7) |
| qml | export ok (238 bytes), Krita cannot read QML back |
| r16, r8 | error: "/tmp/export.r16 has only zero bytes in the first 1000 bytes" for the white test document; ok when the image is darker (a reopened `.r16` exports with 524288 bytes) (problem 5) |

A document that carries metadata is a different case: **png, jpg, kra, ora and krz exports of it hang** and `jxl` returns "Export failed"
(problem 1); tga, bmp, webp, gif, psd, exr, tif, r16, hdr, csv and gbr succeed.

## Failures, most likely to matter first

### 1. Export hangs for any document that carries metadata (PNG, JPEG, KRA, ORA, KRZ; JXL fails)

*What happens.* Open `jpg-exif.jpg`, `jpg-cmyk-adobe.jpg`, a RAW, or a TIFF that has tags beyond the basic ones (a Software or
DateTime tag, a predictor, white point/primaries, ...; every TIFF from Krita's and Pillow's test sets and from ImageMagick that I tried hung, the only ones that did
not were the three Pillow wrote without extra tags: `tif-rgb8`, `tif-grey16`, `tif-cmyk`), then `exportDocument('png' | 'jpg' | 'kra' | 'ora' | 'krz')`. The promise never resolves (60 s and 150 s
waits). The engine does not crash and answers `layers`, `documentInfo`, `kritaWindows` and BMP/TGA/GIF/PSD/EXR/TIFF exports while the
export hangs; no dialog is open (`kritaWindows()` lists only the tool options).
Saving a photograph as KRA is therefore impossible, which also hits any autosave or "save as .kra" path.

*Narrowing it down.* (a) A generated plain 96x64 TIFF with only Software/DateTime/ImageDescription/Artist tags added (`/opt/kw/samples/gen/t_sw.tif`, not in the repository) hangs;
the same picture without those tags does not. (b) After opening a hanging file, adding a new paint layer and deleting the
"Background" layer makes PNG export work at once, so the cause is data on the layer (its `KisMetaData::Store`), not the pixels,
the colour space or the TIFF/JPEG reader. (c) TGA, BMP, GIF, PSD and EXR do not read the store; **TIFF export does** and succeeds for
the same document (`kis_tiff_export.cc:231` calls the Exif backend's `saveTo`), so the Exif writer works. (d) **KRA export writes only the XMP backend**
(`plugins/impex/libkra/kis_kra_save_visitor.cpp:508-518`) and hangs, and PNG/JPEG call exif, iptc and xmp
(`libs/ui/kis_png_converter.cpp:1242-1275`, `plugins/impex/jpeg/kis_jpeg_converter.cc:576-610`). WebP also calls the store, but
only when its option `storeMetaData` is on (default off, `kis_webp_export.cpp:560`), so its success proves nothing.

*Likely location.* The XMP writer: `KisXmpIO::saveTo` (`plugins/metadata/xmp/kis_xmp_io.cpp`) into exiv2 0.28.3 built with
`-DEXIV2_ENABLE_XMP=ON` (`engine/build-deps.sh` `s_exiv2`, its bundled Adobe XMP toolkit: `XmpParser::initialize` at
`src/xmp.cpp:512` calls `SXMPMeta::Initialize()`, which takes the toolkit's global lock, and `XmpParser::encode` at `src/xmp.cpp:810`).
A lock or condition variable that is never released on the engine's thread is the usual way this hangs in a WebAssembly
build; I did not confirm that. `JXL` export of such a document returns "Export failed" at once instead of hanging
(`JPEGXLExport.cpp:479-526`: each `JxlEncoderAddBox` failure returns `InternalError`, which the bridge reports as the empty
message). The shipped wasm has no function names, so I could not get a stack: attach a debugger to the engine worker during the hang
using a build that keeps the name section (`/opt/kw/build/krita/bin/kritaengine.wasm` has one), or test `XMPMeta::Initialize()` /
`Exiv2::XmpParser::encode` in a small program.

*Flakiness.* `raw-kodak.kdc` hung on PNG export in 4 of 5 fresh pages but passed once inside the long run, after many documents had
been opened; I did not find what state makes the difference, so the suite skips PNG read-back for RAW files.

### 2. PDF import always waits for a dialog (hang until answered)

`KisPDFImport::convert` (`plugins/impex/pdf/kis_pdf_import.cpp:86-101`) builds a `KoDialog` "PDF Import Options" (pages, width,
height, resolution) and calls `kdb->exec()` without looking at `batchMode()`; the bridge's `d->setFileBatchMode(true)` only
silences the RAW dialog (`kis_raw_import.cpp:99-101`), the HEIF HLG dialog (`HeifImport.cpp:304`), and similar. So `openDocument` of a PDF does not
return until the modal dialog gets input. The dialog is a Krita window (title "PDF Import Options – Krita", 640x480, modal) that
the page can see through `kritaWindow` and drive with `kritaWindowInput`: the test sends Enter (default button OK), after a click on the
"All pages" radio button at (30,57) for the multi-page case. Result: 2480x3500 (A4 at 300 dpi) first page, or one layer per page.
A password-protected PDF would also open `KPasswordDialog` (line 76). The page's own file-open path must therefore show Krita's
windows while a PDF opens (or the bridge should pre-answer the dialog, e.g. all pages at 300 dpi).

### 3. TIFF export is refused by name but works

`engine/bridge/main.cpp:879-880` refuses `format == "tiff"` because the writer once crashed ("calls a missing function"). The
spelling `tif` goes through the same MIME (`image/tiff`) and is not refused: it wrote 8-bit, 16-bit, grey, F16, F32, CMYK, layered,
alpha and Exif-carrying documents, and each reopened with the same size and colour model; I could not reproduce any crash.
Suggest removing the guard and re-checking with the current build (the crash may have been fixed by a later rebuild, or it
depends on something these documents do not do, e.g. a non-default option in the TIFF options dialog, which is skipped in
batch mode: `kis_dlg_options_tiff.cpp`).

### 4. AVIF and HEIC export: "Export failed"

`plugins/impex/heif/HeifExport.cpp:224` constructs `heif::Encoder encoder(heif_compression_HEVC);` **unconditionally**, and only
afterwards, at line 226-228, replaces it by an AV1 encoder if the target is AVIF. Constructing the HEVC encoder calls
`heif_context_get_encoder_for_format` (`libheif/api/libheif/heif_encoding.cc:129-151`), which throws `Unsupported_filetype` when
no HEVC encoder plugin is compiled in. `engine/build-deps.sh` `s_heif` builds libheif with `-DWITH_X265=OFF` (and x264 off), so
**the HEVC constructor throws before the AV1 encoder is ever created**, for AVIF as well. The exception is caught at line 508 and
`setHeifError` (`HeifError.cpp:27-29`) maps it to `FormatFeaturesUnsupported` without setting a message, so the bridge prints
"Export failed" (`main.cpp:884`). Fix for AVIF: create the encoder only for the MIME that needs it (move line 224 into an `else`
branch of the `image/avif` test), a small patch to Krita; libaom is built as an AV1 encoder (`-DWITH_AOM_ENCODER=ON`, `s_aom`), so
that path should then work (not tried: it needs a rebuild). HEIC export cannot work without an HEVC encoder (x265 is GPL and
slow in wasm).

### 5. `.r8` / `.r16` export refused for bright images (upstream bug)

`KisImportExportFilter::verify` (`libs/ui/KisImportExportFilter.cpp:176-186`) reads the first 1000 bytes of the written file and
loops `if (ba.at(i) > 0) found = true;`. `QByteArray::at` returns `char`, which is **signed** (also on desktop x86), so a byte
>= 0x80 is "not greater than zero". A heightmap file has no header, and a white canvas is 0xFF (or 0xFFFF) throughout, so the check
reports "has only zero bytes in the first 1000 bytes, it's probably corrupt". Reproduced without any colour conversion: a flat grey 200 picture
fails, the same picture with its first pixel changed to 10 passes. The engine's default document is white, so exporting a new
document as `r16`/`r8` always fails; a darker or gradient image works (`heightmap-512.r16` re-exports to exactly 524288 bytes). Fix: compare
`ba.at(i) != 0` in `verify`. It affects every format without a header, which in practice is the heightmaps.

### 6. Silent or partial failures of the linked libraries

a. **TIFF with WebP compression opens blank without an error.** `s_tiff` in `engine/build-deps.sh` passes
`-Dwebp=OFF -Dlzma=OFF -Dzstd=OFF -Djbig=OFF -Dlerc=OFF -Dlibdeflate=OFF`. libtiff cannot decode such strips, and Krita's reader
(`kis_tiff_import.cc`) goes on with an empty buffer. Only WebP was tried; LZMA, ZSTD, JBIG and LERC TIFFs (rare, but ZSTD and LZMA appear in
scientific and GIS files) are very likely the same. Enabling the codecs needs the libraries built.

b. **JPEG-in-TIFF, tiled, YCbCr** (`tif-jpeg-tiled.tif`, a libtiff test image) fails with the error text from `kis_tiff_import.cc:1043`:
`tjDecompressHeader(handle, tables, sz, ...)` on the file's `JPEGTABLES` fails. The same code runs on desktop Krita, and libjpeg-turbo here is 3.0.4 with
TurboJPEG enabled (`s_jpeg`); I did not find whether desktop Krita opens this file, so this may not be specific to the port.

c. **Indexed-colour PSD opens blank without an error.** Krita does not support it: its own test skips the file
(`plugins/impex/psd/tests/kis_psd_test.cpp:46`, `exclusions << "100x100indexed.psd"`). Same on desktop.

d. **EXR with RGBA plus a Z (depth) channel** (`Blobbies.exr`) fails with the generic "Could not open". The five top-level channels
(A, B, G, R, Z) land in the branch "we don't know what to do" of `exr_converter.cc` (around lines 700-800; `Z` is in the
list of top-level names as an XYZ channel); desktop Krita should behave the same (not run there).

e. **JPEG 2000.** `jp2_converter.cc` is strict: 4 components in an sRGB file ("sRGB: number of numComponents 4 does not equal 3", line
272), sub-sampled components ("Sub-sampling not supported", 240), no colour space ("No color space found", ~line 300). The
import plugin registers only `jp2,jpx,jpf` (`krita_jp2_import.json`), so `.j2k`/`.j2c`/`.jpc` codestreams get the generic "Could not open". Same on desktop.
Pillow's `balloon_eciRGBv2_aware.jp2` is truncated (Pillow itself cannot read it), ignore it.

### 7. CSV (Krita animation CSV) cannot be used through the bridge

Krita's CSV is a `.csv` text file plus a folder `<name>.frames/` of PNG frames. `csv_saver.cpp:70-97` builds the folder path from
`m_doc->localFilePath()`, which is empty for a document the bridge created, so the frames go to `./.frames/` in the engine's working
directory, and `exportDocument('csv')` returns only the text (which refers to `frame00001-00000.png`, repeated for 101 frames).
`openDocument` stores only the one file (`main.cpp:859-863`), and `csv_loader.cpp:75-82` looks for `<name>.frames/`, so reopening
fails with "Could not open". No CSV sample could be opened and the round trip is not possible without bridge support for a
bundle of files (or a zip wrapper).

### 8. Animations come in as one layer

Animated GIF, WebP and JPEG XL open with 1 layer. Krita's importers for these formats do not create timeline frames here (frame count was
not checked through the animation API). APNG: a `.apng` file is refused ("Could not open"; the suffix is unknown), a `.png` APNG opens its first frame.

## What I could not get samples for, or could not test

* **CSV import** (problem 7). **HLG HEIF/AVIF** (would show `KisDlgHLGImport`, skipped in batch mode at `HeifImport.cpp:304`; no sample).
* **Real small camera files:** exiftool's and exiv2's `.dng .nef .cr2 .crw .raf` are metadata-only stubs and were dropped; ARW, ORF, RW2,
  RAF and a camera-made DNG were not tried (the DNG is hand-made). The camera files that did open are 9-10 MB and are not in the repository.
* **Deep EXR, tiled/multipart EXR, half-float TIFF, TIFF with ICC profile, PSD with an ICC profile and with text layers, animated
  JPEG XL frame counts, JPEG XL/HEIF with Exif or XMP** (the metadata problem above makes the last ones likely to hit it).
* PNG metadata (`tEXt`, `iTXt`, XMP) was not tested separately; `png-icc.png` has an ICC profile but no Exif.
* Pixel values were compared only for the generated picture (problem-free for 8/16-bit and float TIFF, PNG, JPEG, WebP, GIF, BMP,
  TGA, PSD 8-bit, JP2 8-bit); other files were checked for size and non-blank only. Colour management of CMYK, HDR (PQ, linear) and
  16-bit files was not compared with desktop Krita.
* The hang in problem 1 was observed with timeouts of 20 to 150 s; "never" means "not in 150 s".

## How to rerun

```
cd web && npx vite --port 5192 --strictPort &           # or any dev server
URL='http://localhost:5192/?engine=wasm' node web/tests/import-wasm.mjs        # about 25 minutes: each hang costs its timeout
EXPORT_MS=20000 ...                                       # shorter timeout for a hung call (default 60000)
ONLY='open:psd|export' ...                                # run a subset (regular expression on the case name)
NO_PNG=1 ...                                              # skip the "save as PNG after opening" checks, which are the slow ones
PROBE=1 PROBE_EXPORT=tif,avif node web/tests/import-wasm.mjs some.file other.file    # explore files that are not in the table
ENGINE_BASE=/engine-dev/ ...                              # test another build, as in formats-wasm.mjs
```

The suite lists the known failures with their reasons in `KNOWN` and prints them as `XFAIL`; the exit code is 1 only for a
failure that is not listed. A known failure that starts to pass is printed as `FIXED` (remove it from `KNOWN`).
The dev server reloads the page whenever someone edits `web/src` while the suite runs; the suite repeats a case once when that
happens.
