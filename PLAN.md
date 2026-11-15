# Krita Web Port — Plan (awaiting approval)

Status: **approved; Phase 0 (feasibility spike) in progress.** Decisions in §9 are recorded as answered.

## 1. Summary

Build a web version of Krita by **compiling Krita's real engine to WebAssembly and writing a new web-native UI around it.**

- The parts that are hard to get right (brush engines, blend modes, colour management, transforms, fills, filters, file formats, text shaping) are **Krita's own C++**, compiled, not re-implemented.
- The parts that are desktop-toolkit plumbing (windows, dockers, dialogs, menus, input) are **rewritten in TypeScript**, because the Qt versions do not survive the browser well (§3).
- Work starts with a **feasibility spike with a go/no-go gate** (§6, Phase 0). Nobody has done this before, so the plan is only as good as that spike.

"Feature parity with real Krita" is the end goal, and it is a large one: Krita is about 930,000 lines of C++ plus about 40 native libraries. It will be reached milestone by milestone, each one usable on your site, and tracked against a written checklist (§7). A few features cannot fully exist in a browser; those are listed in §8 so they are agreed up front, not discovered later.

## 2. What was researched

Surveyed Krita `master` at commit `84bab01` (6.1.0-prealpha, 15 Nov 2026). Krita 6.0 (Qt6) shipped 24 March 2026.

| Area | Lines of C++ (tests excluded) | Notes |
|---|---|---|
| `libs/image` | 122k | Tiles, layers/masks, strokes, transforms, fills, layer styles |
| `libs/pigment` + `plugins/color` | 49k | Colour spaces, 148 blend-mode IDs, LCMS2 engine |
| `libs/brush` + `plugins/paintops` | 50k | 16 brush-engine plugins, brush tips, 113 bundled presets |
| `plugins/filters`, `generators` | 27k | 34 filter plugins, 7 generators |
| `libs/flake` + `plugins/flake` | 85k | Vector shapes, SVG, the new text engine |
| `plugins/impex`, `libs/psd*` | 50k | 24 file-format plugins incl. `.kra`, PSD |
| `plugins/tools` | 45k | Transform, selection, fill, smart patch, lazy brush… |
| `libs/ui`, `widgets`, `widgetutils`, `plugins/dockers` | 294k | Qt Widgets UI: 28 dockers, 278 `.ui` forms |
| `plugins/extensions`, `python` | 40k | G'MIC, Python scripting, 24 Python plugins |
| **Total** | **~930k** | |

Other findings:

- **No web port of Krita exists.** The source has zero Emscripten/WASM references. The only public discussion found is a 2019 KDE forum thread where a developer said it was talked about but never tried. "Krita in a browser" projects today are remote-desktop streams of a container.
- **Licence: GPL-3.0** for Krita as a whole. See §9, decision 1.
- **Engine code is lightly tied to the UI toolkit; UI code is not.** In `libs/pigment`, 4 files touch Qt GUI/widget classes; in `libs/image`, 18. Across libs and plugins, 1,284 files reference `QWidget`/`QDialog`.
- **The engine has its own tests:** 362 test sources, and 49 MB of reference images in `libs/image/tests/data`. These become our correctness oracle (§7).
- SIMD goes through `xsimd` (29 files), which has a WebAssembly SIMD backend. Threads are used in 76 files and map to Web Workers under Emscripten.

## 3. Approach: three options, one recommendation

### A. Compile all of Krita, UI included, with Qt for WebAssembly — not recommended
Maximum parity on paper, but Qt's own documentation lists blockers that hit Krita directly:

- `QOpenGLWidget` is **not supported** on WASM; Krita's canvas is built on it (9 files). Only the slower software canvas could work.
- `QDialog::exec()` / nested event loops are unsupported in the default build; Krita has **234** such calls. The workarounds (Asyncify, JSPI) are marked experimental and cost size and speed.
- Dynamic plugin loading is tech-preview and **cannot be combined with threads**; Krita is 174 plugins and heavily threaded. Everything would need static linking.
- KDE Frameworks, Qt Sql, PrintSupport and PyQt are outside Qt's tested WASM module list.
- The result is a desktop UI painted into one `<canvas>`: no browser text selection or accessibility, poor on touch, very large download.

### B. Rewrite Krita from scratch in TypeScript — rejected
This is exactly what you asked to avoid: an LLM re-deriving brush, colour and transform algorithms. Output would look similar and behave differently, with no way to prove parity.

### C. Krita engine in WASM + new web UI — **recommended**
A headless build of Krita's engine runs in a Web Worker. The page talks to it through a narrow message API modelled on `libkis` (Krita's existing 46-class scripting API). The canvas is drawn with WebGL2 from tiles the engine produces.

```
 Browser main thread (TypeScript)            Web Worker(s) (C++ → WASM)
 ┌────────────────────────────────┐          ┌──────────────────────────────────┐
 │ App shell, dockers, dialogs    │ commands │ Krita engine (verbatim source):  │
 │ Pointer/keyboard input         │ ───────▶ │ pigment, image, brush, paintops, │
 │ WebGL2 canvas (tile textures)  │ ◀─────── │ filters, flake, impex, lcms2 …   │
 │ Overlays (Canvas2D/SVG)        │  tiles,  │ QtCore/QtGui only, no widgets    │
 └────────────────────────────────┘  state   │ Thread pool = more workers       │
                                             └──────────────────────────────────┘
```

Running the engine off the main thread also sidesteps Qt's "never block the main thread" restriction, since Krita's scheduler blocks freely.

**The main open question is where to cut.** Document handling, undo, and tool logic (freehand helper, transform strategies, fill strokes) live in `libs/ui` and `plugins/tools`, mixed in with widgets. Two ways to handle it, to be decided by the spike:

1. Pull the logic-only files from `libs/ui`/`plugins/tools` into the engine build and stub the widgets (default; more verbatim code, more build surgery).
2. Cut cleanly below `libs/ui` and rewrite tool controllers in TypeScript on top of engine primitives (less surgery, more new code and more parity risk).

## 4. What is compiled verbatim vs. rewritten

**Compiled from Krita source (the "bones"):**

| Capability | Source |
|---|---|
| Tiled pixel storage, undo memento, swap | `libs/image/tiles3` |
| Colour spaces (RGB/CMYK/Lab/Gray/XYZ/YCbCr × 8/16-bit int, 16/32-bit float), all blend modes, dithering, mixing | `libs/pigment`, `plugins/color` |
| ICC colour management, soft proofing | LCMS2 + `plugins/color/lcms2engine` |
| Brush tips and dab generation (auto, predefined, animated, ABR/GBR/GIH), mask generators, spacing, sensors/curves | `libs/brush`, `libs/image/brushengine`, `plugins/paintops/libpaintop` |
| All brush engines: pixel, colour smudge, bristle, sketch, hatching, spray, deform, curve, grid, particle, experiment, quick, tangent-normal, clone, filter, MyPaint | `plugins/paintops`, libmypaint |
| Layer stack compositing, all layer/mask types, clone and file layers, async projection | `libs/image` |
| Layer styles (bevel, shadow, stroke, satin, overlays), ASL import | `libs/image/layerstyles` |
| Transforms: affine with Krita's resampling filters, perspective, warp, cage, liquify, Bézier mesh | `libs/image/*transform_worker*`, `KisBezierMesh`, `tool_transform2` strategies |
| Flood fill, gap-closing fill, enclose-and-fill, gradients | `libs/image/floodfill`, `kis_gradient_painter`, `tool_enclose_and_fill` |
| Colorize mask (watershed, max-flow graph cut) | `libs/image/lazybrush` |
| Smart patch (inpainting) | `plugins/tools/tool_smart_patch/kis_inpaint.cpp` |
| Selections: outline tracing, grow/shrink/feather/border, magnetic, contiguous, similar-colour | `libs/image`, `plugins/tools/selectiontools` |
| All 34 filters and 7 generators (incl. FFT convolution, wavelet, halftone, screentone, simplex noise, SeExpr) | `plugins/filters`, `plugins/generators`, FFTW, KSeExpr |
| Vector shapes, path boolean ops, SVG read/write | `libs/flake`, `plugins/flake` |
| Text layout with full OpenType | `libs/flake/text`, HarfBuzz, FreeType, raqm, libunibreak |
| File formats: `.kra`, ORA, PSD, PNG, JPEG, TIFF, EXR, WebP, JPEG XL, HEIF, GIF, TGA, RAW, brushes, bundles | `plugins/impex`, `libs/psd`, upstream codec libraries |
| Animation data model, keyframes, interpolation curves, onion skins | `libs/image` |
| G'MIC filter collection | G'MIC (`3rdparty_plugins/ext_gmic`) |
| Canvas shaders (high-quality downscale, gradients) | `krita/data/shaders`, already GLSL ES-compatible |
| Bundled resources (presets, brushes, patterns, gradients, palettes, workspaces) | `krita/data` |

**Rewritten in TypeScript:**

- App shell, dockable panels, menus, toolbars, all dialogs and option panels (the 278 forms)
- Canvas view: pan/zoom/rotate/mirror, tile texture cache, overlays and tool decorations
- Input: Pointer Events (pressure, tilt, twist, coalesced events), shortcuts, canvas input profiles
- Colour selector widgets (the widgets only; colour maths stays Krita's)
- File open/save plumbing, autosave, resource storage in the browser's private file system (OPFS)
- Python scripting host (Pyodide) exposing the `libkis` API
- Video export glue (WebCodecs or ffmpeg.wasm), audio playback (Web Audio)

**Frontend stack (default):** TypeScript, Vite, Preact for panels and dialogs, raw WebGL2 for the canvas. No UI component library.

## 5. Repository layout

```
krita/         git submodule, pinned to a 6.0.x release tag
patches/       small patch series on top of Krita (kept minimal so upstream updates stay cheap)
engine/        CMake + Emscripten build, dependency builds, C++ bridge (embind)
web/           TypeScript app
parity/        feature checklist, golden-image test corpus and runner
```

## 6. Phases

Each phase ends with something usable on your site. Sizes are relative; I am not giving calendar dates before Phase 0 produces real numbers.

**Phase 0 — Feasibility spike and go/no-go (small, but decides everything)**
- Build QtCore/QtGui, LCMS2, and `kritaglobal`, `kritapigment`, `kritaimage`, `kritabrush`, `libkra`, default paintops to WASM with threads and SIMD.
- In a browser: open a real `.kra`, show its composited image, replay one recorded pixel-brush stroke.
- Run Krita's own `libs/pigment` and `libs/image` unit tests under WASM.
- Measure download size, start-up time, memory, stroke latency.
- Decide the cut line (§3, C). Write up results.
- **Gate:** if the engine cannot be built headless with a bounded patch set, stop and reconsider option A before spending more.

**Phase 1 — Painting MVP (large)**
Canvas view, paint and group layers, all blend modes, pixel brush and eraser with bundled presets, stabilisers, colour selector, undo/redo, open/save `.kra`, PNG/JPEG export, pen pressure and tilt.

**Phase 2 — Every brush engine and resource type (large)**
All 16 engines, brush editor, bundles, tags, patterns, gradients, palettes, ABR/GBR/GIH import.

**Phase 3 — Layers, masks, filters (large)**
Filter, fill, clone, file layers; transparency, filter, transform, colorize, selection masks; layer styles; all filters and generators with live preview.

**Phase 4 — Selections and tools (large)**
All selection tools and operations; fill, gradient, enclose-and-fill; all six transform modes; crop; smart patch; assistants; symmetry and multibrush; wrap-around; reference images; guides, grids, snapping.

**Phase 5 — Vector and text (large)**
Vector layers, shape and path tools, SVG import/export, on-canvas text with OpenType features.

**Phase 6 — Colour management and file formats (medium)**
All colour models and depths, profile management, soft proofing, LUT/OCIO docker, remaining import/export formats.

**Phase 7 — Animation (large)**
Timeline, onion skins, curves docker, audio, render to video and image sequence, storyboard docker, recorder.

**Phase 8 — Extensibility and long tail (large)**
G'MIC, Python scripting and the bundled Python plugins, remaining dockers and extensions, workspaces, sessions, shortcut schemes, preferences, translations from Krita's `po/` files.

## 7. How parity is defined and checked

- **Checklist:** `parity/checklist.md` enumerates every tool, docker, filter, brush engine, layer type, file format and menu action from the Krita source and manual. Each row is `missing / partial / done / not possible in browser`. "Parity" means every row is `done` or an agreed `not possible`.
- **Engine tests:** Krita's own unit tests compiled to WASM and run in CI.
- **Golden images:** a corpus of `.kra` files and recorded strokes rendered by desktop Krita (headless) and by the web build, then compared. Because it is the same code, the expected difference is floating-point noise; anything larger is a bug.
- **UI:** Playwright tests driving the real page for each checklist row.

## 8. Things a browser cannot fully match

| Feature | Limit | Planned handling |
|---|---|---|
| Very large documents | 32-bit WASM caps memory at 4 GB; tablets and phones allow much less. 64-bit WASM support is still uneven across browsers. | Krita's tile swap moved to OPFS; warn at document sizes that will not fit |
| Python plugins with Qt UIs | No PyQt in the browser | `libkis` API works via Pyodide; plugin UIs need a small replacement widget API |
| Native file access | Open/save-in-place pickers are Chromium-only | Upload/download fallback elsewhere |
| Installed system fonts | Chromium-only API | Bundled fonts plus user-uploaded fonts |
| Pick colour from outside the window | Chromium-only API | Unavailable elsewhere |
| Pen data | Pressure/tilt depend on browser and OS; no Wintab-level control | Use what Pointer Events deliver |
| HDR display output | Browser HDR canvas support is limited | HDR editing works; display is tone-mapped where unsupported |
| Printing, Wayland/X11 platform features | Not applicable | Dropped |

## 9. Decisions needed from you

1. **GPL-3.0.** Using Krita's code means this tool's source (WASM engine and the UI that forms one program with it) must be released under GPL-3.0 to anyone who can use it. The rest of your website is unaffected as long as the tool is a separate program on it. **Resolved: accepted**, this repository is GPL-3.0. This is my reading, not legal advice. If GPL is unacceptable, option C is off the table and only a clean-room rewrite (option B) remains.
2. **Hosting headers.** Threads require the page to send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, which can break third-party embeds and ads on the same page. **Resolved:** the site is on Cloudflare with a Worker serving from R2, so the Worker adds both headers to responses under the tool's path only (e.g. `/krita/*`); the rest of the site is untouched. The engine files live in R2 (no per-file size cap that matters here) and the Worker must serve `.wasm` as `application/wasm` with long-lived caching. Phase 0 verifies edge compression of the `.wasm` and the real download size.
3. **Target devices.** **Resolved:** desktop Chrome, Edge, Firefox and Safari first. Phones and tablets are a hard requirement later: once desktop works, a stripped-down build is served to those devices. Consequence for the design now: the engine must stay split into separately loadable modules and the UI must not assume a mouse or a large screen.
4. **UI fidelity.** Default: same layout and concepts as Krita (dockers, workspaces, same names and shortcuts) built as normal web UI, not a pixel copy of the Qt look.
5. **Krita version.** Default: pin to the latest 6.0.x release tag and update deliberately.
6. **Section 8 gaps.** **Resolved:** acceptable, unless one turns out to remove a major feature or cause poor performance; any such case is raised before proceeding.

## 10. Main risks

| Risk | Mitigation |
|---|---|
| Engine cannot be separated from `libs/ui` cheaply | Phase 0 gate; fallback to compiling `libs/ui` with widgets stubbed or off-screen |
| Download too large (Qt + engine + G'MIC + codecs) | Split into lazily loaded modules: core first, formats/G'MIC/Python on demand |
| Brush latency across the worker boundary | Input batching, shared memory for tiles; measured in Phase 0 |
| Resource database depends on Qt Sql/SQLite | SQLite compiles to WASM; verify the Qt driver in Phase 0, else replace storage layer |
| Upstream Krita keeps moving | Submodule + minimal patches; offer WASM fixes upstream |
| Scope | Checklist-driven; every phase ships |

## Sources

- Krita source, `github.com/KDE/krita` @ `84bab01` (line counts and file counts above are from this checkout)
- Qt for WebAssembly documentation: https://doc.qt.io/qt-6/wasm.html
- KDE forum, "WASM - Krita in the Browser" (2019): https://forum.kde.org/viewtopic.php%3Ff=137&t=160747.html
- Krita 6.0 release coverage: https://www.phoronix.com/news/Krita-6.0-Released , https://krita.org/en/posts/2026/krita-6.0.0-beta1-released/
- WASM Memory64 status: https://spidermonkey.dev/blog/2025/01/15/is-memory64-actually-worth-using.html , https://bugs.webkit.org/show_bug.cgi?id=300538
