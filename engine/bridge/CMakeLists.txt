# The engine binary the web app loads. Added to Krita's build with -DKRITA_WEB_BRIDGE_DIR=<this dir>.
set(_spike ${CMAKE_CURRENT_SOURCE_DIR}/../spike)
qt_add_executable(kritaengine main.cpp ${_spike}/headless_qpa.cpp)
set_target_properties(kritaengine PROPERTIES AUTOMOC ON)
target_compile_definitions(kritaengine PRIVATE QT_STATICPLUGIN)
target_include_directories(kritaengine PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
# Krita's own file-type database (the krita executable embeds it the same way); without it .kra is "a zip"
qt_add_resources(_bridge_rcc ${CMAKE_SOURCE_DIR}/krita/data/mime-database/mime-database.qrc)
target_sources(kritaengine PRIVATE ${_bridge_rcc})

# Krita's libraries and plugins register things from static initialisers and embedded Qt resources.
# A static link drops those unless the whole archive is kept.
set(_krita_libs
    kritaversion kritaglobal kritaplugin kritastore kritaresources kritacommand kritawidgetutils
    kritamultiarch kritapigment kritaflake kritawidgets kritaresourcewidgets kritametadata
    kritapsdutils kritaimage kritaimpex kritalibbrush kritaui kritalibpaintop kritalibkra
    kritalcmsengine kritadefaultpaintops_static kritadefaultpaintops kritakraimport
    ${KRITA_WEB_PLUGIN_TARGETS})
target_link_options(kritaengine PRIVATE -Wl,--whole-archive)
foreach(_lib ${_krita_libs})
    target_link_options(kritaengine PRIVATE $<TARGET_FILE:${_lib}>)
endforeach()
target_link_options(kritaengine PRIVATE -Wl,--no-whole-archive)
target_link_libraries(kritaengine PRIVATE
    ${_krita_libs}
    Qt6::Test Qt6::GuiPrivate Qt6::CorePrivate
    # static dependencies that KF6I18n and fontconfig do not propagate themselves
    ${CMAKE_PREFIX_PATH}/lib/libintl.a ${CMAKE_PREFIX_PATH}/lib/libexpat.a)

set(_data ${CMAKE_SOURCE_DIR}/krita/data)
# ponytail: font taken from the build machine; the real app ships its own font set.
set(KRITA_WEB_FONT /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf CACHE FILEPATH "Fallback font to bundle")
target_link_options(kritaengine PRIVATE
    -fexceptions
    -sPROXY_TO_PTHREAD   # main() runs in a worker; the browser's main thread stays free
    -sPTHREAD_POOL_SIZE=16 -sINITIAL_MEMORY=512MB -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB
    -sEXPORTED_RUNTIME_METHODS=ccall,UTF8ToString,FS -sEXPORTED_FUNCTIONS=_main,_malloc,_free,_kw_request
    "SHELL:--preload-file ${_data}/profiles@/share/krita/profiles"
    "SHELL:--preload-file ${_data}/bundles/Krita_4_Default_Resources.bundle@/share/krita/bundles/Krita_4_Default_Resources.bundle"
    "SHELL:--preload-file ${_spike}/fonts.conf@/etc/fonts/fonts.conf"
    "SHELL:--preload-file ${KRITA_WEB_FONT}@/usr/share/fonts/fallback.ttf")
