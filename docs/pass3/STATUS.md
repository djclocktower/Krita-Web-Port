# Third parallel pass: status

## Added

- **Image formats:** JPEG, WebP, GIF and EXR import/export, and 16-bit float colour depth. Libraries built by `engine/build-deps.sh` (libjpeg-turbo, libtiff, libwebp, giflib, Imath, OpenEXR); `engine/check-deps.sh` round-trips an image through each.
- **Brush editor:** Krita-style editors for all 15 brush engines, from Krita's own option definitions (`src/descriptions/brushes.ts`), including brush tip and sensor curve editing.
- **Local persistence:** autosave to the browser, recovery on reopen, Open Recent, and imported resources re-imported on start (`src/storage`).
- **Panels:** timeline playback fixes, error banner instead of `alert()`, Krita's filter forms in layer properties, 40 px touch targets inside panels, `activeNode()` in the contract.
- **Krita's own window, actions and tools (spike):** see below.

## Verified at the end, together

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| Mock engine: phase1, phase2, phase3, phase4-shell, phase4-tools, phase7, small-screens, panels-touch, storage | all pass |
| Real engine: `contract-wasm` | 57 of 58 (the one failure is a limit of the test) |
| Real engine: `contract2-wasm` (now includes JPEG, WebP, GIF, EXR, 16-bit float) | 71 of 71 |
| Real engine: `stall-wasm`, `wasm`, `storage` (REAL=only), `filter-forms`, `brush-forms`, real-engine parts of phase4-tools and phase7 | all pass |

Engine binary: 83.6 MB uncompressed (was 70.7 MB before the new formats and tools).

## Spike: driving Krita's real tool system

Question: can Krita's own main window, view, menu actions and tools run with no display and be driven from the page, so tools do not have to be rebuilt one by one?

**Yes for creating and for actions; partly for tools.**

- Krita's `KisMainWindow`, a `KisView` and its canvas are created headlessly. 479 actions and 27 tools are registered, including transform, move, path and magnetic selection, measure and multibrush.
- Actions triggered by name work and are verified: select all, deselect, mirror all layers, and Krita's own undo and redo.
- Pointer input injected through Qt's window-system interface reaches Krita's input manager. Krita's own freehand brush, fill and rectangle tools painted; its rectangular and elliptical selection tools produced correct selections in an isolated run.
- **Not reliable yet:** in back-to-back automated drags results are inconsistent. Krita batches mouse moves on a timer and finishes tools through queued work, and the bridge has no dependable "finished" signal, only fixed waits. `tests/kritatools-wasm.mjs` records this: 8 action checks pass, tool checks vary between runs.
- **Two sets of state:** the view has its own colours, brush preset and active layer, separate from the ones the existing bridge calls set. They must be unified before the interface can use this path.

What it needed: Krita's application class instead of a plain Qt one, a clipboard in the headless platform layer, the view marked active explicitly (no focus events without a window system), Krita's input profiles in the virtual filesystem, and input injected as genuine window-system events (some tools cancel otherwise).

## Open problems

1. **TIFF export crashes the engine** (a missing-function call inside Krita's TIFF writer). It is refused with a message for now. TIFF import is linked but untested.
2. **Texture "Gradient Map" mode with a pattern crashes the engine** on the first stroke (found by the brush-forms work).
3. **A preset's opacity strength is stored but does not change the stroke**, probably overridden by the toolbar opacity.
4. **Tool driving is not reliable** (above), and its state is separate from the rest of the bridge.
5. **Brush editor gaps:** options with several sensors are read-only; which sensor an option uses cannot be changed; some Krita options have no key in the bundled presets and cannot be set.
6. **Autosave:** a stroke that starts while an export is already running can stutter; only Chromium tested; storage persistence request result not checked.
7. **Not started:** transform tool and vector/text tools in the interface, assistants, symmetry, G'MIC, Python scripting, SIMD, Krita's own unit tests under WebAssembly, libmypaint, HEIF/JPEG XL/RAW/PDF.
8. Carried over: Chromium only; small screens checked only with emulated touch; no comparison with desktop Krita.
