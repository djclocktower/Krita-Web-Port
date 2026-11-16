# The engine binary the web app loads. Added to Krita's build with -DKRITA_WEB_BRIDGE_DIR=<this dir>.
set(_spike ${CMAKE_CURRENT_SOURCE_DIR}/../spike)
qt_add_executable(kritaengine main.cpp ${_spike}/headless_qpa.cpp)
set_target_properties(kritaengine PROPERTIES AUTOMOC ON)
target_compile_definitions(kritaengine PRIVATE QT_STATICPLUGIN)
target_include_directories(kritaengine PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
# Krita's own file-type database (the krita executable embeds it the same way); without it .kra is "a zip"
qt_add_resources(_bridge_rcc ${CMAKE_SOURCE_DIR}/krita/data/mime-database/mime-database.qrc
    ${CMAKE_BINARY_DIR}/krita/krita.qrc    # the main window's menu and toolbar layout
    # Krita's icons and cursors, as the krita executable embeds them: its dialogs and panels are drawn here.
    ${CMAKE_SOURCE_DIR}/krita/pics/Breeze-dark/breeze-dark-icons.qrc
    ${CMAKE_SOURCE_DIR}/krita/pics/Breeze-light/breeze-light-icons.qrc
    ${CMAKE_SOURCE_DIR}/krita/pics/layerbox/layerbox-icons.qrc
    ${CMAKE_SOURCE_DIR}/krita/pics/layers/layers-icons.qrc
    ${CMAKE_SOURCE_DIR}/krita/pics/misc-light/misc-light-icons.qrc
    ${CMAKE_SOURCE_DIR}/krita/pics/misc-dark/misc-dark-icons.qrc
    ${CMAKE_SOURCE_DIR}/krita/pics/paintops/paintops-icons.qrc
    ${CMAKE_SOURCE_DIR}/krita/pics/tools/SVG/16/tools-svg-16-icons.qrc
    ${CMAKE_SOURCE_DIR}/krita/pics/tool_transform/tool-transform-icons.qrc
    ${CMAKE_SOURCE_DIR}/krita/pics/svg/svg-icons.qrc
    ${CMAKE_SOURCE_DIR}/libs/flake/flake.qrc
    ${CMAKE_SOURCE_DIR}/libs/widgets/kritawidgets.qrc
    ${CMAKE_SOURCE_DIR}/pics/icons.qrc
    ${CMAKE_SOURCE_DIR}/krita/data/cursors/cursors.qrc
    ${CMAKE_SOURCE_DIR}/krita/data/gamutmasks/gamutmasks.qrc)
target_sources(kritaengine PRIVATE ${_bridge_rcc})

# Krita's libraries and plugins register things from static initialisers and embedded Qt resources.
# A static link drops those unless the whole archive is kept.
set(_krita_libs
    kritaversion kritaglobal kritaplugin kritastore kritaresources kritacommand kritawidgetutils
    kritamultiarch kritapigment kritaflake kritawidgets kritaresourcewidgets kritametadata
    kritapsdutils kritaimage kritaimpex kritalibbrush kritaui kritalibpaintop kritalibkra
    kritalcmsengine kritadefaultpaintops_static kritadefaultpaintops kritakraimport kritadefaulttools_static
    ${KRITA_WEB_PLUGIN_TARGETS})
target_link_options(kritaengine PRIVATE -Wl,--whole-archive)
foreach(_lib ${_krita_libs})
    # A format's import and export plugins compile the same converter sources, so keeping both
    # archives whole would define everything twice. They are pulled in by Q_IMPORT_PLUGIN instead.
    # krita_flaketools and kritadefaulttools both embed a resource file called "defaulttools";
    # the flake one only holds toolbar icons, which a headless engine does not need.
    if (NOT _lib MATCHES "(import|export|flaketools)$")
        target_link_options(kritaengine PRIVATE $<TARGET_FILE:${_lib}>)
    endif()
endforeach()
target_link_options(kritaengine PRIVATE -Wl,--no-whole-archive)
target_link_libraries(kritaengine PRIVATE
    ${_krita_libs}
    Qt6::Test Qt6::GuiPrivate Qt6::CorePrivate
    # static dependencies that KF6I18n and fontconfig do not propagate themselves
    ${KRITA_WEB_PREFIX}/lib/libintl.a ${KRITA_WEB_PREFIX}/lib/libexpat.a)
# Static dependencies of the format and MyPaint plugins that their own CMake files do not list
# (they assume shared libraries, which carry their dependencies themselves).
foreach(_dep jxl jxl_threads jxl_cms hwy brotlienc brotlidec brotlicommon heif de265 aom KDcrawQt6 raw openjp2
             poppler-qt6 poppler mypaint json-c lcms2 tiff jpeg png z)
    if (EXISTS ${KRITA_WEB_PREFIX}/lib/lib${_dep}.a)
        target_link_libraries(kritaengine PRIVATE ${KRITA_WEB_PREFIX}/lib/lib${_dep}.a)
    endif()
endforeach()

set(_data ${CMAKE_SOURCE_DIR}/krita/data)
# ponytail: font taken from the build machine; the real app ships its own font set.
set(KRITA_WEB_FONT /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf CACHE FILEPATH "Fallback font to bundle")
target_link_options(kritaengine PRIVATE
    -fexceptions
    -sPROXY_TO_PTHREAD   # main() runs in a worker; the browser's main thread stays free
    -sPTHREAD_POOL_SIZE=16 -sINITIAL_MEMORY=512MB -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB
    -sEXPORTED_FUNCTIONS=_main,_malloc,_free,_kw_request,_kw_ack
    "SHELL:--preload-file ${_data}/profiles@/share/krita/profiles"
    "SHELL:--preload-file ${_data}/actions@/share/krita/actions"
    "SHELL:--preload-file ${CMAKE_SOURCE_DIR}/plugins/paintops/mypaint/brushes@/share/krita/paintoppresets"   # MyPaint presets
    "SHELL:--preload-file ${_data}/themes@/share/krita/color-schemes"   # Krita's colour themes (dark by default)
    "SHELL:--preload-file ${_data}/input@/share/krita/input"   # which button or gesture does what on the canvas
    "SHELL:--preload-file ${_data}/bundles/Krita_4_Default_Resources.bundle@/share/krita/bundles/Krita_4_Default_Resources.bundle"
    "SHELL:--preload-file ${_spike}/fonts.conf@/etc/fonts/fonts.conf"
    "SHELL:--preload-file ${KRITA_WEB_FONT}@/usr/share/fonts/fallback.ttf")

# -DKRITA_WEB_PROFILING=ON keeps function names in the binary so crashes give readable stacks (larger download).
if (KRITA_WEB_PROFILING)
    target_link_options(kritaengine PRIVATE --profiling-funcs)
endif()
