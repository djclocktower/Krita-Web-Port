# Pass 7: bug fixes after the parity sweep

Engine: 118.8 MB, promoted to `/opt/kw/engine-release` and packaged in `release/krita-web-test.zip`.

## Fixed

| Bug | Cause | Fix |
|---|---|---|
| 381 actions had no label, shortcut or enable condition; `split_alpha_write` / `split_alpha_save_merged` enabled on a paint layer | only 3 of Krita's `.action` files were packaged | all of them are gathered into the engine data (`engine/bridge/CMakeLists.txt`) |
| Krita's file actions opened a Qt file dialog on the engine's internal file system; six of them hung | no real file system in a tab | `KoFileDialog` asks the page (`kritaFileDialog`): open uses the browser's picker, save asks for a name and the written file is sent back as a download (`kritaDownload`). Choosing a folder is refused with a message |
| Configure Krita, Document Information and three more dialogs shrank to 100x30 | the display-less Qt platform reported a hidden window's geometry at once, so a dialog's move-before-show pushed the window's stale size back into it | hidden windows only remember their geometry; it is reported on show (`engine/spike/headless_qpa.cpp`) |
| Add Fill Layer and Convert to Filter Mask froze the engine | a page request waited for the image to go idle while the dialog's live preview kept it busy | under a modal dialog the wait is bounded and the request fails with "Krita is busy with an open dialog" |
| Actions that open a dialog sometimes never returned after the dialog closed (the intermittent hangs of the sweep) | Qt's WebAssembly event dispatcher loses a wake-up issued from inside its own event processing | the page's thread wakes the engine shortly after each request and each dialog close (`wakeSoon`) |
| After a cancelled Add Fill Layer the next action did nothing | the removed layer stayed the active layer | the active layer moves to the top layer when its layer is removed |
| Rectangle, Ellipse, Line drew nothing when a pen press ended with a mouse release | Krita saw two devices | a gesture keeps the device that started it |
| Add Color Overlay Mask crashed | not reproduced on this build | unblocked; it adds the mask |

The three blocked actions are offered again, and Layer > Import/Export (import layer, import as mask, save layer, save vector layer as SVG) is back in the menus.

## Not bugs

- The sweep's "51 menu entries" compared Krita's menus with the page's own commands, not with the generated Krita menus. On the real engine the menus show 196 Krita entries, 56 of them in Filter.
- Transform handles missing when the tool is picked right after start-up: not reproduced.

## Verified on this engine

`kritawindows-wasm` (with new checks for every fix above), `kritatools-wasm`, `formats-wasm`, `contract2-wasm`, `wasm`: all pass.
`contract-wasm`: the one known test-limit failure. `import-wasm`: 147 pass, 12 known, 0 unexpected (one run had a single failure that did not repeat).
Interface suites: `phase1`-`phase4-shell`, `phase7`, `small-screens`, `panels-touch`, `settings`, `storage`, `panels2`, `krita-look`, `krita-ui`, `krita-menus`, `mobile`, `filter-forms` (real engine): all pass.
The page's file dialog was driven in a browser: picking a file adds a layer; Save As downloads the file.

## Still open

- Add File Layer, Convert to File Layer and Save Groups as Images stay out of the menus (they need a file that stays on disk, or a folder).
- A layer move could in principle be seen half-way (removed, not yet re-added) by the new active-layer check; not observed.
- The wake-up after requests uses fixed delays (20 ms and 250 ms); the proper fix is in Qt's dispatcher.
- Not rechecked: the 136 "no visible effect" and 47 disabled actions of the sweep; real devices, Firefox, Safari, a real Cloudflare account.
