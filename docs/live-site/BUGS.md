# Bugs found on the live site (botchomebrew.wiki/krita/)

Date 2026-11-17. Build: `release/krita-web-test.zip` from commit f73a7f6, deployed to the wiki's R2 bucket
`botc-wiki-art` under `krita/` and served by the wiki's own Worker (`serveKrita` in botc-homebrew-wiki's
`worker/worker.js`, a copy of `deploy/cloudflare-worker.js`). Measurements: headless Chromium, SwiftShader,
4 cores, through the dev server (`?engine=wasm`) with the same engine files. Absolute times will differ on a
real machine; the ratios are what matter.

## 1. Slow and laggy, worst with the fill tool and the text tool

Reported by the owner: "extremely slow and laggy, especially the text tool or paint bucket".

### Measured (1600x1200 document)

| Action | Before | After fix A |
|---|---|---|
| Fill, whole canvas (release to `imageUpdate`) | 0.77-1.01 s | 0.37-0.44 s |
| Fill, 400x400 region | 0.45 s | about 0.4 s |
| Tool switch (`krita.tool`) | 0.13 s | 0.07 s |
| First switch to `SvgTextTool` | 5.1 s | 4.5-4.9 s |
| Click with the text tool | 0.48 s, full-canvas `imageUpdate` (1.92 Mpx) | not re-measured |

### Where the time goes (trace with `disabled-by-default-v8.cpu_profiler`, all threads)

- The browser's main thread is idle during a fill (59-77 ms busy out of about 1.5 s). The time is in the engine.
- The fill does its work on **one thread** (Krita's main thread). The other engine threads sit in two small
  wasm functions that are wait loops (`wasm-function[24475]`, `[11934]`; 11934 contains `memory.atomic.wait`),
  so they show as busy in profiles but are not working.
- On that one thread, **68% of the time was JavaScript glue**, not Krita: `Table.prototype.get` 294 ms,
  `wasm-to-js` 180 ms, `getWasmTableEntry` 114 ms, `js-to-wasm` 82 ms, out of 1142 ms.
  That is the `invoke_*` trampolines (399 of them) that Emscripten's JS exception handling puts around every
  call inside a try block.
- In this Emscripten (3.1.56), threaded builds turn off the table mirror, so
  `getWasmTableEntry=funcPtr=>wasmTable.get(funcPtr)` runs on every trampoline call.

### Fix A (done, live)

`engine/bridge/patch-engine-js.mjs` caches table lookups per thread in a pre-sized array; it is run on
`kritaengine.js` after linking (POST_BUILD step added to `engine/bridge/CMakeLists.txt`). Safe because the
engine never changes its table: no `wasmTable.set`/`grow`, no `addFunction`, no dynamic linking. The script
refuses to run if either changes. Commit fa02f06 on branch `ccr-a8f620e5-26fr43`. The patched
`kritaengine.js` is already uploaded to the live bucket.
**Not verified:** the POST_BUILD step itself (no toolchain in that session); the script was run by hand on
the built file. `kritatools-wasm`, `stall-wasm` and `wasm` pass with the patched file.

### Still to do

1. **Native wasm exceptions** (`-fwasm-exceptions` for Krita, every dependency and Qt). Removes the
   trampolines altogether. After fix A they are still about 450 ms of 816 ms on the fill's thread
   (`wasm-to-js`, `js-to-wasm`, the lookup). Needs Qt for WebAssembly built from source with wasm exceptions,
   since the prebuilt Qt uses JS exceptions (`engine/build-krita.sh` comment).
2. **Text tool, first use, about 4.5 s.** One engine thread works about 6 s under tracing (1.5 s of it JS glue).
   During the switch **seven new pthreads start** (`handleMessage`, `Instance`, `importScripts`, 40-60 ms each),
   so `PTHREAD_POOL_SIZE=16` looks exhausted at that point; check whether a larger pool, or loading the QML
   panels before first use, helps.
3. **Text tool click repaints the whole canvas** (one 1.92 Mpx `imageUpdate`, about 7.7 MB sent to the page).
4. **The fill is single-threaded.** The scanline fill itself is Krita's; this is a parity question, not a port bug,
   but with the glue gone it is what remains.
5. **No function names in the release engine** (no `name` section), so profiles read `wasm-function[N]`.
   A `KRITA_WEB_PROFILING=ON` copy of the same build would make items 2-4 much quicker to diagnose.

## 2. Krita's dialogs and dockers are blurry on high-DPI screens

Reported with a screenshot of Help > About Krita on a Windows laptop: the text is soft and low resolution.

### Cause

- `HeadlessScreen` in `engine/spike/headless_qpa.cpp` has no `devicePixelRatio()`, so Qt draws at 1x.
- `engine/bridge/main.cpp` sends each window as `w->grab()` (around line 436): an image in logical pixels.
- The page (`web/src/krita/WindowView.tsx`) puts that image in a canvas of the same pixel size and shows it at
  `width*scale` CSS pixels, so on a screen with `devicePixelRatio` above 1 the browser stretches it.
- Probably the same for tool overlays: `paintOverlay()` draws into `QImage(viewportSize)` at 1x. Not checked on screen.

### Suggested fix

- Engine: send the page's `devicePixelRatio` at start-up; render each window with `QWidget::render` into a
  `QImage` whose `setDevicePixelRatio` is that value (size times DPR), instead of `grab()`; same for the overlay
  image. Leave the screen at 1 so Krita's canvas coordinate maths does not change.
- Page: canvas pixel size from the image, CSS size from the window's logical size (already so). The pointer
  mapping in `WindowView.tsx` (around line 21) scales by `el.width / r.width`; with a 2x image that would send
  device pixels back, so it must use the window's logical `width`/`height` instead.
- Not recommended: `QT_SCALE_FACTOR`. It changes Krita's canvas coordinate maths as well, and the engine does
  not export `ENV`, so the page cannot set it without a rebuild anyway.
- Cost: DPR squared more pixels per window repaint (2.25x at 150%), so dialog repaints get slower.

## Deploying a new build to the live site

`deploy/upload.sh <folder containing krita/> botc-wiki-art --remote` (needs a Cloudflare API token with
Workers R2 Storage: Edit). Engine files are `no-cache` with ETags, so visitors get a new build on their next
load. Nothing in the wiki's repo needs to change for an engine update.
