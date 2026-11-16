# Pass 5: bug fixing, look and feel, Krita's dockers and QML panels

Results are from the promoted engine (123 MB of WebAssembly, 35 MB gzipped, plus 22 MB of data)
unless a line says otherwise. Earlier state: `docs/pass4/STATUS.md`.

## Fixed

- **Krita's internal signals now arrive during a page request.** Krita holds back its "synchronized"
  signals while an event handler is itself running an event loop, which is how every page request
  is handled here. Layer activation inside Krita failed because of it. One level inside a request
  now counts as the top (`WebApplication::notify` in `engine/bridge/main.cpp`).
- **Current layer stored in the type Krita reads** (a weak pointer); any other type read back as "no layer".
- **Transform tool:** frame, handles and pivot appear; drag plus Enter moves the layer. Krita's tools
  get the "selected layers" list, and read-only requests (thumbnails, export) no longer tell an open
  tool stroke to finish. Export while transform or move is open is refused with a message.
- **Tool overlay in normal use:** a fractional canvas size was read as zero, so nothing was drawn.
- **Saving documents with metadata** (camera JPEG, RAW, reopened TIFF) as PNG, JPEG, KRA, ORA, KRZ:
  Exiv2 was built without C++ exceptions, so a routine internal exception aborted the save.
- **MyPaint brushes** are listed (7 presets) and paint. Their preset loader now registers before the
  resource scan, and the resource cache keeps loose preset files.
- **AVIF export**, **TIFF export** (the old guard was stale), **heightmap export of bright images**.
- **Krita's per-device preset memory is off in the web build**; it put a different brush back when
  mouse or pen input arrived.
- **Unknown exceptions in a request are answered with an error** instead of leaving the page waiting.
- **Toolbox icons in the production build** (inlined SVG data URLs needed quoting).

## Added

- **Dark theme and icons** for Krita's dialogs and panels.
- **Real icons for all 35 Krita tools**; Toolbox and Tool Options are stacked so both are visible.
- **Krita's dockers as panels** (28, from the Settings menu): Advanced Color Selector, Palette,
  Histogram, Layers, and so on. They are created on first use; building all of them at start-up cost
  about 10 seconds.
- **Krita's QML panels:** the text tool's option panel, Text Properties docker and Glyph Palette
  render and react to clicks (software Qt Quick backend). The first switch to the text tool takes
  about 5 seconds while they load.
- **Krita's on-canvas messages** reach the page as `kritaMessage` events (the page does not show them yet).
- **Format tests with real sample files** (`web/tests/import-wasm.mjs`, `docs/formats/RESULTS.md`).

## Verified

| Suite | Result |
|---|---|
| `kritatools-wasm`, `kritawindows-wasm`, `formats-wasm`, `contract2-wasm`, `stall-wasm`, `wasm` | pass |
| `contract-wasm` | one failure, the known test limit (blur brush on a blank canvas) |
| `import-wasm` (72 sample files) | 147 pass, 12 known limits, 7 former failures now pass, 0 unexpected |
| Interface: `phase1`, `phase2`, `phase3`, `phase4-shell`, `phase4-tools`, `phase7`, `small-screens`, `panels-touch`, `settings`, `storage`, `panels2`, `krita-look`, `krita-ui`, `canvas-aids`, `filter-forms`, `brush-forms` (997 edits) | pass; `tsc --noEmit` clean |
| Packaged production build, by screenshot | starts in about 8 s here, icons render, Krita's brush paints |

Not every suite was rerun after the last two engine changes (viewport rounding, preset handling);
the tool, window, contract, format and brush suites were. `settings` and `kritawindows` each failed
one check once and passed on rerun.

## Known problems

- **Transform handles can be missing** if the tool is picked within about two seconds of start-up or
  of a new document, while the page is still sending its first requests. Picking the tool again fixes it.
- **Engine waits on the browser's main thread** whenever Krita starts a timer (a synchronous round
  trip, present since the first build). When the page is busy the engine stalls until it is free.
- **Size and start-up:** 35 MB gzipped engine; about 6.7 s from page load on this machine, of which
  the engine's own initialisation is about 2.9 s.
- **Document operations are slow:** new document about 1 s, open about 1 s, add layer about 0.45 s.
  This predates this pass.
- **Toolbox order within a section changes between page loads.**
- **Docker panels on the page side were tested against the mock only**; on the real engine a docker
  was opened by a direct call and seen as a panel tab, nothing more.
- **PDF import** waits on Krita's options dialog, which the page shows. Fine in the app, but a
  script calling `openDocument` on a PDF must answer it.
- **Not supported:** HEIC export (no HEVC encoder), WebP-compressed TIFF, indexed-colour PSD, some
  JPEG 2000 variants, CSV animation through the page (it is a folder of files).
- **QML panels:** typing into their text fields and the resource pop-ups were not tried; one icon is
  missing and one QML warning appears when the docker opens (`docs/qml/REPORT.md`).
- **Two touch targets under 40 px** in the phone layout's panel sheet (older than this pass).
- **Unit tests:** four off-by-one failures still need a desktop comparison (`docs/unit-tests/RESULTS.md`).

## Not done

G'MIC, Python scripting, the phone and tablet build, Firefox/Safari, real pen hardware, Cloudflare
deployment, and a comparison against desktop Krita.
