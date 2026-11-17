# Speed and size pass

Measured in headless Chromium on a shared four-core machine that was busy for most of the pass, so
timings are noisy; comparisons were made by alternating runs of two builds. Sizes are exact.

## What changed, with measurements

| Change | Effect |
|---|---|
| Krita no longer paints its own hidden copy of the image (colour conversion, scaling and a widget repaint on every update, which the page never shows) | with the next row: new document about 1.6 s to about 0.85 s |
| Engine debug log off by default (`?engineLog=1` turns it on); each line was a blocking round trip to the page's thread | as above |
| Final link pass optimises for size (`-Oz`); Krita's code is still compiled `-O3` | engine 123.0 MB to 110.4 MB (before G'MIC), 7% smaller compressed, no measurable slowdown, start about 2 s sooner in one comparison |
| Thumbnails in the prebuilt resource cache capped at 128 px | cache 12.8 MB to 3.7 MB (3.1 MB compressed) |
| Dockers created on first use (earlier pass) | engine initialisation 13.4 s to 2.9 s |
| Page requests handled one at a time | fixes a hang when a fast pen sends strokes back to back; no speed change |
| Krita told it has 3 GiB, tile data kept in memory | fixes undo restoring only part of the image; no speed change |

## Current numbers

First load, brotli level 9:

| File | Raw | Brotli |
|---|---|---|
| `kritaengine.wasm` (with G'MIC) | 118.8 MB | 29.8 MB |
| `kritaengine.data` (default resources, colour profiles, font) | 22.2 MB | 19.7 MB |
| `resourcecache.sqlite` | 3.7 MB | 3.1 MB |
| page (JavaScript, CSS, icons) | about 0.6 MB | about 0.2 MB |
| **Total** | **about 145 MB** | **about 52.8 MB** |

Before this pass the same total was 58.8 MB without G'MIC.

Timings on this machine (headless Chromium, software rendering): start to first document about
5.7 to 6.7 s when quiet; new 1600x1200 document about 0.85 s; open a PNG about 0.8 s; add a layer
about 0.13 s; ten hand-path strokes about 0.1 s; Gaussian blur on 1600x1200 about 4.3 s;
first use of the text tool about 5 s; first G'MIC dialog about 8 s.

## Where the time goes (from CPU profiles of a build with function names)

Start-up, engine thread, about 5.4 s in that run:

- Krita's main window: 2.2 s. Of that, icons for several hundred actions about 0.9 s, the view
  manager about 1.1 s, the brush toolbar and preset editor about 0.8 s.
- Resource database check: about 0.8 s.
- Default brush preset: about 0.8 s, nearly all of it Krita's preset editor updating its (unseen) form.
- Blocking round trips to the page's thread: about 1.1 s in total (file reads, timers, log lines).

New document plus add layer (about 1.5 s per round before the changes):

- Blocking round trips to the page's thread: 31% (file reads and seeks for the resource database,
  timer starts, log lines).
- Registering the document with Krita's resource database (SQLite): about 25%.
- Switching tools and re-reading shortcut settings for the new view: about 20%.
- Krita painting its hidden canvas: 11% (now removed).

## What could be cut

Shares are of engine code, from the link map; megabytes are estimates of the compressed download.

| Candidate | Engine share | Download saved | What is lost |
|---|---|---|---|
| G'MIC | measured | about 4 MB | the G'MIC filter collection (645 filters) |
| Qt Quick / QML | 11% | about 3 MB | the text tool's option panel, Text Properties docker, Glyph Palette (text on canvas still works) |
| Rarely used formats: AVIF/HEIF, PDF import, RAW, JPEG XL, EXR | 10% | about 3 MB, separable | those formats |
| Colour engine variants | 16% | perhaps 2 MB | Lab, XYZ and YCbCr documents, if trimmed to RGB, greyscale and CMYK. Needs code changes; not measured |
| Krita's dockers | 2% | about 0.7 MB | the 28 Krita dockers (the page's own panels stay) |
| MyPaint engine | 1% | about 0.3 MB | seven MyPaint brushes |
| Default patterns | data | up to 6.7 MB | 82 patterns; a core set of ten would save about 6 MB |
| Default brush presets and tips | data | up to 10.6 MB | 118 presets and their 80 tips; these are most of what makes it feel like Krita |

The data file is the larger half of the download and barely compresses. Trimming patterns is the
cheapest large saving. A "lite" build without G'MIC, QML, the rare formats and most patterns would
be roughly 37 MB.

Other options, not done:

- **Load the default bundle after start.** The engine needs one brush to start; the other 17 MB
  could arrive in the background. Needs Krita's resource loading to accept a late bundle.
- **Split the engine** so rarely used parts load on demand. WebAssembly dynamic linking with
  threads and this much C++ is a large project.
- **Compile Krita for size (`-Os`) instead of only the final pass.** A full rebuild; likely another
  10 to 15% off the engine at some speed cost. Not measured.

## Tried and dropped

- **In-engine file system (WASMFS).** Would remove the largest group of round trips to the page's
  thread. It links (with six socket callbacks stubbed), but Krita's resource database (SQLite)
  fails to initialise on it and the engine aborts. The build option `KW_WASMFS=ON` is kept, off by default.
- **Own event dispatcher for Krita's thread.** Removed the timer round trips, but gave no measurable
  speed-up, broke pen pressure, and one run hit a WebAssembly signature-mismatch error. Reverted.

## Still slow, and why

- **Blocking round trips to the page's thread** remain for file reads and timers. When the page is
  busy the engine waits. This is the most valuable thing left to fix (see WASMFS above).
- **New document and open at about 0.8 s** are mostly Krita's own per-document work.
- **Selecting a brush preset** updates Krita's unseen preset editor (about 0.8 s at start-up); the
  same cost is likely on every preset change. Not addressed.
- **Blur at about 4.3 s for 1600x1200** was not profiled.
