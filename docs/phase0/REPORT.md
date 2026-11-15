# Phase 0 report — feasibility spike

**Verdict: go.** Krita's real core compiles to WebAssembly and runs in a browser with a small patch set. Krita's own unit tests have not been run under WebAssembly yet (see "Not done").

## What runs

`engine/spike` links Krita v6.0.4.1's core into one WebAssembly binary and, in headless Chromium:

1. starts Krita's core with no window (resource database, colour engine, plugins);
2. opens `libs/ui/tests/data/load_test.kra` (1000×753, nested layer groups) through Krita's own importer and composites it;
3. loads the bundled preset `b)_Basic-5_Size_default.kpp` and paints a 400-segment pressure-varying stroke through Krita's stroke system (`FreehandStrokeStrategy`), the same path the desktop freehand tool uses.

Output images: `document.png`, `stroke.png`. Raw numbers: `report.json`.

## Measurements

Headless Chromium, 4-core cloud VM, three runs.

| Measure | Result |
|---|---|
| `.wasm` size | 61.9 MB raw, 17.5 MB gzip -9, 13.7 MB Brotli -q 9 |
| Other files | 0.4 MB JS, 4.1 MB data (ICC profiles, sample document, preset, font) |
| Navigation to finished demo | 3.0–3.2 s (local server, no network delay) |
| Core start-up (database, colour spaces, plugins) | 1.05–1.07 s |
| Open and composite the `.kra` | 0.43–0.54 s |
| 400-segment stroke, 1024×1024 canvas | 183–201 ms, about 0.5 ms per segment |
| Blend modes registered for RGBA 8-bit | 136 |

The stroke figure is a throughput number for a small brush, not pen-to-screen latency; that needs the real canvas and a real stylus (Phase 1). All numbers are **without SIMD** (see below), so they are a pessimistic baseline.

## What was built

- 29 third-party libraries for WebAssembly (`engine/build-deps.sh`), including nine KDE Frameworks.
- Krita libraries: `kritaglobal`, `kritapigment`, `kritaflake`, `kritawidgets`, `kritaimage`, `kritalibbrush`, `kritaui`, `kritalibpaintop`, `kritalibkra`, plus the LittleCMS colour engine, default brush engines and `.kra` import plugins. About 1,700 build steps; all pass.
- Patches: a 441-line diff against Krita (10 files, 129 lines added), plus small patches to five KDE Frameworks. All in `patches/`.

## Findings that change the plan

1. **The cut line is above `libs/ui`, not below it.** Brush engines and the `.kra` loader link against `libs/ui`, and `libs/ui` itself compiled with three failing files out of roughly 600. So the whole core, `libs/ui` included, runs headless and only the visible interface is rewritten. This is option 1 from the plan, and it means tool logic (freehand helper, transform strategies, fills) can also stay Krita's own code.
2. **Krita's core must run in a worker thread.** On the browser's main thread it deadlocks, because Krita blocks while waiting for its worker threads. The spike runs `main()` in a worker (`PROXY_TO_PTHREAD`) with an 80-line display-less Qt platform plugin (`engine/spike/headless_qpa.cpp`). This matches the planned architecture; it is now a requirement, not a preference.
3. **Qt's dialog and OpenGL-widget limits stop mattering.** They belong to Qt's browser display layer, which this design does not use.
4. **Plugins are static.** All plugins link into the binary and are found through Qt's static-plugin list (patch to `KoJsonTrader`). Every plugin that is wanted must be linked and imported explicitly.
5. **No SIMD yet.** Krita's per-CPU vector code knows only x86 and ARM, so the build uses Krita's scalar fallback. Adding a WebAssembly SIMD backend there is the first performance task.
6. **Krita's libraries must be linked whole.** They register things from static initialisers and embedded resources that a normal static link silently drops.
7. **Krita needs bits of a desktop environment in the virtual filesystem:** a Fontconfig file, at least one font, ICC profiles, and its file-type database.

## Not done

- **Krita's unit tests under WebAssembly.** Planned for Phase 0, not yet attempted. Until they run, correctness rests on two rendered images looking right.
- **Comparison against desktop Krita.** No desktop build exists in this environment, so pixel parity is unverified.
- **The sample document is not rendered exactly.** It contains an Invert filter layer; filter plugins are not linked yet, so that layer has no effect in `document.png`.
- **Translations.** `libintl` is a stub.
- **Download splitting, memory behaviour with large documents, Safari and Firefox.** Only Chromium was run.

## Reproduce

See `engine/README.md`, then:

```sh
engine/build-deps.sh
engine/build-krita.sh kritaspike
node engine/spike/run.mjs $KW/build/krita/bin out/      # headless run, writes images and report.json
node engine/serve.mjs $KW/build/krita/bin 8080          # then open http://localhost:8080/kritaspike.html
```

The page itself is blank; results are in `window.kritaSpike` (the headless runner saves them).
