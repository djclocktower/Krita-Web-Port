# WebAssembly SIMD for Krita's xsimd layer

Date 2026-11-16. Krita 6.0.4.1 + `patches/krita.patch`, Emscripten 3.1.56, Qt 6.8.3 wasm_multithread, xsimd 13.2.0 (the one in `/opt/kw/prefix`; no upgrade needed, no separate prefix created).
Delivered as `patches/krita-simd.patch` (applies on top of `patches/krita.patch`; verified with `git apply --check` of both in a fresh worktree `/opt/kw/krita-simd-verify`, resulting files identical to my working tree `/opt/kw/krita-simd`).

## What changed (7 files, ~60 lines)

| File | Change |
|---|---|
| `CMakeLists.txt` | New option `KRITA_WASM_SIMD` (Emscripten only, default **ON**). When ON it appends `-msimd128` to `CMAKE_C_FLAGS`/`CMAKE_CXX_FLAGS`. `ko_compile_for_all_implementations(_no_scalar)` gets a `wasm` branch that compiles the per-arch sources once more with `XSIMD_IMPL=WASM`. |
| `cmake/modules/xsimd/xsimdMacros.cmake` | `XSIMD_ARCH` is `wasm` for Emscripten when the option is ON (previous patch forced an empty list = scalar only); with the option OFF the list stays empty, i.e. scalar only as before. New `WASM` implementation in `xsimd_compile_for_all_implementations`. |
| `libs/multiarch/xsimd_extensions/config/xsimd_arch.hpp` | `WASM` implementation id; `XSIMD_IMPL==WASM` selects `xsimd::wasm` as `current_arch`; `XSIMD_UNIVERSAL_BUILD_PASS` is non-zero for it. |
| `libs/multiarch/KoMultiArchBuildSupport.h` | `createOptimizedClass` returns the `xsimd::wasm` implementation when `__wasm_simd128__` is defined (no runtime dispatch, WebAssembly has no CPUID). The existing runtime switch `amdDisableVectorWorkaround` still forces the generic (scalar) implementation. |
| `libs/pigment/compositeops/KoStreamedMath.h` | `OptiRound::roundScalar` on wasm uses `rintf` (`f32.nearest`, round-half-even, like the `cvtss2si` path), instead of `lroundf` (half away from zero). |
| `libs/pigment/benchmarks/KoCompositeOpsBenchmark.*` | Added `benchmarkCompositeOverF32` (RGBA F32 `over`, 1024x1024, 64x64 tiles, opacity 0.5, no mask). |

Why no new Krita-side xsimd extension header was needed: `xsimd::wasm` derives from `xsimd::generic`; Krita's own helpers (`xsimd_generic.hpp`, interleavers via `requires_arch<generic>`) dispatch to it as they do for NEON. Everything Krita instantiates for pigment and image compiled against xsimd 13.2's wasm kernels without errors or Krita-side kernels.

Gotcha found: in xsimd 13.2 `XSIMD_WITH_WASM` is 1 for **any** Emscripten build, with or without `-msimd128` (`xsimd_config.hpp`: `#ifdef __EMSCRIPTEN__`). So the wasm branches test `__wasm_simd128__`, not `XSIMD_WITH_WASM`.

## Build flags for `engine/build-krita.sh` (not edited by me)

Nothing needs to go into `FLAGS`: configure with `-DKRITA_WASM_SIMD=ON` (the default once the patch is applied) and CMake adds `-msimd128` itself. `-DKRITA_WASM_SIMD=OFF` gives the old scalar-only build. Remove the "ponytail: scalar only" comment. Do not use `-msse*` (not used; native wasm backend only). `engine/env.sh` already has `KW_CFLAGS=-pthread -msimd128` for the deps, unchanged. Existing trees need a reconfigure and a full rebuild of pigment/image and everything that links them (flag changes every object).

## Correctness (Krita's own tests, headless Chromium, harness `engine/tests/run-tests.mjs`, unmodified)

Two trees from the same source copy, same configure line except `KRITA_WASM_SIMD`: `/opt/kw/build/krita-simd-scalar` (OFF) and `/opt/kw/build/krita-simd` (ON). The harness include was copied to `/opt/kw/krita-simd-work/KritaWebTests.cmake` (spike dir made absolute; also picks up `benchmarks` dirs). Both trees were configured with libheif disabled (the prefix now contains a libheif whose AOM dependency is not found) and, as in the earlier test tree, needed configure re-runs to write the generated `*_kwplugins.cpp` files.

QTest rows pass/fail (scalar tree vs SIMD tree):

| Test | Scalar | SIMD |
|---|---|---|
| **KoRgbU8ColorSpaceTester** | 6 / **4 fail** (`testCompositeCopyDivisionByZero`, as predicted) | **7 / 0** |
| TestKoColorSpaceAbstract / Registry / Sanity / Maths, TestKoColor, TestKoColorSet, TestKoIntegerMaths, TestKoChannelInfo, TestKisSwatchGroup, TestKoStopGradient, TestColorConversion, TestConvolutionOpImpl, TestFallBackColorTransformation | all pass | all pass (same row counts) |
| kis_auto_brush_test (7), kis_mask_similarity_test (8), kis_mask_generator_test (10), kis_fixed_paint_device_test (20), kis_painter_test (18), kis_gbr_brush_test (10), kis_png_brush_test (7), kis_cs_conversion_test (3), kis_paint_device_test (51) | all pass | all pass |
| TestCompositeOpInversion | 507 pass, 0 fail, did not finish in 1800 s (earlier report) | 507 pass, 0 fail, **did not finish in 1800 s either** |

Totals SIMD: 23 executables, 255 rows pass, 0 fail (TestCompositeOpInversion excluded, it times out in both). "Tests pass" is therefore shown for these tests only; there is no `TestKoCompositeOps` in this version. Not run: the rest of `libs/image` tests, plugin/paintop tests, anything needing a canvas.

## Speed (headless Chromium via the same harness, wasm linked with `-O0` i.e. no wasm-opt; libraries `-O3`)

Machine was shared and loaded (load average 5.5 to 7.4 on 4 cores), so absolute numbers are noisy; numbers below are Qt `QBENCHMARK` "msecs per iteration" with `-iterations 40` (composite) / `20` (mask), scalar and SIMD runs alternated, 3 runs (composite) / 1 or 2 runs (mask). Only the scalar and SIMD trees differ. Raw logs in `/opt/kw/krita-simd-work/{c,m,m2}-*/`.

`KoCompositeOpsBenchmark` (RGBA8 2048x2048 in 64x64 tiles with mask, opacity 0.5, ops from `KoOptimizedCompositeOpFactory`; F32 case 1024x1024, no mask):

| Benchmark | Scalar, ms (3 runs) | SIMD, ms (3 runs) | Ratio (median) |
|---|---|---|---|
| over RGBA8 | 25.9 / 29.2 / 26.9 | 15.9 / 18.0 / 18.2 | ~1.5x |
| alpha darken (hard) RGBA8 | 30.9 / 32.3 / 33.4 | 17.0 / 22.0 / 24.4 | ~1.5x |
| alpha darken (creamy) RGBA8 | 33.7 / 32.6 / 33.3 | 23.7 / 24.8 / 21.6 | ~1.4x |
| over RGBA F32 | 6.8 / 5.6 / 6.8 | 4.3 / 5.2 / 6.0 | ~1.2x (noisy, ranges overlap) |

`KisMaskGeneratorBenchmark` (brush masks; the "Vector" variants use `createOptimizedClass`, so they are scalar code in the scalar tree and wasm SIMD in the SIMD tree; the in-binary "Scalar" variants stay scalar in both), `-iterations 20`:

| Mask (Vector variant) | Scalar tree, ms | SIMD tree, ms | Speed-up |
|---|---|---|---|
| default circle | 18.3 | 2.1 | 8.7x |
| circular gauss | 36.6 | 9.9 | 3.7x |
| circular soft | 17.7 | 5.3 | 3.4x |
| rectangular | 17.2 | 2.7 | 6.4x |
| rectangular gauss | 85.2 | 23.1 | 3.7x |
| rectangular soft | 28.6 | 14.2 | 2.0x |

So: brush masks measured clearly faster (2x to 9x); RGBA8 composite ops measured ~1.4-1.5x faster; F32 over is only slightly, not reliably, faster on this loaded machine. The whole-application effect was not measured.

## Browser support

WebAssembly fixed-width SIMD (128-bit, `-msimd128`): Chrome/Edge 91+, Firefox 89+, Safari 16.4+. The module has no runtime fallback: a browser without SIMD cannot instantiate it at all (one `.wasm`; `WebAssembly.validate` feature check would be needed to serve a scalar build instead, e.g. build twice with `KRITA_WASM_SIMD=ON/OFF` and pick at load). Relaxed SIMD is not used. Version numbers are from memory of the feature tables, not tested here (only Chromium via Playwright was run).

## Known gaps

* Not vectorised on wasm (fall to generic scalar code): `KoOptimizedPixelDataScalerU8ToU16.h` (only SSE/AVX/NEON branches), `KoRgbaInterleavers` has no wasm-specific zip kernels (uses the generic ones, correct but not tuned), `OptiDiv::divScalar` uses a real division (SSE uses approximate `rcp`).
* `TestCompositeOpInversion` still does not finish in 30 minutes; run time is not dominated by this change.
* Only the tests listed were run, in headless Chromium only; no differential comparison of pixel results scalar vs SIMD beyond Krita's own tests (which do compare vector vs scalar in `KoRgbU8ColorSpaceTester`).
* The F32 composite benchmark I added measures a single op; other ops/mask combos not timed.
* Test executables are linked `-O0`; a release engine link with wasm-opt may shift the ratios.
