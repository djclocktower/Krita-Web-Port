# Phases 1–3: status after the first parallel pass

This pass produced a working vertical slice, not finished phases: a web interface that paints with Krita's real engine, with presets, layers and filters wired through. `first-stroke-real-engine.png` is the interface running on the real engine.

## How it fits together

- `web/src/engine/protocol.ts` is the only contract between interface and engine.
- `web/src/engine/mock.ts` implements it in the browser for interface work and tests.
- `engine/bridge/` implements it on Krita's core (C++ → `kritaengine.wasm`); `web/src/engine/wasm.ts` loads it. Open the app with `?engine=wasm` to use it.
- Panels live in `web/src/panels/<name>/` and register themselves.

## Verified

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `tests/phase1.mjs` (shell, canvas, input, colour; mock engine) | all pass |
| `tests/phase2.mjs` (presets, brush editor, curve editor; mock engine) | 14 of 14 |
| `tests/phase3.mjs` (layers, filters; mock engine) | all pass |
| `tests/contract-wasm.mjs` (the contract against the **real** engine) | 56 of 58 |
| `tests/wasm.mjs` (interface + real engine: app starts, a mouse stroke paints) | pass |
| `tests/presets-wasm.mjs` (every bundled preset on the real engine) | 99 of 117 paint, 0 hang; 18 not judgeable on a blank canvas |

What the real-engine contract test establishes: documents can be created; 134 blend modes, over 50 filters and 6 generators are listed; 117 presets load from Krita's default bundle across 15 brush engines; strokes paint and undo/redo restore pixels exactly; layer add, move, duplicate, remove, properties and thumbnails work; paint, group, filter, fill, clone and vector layers and transparency, filter, colorize and selection masks can be added; filters apply and undo; filter preview shows, clears exactly and never reaches an export; a document with strokes, layers, groups and filter layers survives a `.kra` round trip unchanged.

## Open problems

1. **Start-up: fixed, from about 44 s to under 3 s** (headless Chromium, local server). Measured: 42.5 of the 44 s were Krita importing the default resource bundle into its database on every load. `engine/make-resource-cache.mjs` now builds that database once at build time (11.8 MB) and the page puts it in place before the engine starts. If the cache is missing the engine still works and builds the database itself, slowly. Rerun the script after rebuilding the engine. Resources a user imports are still lost on reload: nothing is persisted in the browser yet.
2. **Painting with some presets through the interface stalls the page.** Seen with "Bristles-2 Flat Rough" and "Watercolor Fringe" when painting with real pointer events on the canvas. The engine is not the cause: driven directly it paints a 1,200 px stroke with that preset in about 0.4 s, and it handles duplicate points, tiny steps, repeated timestamps and zero pressure. Flow control for image updates did not cure it. The cause is somewhere in the interface path and is not found yet.
3. **A document containing a fill layer sometimes does not render identically after a `.kra` round trip.** It fails in some runs and passes in others, which points at timing (fill layers render asynchronously) rather than at saving, but that is not confirmed.
4. **The preset survey cannot judge 18 presets.** `tests/presets-wasm.mjs` painted with all 117 bundled presets on the real engine: none hung or crashed and 99 visibly changed a blank white canvas. The other 18 are blenders, dodge/lighten adjusters, clone, distort and blur/sharpen brushes, which have nothing to act on there (this also explains the "filter brush" failure in the contract test). They need a test on a canvas with content.
5. **Transform masks and file layers are refused.** Transform masks need the transform tool's plugin (Phase 4).
6. **Forms for filter and brush settings are generic.** They are generated from each setting's stored type, so labels are raw keys and numbers have no ranges. Krita's hand-built option panels are not reproduced yet.
7. **No stabiliser or smoothing.** Strokes are straight segments between pointer samples.
8. **Some layer property changes are not undoable** (name, visibility, lock, alpha lock, filter layer settings).
9. **Still scalar**: no WebAssembly SIMD in Krita's blending code.

## Not tested

- Pen pressure/tilt and touch on real hardware; only a mouse in headless Chromium.
- Firefox and Safari.
- The interface test suites against the real engine (they run against the mock; only `wasm.mjs` and the contract test use the real one).
- Krita's own unit tests under WebAssembly (carried over from Phase 0).
- Comparison with desktop Krita output.

## Running it

```sh
engine/build-krita.sh kritaengine
node engine/make-resource-cache.mjs $KW/build/krita/bin     # once per engine build; makes start-up fast
ln -sfn $KW/build/krita/bin web/public/engine
cd web && npm install && npx vite --port 5173
# http://localhost:5173/            mock engine
# http://localhost:5173/?engine=wasm   Krita's engine (slow first paint, see problem 1)
node tests/contract-wasm.mjs
```
