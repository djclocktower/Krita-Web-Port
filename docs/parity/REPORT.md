# Krita parity sweep report

Generated 2026-11-17T08:57:17.430Z by `web/tests/parity-sweep.mjs` from `docs/parity/results/*.json` (engine in `web/public/engine`, Chromium + swiftshader).

## Headline counts

### Actions (561 of 561 swept)

| outcome | count |
|---|---|
| changed layers/selection/history/view | 141 |
| no visible effect | 115 |
| disabled | 109 |
| changed image | 87 |
| opened dialog | 73 |
| message | 19 |
| opened popup | 12 |
| crash | 4 |
| hang | 1 |

### Tools (37 of 37)

| outcome (raster + vector gestures) | count |
|---|---|
| changed image/history | 13 |
| changed selection/history | 8 |
| overlay only | 5 |
| changed image/layers/history | 3 |
| message | 1 |
| changed history (but intermittent hang, see note) | 1 |
| changed image/selection/history | 1 |
| changed image/selection | 1 |
| changed colors | 1 |
| no visible effect | 1 |
| changed history | 1 |
| changed image/docinfo/selection | 1 |

Tool option window: 0 blank, 1 identical to the previous tool's.

### Dockers (28 of 28)

| outcome | count |
|---|---|
| opens, no repaint on click | 16 |
| opens, repaints on click | 12 |


_(docs/parity/NOTES.md missing)_

---
# Appendix: generated tables

## A1. Actions that hang, crash or error

| action | text | menu | outcome | observed |
|---|---|---|---|---|
| add_new_fill_layer | Add Fill Layer... | Layer > New | crash |  console shows a wasm trap |
| add_new_fast_color_overlay_mask | Add Color Overlay Mask | - | crash |  console shows abort |
| convert_to_filter_mask | Convert to Filter Mask... | Layer > Convert | hang |  |
| split_alpha_write | Write as Alpha | Layer > Split > Split Alpha | crash |  console shows abort |
| split_alpha_save_merged | Save Merged... | Layer > Split > Split Alpha | crash |  console shows abort |

## A2. Actions that opened a dialog or popup (picture saved)

| action | text | window title | size | closed by | returned | picture |
|---|---|---|---|---|---|---|
| krita_filter_oilpaint | Oilpaint... | dialog: Filter: Oilpaint | 582x325 |  | done | actions/krita_filter_oilpaint__Filter_Oilpaint.png |
| stroke_selection | Stroke Selection... | dialog: Stroke Selection Properties – Krita | 331x235 modal | Escape | done | actions/stroke_selection__Stroke_Selection_Properties_Krita.png |
| show_snap_options_popup | Show Snap Options Popup | popup:  | 166x289 | Escape | done | actions/show_snap_options_popup__.png |
| layer_style | Layer Style... | dialog: Layer Styles – Krita | 818x744 modal | Escape | done | actions/layer_style__Layer_Styles_Krita.png |
| add_new_adjustment_layer | Add Filter Layer... | dialog: New Filter Layer – Krita | 722x527 modal | Escape | done | actions/add_new_adjustment_layer__New_Filter_Layer_Krita.png |
| add_new_filter_mask | Add Filter Mask... | dialog: New Filter Mask – Krita | 722x527 modal | Escape | done | actions/add_new_filter_mask__New_Filter_Mask_Krita.png |
| convert_to_filter_mask | Convert to Filter Mask... | dialog: New Filter Mask – Krita | 722x527 modal | STUCK,STUCK,STUCK,STUCK,STUCK | pending |  |
| image_properties | Properties... | dialog: Image Properties – Krita | 560x552 modal | Escape | done | actions/image_properties__Image_Properties_Krita.png |
| image_color | Image Background Color and Transparency... | dialog: Select a Color | 640x480 modal | Escape | done | actions/image_color__Select_a_Color.png |
| patterns | Patterns | popup:  | 452x402 | Escape | done | actions/patterns__.png |
| gradients | Gradients | popup:  | 322x398 | Escape | done | actions/gradients__.png |
| brushslider1 | Brush option slider 1 | popup:  | 336x130 | Escape | done | actions/brushslider1__.png |
| brushslider2 | Brush option slider 2 | popup:  | 336x130 | Escape | done | actions/brushslider2__.png |
| brushslider3 | Brush option slider 3 | popup:  | 336x130 | Escape | done | actions/brushslider3__.png |
| brushslider4 | Brush option slider 4 | popup:  | 336x130 | Escape | done | actions/brushslider3__.png |
| brushslider5 | Brush option slider 5 | popup:  | 336x130 | Escape | done | actions/brushslider3__.png |
| show_brush_presets | Show Brush Presets | popup:  | 452x552 | Escape | done | actions/show_brush_presets__.png |
| workspaces | Workspaces | popup:  | 274x616 | Escape | done | actions/workspaces__.png |
| chooseForegroundColor | Open Foreground color selector | dialog: Select a Color | 505x490 | Escape | done | actions/chooseForegroundColor__Select_a_Color.png |
| chooseBackgroundColor | Open Background color selector | dialog: Select a Color | 505x490 | Escape | done | actions/chooseBackgroundColor__Select_a_Color.png |
| docker_box | Show Docker Box | popup:  | 302x302 | Escape | done | actions/docker_box__.png |
| imagesize | Scale Image To New Size... | dialog: Scale To New Size – Krita | 547x452 modal | Escape | done | actions/imagesize__Scale_To_New_Size_Krita.png |
| canvassize | Resize Canvas... | dialog: Resize Canvas – Krita | 403x431 modal | Escape | done | actions/canvassize__Resize_Canvas_Krita.png |
| layersize | Scale Layers to new Size... | dialog: Resize Layer – Krita | 377x257 modal | Escape | done | actions/layersize__Resize_Layer_Krita.png |
| scaleAllLayers | Scale All Layers to new Size... | dialog: Resize Layer – Krita | 377x257 modal | Escape | done | actions/scaleAllLayers__Resize_Layer_Krita.png |
| selectionscale | Scale... | dialog: Scale Selection – Krita | 377x257 modal | Escape | done | actions/layersize__Resize_Layer_Krita.png |
| clones_array | Clones Array... | dialog: Create Clones Array – Krita | 836x205 modal | Escape | done | actions/clones_array__Create_Clones_Array_Krita.png |
| colorrange | Select from Color Range... | dialog: Color Range – Krita | 408x236 modal | Escape | done |  |
| imagecolorspaceconversion | Convert Image Color Space... | dialog: Convert All Layers From RGB/Alpha (8-bit integer/channel) – Krita | 658x444 modal | Escape | done | actions/imagecolorspaceconversion__Convert_All_Layers_From_RGB_Alpha_8-bit_integer_chann.png |
| layercolorspaceconversion | Convert Layer Color Space... | dialog: Convert Current Layer From RGB/Alpha (8-bit integer/channel) – Krita | 658x444 modal | Escape | done | actions/imagecolorspaceconversion__Convert_All_Layers_From_RGB_Alpha_8-bit_integer_chann.png |
| imagesplit | Image Split | dialog: Image Split – Krita | 616x328 modal | Escape | done | actions/imagesplit__Image_Split_Krita.png |
| layersplit | Split Layer... | dialog: Split Layer – Krita | 640x480 modal | Escape | done | actions/layersplit__Split_Layer_Krita.png |
| growselection | Grow Selection... | dialog: Grow Selection – Krita | 431x115 modal | Escape | done | actions/growselection__Grow_Selection_Krita.png |
| shrinkselection | Shrink Selection... | dialog: Shrink Selection – Krita | 446x146 modal | Escape | done | actions/shrinkselection__Shrink_Selection_Krita.png |
| borderselection | Border Selection... | dialog: Border Selection – Krita | 485x146 modal | Escape | done | actions/borderselection__Border_Selection_Krita.png |
| featherselection | Feather Selection... | dialog: Feather Selection – Krita | 485x115 modal | Escape | done | actions/featherselection__Feather_Selection_Krita.png |
| offsetimage | Offset Image... | dialog: Offset Image – Krita | 286x196 modal | Escape | done | actions/offsetimage__Offset_Image_Krita.png |
| offsetlayer | Offset Layers... | dialog: Offset Layer – Krita | 286x196 modal | Escape | done | actions/offsetimage__Offset_Image_Krita.png |
| rotateimage | Rotate Image... | dialog: Rotate Image – Krita | 387x337 modal | Escape | done | actions/rotateimage__Rotate_Image_Krita.png |
| rotatelayer | Rotate Layers... | dialog: Rotate Layer – Krita | 387x337 modal | Escape | done | actions/rotateimage__Rotate_Image_Krita.png |
| rotateAllLayers | Rotate All Layers... | dialog: Rotate Layer – Krita | 387x337 modal | Escape | done | actions/rotateimage__Rotate_Image_Krita.png |
| separate | Separate Image... | dialog: Separate Image – Krita | 615x414 modal | Escape | done | actions/separate__Separate_Image_Krita.png |
| shearimage | Shear Image... | dialog: Shear Image – Krita | 250x121 modal | Escape | done | actions/shearimage__Shear_Image_Krita.png |
| shearlayer | Shear Layers... | dialog: Shear Layer – Krita | 250x121 modal | Escape | done | actions/shearimage__Shear_Image_Krita.png |
| shearAllLayers | Shear All Layers... | dialog: Shear Layer – Krita | 250x121 modal | Escape | done | actions/shearimage__Shear_Image_Krita.png |
| waveletdecompose | Wavelet Decompose ... | dialog: WaveletDecompose – Krita | 202x83 modal | Escape | done | actions/waveletdecompose__WaveletDecompose_Krita.png |
| EditLayerMetaData | Edit metadata... | dialog:  | 100x30 modal | Escape | done | actions/EditLayerMetaData__.png |
| save_incremental_version | Save Incremental Version | dialog: Saving As | 908x421 modal | Escape | done | actions/save_incremental_version__Saving_As.png |
| save_incremental_backup | Save Incremental Backup | dialog: Saving As | 908x421 modal | Escape | done | actions/save_incremental_version__Saving_As.png |
| tablet_debugger | Toggle Tablet Debugger | dialog: Krita | 640x480 modal | Escape | done | actions/tablet_debugger__Krita.png |
| create_template | Create Template From Image... | dialog: Create Template – Krita | 442x279 modal | Escape | done | actions/create_template__Create_Template_Krita.png |
| save_groups_as_images | Save Group Layers... | dialog: Krita | 640x480 modal | Escape | done | actions/save_groups_as_images__Krita.png |
| save_node_as_image | Save Layer/Mask... | dialog: Export "Layer 2" | 908x421 modal | Escape | done | actions/save_node_as_image__Export_Layer_2_.png |
| save_vector_node_to_svg | Save Vector Layer as SVG... | dialog: Export to SVG | 908x421 modal | Escape | done | actions/save_node_as_image__Export_Layer_2_.png |
| add_new_file_layer | Add File Layer... | dialog: Krita | 422x377 modal | Escape | done | actions/add_new_file_layer__Krita.png |
| convert_to_file_layer | Convert to File Layer... | dialog: Save layers to... | 640x480 modal | Escape | done | actions/convert_to_file_layer__Save_layers_to....png |
| import_layer_from_file | Import Layer... | dialog: Import Image | 908x421 modal | Escape | done | actions/import_layer_from_file__Import_Image.png |
| import_layer_as_paint_layer | as Paint Layer... | dialog: Import Image | 908x421 modal | Escape | done | actions/import_layer_from_file__Import_Image.png |
| import_layer_as_transparency_mask | as Transparency Mask... | dialog: Import Image | 908x421 modal | Escape | done | actions/import_layer_as_transparency_mask__Import_Image.png |
| import_layer_as_filter_mask | as Filter Mask... | dialog: Import Image | 908x421 modal | Escape | done | actions/import_layer_as_transparency_mask__Import_Image.png |
| import_layer_as_selection_mask | as Selection Mask... | dialog: Import Image | 908x421 modal | Escape | done | actions/import_layer_from_file__Import_Image.png |
| manage_bundles | Manage Resource Libraries... | dialog: Manage Resource Libraries – Krita | 742x535 modal | Escape | done | actions/manage_bundles__Manage_Resource_Libraries_Krita.png |
| manage_resources | Manage Resources... | dialog: Manage Resources – Krita | 742x535 modal | Escape | done | actions/manage_resources__Manage_Resources_Krita.png |
| file_new | New | dialog: Create new document | 505x270 modal | Escape | done |  |
| file_open | Open… | dialog: Open Images | 908x421 modal | Escape | done | actions/import_layer_from_file__Import_Image.png |
| file_quit | Quit | dialog: Krita | 441x111 modal | Escape | done | actions/file_quit__Krita.png |
| options_configure_toolbars | Configure Toolbars… | dialog: Configure Toolbars | 618x460 modal | Escape | done | actions/options_configure_toolbars__Configure_Toolbars.png |
| file_save | Save | dialog: Saving As | 908x421 modal | Escape | done | actions/save_incremental_version__Saving_As.png |
| file_save_as | Save As… | dialog: Saving As | 908x421 modal | Escape | done | actions/save_incremental_version__Saving_As.png |
| file_import_animation | Import animation frames... | dialog: Krita | 503x331 modal | Escape | done | actions/file_import_animation__Krita.png |
| file_import_video_animation | Import video animation... | dialog: Krita | 500x103 modal | Escape,Escape | done | actions/file_import_video_animation__Krita.png |
| render_animation | Render Animation... | dialog: Render Animation – Krita | 493x678 modal | Escape | done | actions/render_animation__Render_Animation_Krita.png |
| file_close_all | Close All | dialog: Krita | 441x111 modal | Escape | done | actions/file_quit__Krita.png |
| file_import_file | Open existing Document as Untitled Document... | dialog: Import Images | 908x421 modal | Escape | done | actions/import_layer_as_transparency_mask__Import_Image.png |
| file_export_file | Export... | dialog: Exporting | 908x421 modal | Escape | done | actions/file_export_file__Exporting.png |
| file_export_advanced | Export Advanced... | dialog: Exporting | 908x421 modal | Escape | done | actions/file_export_file__Exporting.png |
| file_documentinfo | Document Information | dialog: Document Information | 100x30 modal | Escape | done | actions/file_documentinfo__Document_Information.png |
| reset_configurations | Reset All Settings | dialog: Krita | 640x480 modal | Escape | done | actions/reset_configurations__Krita.png |
| view_newwindow | New Window | dialog:  | 1280x720 | closeKritaWindow | done | actions/view_newwindow__.png |
| file_close | Close | dialog: Krita | 441x111 modal | Escape | done | actions/file_quit__Krita.png |
| file_sessions | Sessions... | dialog: Sessions | 363x238 | Escape | done | actions/file_sessions__Sessions.png |
| command_bar_open | Search Actions | popup:  | 666x500 | Escape | done | actions/command_bar_open__.png |
| options_configure | Configure Krita... | dialog: Configure Krita | 100x30 modal | Escape | done | actions/options_configure__Configure_Krita.png |
| switch_application_language | Switch Application Language... | dialog: Switch Application Language | 100x30 | Escape | done | actions/switch_application_language__Switch_Application_Language.png |
| help_about_app | About Krita | dialog: About Krita | 583x635 modal | Escape | done | actions/help_about_app__About_Krita.png |
| help_about_kde | About KDE | dialog: About KDE | 100x30 | Escape | done | actions/switch_application_language__Switch_Application_Language.png |

## A3. Actions that were enabled but had no visible effect

| action | text (from .action file when the engine has none) | menu | fixture | activation in .action |
|---|---|---|---|---|
| wrap_around_mode | Wrap Around Mode | View | base | cond 0 flags 1 |
| wrap_around_hv_axis | Wrap Around Both Directions | View > Wrap Around Mode Direction | base | cond 0 flags 1 |
| wrap_around_h_axis | Wrap Around Horizontally | View > Wrap Around Mode Direction | base | cond 0 flags 1 |
| wrap_around_v_axis | Wrap Around Vertically | View > Wrap Around Mode Direction | base | cond 0 flags 1 |
| level_of_detail_mode | Instant Preview Mode | View | base | cond 0 flags 1 |
| softProof | Soft Proofing | View | base |  |
| gamutCheck | Out of Gamut Warnings | View | base |  |
| showStatusBar | Show Status Bar | View | base | cond 0 flags 0 |
| view_show_canvas_only | Show Canvas Only | View | base | cond 0 flags 1 |
| ruler_pixel_multiple2 | Use multiple of 2 for pixel scale | - | base | cond 0 flags 1 |
| view_ruler | Show Rulers | View | base | cond 0 flags 1 |
| rulers_track_mouse | Rulers Track Pointer | View | base | cond 0 flags 1 |
| zoom_to_100pct | Zoom to 100% | View > Zoom, Rotate, and Mirror | base | cond 0 flags 1 |
| settings_active_author | Active Author Profile | Settings | base |  |
| view_pixel_grid | Show Pixel Grid | View | base | cond 1000 flags 1000 |
| toggle_brush_outline | Toggle Brush Outline | - | base |  |
| filter_apply_again | Apply Filter Again | Filter | base | cond 0 flags 0 |
| filter_apply_reprompt | Apply Filter Again (Reprompt) | Filter | base | cond 0 flags 0 |
| adjust_filters | Adjust | Filter | base |  |
| blur_filters | Blur | Filter | base |  |
| color_filters | Colors | Filter | base |  |
| edge_filters | Edge Detection | Filter | base |  |
| emboss_filters | Emboss | Filter | base |  |
| enhance_filters | Enhance | Filter | base |  |
| map_filters | Map | Filter | base |  |
| artistic_filters | Artistic | Filter | base |  |
| other_filters | Other | Filter | base |  |
| edit_copy | Copy | Edit | base | cond 0 flags 1 |
| copy_sharp | Copy (sharp) | Edit | base | cond 0 flags 100000000 |
| paste_shape_style | Paste Shape Style | Edit | base | cond 0 flags 1000000000000 |
| toggle_display_selection | Display Selection | Select | base | cond 0 flags 1000 |
| edit_selection | Edit Selection | Select | base | cond 100 flags 10000000000 |
| convert_shapes_to_vector_selection | Convert Shapes to Vector Selection | Select | vector | cond 0 flags 1000000000 |
| convert_selection_to_shape | Convert to Shape | Select | vector | cond 0 flags 10000000000 |
| enable_sap | Enable Selection Actions Bar | Select | base | flags 1 |
| toggle-selection-overlay-mode | Toggle Selection Display Mode | - | base | cond 0 flags 0 |
| view_show_guides | Show Guides | View | base | cond 0 flags 1 |
| view_lock_guides | Lock Guides | View | base | cond 0 flags 1 |
| view_snap_to_guides | Snap to Guides | View > Snap To | base | cond 0 flags 1 |
| view_snap_orthogonal | Snap Orthogonal | View > Snap To | base | flags 1000 |
| view_snap_node | Snap Node | View > Snap To | base | flags 1000 |
| view_snap_extension | Snap Extension | View > Snap To | base | flags 1000 |
| view_snap_intersection | Snap Intersection | View > Snap To | base | flags 1000 |
| view_snap_bounding_box | Snap Bounding Box | View > Snap To | base | flags 1000 |
| view_snap_image_bounds | Snap Image Bounds | View > Snap To | base | flags 1000 |
| view_snap_image_center | Snap Image Center | View > Snap To | base | flags 1000 |
| view_snap_to_pixel | Snap Pixel | View > Snap To | base | flags 1000 |
| copy_layer_style | Copy Layer Style | Edit | base | cond 0 flags 1 |
| paste_layer_style | Paste Layer Style | Edit | base | cond 0 flags 1 |
| activateNextLayer | Activate next layer | - | base | cond 0 flags 1000 |
| activateNextSiblingLayer | Activate next sibling layer, skipping over groups. | - | base | cond 0 flags 1000 |
| activatePreviousLayer | Activate previous layer | - | base | cond 0 flags 1000 |
| activatePreviousSiblingLayer | Activate previous sibling layer, skipping over groups. | - | base | cond 0 flags 1000 |
| switchToPreviouslyActiveNode | Activate previously selected layer | - | base | cond 0 flags 1000 |
| copy_layer_clipboard | Copy Layer | Layer | base | cond 0 flags 1000 |
| select_all_layers | All Layers | Layer > Select | base | cond 0 flags 1000 |
| select_visible_layers | Visible Layers | Layer > Select | base | cond 0 flags 1000 |
| select_locked_layers | Locked Layers | Layer > Select | base | cond 0 flags 1000 |
| select_invisible_layers | Invisible Layers | Layer > Select | base | cond 0 flags 1000 |
| select_unlocked_layers | Unlocked Layers | Layer > Select | base | cond 0 flags 1000 |
| convert_to_animated | Convert to Animated Layer | - | anim | cond 0 flags 100000 |
| isolate_active_layer | Isolate Active Layer | - | base | cond 0 flags 1000 |
| isolate_active_group | Isolate Active Group | - | group | cond 0 flags 1000 |
| view_grid | Show Grid | View | base | cond 0 flags 1000 |
| view_snap_to_grid | Snap To Grid | View > Snap To | base | flags 1000 |
| view_toggle_painting_assistants | Show Painting Assistants | View | base | cond 0 flags 1000 |
| view_toggle_assistant_previews | Show Assistant Previews | View | base | cond 0 flags 1000 |
| view_toggle_reference_images | Show Reference Images | View | base | cond 0 flags 1000 |
| dual | Choose foreground and background colors | - | base |  |
| erase_action | Set eraser mode | - | base | cond 0 flags 0 |
| eraser_preset_action | Toggle eraser preset | - | base | cond 0 flags 0 |
| eraser_select_preset_action | Select eraser preset | - | base | cond 0 flags 0 |
| brush_select_preset_action | Select brush preset | - | base | cond 0 flags 0 |
| preserve_alpha | Preserve Alpha | - | base | flags 0 |
| mirrorX-hideDecorations | Hide Mirror X Line | - | base | flags 0 |
| mirrorX-lock | Lock X Line | - | base | flags 0 |
| mirrorX-moveToCenter | Move to Canvas Center X | - | base | flags 0 |
| mirrorY-hideDecorations | Hide Mirror Y Line | - | base | flags 0 |
| mirrorY-lock | Lock Y Line | - | base | flags 0 |
| mirrorY-moveToCenter | Move to Canvas Center Y | - | base | flags 0 |
| hmirror_action | Horizontal Mirror Tool | - | base | flags 0 |
| vmirror_action | Vertical Mirror Tool | - | base | flags 0 |
| Select Normal Blending Mode | Select Normal Blending Mode | - | base | cond 0 flags 0 |
| Select Clear Blending Mode | Select Clear Blending Mode | - | base | cond 0 flags 0 |
| composite_actions | Brush composite | - | base |  |
| mirror_actions | Mirror | - | base |  |
| show_brush_editor | Show Brush Editor | - | base |  |
| disable_pressure | Use Pen Pressure | - | base | flags 0 |
| paintops | Painter's Tools | - | base |  |
| dockerBox | Docker Box | - | base |  |
| LayerGroupSwitcher/next | Move into next group | - | group | cond 0 flags 0 |
| rotate_brush_tip_clockwise | Rotate brush tip clockwise | - | base | cond 0 flags 0 |
| rotate_brush_tip_clockwise_precise | Rotate brush tip clockwise (precise) | - | base | cond 0 flags 0 |
| rotate_brush_tip_counter_clockwise | Rotate brush tip counter-clockwise | - | base | cond 0 flags 0 |
| rotate_brush_tip_counter_clockwise_precise | Rotate brush tip counter-clockwise (precise) | - | base | cond 0 flags 0 |
| KritaShape/KisToolBrush | Freehand Brush Tool | - | base |  |
| edit_redo | Redo  | Edit | base | cond 0 flags 1 |
| open_resources_directory | Open Resources Folder | - | base | cond 0 flags 0 |
| view_print_size | View Print Size | View | base |  |
| render_animation_again | Render Animation Again | - | anim | cond 0 flags 1000 |
| theme_menu | Themes | Settings | base |  |
| view_toggledockers | Show Dockers | Settings | base | cond 0 flags 1 |
| view_detached_canvas | Detach Canvas | View | base | cond 0 flags 1 |
| view_toggledockertitlebars | Show Docker Titlebars | - | base | cond 0 flags 0 |
| settings_dockers_menu | Dockers | Settings | base |  |
| window | Window | - | base |  |
| style_menu | Styles | Settings | base |  |
| windows_cascade | Cascade | - | base | cond 0 flags 10 |
| windows_tile | Tile | - | base | cond 0 flags 10 |
| windows_next | Next | - | base | cond 0 flags 10 |
| windows_previous | Previous | - | base |  |
| expanding_spacer_0 | Expanding Spacer | - | base |  |
| expanding_spacer_1 | Expanding Spacer | - | base |  |
| lock_toolbars | Lock Toolbars | Settings | base |  |
| help_contents | Krita Handbook | Help | base |  |

## A4. Actions disabled in every fixture (base, vector layer, group, mask, animated)

| action | text | menu | activation in .action |
|---|---|---|---|
| configure_sap | Configure selection actions bar | Select |  |
| calligraphy_increase_width | Calligraphy: increase width | - |  |
| calligraphy_decrease_width | Calligraphy: decrease width | - |  |
| calligraphy_increase_angle | Calligraphy: increase angle | - |  |
| calligraphy_decrease_angle | Calligraphy: decrease angle | - |  |
| selection_tool_mode_add | Selection Mode: Add | - |  |
| selection_tool_mode_replace | Selection Mode: Replace | - |  |
| selection_tool_mode_subtract | Selection Mode: Subtract | - |  |
| selection_tool_mode_intersect | Selection Mode: Intersect | - |  |
| object_order_front | Bring to Front | - |  |
| object_order_raise | Raise | - |  |
| object_order_lower | Lower | - |  |
| object_order_back | Send to Back | - |  |
| object_align_horizontal_left | Align Left | - |  |
| object_align_horizontal_center | Horizontally Center | - |  |
| object_align_horizontal_right | Align Right | - |  |
| object_align_vertical_top | Align Top | - |  |
| object_align_vertical_center | Vertically Center | - |  |
| object_align_vertical_bottom | Align Bottom | - |  |
| object_distribute_horizontal_left | Distribute Left | - |  |
| object_distribute_horizontal_center | Distribute Centers Horizontally | - |  |
| object_distribute_horizontal_right | Distribute Right | - |  |
| object_distribute_horizontal_gaps | Distribute Horizontal Gap | - |  |
| object_distribute_vertical_top | Distribute Top | - |  |
| object_distribute_vertical_center | Distribute Centers Vertically | - |  |
| object_distribute_vertical_bottom | Distribute Bottom | - |  |
| object_distribute_vertical_gaps | Distribute Vertical Gap | - |  |
| object_group | Group | - |  |
| object_ungroup | Ungroup | - |  |
| object_transform_rotate_90_cw | Rotate 90° CW | - |  |
| object_transform_rotate_90_ccw | Rotate 90° CCW | - |  |
| object_transform_rotate_180 | Rotate 180° | - |  |
| object_transform_mirror_horizontally | Mirror Horizontally | - |  |
| object_transform_mirror_vertically | Mirror Vertically | - |  |
| object_transform_reset | Reset Transformations | - |  |
| object_unite | Unite | - |  |
| object_intersect | Intersect | - |  |
| object_subtract | Subtract | - |  |
| object_split | Split | - |  |
| text_type_preformatted | Convert Text To Preformatted | - |  |
| text_type_pre_positioned | Convert Text To Pre-positioned | - |  |
| text_type_inline_wrap | Convert Text To Inline Wrapped | - |  |
| add_shape_to_flow_area | Flow Text in Shape | - |  |
| subtract_shape_from_flow_area | Subtract Shape from Text Chain | - |  |
| put_text_on_path | Put Text On Path | - |  |
| remove_shapes_from_text_flow | Remove Shapes from Text Chain | - |  |
| flow_shape_type_toggle | Toggle Flow Shape Type | - |  |
| flow_shape_order_back | Set Flow Shape as Last | - |  |
| flow_shape_order_earlier | Move Shape Earlier In Chain. | - |  |
| flow_shape_order_later | Move Shape Later In Chain. | - |  |
| flow_shape_order_front | Set Shape As First In Chain | - |  |
| undo_polygon_selection | Undo Polygon Selection Points | - |  |
| movetool-move-up | Move up | - |  |
| movetool-move-down | Move down | - |  |
| movetool-move-left | Move left | - |  |
| movetool-move-right | Move right | - |  |
| movetool-move-up-more | Move up more | - |  |
| movetool-move-down-more | Move down more | - |  |
| movetool-move-left-more | Move left more | - |  |
| movetool-move-right-more | Move right more | - |  |
| movetool-show-coordinates | Show Coordinates | - |  |
| set_no_brush_smoothing | Brush Smoothing: Disabled | - |  |
| set_simple_brush_smoothing | Brush Smoothing: Basic | - |  |
| set_weighted_brush_smoothing | Brush Smoothing: Weighted | - |  |
| set_stabilizer_brush_smoothing | Brush Smoothing: Stabilizer | - |  |
| set_pixel_perfect_smoothing | Brush Smoothing: Pixel | - |  |
| toggle_assistant | Toggle Snap To Assistants | - |  |
| svg_align_center | Align Center | - |  |
| svg_align_justified | Align Block | - |  |
| svg_align_left | Align Left | - |  |
| svg_align_right | Align Right | - |  |
| svg_decrease_font_size | Decrease Font Size | - |  |
| svg_font_kerning | Kerning | - |  |
| svg_format_italic | Italic | - |  |
| svg_format_strike_through | Strikethrough | - |  |
| svg_format_subscript | Subscript | - |  |
| svg_format_superscript | Superscript | - |  |
| svg_format_underline | Underline | - |  |
| svg_increase_font_size | Increase Font Size | - |  |
| svg_weight_black | Black | - |  |
| svg_weight_bold | Bold | - |  |
| svg_weight_demi | Demi | - |  |
| svg_weight_light | Light | - |  |
| svg_weight_normal | Normal | - |  |
| svg_insert_special_character | Glyph Palette... | - |  |
| svg_paste_rich_text | Paste Rich Text | - |  |
| svg_paste_plain_text | Paste Plain Text | - |  |
| svg_type_setting_move_selection_start_down_1_px | Move Text Selection Down By 1 Pixel | - |  |
| svg_type_setting_move_selection_start_up_1_px | Move Text Selection Up By 1 Pixel | - |  |
| svg_type_setting_move_selection_start_left_1_px | Move Text Selection Left By 1 Pixel | - |  |
| svg_type_setting_move_selection_start_right_1_px | Move Text Selection Right By 1 Pixel | - |  |
| svg_remove_transforms_from_range | Remove Character Transforms | - |  |
| svg_clear_formatting | Clear Formatting | - |  |
| pathpoint-corner | Corner point | - |  |
| pathpoint-smooth | Smooth point | - |  |
| pathpoint-symmetric | Symmetric Point | - |  |
| pathpoint-curve | Make curve point | - |  |
| pathpoint-line | Make line point | - |  |
| pathsegment-line | Segment to Line | - |  |
| pathsegment-curve | Segment to Curve | - |  |
| pathpoint-insert | Insert point | - |  |
| pathpoint-remove | Remove point | - |  |
| path-break-point | Break at point | - |  |
| path-break-segment | Break at segment | - |  |
| path-break-selection | Break at selection | - |  |
| pathpoint-join | Join with segment | - |  |
| pathpoint-merge | Merge points | - |  |
| convert-to-path | To Path | - |  |
| file_open_recent | Open Recent | File | cond 0 flags 1 |

## A5. Every action

| action | text | fixture | outcome | detail |
|---|---|---|---|---|
| rotate_canvas_right | Rotate Canvas Right | base | message | Rotation: 15.0°  |
| rotate_canvas_left | Rotate Canvas Left | base | message | Rotation: -15.0°  |
| reset_canvas_rotation | Reset Canvas Rotation | base | message | Rotation: 0.0°  |
| wrap_around_mode | Wrap Around Mode | base | no visible effect |  |
| wrap_around_hv_axis | Wrap Around Both Directions | base | no visible effect |  |
| wrap_around_h_axis | Wrap Around Horizontally | base | no visible effect |  |
| wrap_around_v_axis | Wrap Around Vertically | base | no visible effect |  |
| level_of_detail_mode | Instant Preview Mode | base | no visible effect |  |
| softProof | Soft Proofing | base | no visible effect |  |
| gamutCheck | Out of Gamut Warnings | base | no visible effect |  |
| showStatusBar | Show Status Bar | base | no visible effect |  |
| view_show_canvas_only | Show Canvas Only | base | no visible effect |  |
| ruler_pixel_multiple2 | Use multiple of 2 for pixel scale | base | no visible effect |  |
| view_ruler | Show Rulers | base | no visible effect |  |
| rulers_track_mouse | Rulers Track Pointer | base | no visible effect |  |
| zoom_to_100pct | Zoom to 100% | base | no visible effect |  |
| view_zoom_in | Zoom In | base | message | Zoom: 133.3 % |
| view_zoom_out | Zoom Out | base | message | Zoom: 66.7 % |
| zoom_to_fit | Fit to View | base | message | Zoom: 396.5 % |
| zoom_to_fit_width | Fit to View Width | base | message | Zoom: 396.5 % |
| zoom_to_fit_height | Fit to View Height | base | message | Zoom: 5,592,358.0 % |
| toggle_zoom_to_fit | Toggle Fit to View | base | message | Zoom: 286.3 % |
| reset_display | Reset Display | base | message | Rotation: 0.0° /Horizontal mirroring: OFF /Zoom: 396.5 % Rotation: 0.0°  |
| settings_active_author | Active Author Profile | base | no visible effect |  |
| view_pixel_grid | Show Pixel Grid | base | no visible effect |  |
| toggle_fg_bg | Swap Foreground and Background Colors | base | changed layers/selection/history/view | colors |
| reset_fg_bg | Set Foreground and Background Colors to Black and White | base | changed layers/selection/history/view | colors |
| toggle_brush_outline | Toggle Brush Outline | base | no visible effect |  |
| filter_apply_again | Apply Filter Again | base | no visible effect |  |
| filter_apply_reprompt | Apply Filter Again (Reprompt) | base | no visible effect |  |
| adjust_filters | Adjust | base | no visible effect |  |
| krita_filter_asc-cdl | Slope, Offset, Power... | base | changed layers/selection/history/view | history |
| krita_filter_autocontrast | Auto Contrast | base | changed image | image+history |
| blur_filters | Blur | base | no visible effect |  |
| krita_filter_blur | Blur... | base | changed image | image+history |
| krita_filter_burn | Burn... | base | changed image | image+history |
| krita_filter_colorbalance | Color Balance... | base | changed layers/selection/history/view | history |
| color_filters | Colors | base | no visible effect |  |
| krita_filter_colortoalpha | Color to Alpha... | base | changed image | image+history |
| krita_filter_colortransfer | Color Transfer... | base | changed image | image+history |
| krita_filter_crosschannel | Cross-channel adjustment curves... | base | changed layers/selection/history/view | history |
| krita_filter_desaturate | Desaturate... | base | changed image | image+history |
| krita_filter_dodge | Dodge... | base | changed image | image+history |
| edge_filters | Edge Detection | base | no visible effect |  |
| krita_filter_edge detection | Edge Detection... | base | changed image | image+history |
| emboss_filters | Emboss | base | no visible effect |  |
| krita_filter_emboss | Emboss with Variable Depth... | base | changed image | image+history |
| krita_filter_emboss all directions | Emboss in All Directions | base | changed image | image+history |
| krita_filter_emboss horizontal and vertical | Emboss Horizontal  Vertical | base | changed image | image+history |
| krita_filter_emboss horizontal only | Emboss Horizontal Only | base | changed image | image+history |
| krita_filter_emboss laplascian | Emboss (Laplacian) | base | changed image | image+history |
| krita_filter_emboss vertical only | Emboss Vertical Only | base | changed image | image+history |
| krita_filter_fastcoloroverlay | Fast Color Overlay... | base | changed image | image+history |
| krita_filter_gaussian blur | Gaussian Blur... | base | changed image | image+history |
| krita_filter_gaussianhighpass | Gaussian High Pass... | base | changed image | image+history |
| enhance_filters | Enhance | base | no visible effect |  |
| krita_filter_gaussiannoisereducer | Gaussian Noise Reduction... | base | changed image | image+history |
| map_filters | Map | base | no visible effect |  |
| krita_filter_gradientmap | Gradient Map... | base | changed image | image+history |
| artistic_filters | Artistic | base | no visible effect |  |
| krita_filter_halftone | Halftone... | base | changed image | image+history |
| krita_filter_height to normal | Height to Normal Map... | base | changed image | image+history |
| krita_filter_hsvadjustment | HSV Adjustment... | base | changed layers/selection/history/view | history |
| krita_filter_indexcolors | Index Colors... | base | changed image | image+history |
| krita_filter_invert | Invert | base | changed image | image+history |
| krita_filter_lens blur | Lens Blur... | base | changed image | image+history |
| krita_filter_levels | Levels... | base | changed layers/selection/history/view | history |
| krita_filter_maximize | Maximize Channel | base | changed image | image+history |
| krita_filter_mean removal | Mean Removal | base | changed image | image+history |
| krita_filter_minimize | Minimize Channel | base | changed image | image+history |
| krita_filter_motion blur | Motion Blur... | base | changed image | image+history |
| other_filters | Other | base | no visible effect |  |
| krita_filter_noise | Random Noise... | base | changed image | image+history |
| krita_filter_normalize | Normalize | base | changed image | image+history |
| krita_filter_oilpaint | Oilpaint... | base | opened dialog | Filter: Oilpaint ; image+history |
| krita_filter_palettize | Palettize... | base | changed layers/selection/history/view | history |
| krita_filter_perchannel | Color Adjustment curves... | base | changed layers/selection/history/view | history |
| krita_filter_phongbumpmap | Phong Bumpmap... | base | changed image | image+history |
| krita_filter_pixelize | Pixelize... | base | changed image | image+history |
| krita_filter_posterize | Posterize... | base | changed image | image+history |
| krita_filter_propagatecolors | Propagate Colors... | base | changed image | image+history |
| krita_filter_raindrops | Raindrops... | base | changed image | image+history |
| krita_filter_randompick | Random Pick... | base | changed image | image+history |
| krita_filter_resettransparent | Reset Transparent | base | changed layers/selection/history/view | history |
| krita_filter_roundcorners | Round Corners... | base | changed layers/selection/history/view | history |
| krita_filter_sharpen | Sharpen | base | changed image | image+history |
| krita_filter_smalltiles | Small Tiles... | base | changed image | image+history |
| krita_filter_threshold | Threshold... | base | changed image | image+history |
| krita_filter_unsharp | Unsharp Mask... | base | changed image | image+history |
| krita_filter_wave | Wave... | base | changed image | image+history |
| krita_filter_waveletnoisereducer | Wavelet Noise Reducer... | base | changed image | image+history |
| edit_cut | Cut | base | changed image | image+history |
| edit_copy | Copy | base | no visible effect |  |
| edit_paste | Paste | base | changed image | image+layers+selection+history |
| copy_sharp | Copy (sharp) | base | no visible effect |  |
| cut_sharp | Cut (sharp) | base | changed image | image+history |
| paste_new | Paste into New Image | base | changed layers/selection/history/view | Zoom: 119.5 %/Zoom: 576.5 % |
| paste_at | Paste at Cursor | base | changed layers/selection/history/view | layers+selection+history |
| paste_into | Paste into Active Layer | base | changed image | image+layers+selection+history+enabledSet |
| paste_shape_style | Paste Shape Style | base | no visible effect |  |
| copy_merged | Copy merged | base | changed layers/selection/history/view | history |
| select_all | Select All | base | changed layers/selection/history/view | selection+history |
| deselect | Deselect | base | changed layers/selection/history/view | layers+selection+history |
| clear | Clear | base | changed image | image+history |
| reselect | Reselect | base | changed layers/selection/history/view | history |
| invert_selection | Invert Selection | base | changed layers/selection/history/view | selection+history |
| copy_selection_to_new_layer | Copy Selection to New Layer | base | changed image | image+layers+selection+history+activeNode |
| cut_selection_to_new_layer | Cut Selection to New Layer | base | changed layers/selection/history/view | layers+selection+history |
| fill_selection_foreground_color | Fill with Foreground Color | base | changed image | image+history |
| fill_selection_background_color | Fill with Background Color | base | changed image | image+history |
| fill_selection_pattern | Fill with Pattern | base | changed image | image+history |
| fill_selection_foreground_color_opacity | Fill with Foreground Color (Opacity) | base | changed image | image+history |
| fill_selection_background_color_opacity | Fill with Background Color (Opacity) | base | changed image | image+history |
| fill_selection_pattern_opacity | Fill with Pattern (Opacity) | base | changed image | image+history |
| stroke_shapes | Stroke selected shapes | vector | changed layers/selection/history/view | layers+history+enabledSet |
| toggle_display_selection | Display Selection | base | no visible effect |  |
| resizeimagetoselection | Trim to Selection | base | changed image | image+selection+history+docinfo |
| edit_selection | Edit Selection | base | no visible effect |  |
| convert_to_vector_selection | Convert to Vector Selection | base | changed layers/selection/history/view | history |
| convert_to_raster_selection | Convert to Raster Selection | base | message | Selection is already in a raster format  |
| convert_shapes_to_vector_selection | Convert Shapes to Vector Selection | vector | no visible effect |  |
| convert_selection_to_shape | Convert to Shape | vector | no visible effect |  |
| enable_sap | Enable Selection Actions Bar | base | no visible effect | enabledSet |
| configure_sap | Configure selection actions bar | base | disabled |  |
| toggle-selection-overlay-mode | Toggle Selection Display Mode | base | no visible effect |  |
| stroke_selection | Stroke Selection... | base | opened dialog | Stroke Selection Properties – Krita |
| view_show_guides | Show Guides | base | no visible effect |  |
| view_lock_guides | Lock Guides | base | no visible effect |  |
| view_snap_to_guides | Snap to Guides | base | no visible effect |  |
| show_snap_options_popup | Show Snap Options Popup | base | opened popup |  |
| view_snap_orthogonal | Snap Orthogonal | base | no visible effect |  |
| view_snap_node | Snap Node | base | no visible effect |  |
| view_snap_extension | Snap Extension | base | no visible effect |  |
| view_snap_intersection | Snap Intersection | base | no visible effect |  |
| view_snap_bounding_box | Snap Bounding Box | base | no visible effect |  |
| view_snap_image_bounds | Snap Image Bounds | base | no visible effect |  |
| view_snap_image_center | Snap Image Center | base | no visible effect |  |
| view_snap_to_pixel | Snap Pixel | base | no visible effect |  |
| flatten_image | Flatten image | base | changed layers/selection/history/view | layers+selection+history |
| merge_layer | Merge with Layer Below | base | changed layers/selection/history/view | layers+history+enabledSet |
| flatten_layer | Flatten Layer | base | changed layers/selection/history/view | layers+history |
| convert_group_to_animated | Convert Group to Animated Layer | group | changed layers/selection/history/view | layers+history+enabledSet |
| resizeimagetolayer | Trim to Current Layer | base | changed image | image+selection+history+docinfo |
| trim_to_image | Trim to Image Size | base | changed layers/selection/history/view | history |
| purge_unused_image_data | Purge Unused Image Data | base | changed layers/selection/history/view | history |
| layer_style | Layer Style... | base | opened dialog | Layer Styles – Krita |
| copy_layer_style | Copy Layer Style | base | no visible effect |  |
| paste_layer_style | Paste Layer Style | base | no visible effect |  |
| mirrorNodeX | Mirror Layers Horizontally | base | changed image | image+history |
| mirrorNodeY | Mirror Layers Vertically | base | changed image | image+history |
| mirrorAllNodesX | Mirror All Layers Horizontally | base | changed image | image+history |
| mirrorAllNodesY | Mirror All Layers Vertically | base | changed image | image+history |
| activateNextLayer | Activate next layer | base | no visible effect |  |
| activateNextSiblingLayer | Activate next sibling layer, skipping over groups. | base | no visible effect |  |
| activatePreviousLayer | Activate previous layer | base | no visible effect | enabledSet |
| activatePreviousSiblingLayer | Activate previous sibling layer, skipping over groups. | base | no visible effect | enabledSet |
| switchToPreviouslyActiveNode | Activate previously selected layer | base | no visible effect | enabledSet |
| duplicatelayer | Duplicate Layer or Mask | base | changed image | image+layers+history |
| copy_layer_clipboard | Copy Layer | base | no visible effect |  |
| cut_layer_clipboard | Cut Layer | base | changed image | image+layers+history+activeNode |
| paste_layer_from_clipboard | Paste Layer | base | changed image | image+layers+history |
| create_quick_group | Quick Group | group | changed layers/selection/history/view | layers+history |
| create_quick_clipping_group | Quick Clipping Group | group | changed layers/selection/history/view | layers+history+enabledSet |
| quick_ungroup | Quick Ungroup | group | changed layers/selection/history/view | layers+history+enabledSet |
| select_all_layers | All Layers | base | no visible effect |  |
| select_visible_layers | Visible Layers | base | no visible effect |  |
| select_locked_layers | Locked Layers | base | no visible effect |  |
| select_invisible_layers | Invisible Layers | base | no visible effect |  |
| select_unlocked_layers | Unlocked Layers | base | no visible effect |  |
| new_from_visible | New Layer From Visible | base | changed layers/selection/history/view | layers+history |
| pin_to_timeline | Pin to Timeline | anim | changed layers/selection/history/view | enabledSet+checked |
| add_new_paint_layer | Add Paint Layer | base | changed layers/selection/history/view | layers+history+enabledSet |
| add_new_group_layer | Add Group Layer | base | changed layers/selection/history/view | layers+history+enabledSet |
| add_new_clone_layer | Add Clone Layer | base | changed image | image+layers+history+enabledSet |
| add_new_shape_layer | Add Vector Layer | vector | changed layers/selection/history/view | layers |
| add_new_adjustment_layer | Add Filter Layer... | base | opened dialog | New Filter Layer – Krita ; history+enabledSet |
| add_new_fill_layer | Add Fill Layer... | base | crash |  |
| add_new_transparency_mask | Add Transparency Mask | mask | changed image | image+layers+selection+history |
| add_new_filter_mask | Add Filter Mask... | mask | opened dialog | New Filter Mask – Krita ; history+enabledSet |
| add_new_fast_color_overlay_mask | Add Color Overlay Mask | mask | crash |  |
| add_new_colorize_mask | Add Colorize Mask | mask | changed layers/selection/history/view | layers+history+enabledSet |
| add_new_transform_mask | Add Transform Mask | mask | changed layers/selection/history/view | layers+history+enabledSet |
| add_new_selection_mask | Add Local Selection | mask | changed layers/selection/history/view | layers+selection+history |
| convert_to_paint_layer | Convert to Paint Layer | vector | changed layers/selection/history/view | layers+history+enabledSet |
| convert_to_selection_mask | Convert to Selection Mask | mask | changed layers/selection/history/view | layers+history+activeNode |
| convert_to_filter_mask | Convert to Filter Mask... | mask | hang | New Filter Mask – Krita |
| convert_to_transparency_mask | Convert to Transparency Mask | base | changed image | image+layers+history+enabledSet |
| convert_to_animated | Convert to Animated Layer | anim | no visible effect |  |
| isolate_active_layer | Isolate Active Layer | base | no visible effect |  |
| isolate_active_group | Isolate Active Group | group | no visible effect |  |
| toggle_layer_visibility | Toggle layer visibility | base | changed image | image+layers+history |
| toggle_layer_lock | Toggle layer lock | base | changed layers/selection/history/view | layers+history |
| toggle_layer_inherit_alpha | Toggle layer alpha inheritance | base | changed layers/selection/history/view | history |
| toggle_layer_alpha_lock | Toggle layer alpha | base | changed layers/selection/history/view | layers+history |
| split_alpha_into_mask | Alpha into Mask | base | changed layers/selection/history/view | layers+history+enabledSet |
| image_properties | Properties... | base | opened dialog | Image Properties – Krita |
| image_color | Image Background Color and Transparency... | base | opened dialog | Select a Color ; history |
| view_grid | Show Grid | base | no visible effect |  |
| view_snap_to_grid | Snap To Grid | base | no visible effect |  |
| view_toggle_painting_assistants | Show Painting Assistants | base | no visible effect |  |
| view_toggle_assistant_previews | Show Assistant Previews | base | no visible effect |  |
| view_toggle_reference_images | Show Reference Images | base | no visible effect |  |
| force_palette_colors | Force Palette Colors | base | changed layers/selection/history/view | enabledSet+checked |
| make_brush_color_lighter | Make brush color lighter | base | changed layers/selection/history/view | colors |
| make_brush_color_darker | Make brush color darker | base | changed layers/selection/history/view | colors |
| make_brush_color_saturated | Make brush color more saturated | base | changed layers/selection/history/view | colors |
| make_brush_color_desaturated | Make brush color more desaturated | base | changed layers/selection/history/view | colors |
| shift_brush_color_clockwise | Shift brush color hue clockwise | base | changed layers/selection/history/view | colors |
| shift_brush_color_counter_clockwise | Shift brush color hue counter-clockwise | base | changed layers/selection/history/view | colors |
| make_brush_color_redder | Make brush color more red | base | changed layers/selection/history/view | colors |
| make_brush_color_greener | Make brush color more green | base | changed layers/selection/history/view | colors |
| make_brush_color_bluer | Make brush color more blue | base | changed layers/selection/history/view | colors |
| make_brush_color_yellower | Make brush color more yellow | base | changed layers/selection/history/view | colors |
| increase_opacity | Increase Opacity | base | message | Brush Opacity: 100% |
| decrease_opacity | Decrease Opacity | base | changed layers/selection/history/view | Brush Opacity: 90% ; brush |
| increase_flow | Increase Flow | vector | message | Flow: 100% |
| decrease_flow | Decrease Flow | vector | changed layers/selection/history/view | Flow: 90% ; brush |
| increase_fade | Increase Fade | base | message | Fade: 1 |
| decrease_fade | Decrease Fade | base | message | Fade: 0.9 |
| increase_scatter | Increase Scatter | base | message | Scatter: 19% |
| decrease_scatter | Decrease Scatter | base | message | Scatter: 9% |
| mirror_canvas | Mirror View | base | changed layers/selection/history/view | Horizontal mirroring: ON  ; enabledSet+checked |
| mirror_canvas_around_cursor | Mirror View Around Cursor | base | changed layers/selection/history/view | Horizontal mirroring: ON  ; enabledSet+checked |
| mirror_canvas_around_canvas | Mirror View Around Canvas | base | changed layers/selection/history/view | Horizontal mirroring: ON  ; enabledSet+checked |
| patterns | Patterns | base | opened popup |  |
| gradients | Gradients | base | opened popup |  |
| dual | Choose foreground and background colors | base | no visible effect |  |
| erase_action | Set eraser mode | base | no visible effect |  |
| eraser_preset_action | Toggle eraser preset | base | no visible effect |  |
| eraser_select_preset_action | Select eraser preset | base | no visible effect |  |
| brush_select_preset_action | Select brush preset | base | no visible effect |  |
| reload_preset_action | Reload Original Preset | base | changed layers/selection/history/view | brush |
| preserve_alpha | Preserve Alpha | base | no visible effect |  |
| mirrorX-hideDecorations | Hide Mirror X Line | base | no visible effect |  |
| mirrorX-lock | Lock X Line | base | no visible effect |  |
| mirrorX-moveToCenter | Move to Canvas Center X | base | no visible effect |  |
| mirrorY-hideDecorations | Hide Mirror Y Line | base | no visible effect |  |
| mirrorY-lock | Lock Y Line | base | no visible effect |  |
| mirrorY-moveToCenter | Move to Canvas Center Y | base | no visible effect |  |
| hmirror_action | Horizontal Mirror Tool | base | no visible effect |  |
| vmirror_action | Vertical Mirror Tool | base | no visible effect |  |
| Next Blending Mode | Next Blending Mode | base | changed layers/selection/history/view | brush |
| Previous Blending Mode | Previous Blending Mode | base | changed layers/selection/history/view | brush |
| Select Normal Blending Mode | Select Normal Blending Mode | base | no visible effect |  |
| Select Dissolve Blending Mode | Select Dissolve Blending Mode | base | changed layers/selection/history/view | brush |
| Select Behind Blending Mode | Select Behind Blending Mode | base | changed layers/selection/history/view | brush |
| Select Clear Blending Mode | Select Clear Blending Mode | base | no visible effect |  |
| Select Darken Blending Mode | Select Darken Blending Mode | base | changed layers/selection/history/view | brush |
| Select Multiply Blending Mode | Select Multiply Blending Mode | base | changed layers/selection/history/view | brush |
| Select Color Burn Blending Mode | Select Color Burn Blending Mode | base | changed layers/selection/history/view | brush |
| Select Linear Burn Blending Mode | Select Linear Burn Blending Mode | base | changed layers/selection/history/view | brush |
| Select Lighten Blending Mode | Select Lighten Blending Mode | base | changed layers/selection/history/view | brush |
| Select Screen Blending Mode | Select Screen Blending Mode | base | changed layers/selection/history/view | brush |
| Select Color Dodge Blending Mode | Select Color Dodge Blending Mode | base | changed layers/selection/history/view | brush |
| Select Linear Dodge Blending Mode | Select Linear Dodge Blending Mode | base | changed layers/selection/history/view | brush |
| Select Overlay Blending Mode | Select Overlay Blending Mode | base | changed layers/selection/history/view | brush |
| Select Hard Overlay Blending Mode | Select Hard Overlay Blending Mode | base | changed layers/selection/history/view | brush |
| Select Soft Light Blending Mode | Select Soft Light Blending Mode | base | changed layers/selection/history/view | brush |
| Select Hard Light Blending Mode | Select Hard Light Blending Mode | base | changed layers/selection/history/view | brush |
| Select Vivid Light Blending Mode | Select Vivid Light Blending Mode | base | changed layers/selection/history/view | brush |
| Select Linear Light Blending Mode | Select Linear Light Blending Mode | base | changed layers/selection/history/view | brush |
| Select Pin Light Blending Mode | Select Pin Light Blending Mode | base | changed layers/selection/history/view | brush |
| Select Hard Mix Blending Mode | Select Hard Mix Blending Mode | base | changed layers/selection/history/view | brush |
| Select Difference Blending Mode | Select Difference Blending Mode | base | changed layers/selection/history/view | brush |
| Select Exclusion Blending Mode | Select Exclusion Blending Mode | base | changed layers/selection/history/view | brush |
| Select Hue Blending Mode | Select Hue Blending Mode | base | changed layers/selection/history/view | brush |
| Select Saturation Blending Mode | Select Saturation Blending Mode | base | changed layers/selection/history/view | brush |
| Select Color Blending Mode | Select Color Blending Mode | base | changed layers/selection/history/view | brush |
| Select Luminosity Blending Mode | Select Luminosity Blending Mode | base | changed layers/selection/history/view | brush |
| composite_actions | Brush composite | base | no visible effect |  |
| brushslider1 | Brush option slider 1 | base | opened popup |  |
| brushslider2 | Brush option slider 2 | base | opened popup |  |
| brushslider3 | Brush option slider 3 | base | opened popup |  |
| brushslider4 | Brush option slider 4 | base | opened popup |  |
| brushslider5 | Brush option slider 5 | base | opened popup |  |
| next_favorite_preset | Next Favourite Preset | base | changed layers/selection/history/view | c) Pencil-2 selected ; brush |
| previous_favorite_preset | Previous Favourite Preset | base | message | b) Basic-5 Size Opacity selected |
| previous_preset | Switch to Previous Preset | base | message | c) Pencil-2 selected |
| show_brush_presets | Show Brush Presets | base | opened popup |  |
| mirror_actions | Mirror | base | no visible effect |  |
| workspaces | Workspaces | base | opened popup |  |
| show_brush_editor | Show Brush Editor | base | no visible effect |  |
| disable_pressure | Use Pen Pressure | base | no visible effect |  |
| paintops | Painter's Tools | base | no visible effect |  |
| chooseForegroundColor | Open Foreground color selector | base | opened dialog | Select a Color |
| chooseBackgroundColor | Open Background color selector | base | opened dialog | Select a Color |
| docker_box | Show Docker Box | base | opened popup |  |
| dockerBox | Docker Box | base | no visible effect |  |
| imagesize | Scale Image To New Size... | base | opened dialog | Scale To New Size – Krita |
| canvassize | Resize Canvas... | base | opened dialog | Resize Canvas – Krita |
| layersize | Scale Layers to new Size... | base | opened dialog | Resize Layer – Krita |
| scaleAllLayers | Scale All Layers to new Size... | base | opened dialog | Resize Layer – Krita |
| selectionscale | Scale... | base | opened dialog | Scale Selection – Krita |
| clones_array | Clones Array... | base | opened dialog | Create Clones Array – Krita |
| colorrange | Select from Color Range... | base | opened dialog | Color Range – Krita |
| selectopaque | Select Opaque (Replace) | base | changed layers/selection/history/view | selection+history |
| selectopaque_add | Select Opaque (Add) | base | changed layers/selection/history/view | selection+history |
| selectopaque_subtract | Select Opaque (Subtract) | base | changed layers/selection/history/view | selection+history |
| selectopaque_intersect | Select Opaque (Intersect) | base | changed layers/selection/history/view | selection+history |
| imagecolorspaceconversion | Convert Image Color Space... | base | opened dialog | Convert All Layers From RGB/Alpha (8-bit integer/channel) – Krita |
| layercolorspaceconversion | Convert Layer Color Space... | base | opened dialog | Convert Current Layer From RGB/Alpha (8-bit integer/channel) – Krita |
| unifylayerscolorspace | Unify Layers Color Space | base | changed layers/selection/history/view | history |
| imagesplit | Image Split | base | opened dialog | Image Split – Krita |
| layersplit | Split Layer... | base | opened dialog | Split Layer – Krita |
| growselection | Grow Selection... | base | opened dialog | Grow Selection – Krita |
| shrinkselection | Shrink Selection... | base | opened dialog | Shrink Selection – Krita |
| borderselection | Border Selection... | base | opened dialog | Border Selection – Krita |
| featherselection | Feather Selection... | base | opened dialog | Feather Selection – Krita |
| smoothselection | Smooth | base | changed layers/selection/history/view | selection+history |
| offsetimage | Offset Image... | base | opened dialog | Offset Image – Krita |
| offsetlayer | Offset Layers... | base | opened dialog | Offset Layer – Krita |
| LayerGroupSwitcher/previous | Move into previous group | group | changed image | image+layers+enabledSet |
| LayerGroupSwitcher/next | Move into next group | group | no visible effect |  |
| rotateimage | Rotate Image... | base | opened dialog | Rotate Image – Krita |
| rotateImageCW90 | Rotate Image 90° to the Right | base | changed image | image+selection+history+docinfo |
| rotateImage180 | Rotate Image 180° | base | changed image | image+selection+history |
| rotateImageCCW90 | Rotate Image 90° to the Left | base | changed image | image+selection+history+docinfo |
| mirrorImageHorizontal | Mirror Image Horizontally | base | changed image | image+selection+history |
| mirrorImageVertical | Mirror Image Vertically | base | changed image | image+selection+history |
| rotatelayer | Rotate Layers... | base | opened dialog | Rotate Layer – Krita |
| rotateLayer180 | Rotate Layers 180° | base | changed image | image+history |
| rotateLayerCW90 | Rotate Layers 90° to the Right | base | changed image | image+selection+history |
| rotateLayerCCW90 | Rotate Layers 90° to the Left | base | changed image | image+selection+history |
| rotateAllLayers | Rotate All Layers... | base | opened dialog | Rotate Layer – Krita |
| rotateAllLayersCW90 | Rotate All Layers 90° to the Right | base | changed image | image+selection+history |
| rotateAllLayersCCW90 | Rotate All Layers 90° to the Left | base | changed image | image+selection+history |
| rotateAllLayers180 | Rotate All Layers 180° | base | changed image | image+history |
| separate | Separate Image... | base | opened dialog | Separate Image – Krita |
| shearimage | Shear Image... | base | opened dialog | Shear Image – Krita |
| shearlayer | Shear Layers... | base | opened dialog | Shear Layer – Krita |
| shearAllLayers | Shear All Layers... | base | opened dialog | Shear Layer – Krita |
| waveletdecompose | Wavelet Decompose ... | base | opened dialog | WaveletDecompose – Krita |
| EditLayerMetaData | Edit metadata... | base | opened dialog |  |
| ZoomTool | Zoom Tool | base | changed layers/selection/history/view | enabledSet |
| KarbonCalligraphyTool | Calligraphy | base | changed layers/selection/history/view | enabledSet |
| calligraphy_increase_width | Calligraphy: increase width | vector | disabled |  |
| calligraphy_decrease_width | Calligraphy: decrease width | vector | disabled |  |
| calligraphy_increase_angle | Calligraphy: increase angle | vector | disabled |  |
| calligraphy_decrease_angle | Calligraphy: decrease angle | vector | disabled |  |
| KisToolSelectOutline | Freehand Selection Tool | base | changed layers/selection/history/view | enabledSet |
| increase_brush_size | Increase Brush Size | base | changed layers/selection/history/view | Brush Size: 22 px ; brush |
| decrease_brush_size | Decrease Brush Size | base | changed layers/selection/history/view | Brush Size: 18 px ; brush |
| rotate_brush_tip_clockwise | Rotate brush tip clockwise | base | no visible effect |  |
| rotate_brush_tip_clockwise_precise | Rotate brush tip clockwise (precise) | base | no visible effect |  |
| rotate_brush_tip_counter_clockwise | Rotate brush tip counter-clockwise | base | no visible effect |  |
| rotate_brush_tip_counter_clockwise_precise | Rotate brush tip counter-clockwise (precise) | base | no visible effect |  |
| selection_tool_mode_add | Selection Mode: Add | base | disabled |  |
| selection_tool_mode_replace | Selection Mode: Replace | base | disabled |  |
| selection_tool_mode_subtract | Selection Mode: Subtract | base | disabled |  |
| selection_tool_mode_intersect | Selection Mode: Intersect | base | disabled |  |
| PanTool | Pan Tool | base | changed layers/selection/history/view | enabledSet |
| InteractionTool | Select Shapes Tool | base | changed layers/selection/history/view | enabledSet |
| object_order_front | Bring to Front | vector | disabled |  |
| object_order_raise | Raise | vector | disabled |  |
| object_order_lower | Lower | vector | disabled |  |
| object_order_back | Send to Back | vector | disabled |  |
| object_align_horizontal_left | Align Left | vector | disabled |  |
| object_align_horizontal_center | Horizontally Center | vector | disabled |  |
| object_align_horizontal_right | Align Right | vector | disabled |  |
| object_align_vertical_top | Align Top | vector | disabled |  |
| object_align_vertical_center | Vertically Center | vector | disabled |  |
| object_align_vertical_bottom | Align Bottom | vector | disabled |  |
| object_distribute_horizontal_left | Distribute Left | vector | disabled |  |
| object_distribute_horizontal_center | Distribute Centers Horizontally | vector | disabled |  |
| object_distribute_horizontal_right | Distribute Right | vector | disabled |  |
| object_distribute_horizontal_gaps | Distribute Horizontal Gap | vector | disabled |  |
| object_distribute_vertical_top | Distribute Top | vector | disabled |  |
| object_distribute_vertical_center | Distribute Centers Vertically | vector | disabled |  |
| object_distribute_vertical_bottom | Distribute Bottom | vector | disabled |  |
| object_distribute_vertical_gaps | Distribute Vertical Gap | vector | disabled |  |
| object_group | Group | vector | disabled |  |
| object_ungroup | Ungroup | vector | disabled |  |
| object_transform_rotate_90_cw | Rotate 90° CW | vector | disabled |  |
| object_transform_rotate_90_ccw | Rotate 90° CCW | vector | disabled |  |
| object_transform_rotate_180 | Rotate 180° | vector | disabled |  |
| object_transform_mirror_horizontally | Mirror Horizontally | vector | disabled |  |
| object_transform_mirror_vertically | Mirror Vertically | vector | disabled |  |
| object_transform_reset | Reset Transformations | vector | disabled |  |
| object_unite | Unite | vector | disabled |  |
| object_intersect | Intersect | vector | disabled |  |
| object_subtract | Subtract | vector | disabled |  |
| object_split | Split | vector | disabled |  |
| text_type_preformatted | Convert Text To Preformatted | vector | disabled |  |
| text_type_pre_positioned | Convert Text To Pre-positioned | vector | disabled |  |
| text_type_inline_wrap | Convert Text To Inline Wrapped | vector | disabled |  |
| add_shape_to_flow_area | Flow Text in Shape | vector | disabled |  |
| subtract_shape_from_flow_area | Subtract Shape from Text Chain | vector | disabled |  |
| put_text_on_path | Put Text On Path | vector | disabled |  |
| remove_shapes_from_text_flow | Remove Shapes from Text Chain | vector | disabled |  |
| flow_shape_type_toggle | Toggle Flow Shape Type | vector | disabled |  |
| flow_shape_order_back | Set Flow Shape as Last | vector | disabled |  |
| flow_shape_order_earlier | Move Shape Earlier In Chain. | vector | disabled |  |
| flow_shape_order_later | Move Shape Later In Chain. | vector | disabled |  |
| flow_shape_order_front | Set Shape As First In Chain | vector | disabled |  |
| KritaShape/KisToolEllipse | Ellipse Tool | base | changed layers/selection/history/view |  |
| KisToolSelectRectangular | Rectangular Selection Tool | base | changed layers/selection/history/view | enabledSet |
| KritaShape/KisToolLine | Line Tool | base | changed layers/selection/history/view | enabledSet |
| KritaShape/KisToolKnife | Comic Panel Editing Tool | base | changed layers/selection/history/view | enabledSet |
| KisAssistantTool | Assistant Tool | base | changed layers/selection/history/view | enabledSet |
| KisToolSelectMagnetic | Magnetic Selection Tool | base | changed layers/selection/history/view | enabledSet |
| undo_polygon_selection | Undo Polygon Selection Points | base | disabled |  |
| KisToolSelectContiguous | Contiguous Selection Tool | base | changed layers/selection/history/view | enabledSet |
| KisToolSelectSimilar | Similar Color Selection Tool | base | changed layers/selection/history/view |  |
| KisToolTransform | Transform Tool | base | changed image | image+enabledSet |
| movetool-move-up | Move up | base | disabled |  |
| movetool-move-down | Move down | base | disabled |  |
| movetool-move-left | Move left | base | disabled |  |
| movetool-move-right | Move right | base | disabled |  |
| movetool-move-up-more | Move up more | base | disabled |  |
| movetool-move-down-more | Move down more | base | disabled |  |
| movetool-move-left-more | Move left more | base | disabled |  |
| movetool-move-right-more | Move right more | base | disabled |  |
| KisToolTransformFree | Transform Tool (Free Transform) | base | changed image | image+enabledSet |
| KisToolTransformPerspective | Transform Tool (Perspective Transform) | base | changed image | image+enabledSet |
| KisToolTransformWarp | Transform Tool (Warp Transform) | base | changed image | image+enabledSet |
| KisToolTransformCage | Transform Tool (Cage Transform) | base | changed image | image+enabledSet |
| KisToolTransformLiquify | Transform Tool (Liquify Transform) | base | changed image | image+enabledSet |
| KisToolTransformMesh | Transform Tool (Mesh Transform) | base | changed image | image+enabledSet |
| KritaTransform/KisToolMove | Move Tool | base | changed layers/selection/history/view | enabledSet |
| movetool-show-coordinates | Show Coordinates | base | disabled |  |
| KisToolPolygon | Polygon Tool | base | changed layers/selection/history/view | enabledSet |
| KritaShape/KisToolBrush | Freehand Brush Tool | base | no visible effect |  |
| set_no_brush_smoothing | Brush Smoothing: Disabled | base | disabled |  |
| set_simple_brush_smoothing | Brush Smoothing: Basic | base | disabled |  |
| set_weighted_brush_smoothing | Brush Smoothing: Weighted | base | disabled |  |
| set_stabilizer_brush_smoothing | Brush Smoothing: Stabilizer | base | disabled |  |
| set_pixel_perfect_smoothing | Brush Smoothing: Pixel | base | disabled |  |
| toggle_assistant | Toggle Snap To Assistants | base | disabled |  |
| KritaShape/KisToolDyna | Dynamic Brush Tool | base | changed layers/selection/history/view | enabledSet |
| KisToolPath | Bezier Curve Tool | base | changed layers/selection/history/view | enabledSet |
| KritaSelected/KisToolColorSampler | Color Sampler | base | changed layers/selection/history/view | enabledSet |
| KisToolPencil | Freehand Path Tool | base | changed layers/selection/history/view |  |
| SvgTextTool | Text Tool | base | changed layers/selection/history/view | enabledSet |
| svg_align_center | Align Center | vector | disabled |  |
| svg_align_justified | Align Block | vector | disabled |  |
| svg_align_left | Align Left | vector | disabled |  |
| svg_align_right | Align Right | vector | disabled |  |
| svg_decrease_font_size | Decrease Font Size | vector | disabled |  |
| svg_font_kerning | Kerning | vector | disabled |  |
| svg_format_italic | Italic | vector | disabled |  |
| svg_format_strike_through | Strikethrough | vector | disabled |  |
| svg_format_subscript | Subscript | vector | disabled |  |
| svg_format_superscript | Superscript | vector | disabled |  |
| svg_format_underline | Underline | vector | disabled |  |
| svg_increase_font_size | Increase Font Size | vector | disabled |  |
| svg_weight_black | Black | vector | disabled |  |
| svg_weight_bold | Bold | vector | disabled |  |
| svg_weight_demi | Demi | vector | disabled |  |
| svg_weight_light | Light | vector | disabled |  |
| svg_weight_normal | Normal | vector | disabled |  |
| svg_insert_special_character | Glyph Palette... | vector | disabled |  |
| svg_paste_rich_text | Paste Rich Text | vector | disabled |  |
| svg_paste_plain_text | Paste Plain Text | vector | disabled |  |
| svg_type_setting_move_selection_start_down_1_px | Move Text Selection Down By 1 Pixel | vector | disabled |  |
| svg_type_setting_move_selection_start_up_1_px | Move Text Selection Up By 1 Pixel | vector | disabled |  |
| svg_type_setting_move_selection_start_left_1_px | Move Text Selection Left By 1 Pixel | vector | disabled |  |
| svg_type_setting_move_selection_start_right_1_px | Move Text Selection Right By 1 Pixel | vector | disabled |  |
| svg_remove_transforms_from_range | Remove Character Transforms | vector | disabled |  |
| svg_clear_formatting | Clear Formatting | vector | disabled |  |
| KritaShape/KisToolLazyBrush | Colorize Mask Tool | base | changed layers/selection/history/view | enabledSet |
| KisToolSelectElliptical | Elliptical Selection Tool | base | changed layers/selection/history/view | enabledSet |
| KritaFill/KisToolGradient | Gradient Tool | base | changed layers/selection/history/view | enabledSet |
| KritaShape/KisToolMultiBrush | Multibrush Tool | base | changed layers/selection/history/view | enabledSet |
| KisToolEncloseAndFill | Enclose and Fill Tool | base | changed layers/selection/history/view | enabledSet |
| KritaShape/KisToolMeasure | Measurement Tool | base | changed layers/selection/history/view | enabledSet |
| KritaFill/KisToolFill | Fill Tool | base | changed layers/selection/history/view | enabledSet |
| KisToolSelectPolygonal |  | base | changed layers/selection/history/view | enabledSet |
| KritaShape/KisToolRectangle | Rectangle Tool | base | changed layers/selection/history/view | enabledSet |
| KisToolSelectPath | Bezier Curve Selection Tool | base | changed layers/selection/history/view | enabledSet |
| KritaShape/KisToolSmartPatch | Smart Patch Tool | base | changed layers/selection/history/view | enabledSet |
| KisToolCrop | Crop Tool | base | changed image | image+selection+history+docinfo+enabledSet |
| KisToolPolyline | Polyline Tool | base | changed layers/selection/history/view |  |
| PathTool | Edit Shapes Tool | base | changed layers/selection/history/view | enabledSet |
| pathpoint-corner | Corner point | vector | disabled |  |
| pathpoint-smooth | Smooth point | vector | disabled |  |
| pathpoint-symmetric | Symmetric Point | vector | disabled |  |
| pathpoint-curve | Make curve point | vector | disabled |  |
| pathpoint-line | Make line point | vector | disabled |  |
| pathsegment-line | Segment to Line | vector | disabled |  |
| pathsegment-curve | Segment to Curve | vector | disabled |  |
| pathpoint-insert | Insert point | vector | disabled |  |
| pathpoint-remove | Remove point | vector | disabled |  |
| path-break-point | Break at point | vector | disabled |  |
| path-break-segment | Break at segment | vector | disabled |  |
| path-break-selection | Break at selection | vector | disabled |  |
| pathpoint-join | Join with segment | vector | disabled |  |
| pathpoint-merge | Merge points | vector | disabled |  |
| convert-to-path | To Path | vector | disabled |  |
| edit_undo | Undo  | base | changed layers/selection/history/view | history |
| edit_redo | Redo  | base | no visible effect |  |
| save_incremental_version | Save Incremental Version | base | opened dialog | Saving As |
| save_incremental_backup | Save Incremental Backup | base | opened dialog | Saving As |
| tablet_debugger | Toggle Tablet Debugger | base | opened dialog | Krita |
| create_template | Create Template From Image... | base | opened dialog | Create Template – Krita |
| create_copy | Create Copy From Current Image | base | changed layers/selection/history/view | Zoom: 100.0 %/Zoom: 59.3 %/Zoom: 286.3 % ; enabledSet |
| open_resources_directory | Open Resources Folder | base | no visible effect |  |
| view_print_size | View Print Size | base | no visible effect |  |
| paste_as_reference | Paste as Reference Image | base | changed layers/selection/history/view | layers+history+enabledSet |
| save_groups_as_images | Save Group Layers... | group | opened dialog | Krita |
| save_node_as_image | Save Layer/Mask... | base | opened dialog | Export "Layer 2" |
| save_vector_node_to_svg | Save Vector Layer as SVG... | vector | opened dialog | Export to SVG |
| create_reference_image_from_active_layer | Reference Image from Layer | base | changed layers/selection/history/view | layers+history+enabledSet |
| create_reference_image_from_visible_canvas | Reference Image from Visible | base | changed layers/selection/history/view | layers+history+enabledSet |
| add_new_file_layer | Add File Layer... | base | opened dialog | Krita |
| convert_to_file_layer | Convert to File Layer... | base | opened dialog | Save layers to... |
| split_alpha_write | Write as Alpha | base | crash |  |
| split_alpha_save_merged | Save Merged... | base | crash |  |
| import_layer_from_file | Import Layer... | base | opened dialog | Import Image |
| import_layer_as_paint_layer | as Paint Layer... | base | opened dialog | Import Image |
| import_layer_as_transparency_mask | as Transparency Mask... | base | opened dialog | Import Image |
| import_layer_as_filter_mask | as Filter Mask... | base | opened dialog | Import Image |
| import_layer_as_selection_mask | as Selection Mask... | base | opened dialog | Import Image |
| manage_bundles | Manage Resource Libraries... | base | opened dialog | Manage Resource Libraries – Krita |
| manage_resources | Manage Resources... | base | opened dialog | Manage Resources – Krita |
| ToolReferenceImages | Reference Images Tool | base | changed layers/selection/history/view | enabledSet |
| file_new | New | base | opened dialog | Create new document |
| file_open | Open… | base | opened dialog | Open Images |
| file_quit | Quit | base | opened dialog | Krita |
| options_configure_toolbars | Configure Toolbars… | base | opened dialog | Configure Toolbars |
| fullscreen | Full Screen Mode | base | changed layers/selection/history/view | enabledSet+checked |
| file_open_recent | Open Recent | base | disabled |  |
| file_save | Save | base | opened dialog | Saving As |
| file_save_as | Save As… | base | opened dialog | Saving As |
| file_import_animation | Import animation frames... | base | opened dialog | Krita |
| file_import_video_animation | Import video animation... | base | opened dialog | Krita |
| render_animation | Render Animation... | anim | opened dialog | Render Animation – Krita |
| render_animation_again | Render Animation Again | anim | no visible effect |  |
| file_close_all | Close All | base | opened dialog | Krita |
| file_import_file | Open existing Document as Untitled Document... | base | opened dialog | Import Images |
| file_export_file | Export... | base | opened dialog | Exporting |
| file_export_advanced | Export Advanced... | base | opened dialog | Exporting |
| file_documentinfo | Document Information | base | opened dialog | Document Information |
| theme_menu | Themes | base | no visible effect |  |
| view_toggledockers | Show Dockers | base | no visible effect |  |
| reset_configurations | Reset All Settings | base | opened dialog | Krita |
| view_detached_canvas | Detach Canvas | base | no visible effect |  |
| view_toggledockertitlebars | Show Docker Titlebars | base | no visible effect |  |
| settings_dockers_menu | Dockers | base | no visible effect |  |
| window | Window | base | no visible effect |  |
| style_menu | Styles | base | no visible effect |  |
| windows_cascade | Cascade | base | no visible effect |  |
| windows_tile | Tile | base | no visible effect |  |
| windows_next | Next | base | no visible effect |  |
| windows_previous | Previous | base | no visible effect |  |
| view_newwindow | New Window | base | opened dialog |  |
| file_close | Close | base | opened dialog | Krita |
| file_sessions | Sessions... | base | opened dialog | Sessions |
| command_bar_open | Search Actions | base | opened popup |  |
| options_configure | Configure Krita... | base | opened dialog | Configure Krita ; enabledSet |
| expanding_spacer_0 | Expanding Spacer | base | no visible effect |  |
| expanding_spacer_1 | Expanding Spacer | base | no visible effect |  |
| lock_toolbars | Lock Toolbars | base | no visible effect |  |
| help_contents | Krita Handbook | base | no visible effect |  |
| switch_application_language | Switch Application Language... | base | opened dialog | Switch Application Language |
| help_about_app | About Krita | base | opened dialog | About Krita |
| help_about_kde | About KDE | base | opened dialog | About KDE |
| mainToolBar | Hide File Toolbar | base | changed layers/selection/history/view | enabledSet+checked |
| editToolBar | Hide Edit Toolbar | base | changed layers/selection/history/view | enabledSet+checked |
| BrushesAndStuff | Hide Brushes and Stuff Toolbar | base | changed layers/selection/history/view | enabledSet+checked |
| customToolBar1 | Hide Custom toolbar 1 Toolbar | base | changed layers/selection/history/view | enabledSet+checked |
| customToolBar2 | Hide Custom toolbar 2 Toolbar | base | changed layers/selection/history/view | enabledSet+checked |

## T1. Tools

| tool | option window | picture | raster gesture | vector gesture | overlay px (raster/vector) | messages | outcome |
|---|---|---|---|---|---|---|---|
| ZoomTool | 260x720 | ok | - | - | 0/0 | Zoom: 133.3 % / Zoom: 133.3 % | message |
| KarbonCalligraphyTool | 260x720 | ok | image+layers+history | image+history | 1/2 |  | changed image/layers/history |
| KisToolSelectOutline | 260x720 | ok | selection+history | selection+history | 1/1 |  | changed selection/history |
| PanTool | 260x720 | ok | - | - | 1/1 |  | overlay only |
| InteractionTool | 260x720 | ok | - | - | 0/2 | This tool only works on vector layers. You probably want the move tool. | overlay only |
| KritaShape/KisToolEllipse | 260x720 | ok | image+history | image+history | 5/5 | Width: 0 px Height: 0 px / Width: 20 px Height: 15 px / Width: 40 px Height: 30 px | changed image/history |
| KisToolSelectRectangular | 260x720 | ok | selection+history | selection+history | 4/3 | Width: 0 px Height: 0 px / Width: 20 px Height: 15 px / Width: 40 px Height: 30 px | changed selection/history |
| KritaShape/KisToolLine | 260x720 | ok | image+history | image+history | 5/5 | Length: 0.0 px / Length: 25.0 px / Length: 50.0 px | changed image/history |
| KritaShape/KisToolKnife | 260x720 | ok | - | - | 0/3 | This tool only works on vector layers. You probably want to create a vector layer and a starting shape first. | overlay only |
| KisAssistantTool | 260x720 | ok | - | history | 2/3 |  | changed history (but intermittent hang, see note) |
| KisToolSelectMagnetic | 260x720 | ok | selection+history | selection+history | 1/1 |  | changed selection/history |
| KisToolSelectContiguous | 260x720 | ok | selection+history | selection+history | 0/0 |  | changed selection/history |
| KisToolSelectSimilar | 260x720 | ok | selection+history | selection+history | 0/0 |  | changed selection/history |
| KisToolTransform | 260x720 | ok | image+selection+history | image+selection+history | 4/4 |  | changed image/selection/history |
| KritaTransform/KisToolMove | 260x720 | ok | image+selection | image | 0/0 |  | changed image/selection |
| KisToolPolygon | 260x720 | ok | image+history | image+history | 3/3 |  | changed image/history |
| KritaShape/KisToolBrush | 260x720 | ok | image+history | - | 3/1 | The brush tool cannot paint on this layer.  Please select a paint layer or mask. | changed image/history |
| KritaShape/KisToolDyna | 260x720 | ok | image+history | - | 3/1 | The brush tool cannot paint on this layer.  Please select a paint layer or mask. | changed image/history |
| KisToolPath | 260x720 | ok | image+history | image | 11/12 |  | changed image/history |
| KritaSelected/KisToolColorSampler | 260x720 | ok | colors | colors | 1/1 |  | changed colors |
| KisToolPencil | 260x720 | ok | image+history | image+history | 2/2 |  | changed image/history |
| SvgTextTool | 260x720 | ok | image+layers+history | image+history | 7/7 |  | changed image/layers/history |
| KritaShape/KisToolLazyBrush | 260x720 | ok | image+layers+history | image+layers+history | 1/1 |  | changed image/layers/history |
| KisToolSelectElliptical | 260x720 | ok | selection+history | selection+history | 4/3 | Width: 0 px Height: 0 px / Width: 20 px Height: 15 px / Width: 40 px Height: 30 px | changed selection/history |
| ToolReferenceImages | 260x720 | same as previous | - | - | 0/0 |  | no visible effect |
| KritaFill/KisToolGradient | 260x720 | ok | image+history | - | 4/4 |  | changed image/history |
| KritaShape/KisToolMultiBrush | 260x720 | ok | image+history | - | 4/1 | The brush tool cannot paint on this layer.  Please select a paint layer or mask. | changed image/history |
| KisToolEncloseAndFill | 260x720 | ok | history | - | 1/0 | You cannot use this tool with the selected layer type | changed history |
| KritaShape/KisToolMeasure | 260x720 | ok | - | - | 4/3 | 25.0 px 36.9° / 50.0 px 36.9° / 75.0 px 36.9° | overlay only |
| KritaFill/KisToolFill | 260x720 | ok | image+history | - | 0/0 | You cannot use this tool with the selected layer type | changed image/history |
| KisToolSelectPolygonal | 260x720 | ok | selection+history | selection+history | 1/3 |  | changed selection/history |
| KritaShape/KisToolRectangle | 260x720 | ok | image+history | image+history | 5/5 | Width: 0 px Height: 0 px / Width: 20 px Height: 15 px / Width: 40 px Height: 30 px | changed image/history |
| KisToolSelectPath | 260x720 | ok | selection+history | selection+history | 5/5 |  | changed selection/history |
| KritaShape/KisToolSmartPatch | 260x720 | ok | image+history | - | 3/2 | Select a paint layer to use this tool | changed image/history |
| KisToolCrop | 260x720 | ok | image+docinfo+selection | image+docinfo+selection | 4/3 | Width: 1 px Height: 1 px / Width: 20 px Height: 15 px / Width: 40 px Height: 30 px | changed image/docinfo/selection |
| KisToolPolyline | 260x720 | ok | image+history | image+history | 5/5 |  | changed image/history |
| PathTool | 260x720 | ok | - | - | 3/6 |  | overlay only |

## D1. Dockers

| docker | title | open ms | size | colours | click repaint | outcome | picture |
|---|---|---|---|---|---|---|---|
| LogDocker | Log Viewer | 352 | 260x227 | 5 | 1 | opens, repaints on click | dockers/LogDocker.png |
| AnimationCurvesDocker | Animation Curves | 352 | 516x195 | 46 | 0 | opens, no repaint on click | dockers/AnimationCurvesDocker.png |
| ArrangeDocker | Arrange | 302 | 260x100 | 38 | 0 | opens, no repaint on click | dockers/ArrangeDocker.png |
| ArtisticColorSelector | Artistic Color Selector | 410 | 200x101 | 375 | 1 | opens, repaints on click | dockers/ArtisticColorSelector.png |
| BrushHudDocker | On-Canvas Brush Editor | 507 | 240x118 | 79 | 0 | opens, no repaint on click | dockers/BrushHudDocker.png |
| ChannelDocker | Channels | 479 | 260x195 | 15 | 2 | opens, repaints on click | dockers/ChannelDocker.png |
| ColorSelectorNg | Advanced Color Selector | 456 | 200x100 | 1157 | 1 | opens, repaints on click | dockers/ColorSelectorNg.png |
| CompositionDocker | Compositions | 2265 | 288x221 | 16 | 0 | opens, no repaint on click | dockers/CompositionDocker.png |
| DigitalMixer | Digital Colors Mixer | 358 | 312x167 | 794 | 0 | opens, no repaint on click | dockers/DigitalMixer.png |
| GamutMask | Gamut Masks | 506 | 260x275 | 45 | 0 | opens, no repaint on click | dockers/GamutMask.png |
| GridDocker | Grid and Guides | 362 | 315x539 | 102 | 1 | opens, repaints on click | dockers/GridDocker.png |
| HistogramDocker | Histogram | 404 | 200x100 | 14 | 0 | opens, no repaint on click | dockers/HistogramDocker.png |
| History | Undo History | 353 | 258x193 | 72 | 1 | opens, repaints on click | dockers/History.png |
| KisLayerBox | Layers | 452 | 308x291 | 87 | 1 | opens, repaints on click | dockers/KisLayerBox.png |
| OnionSkinsDocker | Onion Skins | 460 | 569x362 | 113 | 1 | opens, repaints on click | dockers/OnionSkinsDocker.png |
| OverviewDocker | Overview | 352 | 200x112 | 128 | 0 | opens, no repaint on click | dockers/OverviewDocker.png |
| PaletteDocker | Palette | 463 | 286x264 | 39 | 0 | opens, no repaint on click | dockers/PaletteDocker.png |
| PatternDocker | Patterns | 611 | 260x313 | 369 | 0 | opens, no repaint on click | dockers/PatternDocker.png |
| PresetDocker | Brush Presets | 611 | 741x100 | 577 | 1 | opens, repaints on click | dockers/PresetDocker.png |
| PresetHistory | Brush Preset History | 356 | 258x193 | 32 | 1 | opens, repaints on click | dockers/PresetHistory.png |
| Snapshot | Snapshot Docker | 412 | 260x224 | 6 | 0 | opens, no repaint on click | dockers/Snapshot.png |
| SpecificColorSelector | Specific Color Selector | 354 | 272x202 | 367 | 0 | opens, no repaint on click | dockers/SpecificColorSelector.png |
| StoryboardDocker | Storyboard | 405 | 265x196 | 23 | 0 | opens, no repaint on click | dockers/StoryboardDocker.png |
| SvgSymbolCollectionDocker | Symbol Libraries | 352 | 260x226 | 21 | 0 | opens, no repaint on click | dockers/SvgSymbolCollectionDocker.png |
| TasksetDocker | Task Sets | 372 | 323x224 | 7 | 0 | opens, no repaint on click | dockers/TasksetDocker.png |
| TextProperties | Text Properties | 8240 | 200x101 | 125 | 1 | opens, repaints on click | dockers/TextProperties.png |
| TimelineDocker | Animation Timeline | 505 | 258x193 | 62 | 1 | opens, repaints on click | dockers/TimelineDocker.png |
| TouchDocker | Touch Docker | 409 | 200x258 | 21 | 0 | opens, no repaint on click | dockers/TouchDocker.png |

## M1. Krita menu entries versus the page

Columns: `page menu` = the page's own menu offers it directly; `search` = only through Search Krita Actions (Ctrl+Enter); `works` = outcome from the action sweep.

| Krita menu path | text | action | page menu | search | works |
|---|---|---|---|---|---|
| File | New | file_new | File > New… |  | opened dialog |
| File | Open… | file_open | File > Open… |  | opened dialog |
| File | Open Recent | file_open_recent | File > Open Recent… |  | disabled |
| File | Save | file_save | File > Save as .kra |  | opened dialog |
| File | Save As… | file_save_as | - | search only | opened dialog |
| File | file_reload_file | file_reload_file | - | not in engine | n/a |
| File | Sessions... | file_sessions | - | search only | opened dialog |
| File | Open existing Document as Untitled Document... | file_import_file | - | search only | opened dialog |
| File | Export... | file_export_file | File > Export… |  | opened dialog |
| File | Export Advanced... | file_export_advanced | - | search only | opened dialog |
| File | file_export_pdf | file_export_pdf | - | not in engine | n/a |
| File | Import animation frames... | file_import_animation | - | search only | opened dialog |
| File | Import video animation... | file_import_video_animation | - | search only | opened dialog |
| File | Render Animation... | render_animation | - | search only | opened dialog |
| File | Save Incremental Version | save_incremental_version | - | search only | opened dialog |
| File | Save Incremental Backup | save_incremental_backup | - | search only | opened dialog |
| File | Create Template From Image... | create_template | - | search only | opened dialog |
| File | Create Copy From Current Image | create_copy | - | search only | changed layers/selection/history/view |
| File | Document Information | file_documentinfo | - | search only | opened dialog |
| File | Close | file_close | - | search only | opened dialog |
| File | Close All | file_close_all | - | search only | opened dialog |
| File | Quit | file_quit | - | search only | opened dialog |
| Edit | Undo  | edit_undo | Edit > Undo |  | changed layers/selection/history/view |
| Edit | Redo  | edit_redo | Edit > Redo |  | no visible effect |
| Edit | Cut | edit_cut | - | search only | changed image |
| Edit | Copy | edit_copy | - | search only | no visible effect |
| Edit | Cut (sharp) | cut_sharp | - | search only | changed image |
| Edit | Copy (sharp) | copy_sharp | - | search only | no visible effect |
| Edit | Copy merged | copy_merged | - | search only | changed layers/selection/history/view |
| Edit | Copy Layer Style | copy_layer_style | - | search only | no visible effect |
| Edit | Paste | edit_paste | - | search only | changed image |
| Edit | Paste at Cursor | paste_at | - | search only | changed layers/selection/history/view |
| Edit | Paste into Active Layer | paste_into | - | search only | changed image |
| Edit | Paste into New Image | paste_new | - | search only | changed layers/selection/history/view |
| Edit | Paste as Reference Image | paste_as_reference | - | search only | changed layers/selection/history/view |
| Edit | Paste Shape Style | paste_shape_style | - | search only | no visible effect |
| Edit | Paste Layer Style | paste_layer_style | - | search only | no visible effect |
| Edit | Clear | clear | Edit > Clear |  | changed image |
| Edit | Fill with Foreground Color | fill_selection_foreground_color | Edit > Fill with Foreground Color |  | changed image |
| Edit | Fill with Background Color | fill_selection_background_color | Edit > Fill with Background Color |  | changed image |
| Edit | Fill with Pattern | fill_selection_pattern | - | search only | changed image |
| Edit > Fill Special | Fill with Foreground Color (Opacity) | fill_selection_foreground_color_opacity | - | search only | changed image |
| Edit > Fill Special | Fill with Background Color (Opacity) | fill_selection_background_color_opacity | - | search only | changed image |
| Edit > Fill Special | Fill with Pattern (Opacity) | fill_selection_pattern_opacity | - | search only | changed image |
| Edit | Stroke selected shapes | stroke_shapes | - | search only | changed layers/selection/history/view |
| Edit | Stroke Selection... | stroke_selection | - | search only | opened dialog |
| Edit | delete | delete | - | not in engine | n/a |
| Edit | Sample Screen Color | sample_screen_color | - | not in engine | n/a |
| Edit | Sample Screen Color (Sample Real Canvas) | sample_screen_color_real_canvas | - | not in engine | n/a |
| Edit | revert | revert | - | not in engine | n/a |
| View | Show Canvas Only | view_show_canvas_only | View > Canvas Only |  | no visible effect |
| View | Full Screen Mode | fullscreen | - | search only | changed layers/selection/history/view |
| View | Detach Canvas | view_detached_canvas | - | search only | no visible effect |
| View | Wrap Around Mode | wrap_around_mode | - | search only | no visible effect |
| View > Wrap Around Mode Direction | Wrap Around Both Directions | wrap_around_hv_axis | - | search only | no visible effect |
| View > Wrap Around Mode Direction | Wrap Around Horizontally | wrap_around_h_axis | - | search only | no visible effect |
| View > Wrap Around Mode Direction | Wrap Around Vertically | wrap_around_v_axis | - | search only | no visible effect |
| View | Instant Preview Mode | level_of_detail_mode | - | search only | no visible effect |
| View | Soft Proofing | softProof | - | search only | no visible effect |
| View | Out of Gamut Warnings | gamutCheck | - | search only | no visible effect |
| View > Zoom, Rotate, and Mirror | Zoom In | view_zoom_in | View > Zoom In |  | message |
| View > Zoom, Rotate, and Mirror | Zoom Out | view_zoom_out | View > Zoom Out |  | message |
| View > Zoom, Rotate, and Mirror | Zoom to 100% | zoom_to_100pct | View > Zoom to 100% |  | no visible effect |
| View > Zoom, Rotate, and Mirror | Fit to View | zoom_to_fit | View > Fit Page |  | message |
| View > Zoom, Rotate, and Mirror | Fit to View Width | zoom_to_fit_width | - | search only | message |
| View > Zoom, Rotate, and Mirror | Fit to View Height | zoom_to_fit_height | - | search only | message |
| View > Zoom, Rotate, and Mirror | Rotate Canvas Right | rotate_canvas_right | View > Rotate Clockwise |  | message |
| View > Zoom, Rotate, and Mirror | Rotate Canvas Left | rotate_canvas_left | View > Rotate Counterclockwise |  | message |
| View > Zoom, Rotate, and Mirror | Reset Canvas Rotation | reset_canvas_rotation | View > Reset Rotation |  | message |
| View > Zoom, Rotate, and Mirror | Mirror View | mirror_canvas | View > Mirror View |  | changed layers/selection/history/view |
| View > Zoom, Rotate, and Mirror | Mirror View Around Cursor | mirror_canvas_around_cursor | - | search only | changed layers/selection/history/view |
| View > Zoom, Rotate, and Mirror | Mirror View Around Canvas | mirror_canvas_around_canvas | - | search only | changed layers/selection/history/view |
| View > Zoom, Rotate, and Mirror | Reset Display | reset_display | - | search only | message |
| View | View Print Size | view_print_size | - | search only | no visible effect |
| View | Show Rulers | view_ruler | View > Show Rulers |  | no visible effect |
| View | Rulers Track Pointer | rulers_track_mouse | - | search only | no visible effect |
| View | Show Guides | view_show_guides | View > ✓ Show Guides |  | no visible effect |
| View | Lock Guides | view_lock_guides | View > Lock Guides |  | no visible effect |
| View | Show Status Bar | showStatusBar | - | search only | no visible effect |
| View | Show Grid | view_grid | View > Show Grid |  | no visible effect |
| View | Show Pixel Grid | view_pixel_grid | - | search only | no visible effect |
| View > Snap To | Snap to Guides | view_snap_to_guides | View > Snap To Guides |  | no visible effect |
| View > Snap To | Snap To Grid | view_snap_to_grid | View > Snap To Grid |  | no visible effect |
| View > Snap To | Snap Pixel | view_snap_to_pixel | - | search only | no visible effect |
| View > Snap To | Snap Orthogonal | view_snap_orthogonal | - | search only | no visible effect |
| View > Snap To | Snap Node | view_snap_node | - | search only | no visible effect |
| View > Snap To | Snap Extension | view_snap_extension | - | search only | no visible effect |
| View > Snap To | Snap Intersection | view_snap_intersection | - | search only | no visible effect |
| View > Snap To | Snap Bounding Box | view_snap_bounding_box | - | search only | no visible effect |
| View > Snap To | Snap Image Bounds | view_snap_image_bounds | View > Snap To Image Bounds |  | no visible effect |
| View > Snap To | Snap Image Center | view_snap_image_center | View > Snap To Image Center |  | no visible effect |
| View | Show Painting Assistants | view_toggle_painting_assistants | - | search only | no visible effect |
| View | Show Assistant Previews | view_toggle_assistant_previews | - | search only | no visible effect |
| View | Show Reference Images | view_toggle_reference_images | - | search only | no visible effect |
| View | view_palette_action_menu | view_palette_action_menu | - | not in engine | n/a |
| View | refresh_canvas | refresh_canvas | - | not in engine | n/a |
| Image | Properties... | image_properties | - | search only | opened dialog |
| Image | Image Background Color and Transparency... | image_color | - | search only | opened dialog |
| Image | Convert Image Color Space... | imagecolorspaceconversion | Image > Convert Image Color Space… |  | opened dialog |
| Image | duplicate_image | duplicate_image | - | not in engine | n/a |
| Image | Trim to Image Size | trim_to_image | - | search only | changed layers/selection/history/view |
| Image | Trim to Current Layer | resizeimagetolayer | - | search only | changed image |
| Image | Trim to Selection | resizeimagetoselection | Image > Trim to Current Selection |  | changed image |
| Image | Purge Unused Image Data | purge_unused_image_data | - | search only | changed layers/selection/history/view |
| Image | Scale Image To New Size... | imagesize | Image > Scale Image To New Size… |  | opened dialog |
| Image | imageresolution | imageresolution | - | not in engine | n/a |
| Image | Resize Canvas... | canvassize | Image > Resize Canvas… |  | opened dialog |
| Image > Rotate | Rotate Image... | rotateimage | Image > Rotate Image › Custom… |  | opened dialog |
| Image > Rotate | Rotate Image 90° to the Right | rotateImageCW90 | Image > Rotate Image › 90° Right |  | changed image |
| Image > Rotate | Rotate Image 90° to the Left | rotateImageCCW90 | Image > Rotate Image › 90° Left |  | changed image |
| Image > Rotate | Rotate Image 180° | rotateImage180 | Image > Rotate Image › 180° |  | changed image |
| Image | Shear Image... | shearimage | - | search only | opened dialog |
| Image | Mirror Image Horizontally | mirrorImageHorizontal | Image > Mirror Image Horizontally |  | changed image |
| Image | Mirror Image Vertically | mirrorImageVertical | Image > Mirror Image Vertically |  | changed image |
| Image | Offset Image... | offsetimage | - | search only | opened dialog |
| Image | Image Split | imagesplit | - | search only | opened dialog |
| Image | Wavelet Decompose ... | waveletdecompose | - | search only | opened dialog |
| Image | Separate Image... | separate | - | search only | opened dialog |
| Layer | Cut Layer | cut_layer_clipboard | - | search only | changed image |
| Layer | Copy Layer | copy_layer_clipboard | - | search only | no visible effect |
| Layer | Paste Layer | paste_layer_from_clipboard | - | search only | changed image |
| Layer > New | Add Paint Layer | add_new_paint_layer | Layer > New Paint Layer |  | changed layers/selection/history/view |
| Layer > New | Add Group Layer | add_new_group_layer | Layer > New Group Layer |  | changed layers/selection/history/view |
| Layer > New | Add Clone Layer | add_new_clone_layer | - | search only | changed image |
| Layer > New | Add Vector Layer | add_new_shape_layer | - | search only | changed layers/selection/history/view |
| Layer > New | Add Filter Layer... | add_new_adjustment_layer | - | search only | opened dialog |
| Layer > New | Add Fill Layer... | add_new_fill_layer | - | search only | crash |
| Layer > New | Add File Layer... | add_new_file_layer | - | search only | opened dialog |
| Layer > New | Add Transparency Mask | add_new_transparency_mask | - | search only | changed image |
| Layer > New | Add Filter Mask... | add_new_filter_mask | - | search only | opened dialog |
| Layer > New | Add Colorize Mask | add_new_colorize_mask | - | search only | changed layers/selection/history/view |
| Layer > New | Add Transform Mask | add_new_transform_mask | - | search only | changed layers/selection/history/view |
| Layer > New | Add Local Selection | add_new_selection_mask | - | search only | changed layers/selection/history/view |
| Layer > New | New Layer From Visible | new_from_visible | - | search only | changed layers/selection/history/view |
| Layer > New | Duplicate Layer or Mask | duplicatelayer | Layer > Duplicate Layer or Mask |  | changed image |
| Layer > New | Cut Selection to New Layer | cut_selection_to_new_layer | - | search only | changed layers/selection/history/view |
| Layer > New | Copy Selection to New Layer | copy_selection_to_new_layer | - | search only | changed image |
| Layer > Import/Export | Save Layer/Mask... | save_node_as_image | - | search only | opened dialog |
| Layer > Import/Export | Save Vector Layer as SVG... | save_vector_node_to_svg | - | search only | opened dialog |
| Layer > Import/Export | Save Group Layers... | save_groups_as_images | - | search only | opened dialog |
| Layer > Import/Export | Import Layer... | import_layer_from_file | - | search only | opened dialog |
| Layer > Import/Export > Import | as Paint Layer... | import_layer_as_paint_layer | - | search only | opened dialog |
| Layer > Import/Export > Import | as Transparency Mask... | import_layer_as_transparency_mask | - | search only | opened dialog |
| Layer > Import/Export > Import | as Filter Mask... | import_layer_as_filter_mask | - | search only | opened dialog |
| Layer > Import/Export > Import | as Selection Mask... | import_layer_as_selection_mask | - | search only | opened dialog |
| Layer > Convert | Convert to Paint Layer | convert_to_paint_layer | - | search only | changed layers/selection/history/view |
| Layer > Convert | Convert to Transparency Mask | convert_to_transparency_mask | - | search only | changed image |
| Layer > Convert | Convert to Filter Mask... | convert_to_filter_mask | - | search only | hang |
| Layer > Convert | Convert to Selection Mask | convert_to_selection_mask | - | search only | changed layers/selection/history/view |
| Layer > Convert | Convert to File Layer... | convert_to_file_layer | - | search only | opened dialog |
| Layer > Convert | Convert Group to Animated Layer | convert_group_to_animated | - | search only | changed layers/selection/history/view |
| Layer > Convert | Convert Layer Color Space... | layercolorspaceconversion | - | search only | opened dialog |
| Layer > Select | All Layers | select_all_layers | - | search only | no visible effect |
| Layer > Select | Visible Layers | select_visible_layers | - | search only | no visible effect |
| Layer > Select | Invisible Layers | select_invisible_layers | - | search only | no visible effect |
| Layer > Select | Locked Layers | select_locked_layers | - | search only | no visible effect |
| Layer > Select | Unlocked Layers | select_unlocked_layers | - | search only | no visible effect |
| Layer > Group | Quick Group | create_quick_group | - | search only | changed layers/selection/history/view |
| Layer > Group | Quick Clipping Group | create_quick_clipping_group | - | search only | changed layers/selection/history/view |
| Layer > Group | Quick Ungroup | quick_ungroup | - | search only | changed layers/selection/history/view |
| Layer > Transform | Scale Layers to new Size... | layersize | - | search only | opened dialog |
| Layer > Transform | Mirror Layers Horizontally | mirrorNodeX | - | search only | changed image |
| Layer > Transform | Mirror Layers Vertically | mirrorNodeY | - | search only | changed image |
| Layer > Transform > Rotate | Rotate Layers... | rotatelayer | - | search only | opened dialog |
| Layer > Transform > Rotate | Rotate Layers 90° to the Right | rotateLayerCW90 | - | search only | changed image |
| Layer > Transform > Rotate | Rotate Layers 90° to the Left | rotateLayerCCW90 | - | search only | changed image |
| Layer > Transform > Rotate | Rotate Layers 180° | rotateLayer180 | - | search only | changed image |
| Layer > Transform | Shear Layers... | shearlayer | - | search only | opened dialog |
| Layer > Transform | Offset Layers... | offsetlayer | - | search only | opened dialog |
| Layer > Transform All Layers | Mirror All Layers Horizontally | mirrorAllNodesX | - | search only | changed image |
| Layer > Transform All Layers | Mirror All Layers Vertically | mirrorAllNodesY | - | search only | changed image |
| Layer > Transform All Layers | Scale All Layers to new Size... | scaleAllLayers | - | search only | opened dialog |
| Layer > Transform All Layers > Rotate | Rotate All Layers... | rotateAllLayers | - | search only | opened dialog |
| Layer > Transform All Layers > Rotate | Rotate All Layers 90° to the Right | rotateAllLayersCW90 | - | search only | changed image |
| Layer > Transform All Layers > Rotate | Rotate All Layers 90° to the Left | rotateAllLayersCCW90 | - | search only | changed image |
| Layer > Transform All Layers > Rotate | Rotate All Layers 180° | rotateAllLayers180 | - | search only | changed image |
| Layer > Transform All Layers | Shear All Layers... | shearAllLayers | - | search only | opened dialog |
| Layer > Split > Split Alpha | Alpha into Mask | split_alpha_into_mask | - | search only | changed layers/selection/history/view |
| Layer > Split > Split Alpha | Write as Alpha | split_alpha_write | - | search only | crash |
| Layer > Split > Split Alpha | Save Merged... | split_alpha_save_merged | - | search only | crash |
| Layer > Split | Split Layer... | layersplit | - | search only | opened dialog |
| Layer > Split | Clones Array... | clones_array | - | search only | opened dialog |
| Layer | Edit metadata... | EditLayerMetaData | - | search only | opened dialog |
| Layer | Histogram... | histogram | - | not in engine | n/a |
| Layer | Merge with Layer Below | merge_layer | Layer > Merge with Layer Below |  | changed layers/selection/history/view |
| Layer | Flatten Layer | flatten_layer | - | search only | changed layers/selection/history/view |
| Layer | merge_all_shape_layers | merge_all_shape_layers | - | not in engine | n/a |
| Layer | Flatten image | flatten_image | Image > Flatten Image |  | changed layers/selection/history/view |
| Layer | merge_selected_layers | merge_selected_layers | - | not in engine | n/a |
| Layer | Layer Style... | layer_style | - | search only | opened dialog |
| Select | Select All | select_all | Select > Select All |  | changed layers/selection/history/view |
| Select | Deselect | deselect | Select > Deselect |  | changed layers/selection/history/view |
| Select | Reselect | reselect | - | search only | changed layers/selection/history/view |
| Select | Invert Selection | invert_selection | Select > Invert Selection |  | changed layers/selection/history/view |
| Select | Scale... | selectionscale | - | search only | opened dialog |
| Select | Edit Selection | edit_selection | - | search only | no visible effect |
| Select | Convert to Vector Selection | convert_to_vector_selection | - | search only | changed layers/selection/history/view |
| Select | Convert to Raster Selection | convert_to_raster_selection | - | search only | message |
| Select | Convert Shapes to Vector Selection | convert_shapes_to_vector_selection | - | search only | no visible effect |
| Select | Convert to Shape | convert_selection_to_shape | - | search only | no visible effect |
| Select | feather | feather | - | not in engine | n/a |
| Select | similar | similar | - | not in engine | n/a |
| Select | Display Selection | toggle_display_selection | - | search only | no visible effect |
| Select | Show Global Selection Mask | show-global-selection-mask | - | not in engine | n/a |
| Select | Select from Color Range... | colorrange | - | search only | opened dialog |
| Select > Select Opaque | Select Opaque (Replace) | selectopaque | - | search only | changed layers/selection/history/view |
| Select > Select Opaque | Select Opaque (Add) | selectopaque_add | - | search only | changed layers/selection/history/view |
| Select > Select Opaque | Select Opaque (Subtract) | selectopaque_subtract | - | search only | changed layers/selection/history/view |
| Select > Select Opaque | Select Opaque (Intersect) | selectopaque_intersect | - | search only | changed layers/selection/history/view |
| Select | Feather Selection... | featherselection | - | search only | opened dialog |
| Select | Grow Selection... | growselection | - | search only | opened dialog |
| Select | Shrink Selection... | shrinkselection | - | search only | opened dialog |
| Select | Border Selection... | borderselection | - | search only | opened dialog |
| Select | Smooth | smoothselection | - | search only | changed layers/selection/history/view |
| Select | Enable Selection Actions Bar | enable_sap | - | search only | no visible effect |
| Select | Configure selection actions bar | configure_sap | - | search only | disabled |
| Filter | Apply Filter Again | filter_apply_again | - | search only | no visible effect |
| Filter | Apply Filter Again (Reprompt) | filter_apply_reprompt | - | search only | no visible effect |
| Filter | filter_gallery | filter_gallery | Filter > Filters… |  | n/a |
| Filter | Adjust | adjust_filters | - | search only | no visible effect |
| Filter | Artistic | artistic_filters | - | search only | no visible effect |
| Filter | Blur | blur_filters | - | search only | no visible effect |
| Filter | Colors | color_filters | - | search only | no visible effect |
| Filter | decor_filters | decor_filters | - | not in engine | n/a |
| Filter | Edge Detection | edge_filters | - | search only | no visible effect |
| Filter | Emboss | emboss_filters | - | search only | no visible effect |
| Filter | Enhance | enhance_filters | - | search only | no visible effect |
| Filter | Map | map_filters | - | search only | no visible effect |
| Filter | nonphotorealistic_filters | nonphotorealistic_filters | - | not in engine | n/a |
| Filter | Other | other_filters | - | search only | no visible effect |
| Filter | Start G'MIC-Qt | QMic | - | not in engine | n/a |
| Filter | Re-apply the last G'MIC filter | QMicAgain | - | not in engine | n/a |
| Settings | Configure Krita... | options_configure | Settings > Configure Krita… |  | opened dialog |
| Settings | Change Interface Scale... | change_interface_scale | - | not in engine | n/a |
| Settings | Manage Resource Libraries... | manage_bundles | - | search only | opened dialog |
| Settings | Manage Resources... | manage_resources | - | search only | opened dialog |
| Settings | Get More Resources... | manage_supporter_bundles | - | not in engine | n/a |
| Settings | Manage Supporter Benefits... | manage_donations | - | not in engine | n/a |
| Settings | Manage Subscriptions... | manage_subscriptions | - | not in engine | n/a |
| Settings | Configure Toolbars… | options_configure_toolbars | - | search only | opened dialog |
| Settings | Lock Toolbars | lock_toolbars | - | search only | no visible effect |
| Settings | Show Dockers | view_toggledockers | - | search only | no visible effect |
| Settings | Dockers | settings_dockers_menu | - | search only | no visible effect |
| Settings | Themes | theme_menu | - | search only | no visible effect |
| Settings | Styles | style_menu | - | search only | no visible effect |
| Settings | Switch Application Language... | switch_application_language | - | search only | opened dialog |
| Settings | Active Author Profile | settings_active_author | - | search only | no visible effect |
| Settings | Reset All Settings | reset_configurations | - | search only | opened dialog |
| Help | Krita Handbook | help_contents | - | search only | no visible effect |
| Help | help_whats_this | help_whats_this | - | not in engine | n/a |
| Help | help_show_tip | help_show_tip | - | not in engine | n/a |
| Help | Report Bug... | help_report_bug | - | not in engine | n/a |
| Help | Show Krita log for bug reports. | buginfo | - | not in engine | n/a |
| Help | Show system information for bug reports. | sysinfo | - | not in engine | n/a |
| Help | Show color management information | color_management_report | - | not in engine | n/a |
| Help | Show Android log for bug reports. | logcatdump | - | not in engine | n/a |
| Help | Show crash log for bug reports. | crashlog | - | not in engine | n/a |
| Help | About Krita | help_about_app | - | search only | opened dialog |
| Help | About KDE | help_about_kde | - | search only | opened dialog |
| Layer | Scale Layers to new Size... | layersize | - | search only | opened dialog |
| Help | Show Krita log for bug reports. | buginfo | - | not in engine | n/a |
| Help | Show system information for bug reports. | sysinfo | - | not in engine | n/a |
| Layer | Clones Array... | clones_array | - | search only | opened dialog |
| Select | Select Opaque (Replace) | selectopaque | - | search only | changed layers/selection/history/view |
| Layer | Convert Layer Color Space... | layercolorspaceconversion | - | search only | opened dialog |
| Tools | Explore Resources Cache Database... | dbexplorer | - | not in engine | n/a |
| Layer | Split Layer... | layersplit | - | search only | opened dialog |
| Layer | Offset Layers... | offsetlayer | - | search only | opened dialog |
| Edit > Resources | import | import | - | not in engine | n/a |
| Edit > Resources | createbundle | createbundle | - | not in engine | n/a |
| Edit > Resources | managebundles | managebundles | - | not in engine | n/a |
| Image > Rotate | Mirror Image Horizontally | mirrorImageHorizontal | Image > Mirror Image Horizontally |  | changed image |
| Image > Rotate | Mirror Image Vertically | mirrorImageVertical | Image > Mirror Image Vertically |  | changed image |
| Layer > Rotate | Rotate Layers... | rotatelayer | - | search only | opened dialog |
| Layer > Rotate | Rotate Layers 90° to the Right | rotateLayerCW90 | - | search only | changed image |
| Layer > Rotate | Rotate Layers 90° to the Left | rotateLayerCCW90 | - | search only | changed image |
| Layer > Rotate | Rotate Layers 180° | rotateLayer180 | - | search only | changed image |
| Edit | Sample Screen Color | sample_screen_color | - | not in engine | n/a |
| Edit | Sample Screen Color (Sample Real Canvas) | sample_screen_color_real_canvas | - | not in engine | n/a |
| Layer | Shear Layers... | shearlayer | - | search only | opened dialog |
| Layer | Wavelet Decompose ... | waveletdecompose | - | search only | opened dialog |
| Edit | edit_select_all | edit_select_all | - | not in engine | n/a |
| Edit | edit_deselect | edit_deselect | - | not in engine | n/a |
| Edit | edit_find | edit_find | - | not in engine | n/a |
| Edit | edit_find_next | edit_find_next | - | not in engine | n/a |
| Edit | edit_find_prev | edit_find_prev | - | not in engine | n/a |
| Edit | edit_replace | edit_replace | - | not in engine | n/a |
| View | Zoom Out | view_zoom_out | View > Zoom Out |  | message |
| View | Zoom In | view_zoom_in | View > Zoom In |  | message |
| Settings | Settings... | svg_settings | - | not in engine | n/a |
| Filter > Adjust | Slope, Offset, Power... | krita_filter_asc-cdl | - | search only | changed layers/selection/history/view |
| Filter > Colors | Minimize Channel | krita_filter_minimize | - | search only | changed image |
| Filter > Colors | Color Transfer... | krita_filter_colortransfer | - | search only | changed image |
| Filter > Colors | Fast Color Overlay... | krita_filter_fastcoloroverlay | - | search only | changed image |
| Filter > Enhance | Sharpen | krita_filter_sharpen | - | search only | changed image |
| Filter > Colors | Color to Alpha... | krita_filter_colortoalpha | - | search only | changed image |
| Filter > Adjust | Desaturate... | krita_filter_desaturate | - | search only | changed image |
| Filter > Adjust | Dodge... | krita_filter_dodge | - | search only | changed image |
| Filter > Emboss | Emboss Horizontal Only | krita_filter_emboss horizontal only | - | search only | changed image |
| Filter > Edge Detection | Gaussian High Pass... | krita_filter_gaussianhighpass | - | search only | changed image |
| Filter > Other | Reset Transparent | krita_filter_resettransparent | - | search only | changed layers/selection/history/view |
| Filter > Adjust | Cross-channel adjustment curves... | krita_filter_crosschannel | - | search only | changed layers/selection/history/view |
| Filter > Artistic | Halftone... | krita_filter_halftone | - | search only | changed image |
| Filter > Artistic | Posterize... | krita_filter_posterize | - | search only | changed image |
| Filter > Artistic | Raindrops... | krita_filter_raindrops | - | search only | changed image |
| Filter > Artistic | Index Colors... | krita_filter_indexcolors | - | search only | changed image |
| Filter > Artistic | Oilpaint... | krita_filter_oilpaint | - | search only | opened dialog |
| Filter > Colors | Maximize Channel | krita_filter_maximize | - | search only | changed image |
| Filter > Other | Random Noise... | krita_filter_noise | - | search only | changed image |
| Filter > Blur | Gaussian Blur... | krita_filter_gaussian blur | - | search only | changed image |
| Filter > Map | Small Tiles... | krita_filter_smalltiles | - | search only | changed image |
| Filter > Edge Detection | Height to Normal Map... | krita_filter_height to normal | - | search only | changed image |
| Filter > Adjust | Levels... | krita_filter_levels | - | search only | changed layers/selection/history/view |
| Filter > Adjust | Color Balance... | krita_filter_colorbalance | - | search only | changed layers/selection/history/view |
| Filter > Adjust | HSV Adjustment... | krita_filter_hsvadjustment | - | search only | changed layers/selection/history/view |
| Filter > Blur | Blur... | krita_filter_blur | - | search only | changed image |
| Filter > Blur | Motion Blur... | krita_filter_motion blur | - | search only | changed image |
| Filter > Enhance | Mean Removal | krita_filter_mean removal | - | search only | changed image |
| Filter > Enhance | Unsharp Mask... | krita_filter_unsharp | - | search only | changed image |
| Filter > Other | Wave... | krita_filter_wave | - | search only | changed image |
| Filter > Map | Gradient Map... | krita_filter_gradientmap | - | search only | changed image |
| Filter > Map | Phong Bumpmap... | krita_filter_phongbumpmap | - | search only | changed image |
| Filter > Enhance | Wavelet Noise Reducer... | krita_filter_waveletnoisereducer | - | search only | changed image |
| Filter > Map | Palettize... | krita_filter_palettize | - | search only | changed layers/selection/history/view |
| Filter > Emboss | Emboss Vertical Only | krita_filter_emboss vertical only | - | search only | changed image |
| Filter > Adjust | Burn... | krita_filter_burn | - | search only | changed image |
| Filter > Emboss | Emboss with Variable Depth... | krita_filter_emboss | - | search only | changed image |
| Filter > Adjust | Color Adjustment curves... | krita_filter_perchannel | - | search only | changed layers/selection/history/view |
| Filter > Enhance | Gaussian Noise Reduction... | krita_filter_gaussiannoisereducer | - | search only | changed image |
| Filter > Map | Round Corners... | krita_filter_roundcorners | - | search only | changed layers/selection/history/view |
| Filter > Edge Detection | Edge Detection... | krita_filter_edge detection | - | search only | changed image |
| Filter > Colors | Propagate Colors... | krita_filter_propagatecolors | - | search only | changed image |
| Filter > Emboss | Emboss (Laplacian) | krita_filter_emboss laplascian | - | search only | changed image |
| Filter > Artistic | Pixelize... | krita_filter_pixelize | - | search only | changed image |
| Filter > Map | Normalize | krita_filter_normalize | - | search only | changed image |
| Filter > Blur | Lens Blur... | krita_filter_lens blur | - | search only | changed image |
| Filter > Adjust | Threshold... | krita_filter_threshold | - | search only | changed image |
| Filter > Emboss | Emboss in All Directions | krita_filter_emboss all directions | - | search only | changed image |
| Filter > Other | Random Pick... | krita_filter_randompick | - | search only | changed image |
| Filter > Emboss | Emboss Horizontal  Vertical | krita_filter_emboss horizontal and vertical | - | search only | changed image |
| Filter > Adjust | Auto Contrast | krita_filter_autocontrast | - | search only | changed image |
| Filter > Adjust | Invert | krita_filter_invert | - | search only | changed image |

## M2. Menu entries the page lacks, prioritised (works first, core menus first)

| priority | Krita menu path | text | action | engine outcome |
|---|---|---|---|---|
| add | Edit | Cut | edit_cut | changed image |
| add | Edit | Cut (sharp) | cut_sharp | changed image |
| add | Edit | Copy merged | copy_merged | changed layers/selection/history/view |
| add | Edit | Paste | edit_paste | changed image |
| add | Edit | Paste at Cursor | paste_at | changed layers/selection/history/view |
| add | Edit | Paste into Active Layer | paste_into | changed image |
| add | Edit | Paste into New Image | paste_new | changed layers/selection/history/view |
| add | Edit | Paste as Reference Image | paste_as_reference | changed layers/selection/history/view |
| add | Edit | Fill with Pattern | fill_selection_pattern | changed image |
| add | Edit > Fill Special | Fill with Foreground Color (Opacity) | fill_selection_foreground_color_opacity | changed image |
| add | Edit > Fill Special | Fill with Background Color (Opacity) | fill_selection_background_color_opacity | changed image |
| add | Edit > Fill Special | Fill with Pattern (Opacity) | fill_selection_pattern_opacity | changed image |
| add | Edit | Stroke selected shapes | stroke_shapes | changed layers/selection/history/view |
| add | Edit | Stroke Selection... | stroke_selection | opened dialog |
| add | Image | Properties... | image_properties | opened dialog |
| add | Image | Image Background Color and Transparency... | image_color | opened dialog |
| add | Image | Trim to Image Size | trim_to_image | changed layers/selection/history/view |
| add | Image | Trim to Current Layer | resizeimagetolayer | changed image |
| add | Image | Purge Unused Image Data | purge_unused_image_data | changed layers/selection/history/view |
| add | Image | Shear Image... | shearimage | opened dialog |
| add | Image | Offset Image... | offsetimage | opened dialog |
| add | Image | Image Split | imagesplit | opened dialog |
| add | Image | Wavelet Decompose ... | waveletdecompose | opened dialog |
| add | Image | Separate Image... | separate | opened dialog |
| add | Layer | Cut Layer | cut_layer_clipboard | changed image |
| add | Layer | Paste Layer | paste_layer_from_clipboard | changed image |
| add | Layer > New | Add Clone Layer | add_new_clone_layer | changed image |
| add | Layer > New | Add Vector Layer | add_new_shape_layer | changed layers/selection/history/view |
| add | Layer > New | Add Filter Layer... | add_new_adjustment_layer | opened dialog |
| add | Layer > New | Add File Layer... | add_new_file_layer | opened dialog |
| add | Layer > New | Add Transparency Mask | add_new_transparency_mask | changed image |
| add | Layer > New | Add Filter Mask... | add_new_filter_mask | opened dialog |
| add | Layer > New | Add Colorize Mask | add_new_colorize_mask | changed layers/selection/history/view |
| add | Layer > New | Add Transform Mask | add_new_transform_mask | changed layers/selection/history/view |
| add | Layer > New | Add Local Selection | add_new_selection_mask | changed layers/selection/history/view |
| add | Layer > New | New Layer From Visible | new_from_visible | changed layers/selection/history/view |
| add | Layer > New | Cut Selection to New Layer | cut_selection_to_new_layer | changed layers/selection/history/view |
| add | Layer > New | Copy Selection to New Layer | copy_selection_to_new_layer | changed image |
| add | Layer > Import/Export | Save Layer/Mask... | save_node_as_image | opened dialog |
| add | Layer > Import/Export | Save Vector Layer as SVG... | save_vector_node_to_svg | opened dialog |
| add | Layer > Import/Export | Save Group Layers... | save_groups_as_images | opened dialog |
| add | Layer > Import/Export | Import Layer... | import_layer_from_file | opened dialog |
| add | Layer > Import/Export > Import | as Paint Layer... | import_layer_as_paint_layer | opened dialog |
| add | Layer > Import/Export > Import | as Transparency Mask... | import_layer_as_transparency_mask | opened dialog |
| add | Layer > Import/Export > Import | as Filter Mask... | import_layer_as_filter_mask | opened dialog |
| add | Layer > Import/Export > Import | as Selection Mask... | import_layer_as_selection_mask | opened dialog |
| add | Layer > Convert | Convert to Paint Layer | convert_to_paint_layer | changed layers/selection/history/view |
| add | Layer > Convert | Convert to Transparency Mask | convert_to_transparency_mask | changed image |
| add | Layer > Convert | Convert to Selection Mask | convert_to_selection_mask | changed layers/selection/history/view |
| add | Layer > Convert | Convert to File Layer... | convert_to_file_layer | opened dialog |
| add | Layer > Convert | Convert Group to Animated Layer | convert_group_to_animated | changed layers/selection/history/view |
| add | Layer > Convert | Convert Layer Color Space... | layercolorspaceconversion | opened dialog |
| add | Layer > Group | Quick Group | create_quick_group | changed layers/selection/history/view |
| add | Layer > Group | Quick Clipping Group | create_quick_clipping_group | changed layers/selection/history/view |
| add | Layer > Group | Quick Ungroup | quick_ungroup | changed layers/selection/history/view |
| add | Layer > Transform | Scale Layers to new Size... | layersize | opened dialog |
| add | Layer > Transform | Mirror Layers Horizontally | mirrorNodeX | changed image |
| add | Layer > Transform | Mirror Layers Vertically | mirrorNodeY | changed image |
| add | Layer > Transform > Rotate | Rotate Layers... | rotatelayer | opened dialog |
| add | Layer > Transform > Rotate | Rotate Layers 90° to the Right | rotateLayerCW90 | changed image |
| add | Layer > Transform > Rotate | Rotate Layers 90° to the Left | rotateLayerCCW90 | changed image |
| add | Layer > Transform > Rotate | Rotate Layers 180° | rotateLayer180 | changed image |
| add | Layer > Transform | Shear Layers... | shearlayer | opened dialog |
| add | Layer > Transform | Offset Layers... | offsetlayer | opened dialog |
| add | Layer > Transform All Layers | Mirror All Layers Horizontally | mirrorAllNodesX | changed image |
| add | Layer > Transform All Layers | Mirror All Layers Vertically | mirrorAllNodesY | changed image |
| add | Layer > Transform All Layers | Scale All Layers to new Size... | scaleAllLayers | opened dialog |
| add | Layer > Transform All Layers > Rotate | Rotate All Layers... | rotateAllLayers | opened dialog |
| add | Layer > Transform All Layers > Rotate | Rotate All Layers 90° to the Right | rotateAllLayersCW90 | changed image |
| add | Layer > Transform All Layers > Rotate | Rotate All Layers 90° to the Left | rotateAllLayersCCW90 | changed image |
| add | Layer > Transform All Layers > Rotate | Rotate All Layers 180° | rotateAllLayers180 | changed image |
| add | Layer > Transform All Layers | Shear All Layers... | shearAllLayers | opened dialog |
| add | Layer > Split > Split Alpha | Alpha into Mask | split_alpha_into_mask | changed layers/selection/history/view |
| add | Layer > Split | Split Layer... | layersplit | opened dialog |
| add | Layer > Split | Clones Array... | clones_array | opened dialog |
| add | Layer | Edit metadata... | EditLayerMetaData | opened dialog |
| add | Layer | Flatten Layer | flatten_layer | changed layers/selection/history/view |
| add | Layer | Layer Style... | layer_style | opened dialog |
| add | Select | Reselect | reselect | changed layers/selection/history/view |
| add | Select | Scale... | selectionscale | opened dialog |
| add | Select | Convert to Vector Selection | convert_to_vector_selection | changed layers/selection/history/view |
| add | Select | Convert to Raster Selection | convert_to_raster_selection | message |
| add | Select | Select from Color Range... | colorrange | opened dialog |
| add | Select > Select Opaque | Select Opaque (Replace) | selectopaque | changed layers/selection/history/view |
| add | Select > Select Opaque | Select Opaque (Add) | selectopaque_add | changed layers/selection/history/view |
| add | Select > Select Opaque | Select Opaque (Subtract) | selectopaque_subtract | changed layers/selection/history/view |
| add | Select > Select Opaque | Select Opaque (Intersect) | selectopaque_intersect | changed layers/selection/history/view |
| add | Select | Feather Selection... | featherselection | opened dialog |
| add | Select | Grow Selection... | growselection | opened dialog |
| add | Select | Shrink Selection... | shrinkselection | opened dialog |
| add | Select | Border Selection... | borderselection | opened dialog |
| add | Select | Smooth | smoothselection | changed layers/selection/history/view |
| add | Layer | Scale Layers to new Size... | layersize | opened dialog |
| add | Layer | Clones Array... | clones_array | opened dialog |
| add | Select | Select Opaque (Replace) | selectopaque | changed layers/selection/history/view |
| add | Layer | Convert Layer Color Space... | layercolorspaceconversion | opened dialog |
| add | Layer | Split Layer... | layersplit | opened dialog |
| add | Layer | Offset Layers... | offsetlayer | opened dialog |
| add | Layer > Rotate | Rotate Layers... | rotatelayer | opened dialog |
| add | Layer > Rotate | Rotate Layers 90° to the Right | rotateLayerCW90 | changed image |
| add | Layer > Rotate | Rotate Layers 90° to the Left | rotateLayerCCW90 | changed image |
| add | Layer > Rotate | Rotate Layers 180° | rotateLayer180 | changed image |
| add | Layer | Shear Layers... | shearlayer | opened dialog |
| add | Layer | Wavelet Decompose ... | waveletdecompose | opened dialog |
| add | View | Full Screen Mode | fullscreen | changed layers/selection/history/view |
| add | View > Zoom, Rotate, and Mirror | Fit to View Width | zoom_to_fit_width | message |
| add | View > Zoom, Rotate, and Mirror | Fit to View Height | zoom_to_fit_height | message |
| add | View > Zoom, Rotate, and Mirror | Mirror View Around Cursor | mirror_canvas_around_cursor | changed layers/selection/history/view |
| add | View > Zoom, Rotate, and Mirror | Mirror View Around Canvas | mirror_canvas_around_canvas | changed layers/selection/history/view |
| add | View > Zoom, Rotate, and Mirror | Reset Display | reset_display | message |
| add | Filter > Adjust | Slope, Offset, Power... | krita_filter_asc-cdl | changed layers/selection/history/view |
| add | Filter > Colors | Minimize Channel | krita_filter_minimize | changed image |
| add | Filter > Colors | Color Transfer... | krita_filter_colortransfer | changed image |
| add | Filter > Colors | Fast Color Overlay... | krita_filter_fastcoloroverlay | changed image |
| add | Filter > Enhance | Sharpen | krita_filter_sharpen | changed image |
| add | Filter > Colors | Color to Alpha... | krita_filter_colortoalpha | changed image |
| add | Filter > Adjust | Desaturate... | krita_filter_desaturate | changed image |
| add | Filter > Adjust | Dodge... | krita_filter_dodge | changed image |
| add | Filter > Emboss | Emboss Horizontal Only | krita_filter_emboss horizontal only | changed image |
| add | Filter > Edge Detection | Gaussian High Pass... | krita_filter_gaussianhighpass | changed image |
| add | Filter > Other | Reset Transparent | krita_filter_resettransparent | changed layers/selection/history/view |
| add | Filter > Adjust | Cross-channel adjustment curves... | krita_filter_crosschannel | changed layers/selection/history/view |
| add | Filter > Artistic | Halftone... | krita_filter_halftone | changed image |
| add | Filter > Artistic | Posterize... | krita_filter_posterize | changed image |
| add | Filter > Artistic | Raindrops... | krita_filter_raindrops | changed image |
| add | Filter > Artistic | Index Colors... | krita_filter_indexcolors | changed image |
| add | Filter > Artistic | Oilpaint... | krita_filter_oilpaint | opened dialog |
| add | Filter > Colors | Maximize Channel | krita_filter_maximize | changed image |
| add | Filter > Other | Random Noise... | krita_filter_noise | changed image |
| add | Filter > Blur | Gaussian Blur... | krita_filter_gaussian blur | changed image |
| add | Filter > Map | Small Tiles... | krita_filter_smalltiles | changed image |
| add | Filter > Edge Detection | Height to Normal Map... | krita_filter_height to normal | changed image |
| add | Filter > Adjust | Levels... | krita_filter_levels | changed layers/selection/history/view |
| add | Filter > Adjust | Color Balance... | krita_filter_colorbalance | changed layers/selection/history/view |
| add | Filter > Adjust | HSV Adjustment... | krita_filter_hsvadjustment | changed layers/selection/history/view |
| add | Filter > Blur | Blur... | krita_filter_blur | changed image |
| add | Filter > Blur | Motion Blur... | krita_filter_motion blur | changed image |
| add | Filter > Enhance | Mean Removal | krita_filter_mean removal | changed image |
| add | Filter > Enhance | Unsharp Mask... | krita_filter_unsharp | changed image |
| add | Filter > Other | Wave... | krita_filter_wave | changed image |
| add | Filter > Map | Gradient Map... | krita_filter_gradientmap | changed image |
| add | Filter > Map | Phong Bumpmap... | krita_filter_phongbumpmap | changed image |
| add | Filter > Enhance | Wavelet Noise Reducer... | krita_filter_waveletnoisereducer | changed image |
| add | Filter > Map | Palettize... | krita_filter_palettize | changed layers/selection/history/view |
| add | Filter > Emboss | Emboss Vertical Only | krita_filter_emboss vertical only | changed image |
| add | Filter > Adjust | Burn... | krita_filter_burn | changed image |
| add | Filter > Emboss | Emboss with Variable Depth... | krita_filter_emboss | changed image |
| add | Filter > Adjust | Color Adjustment curves... | krita_filter_perchannel | changed layers/selection/history/view |
| add | Filter > Enhance | Gaussian Noise Reduction... | krita_filter_gaussiannoisereducer | changed image |
| add | Filter > Map | Round Corners... | krita_filter_roundcorners | changed layers/selection/history/view |
| add | Filter > Edge Detection | Edge Detection... | krita_filter_edge detection | changed image |
| add | Filter > Colors | Propagate Colors... | krita_filter_propagatecolors | changed image |
| add | Filter > Emboss | Emboss (Laplacian) | krita_filter_emboss laplascian | changed image |
| add | Filter > Artistic | Pixelize... | krita_filter_pixelize | changed image |
| add | Filter > Map | Normalize | krita_filter_normalize | changed image |
| add | Filter > Blur | Lens Blur... | krita_filter_lens blur | changed image |
| add | Filter > Adjust | Threshold... | krita_filter_threshold | changed image |
| add | Filter > Emboss | Emboss in All Directions | krita_filter_emboss all directions | changed image |
| add | Filter > Other | Random Pick... | krita_filter_randompick | changed image |
| add | Filter > Emboss | Emboss Horizontal  Vertical | krita_filter_emboss horizontal and vertical | changed image |
| add | Filter > Adjust | Auto Contrast | krita_filter_autocontrast | changed image |
| add | Filter > Adjust | Invert | krita_filter_invert | changed image |
| add | File | Save As… | file_save_as | opened dialog |
| add | File | Sessions... | file_sessions | opened dialog |
| add | File | Open existing Document as Untitled Document... | file_import_file | opened dialog |
| add | File | Export Advanced... | file_export_advanced | opened dialog |
| add | File | Import animation frames... | file_import_animation | opened dialog |
| add | File | Import video animation... | file_import_video_animation | opened dialog |
| add | File | Render Animation... | render_animation | opened dialog |
| add | File | Save Incremental Version | save_incremental_version | opened dialog |
| add | File | Save Incremental Backup | save_incremental_backup | opened dialog |
| add | File | Create Template From Image... | create_template | opened dialog |
| add | File | Create Copy From Current Image | create_copy | changed layers/selection/history/view |
| add | File | Document Information | file_documentinfo | opened dialog |
| add | File | Close | file_close | opened dialog |
| add | File | Close All | file_close_all | opened dialog |
| add | File | Quit | file_quit | opened dialog |
| add | Settings | Manage Resource Libraries... | manage_bundles | opened dialog |
| add | Settings | Manage Resources... | manage_resources | opened dialog |
| add | Settings | Configure Toolbars… | options_configure_toolbars | opened dialog |
| add | Settings | Switch Application Language... | switch_application_language | opened dialog |
| add | Settings | Reset All Settings | reset_configurations | opened dialog |
| add | Help | About Krita | help_about_app | opened dialog |
| add | Help | About KDE | help_about_kde | opened dialog |
| add after engine fix / check | Edit | Copy | edit_copy | no visible effect |
| add after engine fix / check | Edit | Copy (sharp) | copy_sharp | no visible effect |
| add after engine fix / check | Edit | Copy Layer Style | copy_layer_style | no visible effect |
| add after engine fix / check | Edit | Paste Shape Style | paste_shape_style | no visible effect |
| add after engine fix / check | Edit | Paste Layer Style | paste_layer_style | no visible effect |
| add after engine fix / check | Layer | Copy Layer | copy_layer_clipboard | no visible effect |
| add after engine fix / check | Layer > New | Add Fill Layer... | add_new_fill_layer | crash |
| add after engine fix / check | Layer > Convert | Convert to Filter Mask... | convert_to_filter_mask | hang |
| add after engine fix / check | Layer > Select | All Layers | select_all_layers | no visible effect |
| add after engine fix / check | Layer > Select | Visible Layers | select_visible_layers | no visible effect |
| add after engine fix / check | Layer > Select | Invisible Layers | select_invisible_layers | no visible effect |
| add after engine fix / check | Layer > Select | Locked Layers | select_locked_layers | no visible effect |
| add after engine fix / check | Layer > Select | Unlocked Layers | select_unlocked_layers | no visible effect |
| add after engine fix / check | Layer > Split > Split Alpha | Write as Alpha | split_alpha_write | crash |
| add after engine fix / check | Layer > Split > Split Alpha | Save Merged... | split_alpha_save_merged | crash |
| add after engine fix / check | Select | Edit Selection | edit_selection | no visible effect |
| add after engine fix / check | Select | Convert Shapes to Vector Selection | convert_shapes_to_vector_selection | no visible effect |
| add after engine fix / check | Select | Convert to Shape | convert_selection_to_shape | no visible effect |
| add after engine fix / check | Select | Display Selection | toggle_display_selection | no visible effect |
| add after engine fix / check | Select | Enable Selection Actions Bar | enable_sap | no visible effect |
| add after engine fix / check | Select | Configure selection actions bar | configure_sap | disabled |
| add after engine fix / check | View | Detach Canvas | view_detached_canvas | no visible effect |
| add after engine fix / check | View | Wrap Around Mode | wrap_around_mode | no visible effect |
| add after engine fix / check | View > Wrap Around Mode Direction | Wrap Around Both Directions | wrap_around_hv_axis | no visible effect |
| add after engine fix / check | View > Wrap Around Mode Direction | Wrap Around Horizontally | wrap_around_h_axis | no visible effect |
| add after engine fix / check | View > Wrap Around Mode Direction | Wrap Around Vertically | wrap_around_v_axis | no visible effect |
| add after engine fix / check | View | Instant Preview Mode | level_of_detail_mode | no visible effect |
| add after engine fix / check | View | Soft Proofing | softProof | no visible effect |
| add after engine fix / check | View | Out of Gamut Warnings | gamutCheck | no visible effect |
| add after engine fix / check | View | View Print Size | view_print_size | no visible effect |
| add after engine fix / check | View | Rulers Track Pointer | rulers_track_mouse | no visible effect |
| add after engine fix / check | View | Show Status Bar | showStatusBar | no visible effect |
| add after engine fix / check | View | Show Pixel Grid | view_pixel_grid | no visible effect |
| add after engine fix / check | View > Snap To | Snap Pixel | view_snap_to_pixel | no visible effect |
| add after engine fix / check | View > Snap To | Snap Orthogonal | view_snap_orthogonal | no visible effect |
| add after engine fix / check | View > Snap To | Snap Node | view_snap_node | no visible effect |
| add after engine fix / check | View > Snap To | Snap Extension | view_snap_extension | no visible effect |
| add after engine fix / check | View > Snap To | Snap Intersection | view_snap_intersection | no visible effect |
| add after engine fix / check | View > Snap To | Snap Bounding Box | view_snap_bounding_box | no visible effect |
| add after engine fix / check | View | Show Painting Assistants | view_toggle_painting_assistants | no visible effect |
| add after engine fix / check | View | Show Assistant Previews | view_toggle_assistant_previews | no visible effect |
| add after engine fix / check | View | Show Reference Images | view_toggle_reference_images | no visible effect |
| add after engine fix / check | Filter | Apply Filter Again | filter_apply_again | no visible effect |
| add after engine fix / check | Filter | Apply Filter Again (Reprompt) | filter_apply_reprompt | no visible effect |
| add after engine fix / check | Filter | Adjust | adjust_filters | no visible effect |
| add after engine fix / check | Filter | Artistic | artistic_filters | no visible effect |
| add after engine fix / check | Filter | Blur | blur_filters | no visible effect |
| add after engine fix / check | Filter | Colors | color_filters | no visible effect |
| add after engine fix / check | Filter | Edge Detection | edge_filters | no visible effect |
| add after engine fix / check | Filter | Emboss | emboss_filters | no visible effect |
| add after engine fix / check | Filter | Enhance | enhance_filters | no visible effect |
| add after engine fix / check | Filter | Map | map_filters | no visible effect |
| add after engine fix / check | Filter | Other | other_filters | no visible effect |
| add after engine fix / check | Settings | Lock Toolbars | lock_toolbars | no visible effect |
| add after engine fix / check | Settings | Show Dockers | view_toggledockers | no visible effect |
| add after engine fix / check | Settings | Dockers | settings_dockers_menu | no visible effect |
| add after engine fix / check | Settings | Themes | theme_menu | no visible effect |
| add after engine fix / check | Settings | Styles | style_menu | no visible effect |
| add after engine fix / check | Settings | Active Author Profile | settings_active_author | no visible effect |
| add after engine fix / check | Help | Krita Handbook | help_contents | no visible effect |

## M3. Krita menu entries whose action is not in this engine's action list

| Krita menu path | text | action | menu file | defined in Krita source |
|---|---|---|---|---|
| File | file_reload_file | file_reload_file | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| File | file_export_pdf | file_export_pdf | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| Edit | delete | delete | krita/krita/krita5.xmlgui | krita/plugins/tools/svgtexttool/tests/SvgTextCursorTest.cpp |
| Edit | Sample Screen Color | sample_screen_color | krita/krita/krita5.xmlgui | krita/krita/krita.action, krita/plugins/extensions/samplescreencolor/KisSampleScreenColor.cpp |
| Edit | Sample Screen Color (Sample Real Canvas) | sample_screen_color_real_canvas | krita/krita/krita5.xmlgui | krita/krita/krita.action, krita/plugins/extensions/samplescreencolor/KisSampleScreenColor.cpp |
| Edit | revert | revert | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| View | view_palette_action_menu | view_palette_action_menu | krita/krita/krita5.xmlgui | krita/libs/ui/KisMainWindow.h |
| View | refresh_canvas | refresh_canvas | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| Image | duplicate_image | duplicate_image | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| Image | imageresolution | imageresolution | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| Layer | Histogram... | histogram | krita/krita/krita5.xmlgui | krita/krita/krita.action |
| Layer | merge_all_shape_layers | merge_all_shape_layers | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| Layer | merge_selected_layers | merge_selected_layers | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| Select | feather | feather | krita/krita/krita5.xmlgui | krita/plugins/tools/tool_enclose_and_fill/KisToolEncloseAndFill.cpp |
| Select | similar | similar | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| Select | Show Global Selection Mask | show-global-selection-mask | krita/krita/krita5.xmlgui | krita/libs/ui/tool/kis_selection_tool_helper.cpp, krita/krita/krita.action |
| Filter | filter_gallery | filter_gallery | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| Filter | decor_filters | decor_filters | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| Filter | nonphotorealistic_filters | nonphotorealistic_filters | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| Filter | Start G'MIC-Qt | QMic | krita/krita/krita5.xmlgui | krita/krita/kritamenu.action, krita/plugins/extensions/qmic/QMic.cpp |
| Filter | Re-apply the last G'MIC filter | QMicAgain | krita/krita/krita5.xmlgui | krita/krita/kritamenu.action, krita/plugins/extensions/qmic/QMic.cpp |
| Settings | Change Interface Scale... | change_interface_scale | krita/krita/krita5.xmlgui | krita/libs/ui/KisMainWindow.cpp, krita/krita/kritamenu_android.action |
| Settings | Get More Resources... | manage_supporter_bundles | krita/krita/krita5.xmlgui | krita/libs/ui/KisMainWindow.cpp, krita/krita/kritamenu_android.action |
| Settings | Manage Supporter Benefits... | manage_donations | krita/krita/krita5.xmlgui | krita/libs/ui/KisMainWindow.cpp, krita/krita/kritamenu_android.action |
| Settings | Manage Subscriptions... | manage_subscriptions | krita/krita/krita5.xmlgui | krita/libs/ui/KisMainWindow.cpp, krita/krita/kritamenu_android.action |
| Help | help_whats_this | help_whats_this | krita/krita/krita5.xmlgui | krita/libs/widgetutils/config/kstandardaction_p.h |
| Help | help_show_tip | help_show_tip | krita/krita/krita5.xmlgui | only in the xmlgui (dangling in Krita too) |
| Help | Report Bug... | help_report_bug | krita/krita/krita5.xmlgui | krita/libs/widgetutils/config/kstandardaction_p.h, krita/krita/kritamenu.action |
| Help | Show Krita log for bug reports. | buginfo | krita/krita/krita5.xmlgui | krita/krita/krita.action, krita/plugins/extensions/buginfo/buginfo.cpp |
| Help | Show system information for bug reports. | sysinfo | krita/krita/krita5.xmlgui | krita/krita/krita.action, krita/plugins/extensions/buginfo/buginfo.cpp |
| Help | Show color management information | color_management_report | krita/krita/krita5.xmlgui | krita/krita/krita.action, krita/plugins/extensions/buginfo/buginfo.cpp |
| Help | Show Android log for bug reports. | logcatdump | krita/krita/krita5.xmlgui | krita/krita/krita.action, krita/plugins/extensions/buginfo/buginfo.cpp |
| Help | Show crash log for bug reports. | crashlog | krita/krita/krita5.xmlgui | krita/krita/krita.action, krita/plugins/extensions/buginfo/buginfo.cpp |
| Help | Show Krita log for bug reports. | buginfo | krita/plugins/extensions/buginfo/buginfo.xmlgui | krita/krita/krita.action, krita/plugins/extensions/buginfo/buginfo.cpp |
| Help | Show system information for bug reports. | sysinfo | krita/plugins/extensions/buginfo/buginfo.xmlgui | krita/krita/krita.action, krita/plugins/extensions/buginfo/buginfo.cpp |
| Tools | Explore Resources Cache Database... | dbexplorer | krita/plugins/extensions/dbexplorer/dbexplorer.xmlgui | krita/plugins/extensions/dbexplorer/dbexplorer.action, krita/plugins/extensions/dbexplorer/DbExplorer.cpp |
| Edit > Resources | import | import | krita/plugins/extensions/resourcemanager/resourcemanager.xmlgui | only in the xmlgui (dangling in Krita too) |
| Edit > Resources | createbundle | createbundle | krita/plugins/extensions/resourcemanager/resourcemanager.xmlgui | only in the xmlgui (dangling in Krita too) |
| Edit > Resources | managebundles | managebundles | krita/plugins/extensions/resourcemanager/resourcemanager.xmlgui | only in the xmlgui (dangling in Krita too) |
| Edit | Sample Screen Color | sample_screen_color | krita/plugins/extensions/samplescreencolor/samplescreencolor.xmlgui | krita/krita/krita.action, krita/plugins/extensions/samplescreencolor/KisSampleScreenColor.cpp |
| Edit | Sample Screen Color (Sample Real Canvas) | sample_screen_color_real_canvas | krita/plugins/extensions/samplescreencolor/samplescreencolor.xmlgui | krita/krita/krita.action, krita/plugins/extensions/samplescreencolor/KisSampleScreenColor.cpp |
| Edit | edit_select_all | edit_select_all | krita/plugins/tools/svgtexttool/svgtexttool.xmlgui | krita/libs/widgetutils/config/kstandardaction_p.h |
| Edit | edit_deselect | edit_deselect | krita/plugins/tools/svgtexttool/svgtexttool.xmlgui | krita/libs/widgetutils/config/kstandardaction_p.h |
| Edit | edit_find | edit_find | krita/plugins/tools/svgtexttool/svgtexttool.xmlgui | krita/libs/widgetutils/config/kstandardaction_p.h |
| Edit | edit_find_next | edit_find_next | krita/plugins/tools/svgtexttool/svgtexttool.xmlgui | krita/libs/widgetutils/config/kstandardaction_p.h |
| Edit | edit_find_prev | edit_find_prev | krita/plugins/tools/svgtexttool/svgtexttool.xmlgui | krita/libs/widgetutils/config/kstandardaction_p.h |
| Edit | edit_replace | edit_replace | krita/plugins/tools/svgtexttool/svgtexttool.xmlgui | krita/libs/widgetutils/config/kstandardaction_p.h |
| Settings | Settings... | svg_settings | krita/plugins/tools/svgtexttool/svgtexttool.xmlgui | krita/plugins/tools/svgtexttool/SvgTextEditor.cpp, krita/plugins/tools/svgtexttool/SvgTextTool.action |

## M4. Dockers (Settings > Dockers in Krita)

| docker | title | page menu |
|---|---|---|
| LogDocker | Log Viewer | Settings > Krita Dockers > Log Viewer |
| AnimationCurvesDocker | Animation Curves | Settings > Krita Dockers > Animation Curves |
| ArrangeDocker | Arrange | Settings > Krita Dockers > Arrange |
| ArtisticColorSelector | Artistic Color Selector | Settings > Krita Dockers > Artistic Color Selector |
| BrushHudDocker | On-Canvas Brush Editor | Settings > Krita Dockers > On-Canvas Brush Editor |
| ChannelDocker | Channels | Settings > Krita Dockers > Channels |
| ColorSelectorNg | Advanced Color Selector | Settings > Krita Dockers > Advanced Color Selector |
| CompositionDocker | Compositions | Settings > Krita Dockers > Compositions |
| DigitalMixer | Digital Colors Mixer | Settings > Krita Dockers > Digital Colors Mixer |
| GamutMask | Gamut Masks | Settings > Krita Dockers > Gamut Masks |
| GridDocker | Grid and Guides | Settings > Krita Dockers > Grid and Guides |
| HistogramDocker | Histogram | Settings > Krita Dockers > Histogram |
| History | Undo History | Settings > Krita Dockers > Undo History |
| KisLayerBox | Layers | Settings > Krita Dockers > Layers |
| OnionSkinsDocker | Onion Skins | Settings > Krita Dockers > Onion Skins |
| OverviewDocker | Overview | Settings > Krita Dockers > Overview |
| PaletteDocker | Palette | Settings > Krita Dockers > Palette |
| PatternDocker | Patterns | Settings > Krita Dockers > Patterns |
| PresetDocker | Brush Presets | Settings > Krita Dockers > Brush Presets |
| PresetHistory | Brush Preset History | Settings > Krita Dockers > Brush Preset History |
| Snapshot | Snapshot Docker | Settings > Krita Dockers > Snapshot Docker |
| SpecificColorSelector | Specific Color Selector | Settings > Krita Dockers > Specific Color Selector |
| StoryboardDocker | Storyboard | Settings > Krita Dockers > Storyboard |
| SvgSymbolCollectionDocker | Symbol Libraries | Settings > Krita Dockers > Symbol Libraries |
| TasksetDocker | Task Sets | Settings > Krita Dockers > Task Sets |
| TextProperties | Text Properties | Settings > Krita Dockers > Text Properties |
| TimelineDocker | Animation Timeline | Settings > Krita Dockers > Animation Timeline |
| TouchDocker | Touch Docker | Settings > Krita Dockers > Touch Docker |

## M5. The page's own menu commands

| menu | command | title | Krita action it corresponds to |
|---|---|---|---|
| File | file.new | New… | file_new |
| File | file.open | Open… | file_open |
| File | file.openRecent | Open Recent… | file_open_recent |
| File | file.saveKra | Save as .kra | file_save |
| File | file.export | Export… | file_export_file |
| Edit | edit.undo | Undo | edit_undo |
| Edit | edit.redo | Redo | edit_redo |
| Edit | edit.fillFg | Fill with Foreground Color | fill_selection_foreground_color |
| Edit | edit.fillBg | Fill with Background Color | fill_selection_background_color |
| Edit | edit.clear | Clear | clear |
| Select | select.all | Select All | select_all |
| Select | select.none | Deselect | deselect |
| Select | select.invert | Invert Selection | invert_selection |
| Image | image.scale | Scale Image To New Size… | imagesize |
| Image | image.resizeCanvas | Resize Canvas… | canvassize |
| Image | image.trim | Trim to Current Selection | resizeimagetoselection |
| Image | image.rotateRight | Rotate Image › 90° Right | rotateImageCW90 |
| Image | image.rotateLeft | Rotate Image › 90° Left | rotateImageCCW90 |
| Image | image.rotate180 | Rotate Image › 180° | rotateImage180 |
| Image | image.rotateCustom | Rotate Image › Custom… | rotateimage |
| Image | image.mirrorH | Mirror Image Horizontally | mirrorImageHorizontal |
| Image | image.mirrorV | Mirror Image Vertically | mirrorImageVertical |
| Image | image.flatten | Flatten Image | flatten_image |
| Image | image.convert | Convert Image Color Space… | imagecolorspaceconversion |
| View | view.zoomIn | Zoom In | view_zoom_in |
| View | view.zoomOut | Zoom Out | view_zoom_out |
| View | view.zoom100 | Zoom to 100% | zoom_to_100pct |
| View | view.fit | Fit Page | zoom_to_fit |
| View | view.rotateCcw | Rotate Counterclockwise | rotate_canvas_left |
| View | view.rotateCw | Rotate Clockwise | rotate_canvas_right |
| View | view.rotateReset | Reset Rotation | reset_canvas_rotation |
| View | view.mirror | Mirror View | mirror_canvas |
| Tools | tools.sizeDown | Decrease Brush Size | decrease_brush_size |
| Tools | tools.sizeUp | Increase Brush Size | increase_brush_size |
| Tools | tools.opacityDown | Decrease Opacity | decrease_opacity |
| Tools | tools.opacityUp | Increase Opacity | increase_opacity |
| Tools | tools.eraser | Toggle Eraser | erase_action |
| Tools | tools.swapColors | Swap Foreground and Background | toggle_fg_bg |
| Tools | tools.resetColors | Reset Colors | reset_fg_bg |
| Settings | settings.configure | Configure Krita… | options_configure |
| Settings | workspace.default | Workspace: Default |  |
| Settings | workspace.minimal | Workspace: Minimal |  |
| Settings | workspace.animation | Workspace: Animation |  |
| Settings | workspace.manage | Workspace: Save and Manage… |  |
| Settings | help.actions | Search Krita Actions… |  |
| Settings | help.about | About Krita Web… |  |
| Layer | layer.newPaint | New Paint Layer | add_new_paint_layer |
| Layer | layer.newGroup | New Group Layer | add_new_group_layer |
| Layer | layer.duplicate | Duplicate Layer or Mask | duplicatelayer |
| Layer | layer.mergeDown | Merge with Layer Below | merge_layer |
| Layer | layer.remove | Remove Layer | remove_layer |
| Layer | layer.properties | Layer Properties… | layer_properties |
| View | view.rulers | Show Rulers | view_ruler |
| View | view.grid | Show Grid | view_grid |
| View | view.guides | ✓ Show Guides | view_show_guides |
| View | view.lockGuides | Lock Guides | view_lock_guides |
| View | view.snapGuides | Snap To Guides | view_snap_to_guides |
| View | view.snapGrid | Snap To Grid | view_snap_to_grid |
| View | view.snapBounds | Snap To Image Bounds | view_snap_image_bounds |
| View | view.snapCenter | Snap To Image Center | view_snap_image_center |
| View | view.canvasOnly | Canvas Only | view_show_canvas_only |
| Tools | animation.play | Animation: Play / Pause |  |
| Tools | animation.addBlank | Animation: Add Blank Frame |  |
| Tools | animation.addDuplicate | Animation: Add Duplicate Frame |  |
| Tools | animation.remove | Animation: Remove Frame |  |
| Tools | animation.next | Animation: Next Frame |  |
| Tools | animation.prev | Animation: Previous Frame |  |
| Filter | filter.gallery | Filters… | filter_gallery |
| Settings | presets.import | Import Resources… |  |
| Settings | krita.docker.LogDocker | Krita Dockers › Log Viewer |  |
| Settings | krita.docker.AnimationCurvesDocker | Krita Dockers › Animation Curves |  |
| Settings | krita.docker.ArrangeDocker | Krita Dockers › Arrange |  |
| Settings | krita.docker.ArtisticColorSelector | Krita Dockers › Artistic Color Selector |  |
| Settings | krita.docker.BrushHudDocker | Krita Dockers › On-Canvas Brush Editor |  |
| Settings | krita.docker.ChannelDocker | Krita Dockers › Channels |  |
| Settings | krita.docker.ColorSelectorNg | Krita Dockers › Advanced Color Selector |  |
| Settings | krita.docker.CompositionDocker | Krita Dockers › Compositions |  |
| Settings | krita.docker.DigitalMixer | Krita Dockers › Digital Colors Mixer |  |
| Settings | krita.docker.GamutMask | Krita Dockers › Gamut Masks |  |
| Settings | krita.docker.GridDocker | Krita Dockers › Grid and Guides |  |
| Settings | krita.docker.HistogramDocker | Krita Dockers › Histogram |  |
| Settings | krita.docker.History | Krita Dockers › Undo History |  |
| Settings | krita.docker.KisLayerBox | Krita Dockers › Layers |  |
| Settings | krita.docker.OnionSkinsDocker | Krita Dockers › Onion Skins |  |
| Settings | krita.docker.OverviewDocker | Krita Dockers › Overview |  |
| Settings | krita.docker.PaletteDocker | Krita Dockers › Palette |  |
| Settings | krita.docker.PatternDocker | Krita Dockers › Patterns |  |
| Settings | krita.docker.PresetDocker | Krita Dockers › Brush Presets |  |
| Settings | krita.docker.PresetHistory | Krita Dockers › Brush Preset History |  |
| Settings | krita.docker.Snapshot | Krita Dockers › Snapshot Docker |  |
| Settings | krita.docker.SpecificColorSelector | Krita Dockers › Specific Color Selector |  |
| Settings | krita.docker.StoryboardDocker | Krita Dockers › Storyboard |  |
| Settings | krita.docker.SvgSymbolCollectionDocker | Krita Dockers › Symbol Libraries |  |
| Settings | krita.docker.TasksetDocker | Krita Dockers › Task Sets |  |
| Settings | krita.docker.TextProperties | Krita Dockers › Text Properties |  |
| Settings | krita.docker.TimelineDocker | Krita Dockers › Animation Timeline |  |
| Settings | krita.docker.TouchDocker | Krita Dockers › Touch Docker |  |
