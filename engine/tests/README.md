# Krita's own unit tests in the browser

Builds Krita's Qt Test executables for WebAssembly and runs each one in headless Chromium.
Nothing under `krita/` is changed; everything is done from outside with a CMake project include.

## Files

| File | What it does |
|---|---|
| `configure.sh` | Configures Krita with `-DBUILD_TESTING=ON` in `$KW/build/krita-tests` (own tree; same arguments as `engine/build-krita.sh`) plus `-DCMAKE_PROJECT_INCLUDE=KritaWebTests.cmake`. Extra arguments are passed to cmake. |
| `KritaWebTests.cmake` | Overrides `add_executable`. Every executable created in a directory called `tests` (not `sdk/tests`) is finished at the end of configuration: adds the display-less Qt platform (`engine/spike/headless_qpa.cpp`, compiled once into `kwtestsupport`), a generated `<test>_kwplugins.cpp` (imports the platform plugin and, for tests that use colour spaces, the LittleCMS engine plugin; sets `QT_QPA_PLATFORM` and `FONTCONFIG_FILE` before `main()`), whole-archive links of the Krita libraries the test depends on, `-fexceptions -sPROXY_TO_PTHREAD -sEXIT_RUNTIME=1`, a 16-thread pool, and preloads the test directory's `data/`, `sdk/tests/data`, ICC profiles, fontconfig and one font at their build-time absolute paths. Output is `bin/<test>.js/.wasm/.data`. |
| `run-tests.mjs` | Node + Playwright runner. Serves the build tree with `engine/serve.mjs`, opens one page per test (a generated page in the same folder as the `.js`), captures console output, stops on runtime exit / abort / QTest's closing line / hard timeout, parses `PASS/FAIL!/SKIP/XFAIL` lines, writes `logs/<test>.log` (head and tail only when over 200 lines) and `results.json`. |

## Reproduce

```sh
source engine/env.sh
engine/tests/configure.sh                      # about 1 minute
ninja -C $KW/build/krita-tests -j2 TestKoColorSpaceRegistry TestKoColor ...   # test target names = source file names
node engine/tests/run-tests.mjs $KW/build/krita-tests out/ --timeout 300 --jobs 2 TestKoColorSpaceRegistry TestKoColor ...
```

The first target compiles the libraries it needs (pigment: about 290 steps; image: about 950). `docs/unit-tests/RESULTS.md` lists the exact targets used.
Never point this at `$KW/build/krita`; it is a separate tree on purpose.

## Choices worth knowing

* Tests are linked with `-O0` at link time. Libraries are compiled `-O3` as usual; the final `wasm-opt` pass only reshapes the binary and took minutes per test.
* A test's `main()` is Krita's `SIMPLE_TEST_MAIN` / `KISTEST_MAIN`, unchanged. `QApplication` is created on the proxied pthread (Qt prints "not created in the main() thread"; harmless here).
* Each test carries `sdk/tests/data` (7 MB) and its own directory's data, so `.data` files are 14 MB (pigment) to 60+ MB (image). They are not shared between tests.
* `KRITA_WEB_TEST_PLUGINS` (cache variable, `target:QtPluginClass` pairs) lists static plugins given to colour-aware tests. Image tests that need filters or brush engines would need more entries (`engine/bridge/plugins.inc` lists the class names).
* `KRITA_WEB_NO_WHOLE_ARCHIVE` lists tests linked without whole-archive.
* Same engine configuration as the main tree: scalar code (no `-msimd128`; Krita has no wasm xsimd backend), Emscripten JS exceptions (`-fexceptions`), Release `-O3`.
