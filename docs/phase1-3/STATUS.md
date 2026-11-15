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

What the real-engine contract test establishes: documents can be created; 134 blend modes, 52 filters and 6 generators are listed; 117 presets load from Krita's default bundle across 15 brush engines; strokes paint and undo/redo restore pixels exactly; layer add, move, duplicate, remove, properties and thumbnails work; paint, group, filter, fill, clone and vector layers and transparency, filter, colorize and selection masks can be added; filters apply and undo; filter preview shows, clears exactly and never reaches an export; a document with strokes, layers, groups and filter layers survives a `.kra` round trip unchanged.

## Open problems

1. **Start-up takes about 40 seconds.** Almost all of it is importing the default resource bundle into the resource database on every load, because the virtual filesystem is in memory. Fix: keep the database in the browser's persistent storage, or ship it prebuilt.
2. **Some presets hang the engine.** At least "Bristles-2 Flat Rough" and "Watercolor Fringe". `tests/presets-wasm.mjs` paints with every preset to find them all; see its results below when recorded.
3. **A document containing a fill layer does not render identically after a `.kra` round trip.** Cause not yet known.
4. **The filter brush engine made no visible change** in the contract test. Not investigated.
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
ln -sfn $KW/build/krita/bin web/public/engine
cd web && npm install && npx vite --port 5173
# http://localhost:5173/            mock engine
# http://localhost:5173/?engine=wasm   Krita's engine (slow first paint, see problem 1)
node tests/contract-wasm.mjs
```
