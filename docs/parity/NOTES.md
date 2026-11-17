## What was measured, and on what

- **Engine:** the promoted engine as it was at 11:40 UTC on 2026-11-17, SHA-1 `d1f03f661c75…` (118 766 584 bytes). It was promoted three
  times while this sweep was being written (09:31, 10:05, 11:40), so the final sweep runs against a frozen copy
  (`FREEZE=1`, copied to `/tmp/parity-frozen`, served by a second Vite on port 5194). Every number below is from that one build.
  Earlier passes on the previous builds are not mixed in; where they behaved differently it is said so.
- **Counts:** 563 actions (the earlier builds listed 561; this one adds the G'MIC pair `QMic`, `QMicAgain`), 37 tools, 28 dockers.
- **How an action was run:** fresh 400x300 document (white background with a stroke, a second paint layer with strokes, a rectangular
  selection, brush tool active, clipboard filled by `edit_copy`). Five fixtures: base, vector layer, group, transparency mask, animated layer.
  An action is run in the first fixture where it is enabled. Actions disabled everywhere were retried with each of the 37 tools active in the
  state it needs (a shape on a vector layer, a selected shape, a text object, a pending polygon): 65 became enabled and were run there (`context` in the JSON).
- **State compared before and after:** PNG export hash, layer tree, selection outline, history, document info, foreground/background colour,
  brush state, animation state, active node and its keyframes, the enabled/checked flag of every action, plus `kritaMessage`, `kritaToolChanged` and overlay events.
- **Verified by looking at a picture:** the dialogs `file_quit`, `file_open`(Qt file dialog, via `file_export_file`), `save_groups_as_images`,
  `add_new_file_layer`, `file_import_animation`, `file_import_video_animation` (FFmpeg not found), `tablet_debugger`, `reset_configurations`,
  `view_newwindow` (a whole second Krita main window), the Tool Options panel for Rectangle, and the Histogram, Layers and Log Viewer dockers.
  Everything else is classified from the state comparison only (pictures of all dialogs, tools and dockers are saved for the owner to look through).
- **Interference from the page:** the app page itself talks to the engine (first document, thumbnails). It did not disturb the sweep, but a Vite hot reload
  (other people editing `web/src`) reloads the page under the harness: those cases show as "Execution context was destroyed" and are retried on a fresh page.
  Cutting the HMR client off (an experiment) changed the page's behaviour (no tool overlay events at all), so it is not done.

## Most important findings (engine first, then page)

### 1. Krita's action definitions are not in the engine's data (explains most of the odd action behaviour)
`engine/bridge/CMakeLists.txt:77` preloads only `krita/data/actions` into `/share/krita/actions`, which holds three files
(`InteractionTool.action`, `MoveTool.action`, `PathTool.action`). The files that define everything else (`krita/krita/krita.action`,
`krita/krita/kritamenu.action`, `krita/plugins/tools/tools.action`, `SvgTextTool.action`, `KisToolTransform.action`, the selection, crop, polygon, assistant ... tool files)
are not packaged. Measured result in `kritaActions()`:
- **381 of 563 actions have an empty `text`** (182 have one). Each of the 381 is defined in one of the missing files. The page's "Search Krita Actions"
  therefore shows blank labels for two thirds of the actions (it matches the internal name only), e.g. `view_ruler`, `rotate_canvas_left`, `zoom_to_fit`, `save_incremental_version`.
- **Only 12 are `checkable`** and only 20 have a shortcut. `view_ruler`, `wrap_around_mode`, `showStatusBar`, `softProof`, `view_snap_*`, `view_show_guides` ... are toggles in Krita (`<isCheckable>true</isCheckable>`) but are listed as plain actions, so their on/off state cannot be shown or even read back.
- **No activation conditions**, so actions Krita would keep disabled are enabled. The measured case: `split_alpha_write` and `split_alpha_save_merged` are enabled on a paint layer (their `.action` says `activationConditions 1` = needs a transparency mask) and hit
  `KIS_ASSERT_RECOVER_RETURN(node->inherits("KisTransparencyMask")) // guaranteed by KisActionManager` at `krita/libs/ui/kis_node_manager.cpp:1402`. This build turns it into an error message; the previous build aborted the whole engine (`Aborted()`).
- Fix: preload `krita.action`, `kritamenu.action` and every plugin `.action` file too (the plugin ones are installed next to each plugin in a normal Krita install).

### 2. Hangs: Qt file dialogs whose call does not return (6 actions, each reproduced on a second fresh page)
`file_open`, `file_save`, `file_import_file`, `file_export_file`, `file_export_advanced`, `import_layer_as_selection_mask`: the dialog opens, Escape closes it (`kritaWindowClosed` arrives within ~10 ms),
but `triggerKritaAction` does not return in 30 s (a manual probe of `file_open`: not in 90 s). The engine keeps answering other requests (`documentInfo` fine), so this is "a pending call", not a frozen engine.
It is intermittent per action: `file_save_as`, `import_layer_from_file`, `save_node_as_image` and the others of the family returned normally on the same build (the first attempt hung, the second returned). A page that awaits these calls will wait forever; the page has its own open/save, so the simplest fix is not to offer them (see 3).

### 3. Qt file dialogs appear as Krita windows (16 actions)
A real `QFileDialog` (908x421, browsing the engine's in-memory file system: `dev etc home proc share tmp usr`) is shown for: `file_open`, `file_save`, `file_save_as`, `file_import_file`, `file_export_file`,
`file_export_advanced`, `save_incremental_version`, `save_incremental_backup`, `save_node_as_image`, `save_vector_node_to_svg`, `import_layer_from_file`, `import_layer_as_paint_layer`,
`import_layer_as_transparency_mask`, `import_layer_as_filter_mask`, `import_layer_as_selection_mask`, `convert_to_file_layer` ("Save layers to...", 640x480). Dialogs that contain a folder/file button that would open one (seen in the pictures): `add_new_file_layer`, `save_groups_as_images`, `file_import_animation` (Add images...); `render_animation` and `create_template` also ask for a path (not clicked). None of these can produce or read a file the page can see. The page should
route them to its own open/save (and, for `save_incremental_*`, `file_close`-style actions, do them itself).
`view_newwindow` opens a **whole second Krita main window** (1280x720 with the welcome page) as a "dialog"; `file_quit`, `file_close`, `file_close_all` ask "document has been modified, save?" (a Krita window) and quit nothing; `reset_configurations` asks "clear the settings file?".

### 4. Dialogs that collapse to 100x30
`file_documentinfo` (Document Information), `options_configure` (Configure Krita), `help_about_kde`, `switch_application_language`, `EditLayerMetaData`: the window is first announced at its real size (Document Information: 828x612), then
reported again as 100x30 and painted once at that size; it never grows (watched for 20 s). The page therefore shows a 100x30 grey box and the user cannot reach Krita's settings, document information or language dialog. The console prints
`This plugin does not support propagateSizeHints()` for these; the likely cause is that these `KPageDialog`/tabbed dialogs rely on a size hint the headless platform plugin never applies. This is the most visible dialog failure: "Configure Krita" is how most settings get changed.

### 5. Three actions that crashed or hung earlier builds are now disabled
`add_new_fill_layer` (earlier builds: wasm trap `operation does not support unaligned accesses` after a `QFormLayout::changed(const KoColor&)` connect warning), `add_new_fast_color_overlay_mask` (`null function` trap), `convert_to_filter_mask` (modal "New Filter Mask" that neither Escape nor `closeKritaWindow` could close; engine stopped answering).
In the final build they are disabled in every fixture although Krita enables them (Layer > New > Add Fill Layer is a core feature). Worth checking whether they were switched off on purpose or whether the fill-layer / filter-mask dialogs are still broken.

### 6. Filters
All 52 filter actions run. 39 open Krita's filter dialog (with the filter's options), 12 apply immediately (invert, autocontrast, maximize, minimize, normalize, mean removal, sharpen, five emboss variants) and one changes history only. The Filter menu of Krita
is 65 entries here (the 52 filters plus the category sub-menus and Re-apply); the page has a single "Filters..." entry, so the individual filters are search-only on the page.

### 7. Other engine observations
- **Canvas view actions** (`view_zoom_in/out`, `zoom_to_fit*`, `rotate_canvas_*`, `reset_display`) report their result as a `kritaMessage` ("Zoom: 133.3 %") and keep their own view state; they do not change the exported image, so the page must apply zoom/rotation itself from the message or keep its own view (it does).
- **View toggles show no effect in the bridge** (21 under View in the table): `wrap_around_*`, `softProof`, `gamutCheck`, `view_ruler`, `rulers_track_mouse`, `view_pixel_grid`, `view_show_guides`, `view_lock_guides`, `view_snap_*`, `view_grid`, `view_snap_to_grid`,
  `view_toggle_painting_assistants`, `view_toggle_assistant_previews`, `view_toggle_reference_images`, `showStatusBar`, `view_show_canvas_only`. With no `checkable`/`checked` (finding 1) there is nothing to read back; whether Krita's own (hidden) canvas reacted was not observable. `level_of_detail_mode` does nothing: the console says
  `Level of Detail functionality is available only with openGL + GLSL 1.3 support` (OpenGL is not available in this build, `kis_opengl.cpp:141` `g_sanityDefaultFormatIsSet` assert).
- **Brush/paintop resource actions with no visible change** (state exists in `brushState()` but did not change): `erase_action`, `eraser_preset_action`, `eraser_select_preset_action`, `brush_select_preset_action`, `preserve_alpha`, `disable_pressure`, `dual`,
  `hmirror_action`, `vmirror_action`, `mirrorX-*`, `mirrorY-*`, `rotate_brush_tip_*`. In Krita these change a canvas resource that the bridge's `BrushState` does not expose; `erase_action` in particular should flip `eraser` (check by painting). The size/opacity/flow/colour, blending-mode actions do change `brushState()`/colours.
- **Layer-selection actions with no visible effect:** `select_all_layers`, `select_visible_layers`, `select_locked_layers`, `select_invisible_layers`, `select_unlocked_layers` (multi-selection is not part of `layers()`), `isolate_active_layer`, `isolate_active_group` (affects only the projection shown on the canvas),
  `convert_to_animated` (no keyframe appears on the layer: a finding if Krita is meant to create frame 0), `activateNextLayer`/`activateNextSiblingLayer` (the fixture's active layer is already the top one, so this is expected; the previous-layer variants do change the active node).
- **Container and no-op actions (expected):** `adjust_filters`, `blur_filters` ... (sub-menu parents), `window`, `windows_*`, `theme_menu`, `style_menu`, `settings_dockers_menu`, `expanding_spacer_*`, `lock_toolbars`, `view_toggledockers`, `view_toggledockertitlebars`, `view_detached_canvas`, `view_print_size` (printing is not built), `open_resources_directory`, `render_animation_again` (nothing rendered yet), `edit_redo`/`filter_apply_again` (nothing to redo/re-apply), `help_contents` (no visible effect).
- **Clipboard:** `edit_copy`, `copy_sharp`, `copy_layer_clipboard`, `copy_layer_style`, `paste_*style` have no effect that can be observed through the bridge (the paste actions that follow them do work, so the clipboard itself works: 8 edit actions changed the image).
- **Not available when triggered (5):** `selection_tool_mode_add/replace/subtract/intersect` and `undo_polygon_selection` were enabled in the survey with a selection tool active but rejected as "Action is not available right now" when run (enabled state flips with tool state; the same actions are listed as disabled with the brush active, which matches Krita).
- **Still disabled everywhere (47):** `object_*` multi-shape actions (distribute, group, unite, intersect, subtract, split need two or more selected shapes), the path-point actions (`pathpoint-*`, `pathsegment-*`, `path-break-*`: need selected path points), the text flow actions (`put_text_on_path`, `flow_shape_*`, `add_shape_to_flow_area`),
  `svg_type_setting_move_selection_*`, `configure_sap`, `file_open_recent` (empty recent list) and the three in finding 5. The multi-selection and point-selection contexts were not reachable by the harness; they are untested, not broken.
- **FFmpeg:** `file_import_video_animation` shows "FFmpeg not found! Please add a path to FFmpeg in the "Advanced" tab" and then Krita's own import dialog; `render_animation` opens its dialog (rendering needs FFmpeg).
- **G'MIC (looked at the picture):** `QMic` (Filter > Start G'MIC-Qt) opens G'MIC-Qt 3.7.2 as a 1267x712 window listing 645 filters with a live preview of the layer (looked at the picture); no filter was applied. `QMicAgain` has no effect before a first run.

### 8. Tools (37 of 37)
- All 37 activate; every Tool Options panel paints (>= 64 distinct colours at 260x720); only `ToolReferenceImages` is pixel-identical to the previous tool's in the run order. Pictures: `docs/parity/pictures/tools/`.
- A drag/click/Enter gesture on the painted raster layer changed what it should for: every freehand/shape/selection/fill/gradient/transform/crop/move/colour-sample/text/calligraphy/lazy-brush/smart-patch tool.
  Zoom answers with a message, Pan, Measure, Knife, Interaction, Path and Reference Images change nothing in the image (Measure draws its overlay, Knife/Interaction on a raster layer answer with Krita's own "This tool only works on vector layers" message; Path/Interaction need
  a selected shape and only drew an overlay in this gesture; Reference Images needs a file, which would be a Qt file dialog; not exercised).
- On a **vector layer** Brush, Dyna, MultiBrush, SmartPatch, Fill, Enclose and Gradient answer with Krita's own "cannot paint on this layer" messages and change nothing, as in Krita. Rectangle, Ellipse, Line, Polygon, Polyline, Path, Text, Calligraphy, Crop and the selection tools do act.
- **Overlay events** (`kritaOverlay` with pixels) arrived for every tool that draws something while dragging; none for Contiguous/Similar selection, Fill, Zoom, Move and Reference Images (they draw nothing in Krita either while dragging).
- **Mouse versus pen:** every gesture was run twice, as mouse events and as a consistent pen stream (pressure on press, moves and release). They agree except Transform (pen: image only, no history entry), Crop (pen: no document-info change), Path and Polyline (pen drew, mouse only added history). A harness mistake worth knowing about: a **pen press followed by a mouse release**
  (pressure on press/moves only) makes Rectangle, Ellipse and Line draw nothing (zero-size shape): the tablet/mouse event kinds must not be mixed within one gesture.
- **Modes reached without clicking in the option panel:** transform Free, Perspective, Warp, Cage, Liquify and Mesh (each is a Krita action that selects the Transform tool in that mode; the option panel picture is different for all six): each changed the image (Cage did not add a history entry or touch the selection in this gesture: four clicks + Enter + one drag; not confirmed to be a defect).
  Selection modifiers work: replace 10 000 px, Shift add 19 600, Alt subtract 18 700, Shift+Alt intersect 4 000.
- **Not reached:** gradient shapes (linear/radial/...), fill threshold and sampling options, the Text tool's panel, brush/shape tool option widgets and the Assistants' types: they need clicks inside the option panel at positions read off the pictures; not done.
- **Intermittent hang (earlier build):** the Assistant tool hung the page's call 4 of 7 times on an earlier build (stops answering in `newDocument` after the vector-layer gesture left the assistant tool active); not seen in the final sweep.

### 9. Dockers (28 of 28)
All 28 open (0.5-0.6 s; Text Properties 7 s as the QML panel loads) and paint non-blank pictures (checked by colour count; looked at Histogram, Layers and Log Viewer). Eight open about 100 px high (Advanced and Artistic Color Selector, Histogram, Overview, Text Properties, On-Canvas Brush Editor, Arrange, Brush Presets at 741x100) so the page must call `resizeKritaWindow`; after resizing to 320x420 all rendered. A single click in the middle repainted 10 of 28; that is not a failure signal (the middle of a docker is often empty). No docker failed, hung or crashed. The Log Viewer is empty because logging is off.

### 10. Page menus (Part 3)
Of 342 entries in Krita's menus (main `krita5.xmlgui` + plugin `.xmlgui` + the Filter menu the engine builds from `filters()`), **51 are in the page's menus**, **246 are reachable only through Search Krita Actions**, and **about 45 are not in this engine's action list** (most of those are dangling in Krita too: only in the xmlgui, not defined in any `.cpp`/`.action`: `file_reload_file`, `duplicate_image`, `imageresolution`, `merge_selected_layers`, `merge_all_shape_layers`, `filter_gallery`, `feather`, `similar`, `revert`, `delete` ...;
and the plugins this build lacks: Sample Screen Color, Report Bug/Show Krita log/System information, Explore Resources Cache, Change Interface Scale). Prioritised additions are in table M2: first everything under Edit (Cut, Copy Merged, Paste family, Fill with Pattern, Fill Special, Stroke Selection...), Layer > New (all 12 kinds), Layer > Convert / Group / Select / Transform (rotate, mirror, shear, offset), Image > Properties, Background Colour, Trim, Shear, Offset, Split, Separate, Select (Reselect, Grow/Shrink/Border/Feather/Smooth, Color Range, Select Opaque), then the Filter submenus, View > Zoom (fit width/height) and Snap To entries, File > Save As / Close (to be done by the page).
Items to leave out of the page: the 16 Qt file-dialog actions and `view_newwindow`, `file_quit`, `file_close*`, `window`, `windows_*`, `fullscreen`, `help_*`.

## What could not be tested, and why
- **Comparison with desktop Krita:** none exists here. "Works" means "the document, selection, layers, history, colours, brush, animation, view message or a window changed", not "is identical to Krita".
- **Actions disabled everywhere (47):** need contexts the harness could not build (several selected shapes, selected path points, a text flow area); see finding 7.
- **View toggles, `level_of_detail_mode`, `softProof`, `gamutCheck`, `showStatusBar`, guides, snapping, assistants and reference-image visibility:** the bridge exposes no state for them (no `checked`), so only "no visible effect" can be said; whether the hidden canvas changed is unknown.
- **Option-panel interaction for tools and filter dialogs** (clicking spin boxes, combo boxes, OK in dialogs): only Escape/close, a centre click on dockers and the transform-mode actions were exercised. Dialog contents were not edited and OK was never pressed, so "opened dialog" does not mean the action then works.
- **Gradient shapes, fill options, assistant types, text options, brush engine options:** see finding 8.
- **Real pen hardware, OpenGL/LoD, printing, Python, FFmpeg encoding, G'MIC filters:** not built or not testable in headless Chromium with swiftshader.
- **Timing:** the machine was shared with compile jobs; a few results (hangs, first-attempt failures) were retried on fresh pages and both attempts are recorded in `attempts` in `actions.json`.

## How to rerun
```
cd web && npx vite --port 5193 --strictPort &        # or use FREEZE=1 below and skip this
node web/tests/parity-sweep.mjs                      # everything, resumes from docs/parity/results/*.json (about 2.5 hours)
FREEZE=1 node web/tests/parity-sweep.mjs             # same, on a frozen copy of the engine, own server on port 5194
PART=actions|tools|menus|dockers|report              # one part; ONLY=regex re-runs matching names; FRESH=1 ignores old results
ISOLATE=1 PART=actions ONLY='^file_open$' node web/tests/parity-sweep.mjs   # one action per fresh page
```
Delete `docs/parity/results` to start over (the inventory and the engine fingerprint are written first).
