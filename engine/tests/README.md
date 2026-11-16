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

## Targets used for docs/unit-tests/RESULTS.md

```
TestKoColorSet TestKoColorSpaceRegistry TestKoColorSpaceAbstract TestColorConversionSystem TestKoColor 
TestKoIntegerMaths TestConvolutionOpImpl KoRgbU8ColorSpaceTester TestKoColorSpaceSanity 
TestFallBackColorTransformation TestKoChannelInfo TestCompositeOpInversion TestColorConversion 
TestKoColorSpaceMaths TestKisSwatchGroup TestKoStopGradient KisSignalAutoConnectionTest 
KisSignalCompressorTest KisForestTest KisMplTest KisRectsGridTest KisLazyStorageTest KisValueCacheTest 
KisHistoryListTest KisAdaptedLockTest KisGlobalTest kis_base_node_test kis_fast_math_test kis_node_test 
kis_fixed_paint_device_test kis_layer_test kis_iterator_test kis_painter_test kis_pixel_selection_test 
kis_selection_test kis_group_layer_test kis_paint_layer_test kis_convolution_painter_test 
kis_datamanager_test kis_fill_painter_test kis_filter_strategy_test kis_gradient_painter_test kis_image_test 
kis_iterators_ng_test kis_transaction_test kis_projection_test kis_selection_mask_test kis_mask_test 
kis_filter_weights_applicator_test kis_filter_weights_buffer_test kis_mask_generator_test 
kis_scanline_fill_test kis_fill_interval_test kis_algebra_2d_test kis_math_toolbox_test kis_cubic_curve_test 
kis_warp_transform_worker_test kis_transparency_mask_test kis_paint_information_test 
kis_fixed_point_maths_test kis_bsplines_test kis_count_visitor_test kis_effect_mask_test 
KisFourPointInterpolatorTest kis_transform_worker_test kis_paint_device_test kis_cs_conversion_test 
kis_tile_data_pooler_test kis_tile_data_store_test kis_tiled_data_manager_test 
kis_properties_configuration_test kis_pattern_test kis_filter_test kis_filter_registry_test 
kis_filter_configuration_test kis_image_commands_test kis_processing_applicator_test kis_strokes_queue_test 
kis_stroke_test kis_updater_context_test kis_simple_update_queue_test kis_node_facade_test 
kis_node_commands_test kis_node_visitor_test kis_crop_processing_visitor_test kis_adjustment_layer_test 
kis_psd_layer_style_test kis_layer_style_projection_plane_test kis_lazy_brush_test kis_cubic_spline_test 
kis_name_server_test kis_paintop_test kis_shared_ptr_test kis_types_test kis_vec_test kis_annotation_test 
kis_image_signal_router_test kis_fill_interval_map_test kis_mask_similarity_test 
kis_lod_capable_layer_offset_test kis_marker_painter_test kis_filter_processing_information_test 
kis_node_graph_listener_test kis_node_query_path_test kis_boundary_test kis_clone_layer_test 
kis_transform_mask_test kis_cage_transform_worker_test kis_liquify_transform_worker_test 
kis_mesh_transform_worker_test kis_simple_stroke_strategy_test kis_stroke_strategy_undo_command_based_test 
kis_filter_config_widget_test kis_gbr_brush_test kis_auto_brush_test kis_png_brush_test 
kis_imagepipe_brush_test kis_auto_brush_factory_test 
```

Cache overrides needed on top of the defaults: none beyond `KritaWebTests.cmake` (note: CMake cache variables do not change when the default in the file changes; pass `-D` through `configure.sh` or delete the build tree after editing the lists). `make-table.mjs` turns `results.json` into the Markdown tables.
