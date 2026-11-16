# Krita's QML panels in the headless WebAssembly engine

Result: the text tool's option panel, the Text Properties docker and the Glyph Palette dialog all render real
pictures in the engine, and the panel and docker react to clicks. No OpenGL is needed: Qt Quick's software
backend draws into an image, which `QWidget::grab()` (our window-to-page path) picks up unchanged.

## What was verified (headless Chromium, my own build in /opt/kw/build/krita-qml)

Driver: `/opt/kw/krita-qml-work/qml-test.mjs` (boots the engine, `setKritaTool('SvgTextTool')`, reads `kritaWindowPaint`).

| Panel | Level reached | Evidence |
|---|---|---|
| Text tool option panel (`SvgTextToolOptions.qml`, kind `toolOptions`) | non-blank picture with controls; reacts to a click | `text-options.png` (569 distinct colours at 227x162, 687 at 300x700). Clicking the "Use Visual Cursor" check box repaints it with the box ticked (`text-options-after-clicks.png`); hovering shows a QML tooltip. |
| Text Properties docker (`TextProperties.qml`) | non-blank picture with controls; reacts to a click | opened by the panel's "Open Text Properties" button; `text-properties-docker.png`. A click on the "Character" tab repaints and switches the tab (`text-properties-character-tab.png`). |
| Glyph Palette dialog (`glyphpalette/`) | window shows a non-blank picture | opened by the panel's "Glyph Palette" button; `glyph-palette-dialog.png` (tabs, "No glyph alternates available", OK/Cancel). Clicks inside it were not tried. |
| `org.krita.components` module | compiles, links, and its types load (the panels use `Kis.*` controls such as the spin boxes and `OptionButtonStrip`) | no QML load errors besides those listed under gaps |

Not verified: typing into QML text inputs, the resource popups (`ResourceView`/`ResourcePopup`, never opened), the
Preset tab, keyboard focus handling, and the text tool actually editing text through these panels.

## Changes

1. `patches/krita-qml.patch` (on top of `patches/krita.patch`, applies cleanly: checked on a fresh worktree):
   - `CMakeLists.txt`: build all of `qmlmodules` for Emscripten (was: only `qmlmodules/widgets`).
   - `qmlmodules/components/CMakeLists.txt`: do not pass `SHARED` to `ecm_add_qml_module` under Emscripten. The
     `add_library` override turns SHARED into STATIC, but `ecm_add_qml_module` itself adds `STATIC` when
     `BUILD_SHARED_LIBS=OFF`, and `qt6_add_qml_module` then fails with "Both STATIC and SHARED specified".
     With the module as its own backing and plugin target, Qt generates `kritaqmlcomponents_init.cpp`
     (`Q_IMPORT_PLUGIN(org_krita_componentsPlugin)`), which links in with the library, so no manual import is needed.
     The QML resources are compiled with `--no-zstd` already (Qt's CMake does this by itself).
2. `engine/*` changes, as unified diffs against the current repository files: `engine.diff` (this folder).
   `engine/spike/headless_qpa.cpp` needs NO change.
   - `bridge/CMakeLists.txt`: link `Qt6::Quick Qt6::QuickControls2 Qt6::QuickWidgets`.
   - `bridge/qmlimports.qml` (new file, never loaded): static Qt links only the QML plugins that
     `qmlimportscanner` finds under the executable's source dir, and Krita's panels import Qt Quick from
     resources it cannot see. This file lists the imports (QtQuick, Controls, Controls.Fusion, Layouts, Window,
     Templates, QtQml.Models, Shapes). `qt_add_executable` runs the scanner itself; after adding the file the CMake
     must be re-run (touch `bridge/CMakeLists.txt`): the scan happens at configure time. The scan reported 23 plugins.
   - `bridge/main.cpp`: `qputenv("QT_QUICK_BACKEND", "software")` before the application is created (Krita itself does
     the same on Android, `KisApplication.cpp`). `KisQQuickWidget.cpp` forces no RHI/GL surface; it only sets a surface
     format with an sRGB colour space, which the software backend ignores. Also float the "TextProperties" docker
     (hidden until the text tool's button shows it) the way `sharedtooldocker` is, so it becomes a tracked
     window (kind `dialog`, title "Text Properties") that the page can show.
   - `bridge/plugin-targets.txt`: append ` kritaqmlcomponents kritatextproperties` (one line, no newline added).
   - `bridge/plugins.inc`: `Q_IMPORT_PLUGIN(TextPropertiesPluginFactory)`.
   - The QML files load icons as `qrc:///light_*.svg` and `qrc:///16_light_*.svg`. These come from `krita/pics/svg`,
     `krita/pics/layers` and `pics/icons.qrc`. The current repository `bridge/CMakeLists.txt` already embeds them
     (my copy did not at first, and the QML showed "Cannot open: qrc:///light_..." until I added them), so no change.

## Size

`kritaengine.wasm`: 117,984,137 bytes in my build (with the icon qrcs). The same build before adding the icons
(QML module, Qt Quick/Controls/Fusion plugins, both plugins): 116,049,438. `/opt/kw/engine-release` is 107,339,571
but is an older source state (no icons and others' later work), so it is not a clean baseline; I did not build
the exact pre-QML binary. Estimate for the QML work itself: about 8 to 10 MB uncompressed.

## Known gaps

- `qrc:///light_configure.svg` is still missing (an icon from a qrc that the engine does not embed; seen from a `ToolButton`).
- `qrc:/SvgTextToolOptions.qml:31: ReferenceError: updateTextProperties is not defined` appears when the text properties
  docker opens: a Krita QML bug, not a port problem (not investigated further).
- The "Font Size" spin box in the docker draws a blue selection box over its label; Qt Quick text selection state under
  the headless platform, not investigated.
- The panel's size is Krita's own (227x162 at start); the page has to call `resizeKritaWindow` to see all controls.
- Console noise: "This plugin does not support setting window opacity/raise()/propagateSizeHints()" from the platform plugin.
- Mouse hover/leave on QML items depends on the page sending `move` events through `kritaWindowInput`; it works (tooltip seen).
- Browser test setup: `engineBase=` needs a path on the same origin (the engine's worker and script cannot be loaded
  cross-origin with COEP). I served `/engine-qml/` from my bin dir through a small proxy
  (`/opt/kw/krita-qml-work/proxy.mjs`, port 5192, forwards everything else to vite on 5191) instead of `serve.mjs` on another port.

## Reproduce

`/opt/kw/krita-qml-work/build.sh kritaengine` (same configure line as `engine/build-krita.sh`, source
`/opt/kw/krita-qml`, bridge copy `/opt/kw/krita-qml-work/bridge`), then `node /opt/kw/krita-qml-work/qml-test.mjs`
with `CLICKS='18,205;150,128;150,401'`.
