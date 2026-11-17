# G'MIC (Filter > Start G'MIC-Qt) in the WebAssembly engine

Level reached: **a G'MIC filter applies to the Krita document and undoes**, in headless Chromium against my own engine build
(`/opt/kw/build/krita-gmic`). Opening the dialog twice works, no network request is made, five filters from five categories were
applied (one FFTW, one that adds a layer).

## Versions
- G'MIC / G'MIC-Qt 3.7.2.2: clone of `https://github.com/vanyossi/gmic.git` tag `v3.7.2.2` (the source Krita's `ext_gmic` recipe downloads; one repo with `src/` = core and `gmic-qt/` = host, `GMIC_QT_HOST=krita-plugin`).
- FFTW 3.3.10 from `https://salsa.debian.org/science-team/fftw3.git` tag `upstream/3.3.10` (has the generated codelets; the GitHub repo needs OCaml). Double and float libraries, single threaded (`cimg_use_fftw3_singlethread`).
- Not enabled: OpenMP, curl/network, display (`cimg_display=0`), OpenCV, GraphicsMagick, JPEG/TIFF in G'MIC (only PNG and zlib, as gmic-qt's own CMake does), translations.

## What was built, and how it is wired
- `libgmic.a` (core) and FFTW go to their own prefix `$KW/prefix-gmic`, **not** `$PREFIX`: Krita's own `find_package(FFTW3)` would otherwise find FFTW and silently turn on its `HAVE_FFTW3` convolution code (that happened to me once; the autotools install also writes a broken `lib/cmake/fftw3`).
- The host plugin is `kritagmicqt`, a static library built inside Krita's build from the gmic-qt sources (`plugins/extensions/qmic/gmic-qt-web/CMakeLists.txt`, `patches/krita-gmic.patch`); `kritaqmic` (the action plugin) was already in the tree. Both are added to `plugin-targets.txt` and registered with `Q_IMPORT_PLUGIN(QMicFactory)` / `Q_IMPORT_PLUGIN(KritaGmicPluginFactory)`. Krita's plugin trader finds the host through its static metadata (`Krita/GMic`), unchanged.
- Quirks handled in the wrapper CMake: Krita defines `QT_NO_SIGNALS_SLOTS_KEYWORDS` (gmic-qt uses `slots`/`signals`); `plugins/extensions/qmic/gmic.h` is a stand-in header that hid the real `gmic.h` (the wrapper lives in its own directory and reaches only the two interface headers).
- No network: `_GMIC_QT_DISABLE_UPDATES_` plus `patches/dep-gmic-qt.patch` (`Updater::startUpdate` forces `useNetwork=false`, so even the dialog's "Internet" refresh button cannot download). The filter list comes from the standard library embedded in `gmic.cpp` (645 filters). The "Internet" box is unticked.
- Settings/cache land in Emscripten's file system without errors (no message in the console).

## The hard part: compiling gmic.cpp
`gmic.cpp` does not compile for Emscripten with JS exceptions within this machine's memory: clang needed more than 6 GB at `-O0` (killed at 7.4 GB), more at `-O1/-Os/-O2`. Without `-fexceptions` it still needs 3.6 GB at `-O0`. The cause is `gmic::_run`, one function of about 10000 lines (138k lines of IR) whose exception lowering explodes.
Fix (`patches/dep-gmic.patch`, produced by `patch-gmic-cpp.py`, build in `gmic-core.sh`):
1. The body of `_run` moves into a `noinline` lambda; every other function of the file (4236) is passed to `-emscripten-cxx-exceptions-allowed`, so only `_run` and its lambda are compiled without exception catching. Peak memory 4.5 GB, about 4 minutes, **`-O1`** (O2 was not tried again: it exceeded the limit in the first attempt).
2. The five places that catch `gmic_exception` around a recursive `_run` call (`local`/`onfail` blocks, calls of custom commands) go through a small helper `gmic_wasm_catch`, which is compiled with catching, so `onfail` and error propagation keep working.
Semantic cost, not tested beyond the above: the ~35 other `try/catch` inside `_run` never catch (mostly fallbacks for 3D objects, `discard` with a non-numeric list, file-save fallbacks, math-parser error texts), and destructors do not run when an exception leaves `_run` (leaks on error paths). The outer handler of `_run` is kept (it is in the allowed wrapper), so CImg errors still become G'MIC errors.

## Build steps for `engine/build-deps.sh` (new steps; not edited there)
```sh
# FFTW and G'MIC go into their own prefix (see report); GP=$KW/prefix-gmic
s_fftw() { fetch_git fftw https://salsa.debian.org/science-team/fftw3.git upstream/3.3.10
           for p in d f; do local b=$KW/build/fftw-$p; rm -rf $b; mkdir -p $b; ( cd $b
               emconfigure $KW/src/fftw/configure --prefix=$GP --disable-shared --enable-static --disable-fortran --disable-doc \
                   --with-our-malloc16=no $( [ $p = f ] && echo --enable-float ) CFLAGS="$KW_CFLAGS -O2" &&
               emmake make -j2 && emmake make install ) >$KW/build/fftw-$p.log 2>&1 || return 1; done
           rm -rf $GP/lib/cmake $GP/bin; }
s_gmic() { fetch_git gmic https://github.com/vanyossi/gmic.git v3.7.2.2   # applies patches/dep-gmic.patch
           git -C $KW/src/gmic apply "$ROOT/patches/dep-gmic-qt.patch"
           GP=$GP "$ROOT/docs/gmic/gmic-core.sh" -O1; }   # needs ~5 GB free memory for about 4 minutes
```
(`gmic-core.sh` is in this folder; it sources env.sh. `fetch_git` already applies `patches/dep-gmic.patch`; the gmic-qt patch is a second command because both live in one repository.)
Krita side: apply `patches/krita-gmic.patch` after `patches/krita.patch`; `docs/gmic/engine.diff` adds `-DKRITA_WEB_GMIC_DIR=$KW/src/gmic -DKRITA_WEB_GMIC_PREFIX=$KW/prefix-gmic` to `build-krita.sh`, links `libgmic.a libfftw3f.a libfftw3.a` in `bridge/CMakeLists.txt`, appends ` kritaqmic kritagmicqt` to `plugin-targets.txt` (one line, no newline) and the two `Q_IMPORT_PLUGIN` lines to `plugins.inc`. `main.cpp` needs **no** change. `git apply --check` was run for all patches on fresh clones/worktrees.
Note: if the Krita build tree already has FFTW3 cached in `CMakeCache.txt`, remove the `FFTW3*` cache entries.

## Verified (my engine, headless Chromium, page driven through `window.__engine`)
| Check | Result |
|---|---|
| `kritaActions()` | `QMic` and `QMicAgain` exist, enabled |
| `triggerKritaAction('QMic')` | opens a modal Krita window "G'MIC-Qt for Krita - Generic Unix 32 bits - 3.7.2", 1267x712, in about 8 s the first time (`dialog-open.png`: 645 filters in a category tree, preview of the layer, search field, Settings/Fullscreen/Close/Apply/OK) |
| typing in the search field through `kritaWindowInput` | works (`dialog-search.png`); clicking a tree entry selects the filter and shows its parameter panel (`dialog-filter-selected.png`) |
| OK | action returns, document export hash changes (`doc-after-cartoon.png`) |
| Undo (`__engine.undo()`) | export hash identical to before, for all six runs below |
| open the dialog, Close, open again | works (2x, and in every multi-filter run); `Close` makes the action return |
| network | 0 requests leave the page after boot; no hang, no error dialog; windows after opening: only Tool Options and the G'MIC window |

Filter timings, 1000x1000 layer, one run each on a shared 4-core machine, headless Chromium, binaryen -O1 link (see below). "apply" = click OK until the action returns, including G'MIC re-running on the whole layer and Krita importing the result; "preview" = time until the preview picture stopped changing:

| Filter (category) | preview | apply | note |
|---|---|---|---|
| Cartoon (Artistic) | 2.5 s | 7.7 s | |
| Sepia (Colors) | 1.5 s | 0.9 s | |
| Fourier Analysis (Frequencies) | 1.0 s | 0.8 s | **uses FFTW; adds a layer** (2 layers after, undo removes it; `doc-after-fourier-analysis.png`) |
| Ripple (Deformations) | 0.5 s | 0.6 s | |
| Sharpen [Richardson-Lucy] (Details) | 1.5 s | 6.5 s | |
| Add Noise (Degradations) | 0.5 s | 1.3 s | |

## Size and start-up
Both numbers are from my tree, linked with binaryen `-O1` (`-O3` wasm-opt needs ~7.5 GB and was killed on this shared machine every time another wasm-opt ran; the repository build uses `-Oz`):
- `kritaengine.wasm`: 193,239,106 bytes without G'MIC, 203,623,725 with: **+10.4 MB (+5.4 %)** before the final size pass (expect about +5 % after `-Oz` too; not measured). `.data` unchanged (22.2 MB).
- `engine start-up` `engineMs`, three runs each: without 3043 / 3051 / 3730, with 3198 / 3335 / 2626 ms; page load to ready 7.4-8.4 s without, 7.3-9.0 s with. No measurable difference (noise is larger). The G'MIC cost is paid when the dialog opens (about 8 s the first time: building the filter tree).

## Not verified / known gaps
- Compile level only: nothing in the G'MIC dialog beyond the paths above was exercised: parameter widgets (colour pickers, file/folder parameters that would open a native dialog), keypoint/point parameters in the preview, zoom, the Settings dialog, favourites, "Input layers" other than Active, "Apply" button (only OK), `QMicAgain` (headless re-run; enabled but not triggered), Fullscreen.
- Output modes other than in place and input modes NoInput/AllVisible/AllInvisible are disabled by the host (same as desktop Krita).
- Local `catch` blocks inside `_run` are inactive (see above); G'MIC compiled `-O1`, not `-O2`; single-threaded FFTW; no JPEG/TIFF/curl/OpenMP inside G'MIC; no translations; the "Internet" updates cannot work by design.
- Dialog picture: the first opening has the tree on the right and the next ones (after a filter was selected) the tree on the left (G'MIC-Qt remembers its splitter layout in its settings); both render. The first filter chosen in a session shows the parameter panel only after selection. Window title says "Generic Unix 32 bits".
- Side finding, already fixed by main in `engine/bridge/main.cpp` (`setMemorySoftLimitPercent(95)`): without it undo of any whole-layer operation (G'MIC or Krita's own filters) restored only a few tiles, because Krita's tile swapper assumes 1 GiB RAM and swaps undo data to a file that reads back blank. My build already has that line (reproduced with and without it).
- Files here: `gmic-core.sh`, `patch-gmic-cpp.py` (how `dep-gmic.patch` was made), `engine.diff`, `*.png`.
