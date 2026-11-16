# Krita's own unit tests, run in the browser

Date: 2026-11-16. Engine: Krita v6.0.4.1 (patched tree, `patches/krita.patch`), Qt 6.8.3 wasm_multithread, Emscripten 3.1.56, headless Chromium (Playwright), 4-core shared VM.
Reproduction: `engine/tests/README.md`. Raw logs: `logs/` (trimmed to head and tail beyond 200 lines). Per-test machine-readable data: `results.json`
(the timed-out `TestCompositeOpInversion` was re-run alone with a 1800 s limit: `results-TestCompositeOpInversion-30min.json`, and its table row and log are from that run).

## Does this match the main-tree engine?

Yes, as far as configuration goes: the tree `/opt/kw/build/krita-tests` was configured by `engine/tests/configure.sh` with the same CMake arguments as `engine/build-krita.sh`
(Release, `-O3`, `-pthread -fexceptions`, i.e. Emscripten JS exceptions) plus `BUILD_TESTING=ON`. There is **no SIMD**: no `-msimd128`, and Krita's xsimd layer has no wasm backend, so every composite op,
alpha applicator and brush mask runs Krita's scalar fallback, the same as the main tree. The only difference: test executables are linked with `-O0` (no final `wasm-opt` pass; libraries are still compiled `-O3`).

## Summary

| | Listed | Built | Ran (QTest reached its end) | Functions pass / fail | QTest rows pass / fail |
|---|---|---|---|---|---|
| Total (4 directories) | 118 | 114 | 113 (+1 started, not finished) | 955 / 5 | 1638 / 8 |

* "Functions" counts each test function once (a function with data rows is a failure if any row fails). "Rows" are the `PASS`/`FAIL!` lines QTest prints, data rows counted separately. Nothing was skipped (`SKIP`) by QTest.
* Totals are from what the runner saw QTest print. A test that timed out is counted only for the `PASS` lines it printed.
* 4 executables could not be built (duplicate symbols, below). 1 (`TestCompositeOpInversion`) did not finish in 30 minutes (507 rows passed, 0 failed).
* 8 executables printed QTest's closing line but Emscripten's runtime did not exit (an async operation, probably a Qt timer or thread, kept it alive: "keepRuntimeAlive() is set"), so no exit code was captured; the result is taken from QTest's own output. They are marked "completed (runtime did not exit)".
* None of the tests listed is registered as `krita_add_broken_unit_test` upstream (that list, from the CMake cache, contains e.g. `kis_perspective_transform_worker_test`, which was not selected), so category (c) does not apply.
* Wall time: all 114 runnable executables in one run, 2 pages in parallel, took 605 s (including one 300 s timeout). Typical test: 1.5-4 s. Slow ones: `kis_transform_worker_test` 98 s, `KisSignalCompressorTest` 99 s (timer-based), `kis_cage_transform_worker_test` 122 s, `kis_fill_painter_test` 50 s, `kis_tiled_data_manager_test` 47 s.
  Build: first target (pigment) about 290 steps; image libraries + plugins about 2,000 steps; roughly 1.5 h of `ninja -j2` on a loaded machine, plus about 20 s to link each test.

## Failures and classification

| Test function | QTest message | Classification |
|---|---|---|
| `KoRgbU8ColorSpaceTester::testCompositeCopyDivisionByZero` (the same check fails for 4 pixel cases) | `Failed to compose pixels` at `KoRgbU8ColorSpaceTester.cpp:365`. Case 1: src `128 128 128 129`, dst `12 12 12 0`, opacity 128, op `copy`: expected dst `128 128 128 65`, got `129 129 129 65`. Other cases: src alpha 0, dst `12 12 12 0`; the logged "expD/dst1" lines are in `logs/KoRgbU8ColorSpaceTester.log`. | **(a), but a scalar-vs-vector difference, not a WebAssembly miscompile.** `KoCompositeOpCopy2` integer path: `srcMult = mul(128,129) = 65`, `blended = lerp(0,65,128) = 33`, `33*255/65 = 129.46 -> 129`. The test expects the vectorised (float) result 128, and its own comment says it exists "to catch irregularities between vector and scalar versions". It only tolerates the difference when `XSIMD_NO_SUPPORTED_ARCHITECTURE` is defined in the test's translation unit; it is not defined there (xsimd is not even included), so any scalar-only Krita build fails it the same way. Not confirmed on a native scalar build (none available here). Expected to pass once a wasm SIMD backend exists. |
| `KisTransformMaskTest::testSafeTransform` | `Compared values are not the same`: `fwdRect.toRect()` actual `QRect(10,403 274x211)`, expected `274x210` (`kis_transform_mask_test.cpp:70`) | **(d) unknown**, probably floating-point rounding at a .5 boundary. The rounded polygon points that the test checks just before (`fwdPoly.toPolygon()`) matched the reference, so the geometry is right to within a pixel; only the rounding of the rect edge (612.5-ish) differs. Candidates: different last-bit results of `tan`/`atan2`/`sin` in Emscripten's musl libm vs glibc, or compiler contraction. Not proven; needs the unrounded `QRectF` printed from a native build. |
| `KisTransformMaskTest::testSafeTransformSingleVanishingPoint` | `fwdRect.toRect()` actual `QRect(629,648 971x199)`, expected `972x199` (line 182) | Same as above: **(d)**, same suspected cause. |
| `KisCageTransformWorkerTest::testCageClockwiseUnity` | `TestUtil::checkQImage(result, "cage_transform_test", "cage", testName, 1, 1) returned FALSE`; log: one pixel differs, `Different at QPoint(299,151) source 0 0 0 0 dest 255 255 255 255 ... ( 1 of 0 allowed )` | **(d) unknown**, probably floating-point rounding at the cage edge (x = 299 is the last column of the 300 px image; the identity ("unity") cage places that pixel exactly on the boundary of the inside test). One transparent pixel where the reference is opaque. Not proven. |
| `KisCageTransformWorkerTest::testCageCounterclockwiseUnity` | same, `Different at QPoint(299,152)` | Same as above: **(d)**. |

No failure is attributable to environment (missing files, fonts, plugins, display) that we could see; all other tests loaded their data. The two transform failures are the only candidates for a real wasm-versus-desktop floating-point difference and should be checked first on a native build (see next steps).

## Not built

All four fail to link with `duplicate symbol`: the test and the whole-archive-free link of the library both define a function that Krita's headers define **without `inline`** (on desktop the libraries are shared, so it never clashes). Not fixed because that needs a Krita source change. Minimal patch: add `inline` to the definitions.

| Executable | Duplicate symbols | Where (not edited) |
|---|---|---|
| `TestColorConversionSystem` | `operator<<(QDebug, KoColorConversionSystem::Node const&)`, `...NodeKey const&`, `qHash(NodeKey const&)` | `libs/pigment/KoColorConversionSystem_p.h` lines 114, 180 and the `qHash` definition |
| `kis_filter_weights_applicator_test` | `operator<<(QDebug, KisFixedPoint const&)`, `tmp::createIterator<KisHLineIteratorSP/KisVLineIteratorSP>` | `libs/image/kis_fixed_point_maths.h:129`, `libs/image/kis_filter_weights_applicator.h:22,28` (explicit specialisations need `inline`) |
| `kis_lazy_brush_test` | `operator<<(QDebug, KisLazyFillGraph::VertexDescriptor const&)` and the `pair<...>` overload | `libs/image/lazybrush/kis_lazy_fill_graph.h:999,1009` |
| `kis_mesh_transform_worker_test` | `KisBezierUtils::operator<<(QDebug, Range const&)` | `libs/global/KisBezierPatchParamSpaceUtils.h:96` |

`kis_fixed_point_maths_test`, `kis_filter_weights_buffer_test` needed the same workaround ("link without whole-archive", `KRITA_WEB_NO_WHOLE_ARCHIVE`) but then linked and passed.

## Did not finish

`TestCompositeOpInversion` (pigment): iterates every composite op over many colour pairs in F32; scalar code in WebAssembly was still running after 300 s and after 1800 s. 507 `PASS` rows (functions `test`, `testPreservesStrictNegative`, `testSrcCannotMakeNegative`, `testPreservesLooseSdrRange`, `testF32ModesNaN` ...), 0 `FAIL!`. Its total runtime is unknown (no desktop timing available); do not count it as passed.

## Not attempted

`libs/image` tests beyond the 87 selected (roughly 40 more, including filter/mask tests with large reference images), `libs/flake`, `libs/ui`, `libs/resources`, plugin tests (`plugins/filters/tests`, paintop tests, impex). Tests that need a real display or a canvas (`libs/ui`) are out of scope for the headless platform.

## Results by directory

### libs/pigment/tests

| Executable | Built | Ran | Status | Exit | Functions pass / fail / skip | QTest rows pass / fail / skip | Wall (s) |
|---|---|---|---|---|---|---|---|
| KoRgbU8ColorSpaceTester | yes | yes | completed | 1 | 6 / 1 / 0 | 6 / 4 / 0 | 2.2 |
| TestColorConversion | yes | yes | completed | 0 | 4 / 0 / 0 | 4 / 0 / 0 | 1.5 |
| TestColorConversionSystem | no | no | not built | - | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 |
| TestCompositeOpInversion | yes | yes | timeout (1800s) | - | 10 / 0 / 0 | 507 / 0 / 0 | 1800.0 |
| TestConvolutionOpImpl | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 2.0 |
| TestFallBackColorTransformation | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.9 |
| TestKisSwatchGroup | yes | yes | completed | 0 | 11 / 0 / 0 | 11 / 0 / 0 | 1.7 |
| TestKoChannelInfo | yes | yes | completed | 0 | 4 / 0 / 0 | 4 / 0 / 0 | 2.0 |
| TestKoColor | yes | yes | completed | 0 | 9 / 0 / 0 | 9 / 0 / 0 | 2.8 |
| TestKoColorSet | yes | yes | completed | 0 | 31 / 0 / 0 | 32 / 0 / 0 | 2.8 |
| TestKoColorSpaceAbstract | yes | yes | completed | 0 | 7 / 0 / 0 | 24 / 0 / 0 | 2.0 |
| TestKoColorSpaceMaths | yes | yes | completed | 0 | 4 / 0 / 0 | 4 / 0 / 0 | 1.5 |
| TestKoColorSpaceRegistry | yes | yes | completed | 0 | 6 / 0 / 0 | 6 / 0 / 0 | 2.2 |
| TestKoColorSpaceSanity | yes | yes | completed | 0 | 4 / 0 / 0 | 4 / 0 / 0 | 2.4 |
| TestKoIntegerMaths | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 1.5 |
| TestKoStopGradient | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.2 |

### libs/global/tests

| Executable | Built | Ran | Status | Exit | Functions pass / fail / skip | QTest rows pass / fail / skip | Wall (s) |
|---|---|---|---|---|---|---|---|
| KisAdaptedLockTest | yes | yes | completed | 0 | 9 / 0 / 0 | 9 / 0 / 0 | 1.2 |
| KisForestTest | yes | yes | completed | 0 | 29 / 0 / 0 | 29 / 0 / 0 | 1.2 |
| KisGlobalTest | yes | yes | completed | 0 | 3 / 0 / 0 | 19 / 0 / 0 | 1.2 |
| KisHistoryListTest | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 1.2 |
| KisLazyStorageTest | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.2 |
| KisMplTest | yes | yes | completed | 0 | 15 / 0 / 0 | 15 / 0 / 0 | 1.2 |
| KisRectsGridTest | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.2 |
| KisSignalAutoConnectionTest | yes | yes | completed | 0 | 7 / 0 / 0 | 7 / 0 / 0 | 1.2 |
| KisSignalCompressorTest | yes | yes | completed (runtime did not exit) | - | 7 / 0 / 0 | 10 / 0 / 0 | 99.0 |
| KisValueCacheTest | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.2 |

### libs/image/tests

| Executable | Built | Ran | Status | Exit | Functions pass / fail / skip | QTest rows pass / fail / skip | Wall (s) |
|---|---|---|---|---|---|---|---|
| kis_adjustment_layer_test | yes | yes | completed | 0 | 6 / 0 / 0 | 6 / 0 / 0 | 2.3 |
| kis_algebra_2d_test | yes | yes | completed | 0 | 34 / 0 / 0 | 76 / 0 / 0 | 2.6 |
| kis_annotation_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.8 |
| kis_base_node_test | yes | yes | completed | 0 | 6 / 0 / 0 | 6 / 0 / 0 | 2.0 |
| kis_boundary_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.5 |
| kis_bsplines_test | yes | yes | completed | 0 | 7 / 0 / 0 | 7 / 0 / 0 | 2.1 |
| kis_cage_transform_worker_test | yes | yes | completed (runtime did not exit) | - | 11 / 2 / 0 | 11 / 2 / 0 | 121.6 |
| kis_clone_layer_test | yes | yes | completed (runtime did not exit) | - | 15 / 0 / 0 | 25 / 0 / 0 | 9.2 |
| kis_convolution_painter_test | yes | yes | completed | 0 | 20 / 0 / 0 | 20 / 0 / 0 | 35.9 |
| kis_count_visitor_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.9 |
| kis_crop_processing_visitor_test | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 3.1 |
| kis_cs_conversion_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 6.0 |
| kis_cubic_curve_test | yes | yes | completed | 0 | 10 / 0 / 0 | 10 / 0 / 0 | 2.3 |
| kis_cubic_spline_test | yes | yes | completed | 0 | 6 / 0 / 0 | 6 / 0 / 0 | 1.9 |
| kis_datamanager_test | yes | yes | completed | 0 | 4 / 0 / 0 | 4 / 0 / 0 | 1.9 |
| kis_effect_mask_test | yes | yes | completed | 0 | 6 / 0 / 0 | 6 / 0 / 0 | 2.1 |
| kis_fast_math_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.8 |
| kis_fill_interval_map_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.0 |
| kis_fill_interval_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.1 |
| kis_fill_painter_test | yes | yes | completed | 0 | 10 / 0 / 0 | 10 / 0 / 0 | 49.0 |
| kis_filter_config_widget_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.9 |
| kis_filter_configuration_test | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 1.7 |
| kis_filter_processing_information_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.3 |
| kis_filter_registry_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.7 |
| kis_filter_strategy_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.9 |
| kis_filter_test | yes | yes | completed | 0 | 8 / 0 / 0 | 8 / 0 / 0 | 3.1 |
| kis_filter_weights_applicator_test | no | no | not built | - | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 |
| kis_filter_weights_buffer_test | yes | yes | completed | 0 | 10 / 0 / 0 | 10 / 0 / 0 | 1.9 |
| kis_fixed_paint_device_test | yes | yes | completed | 0 | 13 / 0 / 0 | 20 / 0 / 0 | 2.5 |
| kis_fixed_point_maths_test | yes | yes | completed | 0 | 6 / 0 / 0 | 6 / 0 / 0 | 1.7 |
| kis_gradient_painter_test | yes | yes | completed | 0 | 10 / 0 / 0 | 10 / 0 / 0 | 2.4 |
| kis_group_layer_test | yes | yes | completed | 0 | 4 / 0 / 0 | 4 / 0 / 0 | 3.2 |
| kis_image_commands_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.7 |
| kis_image_signal_router_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.2 |
| kis_image_test | yes | yes | completed (runtime did not exit) | - | 27 / 0 / 0 | 98 / 0 / 0 | 27.8 |
| kis_iterator_test | yes | yes | completed | 0 | 9 / 0 / 0 | 9 / 0 / 0 | 4.4 |
| kis_iterators_ng_test | yes | yes | completed | 0 | 11 / 0 / 0 | 11 / 0 / 0 | 6.0 |
| kis_layer_style_projection_plane_test | yes | yes | completed | 0 | 15 / 0 / 0 | 15 / 0 / 0 | 18.4 |
| kis_layer_test | yes | yes | completed | 0 | 8 / 0 / 0 | 8 / 0 / 0 | 5.8 |
| kis_lazy_brush_test | no | no | not built | - | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 |
| kis_liquify_transform_worker_test | yes | yes | completed (runtime did not exit) | - | 6 / 0 / 0 | 15 / 0 / 0 | 24.6 |
| kis_lod_capable_layer_offset_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.0 |
| kis_marker_painter_test | yes | yes | completed | 0 | 6 / 0 / 0 | 6 / 0 / 0 | 2.4 |
| kis_mask_generator_test | yes | yes | completed | 0 | 10 / 0 / 0 | 10 / 0 / 0 | 1.7 |
| kis_mask_similarity_test | yes | yes | completed | 0 | 8 / 0 / 0 | 8 / 0 / 0 | 2.5 |
| kis_mask_test | yes | yes | completed | 0 | 7 / 0 / 0 | 7 / 0 / 0 | 2.0 |
| kis_math_toolbox_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.0 |
| kis_mesh_transform_worker_test | no | no | not built | - | 0 / 0 / 0 | 0 / 0 / 0 | 0.0 |
| kis_name_server_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.8 |
| kis_node_commands_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.3 |
| kis_node_facade_test | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 2.2 |
| kis_node_graph_listener_test | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 2.1 |
| kis_node_query_path_test | yes | yes | completed | 0 | 24 / 0 / 0 | 24 / 0 / 0 | 2.3 |
| kis_node_test | yes | yes | completed | 0 | 8 / 0 / 0 | 8 / 0 / 0 | 15.7 |
| kis_node_visitor_test | yes | yes | completed | 0 | 4 / 0 / 0 | 4 / 0 / 0 | 2.2 |
| kis_paint_device_test | yes | yes | completed | 0 | 50 / 0 / 0 | 51 / 0 / 0 | 25.2 |
| kis_paint_information_test | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 2.0 |
| kis_paint_layer_test | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 3.0 |
| kis_painter_test | yes | yes | completed | 0 | 18 / 0 / 0 | 18 / 0 / 0 | 7.7 |
| kis_paintop_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.0 |
| kis_pattern_test | yes | yes | completed | 0 | 4 / 0 / 0 | 4 / 0 / 0 | 2.0 |
| kis_pixel_selection_test | yes | yes | completed | 0 | 20 / 0 / 0 | 20 / 0 / 0 | 4.1 |
| kis_processing_applicator_test | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 4.0 |
| kis_projection_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 8.8 |
| kis_properties_configuration_test | yes | yes | completed | 0 | 9 / 0 / 0 | 9 / 0 / 0 | 2.1 |
| kis_psd_layer_style_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.2 |
| kis_scanline_fill_test | yes | yes | completed | 0 | 10 / 0 / 0 | 10 / 0 / 0 | 2.7 |
| kis_selection_mask_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.1 |
| kis_selection_test | yes | yes | completed | 0 | 13 / 0 / 0 | 13 / 0 / 0 | 3.2 |
| kis_shared_ptr_test | yes | yes | completed | 0 | 15 / 0 / 0 | 15 / 0 / 0 | 2.0 |
| kis_simple_stroke_strategy_test | yes | yes | completed | 0 | 4 / 0 / 0 | 4 / 0 / 0 | 2.8 |
| kis_simple_update_queue_test | yes | yes | completed | 0 | 8 / 0 / 0 | 8 / 0 / 0 | 2.4 |
| kis_stroke_strategy_undo_command_based_test | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 24.1 |
| kis_stroke_test | yes | yes | completed | 0 | 8 / 0 / 0 | 8 / 0 / 0 | 1.8 |
| kis_strokes_queue_test | yes | yes | completed | 0 | 21 / 0 / 0 | 21 / 0 / 0 | 2.2 |
| kis_tile_data_pooler_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.4 |
| kis_tile_data_store_test | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 1.8 |
| kis_tiled_data_manager_test | yes | yes | completed | 0 | 21 / 0 / 0 | 21 / 0 / 0 | 48.7 |
| kis_transaction_test | yes | yes | completed | 0 | 9 / 0 / 0 | 9 / 0 / 0 | 2.7 |
| kis_transform_mask_test | yes | yes | completed (runtime did not exit) | - | 9 / 2 / 0 | 9 / 2 / 0 | 7.2 |
| kis_transform_worker_test | yes | yes | completed (runtime did not exit) | - | 35 / 0 / 0 | 40 / 0 / 0 | 97.5 |
| kis_transparency_mask_test | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 2.3 |
| kis_types_test | yes | yes | completed | 0 | 2 / 0 / 0 | 2 / 0 / 0 | 2.1 |
| kis_updater_context_test | yes | yes | completed | 0 | 5 / 0 / 0 | 5 / 0 / 0 | 2.6 |
| kis_vec_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 1.9 |
| kis_warp_transform_worker_test | yes | yes | completed (runtime did not exit) | - | 7 / 0 / 0 | 7 / 0 / 0 | 9.1 |
| KisFourPointInterpolatorTest | yes | yes | completed | 0 | 11 / 0 / 0 | 11 / 0 / 0 | 2.1 |

### libs/brush/tests

| Executable | Built | Ran | Status | Exit | Functions pass / fail / skip | QTest rows pass / fail / skip | Wall (s) |
|---|---|---|---|---|---|---|---|
| kis_auto_brush_factory_test | yes | yes | completed | 0 | 3 / 0 / 0 | 3 / 0 / 0 | 2.1 |
| kis_auto_brush_test | yes | yes | completed | 0 | 7 / 0 / 0 | 7 / 0 / 0 | 2.3 |
| kis_gbr_brush_test | yes | yes | completed | 0 | 10 / 0 / 0 | 10 / 0 / 0 | 6.8 |
| kis_imagepipe_brush_test | yes | yes | completed | 0 | 9 / 0 / 0 | 9 / 0 / 0 | 3.4 |
| kis_png_brush_test | yes | yes | completed | 0 | 3 / 0 / 0 | 7 / 0 / 0 | 1.8 |

