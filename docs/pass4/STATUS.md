# Pass 4: Krita's own tools, windows, remaining plugins, formats, SIMD

This pass finished the remaining additions before bug fixing. Results below are from the promoted
engine build (about 101 MB of WebAssembly) unless a line says otherwise.

## What was added

- **Krita's own tools drive the canvas.** The toolbox lists Krita's tools (37) and pointer, pen and
  key input goes to them. Krita's actions (534) can be searched and run (Ctrl+Enter).
- **Krita's own windows in the page.** Dialogs, pop-ups and the active tool's option panel are painted
  by Krita and shown by the page, which sends input back. This is how every Krita dialog becomes
  available without rebuilding it by hand.
- **Tool overlay.** What a tool draws over the image (crop frame, handles, guides) is sent to the page
  and lined up with the page's zoom and pan.
- **More of Krita's plugins:** polygon, polyline, dynamic brush, enclose-and-fill, colorize mask,
  knife, smart patch, calligraphy, text, assistants; vector path and image shapes; the Image/Layer/
  Select extension commands (rotate, shear, offset, colour range, split, separate, wavelet
  decompose, modify selection, ...); metadata (Exif, IPTC, XMP); CSV, RGBE, .krz, Spriter, QML,
  heightmap export.
- **New libraries and their plugins:** MyPaint brush engine, JPEG XL, HEIF/AVIF, RAW, JPEG 2000, PDF import.
- **SIMD.** Krita's vector code now uses WebAssembly SIMD. Measured in the SIMD agent's own build:
  brush masks 2x to 9x faster, 8-bit blending about 1.5x (see `docs/simd/REPORT.md`). Whole-app speed
  was not measured. There is no fallback for browsers without WebAssembly SIMD.
- **Krita's unit tests** run in the browser build (`docs/unit-tests/RESULTS.md`); the four header
  fixes that blocked four test programs are in the patch (those four were not rebuilt).

## Verified on the real engine

| Suite | Result |
|---|---|
| `kritawindows-wasm` (tool options, dialog, overlay, viewport, keys, new tools and actions) | all pass |
| `kritatools-wasm` (Krita's selection, brush, fill, rectangle, line tools, pen pressure, undo) | all pass |
| `contract2-wasm` | all pass |
| `contract-wasm` | one failure, the same test limit as before (blur brush on a blank canvas) |
| `stall-wasm`, `wasm` | pass |
| `formats-wasm` | JPEG XL, .krz, WebP, EXR export and reopen pass; AVIF and MyPaint fail (below) |
| Text tool, by hand | a drag makes a text box on a new vector layer; typed text draws |

Interface suites: see the end of this file.

## Known problems, for the bug-fixing phase

- **MyPaint presets are not listed.** The engine and the preset files are in, but Krita's resource
  system does not pick the presets up.
- **AVIF export fails** ("Export failed"). HEIC export cannot work (no HEVC encoder was built).
- **RAW, JPEG 2000, PDF and HEIF import are untested** (no sample files were tried).
- **TIFF export** still crashes and stays disabled.
- **Transform tool:** no handles appeared over the canvas when it was activated through the page.
- **Krita's windows use a light theme and have no icons**, so they do not match the app. Text fields
  inside them have not been tried with real typing beyond Escape/Enter.
- **Toolbox icons:** most Krita tools show two-letter placeholders.
- **Text tool option panel** is written in QML and Krita's QML component module is not built, so the
  panel is expected to be blank. The glyph palette and text properties docker are in the same position.
- **Start-up** is about 5 to 6 seconds on this (loaded) machine; the download is larger (101 MB engine
  plus 22 MB data, before compression).
- **Old real-engine sections of `phase4-tools` and `canvas-aids`** assume the hand-built tools and
  need updating now that the real engine uses Krita's.
- **Tool Options and Toolbox share one dock**, so Krita's option panel is hidden until its tab is chosen.
- Krita's selection outline is drawn by both Krita's overlay and the page.
- Unit tests: four unexplained off-by-one failures still need a desktop comparison.

## Not done

- **G'MIC** and **Python scripting**: not attempted. Both are large separate ports.
- **Krita's dockers** (advanced colour selector, palette, etc.) are not exposed; the page has its own panels.
- **Phone and tablet build**, Firefox/Safari, real pen hardware, Cloudflare deployment: untested.
- No comparison with desktop Krita yet.

## How it works (for whoever continues)

- `engine/spike/headless_qpa.cpp`: the display-less Qt platform now confirms window geometry itself,
  delivers window-system events synchronously, has a font database, and declares that windows can
  be sized (without that Qt ignores every resize).
- `engine/bridge/main.cpp`: `WebApplication::notify` watches every event (application event filters
  do not run, because Qt takes the browser's main thread for its own); windows are tracked on
  Show/Hide and repainted on update requests; `krita.viewport` sets Krita's zoom/pan/rotation and
  grows its window to fit; `paintOverlay` draws Krita's decorations into a picture and sends the used part.
- Contract additions are at the end of `web/src/engine/protocol.ts`; the page side is `web/src/krita/`.
