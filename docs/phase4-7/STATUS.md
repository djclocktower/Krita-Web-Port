# Phases 4–7: status after the second parallel pass

A second slice, not finished phases. Phases 5 (vector, text) and 8 (G'MIC, Python, remaining dockers, translations) were not started.

## What exists now

**Engine (Krita's own code behind `protocol.ts`)**
- Selections: all, none, invert, rectangle, ellipse, polygon/lasso, contiguous; replace/add/subtract/intersect; outline for marching ants. Painting, fills, gradients and filters respect the selection.
- Fill (flood, selection), clear, gradient (six shapes, repeat, reverse).
- Image operations: scale, resize canvas, crop, rotate (any angle), mirror, flatten.
- Colour spaces: list models, depths and profiles; convert the image (RGB, greyscale, CMYK, Lab; 8/16-bit integer and 32-bit float verified).
- Animation: frame rate, range, current time, raster keyframes (add blank or duplicate, move, remove), onion-skin toggle; survives a `.kra` round trip.
- Formats added: PSD and ORA (layers preserved), TGA, BMP, SVG import, brush files, heightmap import.

**Interface**
- Canvas tools through a plug-in point (`src/tools.ts`): brush, rectangle/ellipse/lasso/contiguous selection, fill, gradient, crop, pan, zoom; toolbox; per-tool options; marching ants.
- Menus and dialogs for Select, Edit fill/clear, the Image menu, colour space conversion and export with a format choice; commands disable when they do not apply; a non-blocking error banner.
- Layouts for tablets (docks as side sheets) and phones (single menu button, one-row toolbar, panels as a bottom sheet), with on-screen undo/redo.
- Animation timeline docker.
- Krita-accurate settings forms for filters and generators (`src/descriptions`), built by reading Krita's dialogs.

## Verified (all run by me at the end, together)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `contract-wasm.mjs` (real engine, Phases 1–3 calls) | 57 of 58; the one failure is the blur brush on a blank canvas, a limit of the test |
| `contract2-wasm.mjs` (real engine, everything listed under Engine above) | 67 of 67 |
| `stall-wasm.mjs` (real engine, real pointer strokes with three presets) | pass |
| `wasm.mjs` (interface on the real engine) | pass |
| `phase1`, `phase2`, `phase3`, `phase4-shell`, `phase4-tools`, `small-screens` (mock engine; tools also on the real engine) | all pass |
| `filter-forms.mjs` (descriptions against the real engine; 187 filter applications at described minimum, maximum and choice values) | pass |
| `phase7.mjs` (timeline) | all pass except the playback-rate check, which is intermittent (see below) |

## Fixed in this pass

- **The stall while painting was an engine deadlock**, not an interface problem as reported after the first pass. A request that waits for the image to go idle (a layer thumbnail, asked for 0.4 s into a stroke) blocked the queue that the stroke's own end arrived on. Non-stroke requests are now held until the stroke ends. It affected any stroke longer than 0.4 s, with any preset.
- Events carrying a node id were mistaken for replies and dropped, so "active layer changed" never reached the interface on the real engine.

## Open problems

1. **Timeline playback rate check is intermittent**: measured about 29 frames per second against 24 in two of three runs. Not yet known whether the test or the playback timing is at fault.
2. **No JPEG, TIFF, WebP, EXR, JPEG XL, HEIF, GIF or RAW**: their libraries are not built. JPEG export is refused with a clear message; the export dialog still lists it. 16-bit float colour depth is also missing for the same reason (needs OpenEXR).
3. **Non-contiguous "similar colour" fill and selection are refused** by the real engine.
4. **Filter forms**: `halftone` is not described (264 settings), `colorbalance` is partial, and settings the engine does not report (curves, gradients, palettes, some colours) have no editor. The layer properties dialog does not use the new descriptions yet.
5. **Krita bug found**: the colour balance filter's default settings use different key names from the ones the filter reads, so two of its three axes cannot be set through defaults.
6. **Selection tools not built**: bezier, magnetic, similar-colour selection tools; selection transform; feather/grow/shrink/border.
7. **Transform tool, assistants, symmetry, wrap-around, reference images, guides and grids** (the rest of Phase 4) are not started. Transform masks are still refused.
8. **Timeline**: only paint layers get rows; no audio; no render to video; onion-skin settings are a bare on/off.
9. **Small screens** were checked with emulated touch in headless Chromium only. Panels' own small controls (24–28 px) are below the 40 px touch target inside sheets.
10. **Panels still use `alert()`** in places instead of the shell's error banner.
11. Carried over: no SIMD, no stroke smoothing, Krita's unit tests not run under WebAssembly, no comparison with desktop Krita, Chromium only, imported resources not persisted.
