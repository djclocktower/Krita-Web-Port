# Phase 0 spike executable. Added to Krita's build with -DKRITA_WEB_SPIKE_DIR=<this dir>.
qt_add_executable(kritaspike main.cpp headless_qpa.cpp)
set_target_properties(kritaspike PROPERTIES AUTOMOC ON)
target_compile_definitions(kritaspike PRIVATE QT_STATICPLUGIN)
target_include_directories(kritaspike PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
# Krita's libraries register things from static initialisers and embedded Qt resources
# (SQL scripts, icons). A static link drops those unless the whole archive is kept.
set(_krita_libs
    kritaversion kritaglobal kritaplugin kritastore kritaresources kritacommand kritawidgetutils
    kritamultiarch kritapigment kritaflake kritawidgets kritaresourcewidgets kritametadata
    kritapsdutils kritaimage kritaimpex kritalibbrush kritaui kritalibpaintop kritalibkra
    kritalcmsengine kritadefaultpaintops_static kritadefaultpaintops kritakraimport)
target_link_options(kritaspike PRIVATE -Wl,--whole-archive)
foreach(_lib ${_krita_libs})
    target_link_options(kritaspike PRIVATE $<TARGET_FILE:${_lib}>)
endforeach()
target_link_options(kritaspike PRIVATE -Wl,--no-whole-archive)
target_link_libraries(kritaspike PRIVATE
    ${_krita_libs}
    Qt6::Test Qt6::GuiPrivate Qt6::CorePrivate
    # static dependencies that KF6I18n and fontconfig do not propagate themselves
    ${CMAKE_PREFIX_PATH}/lib/libintl.a ${CMAKE_PREFIX_PATH}/lib/libexpat.a)
set(_data ${CMAKE_SOURCE_DIR})
# Krita's text engine refuses to start without at least one font. ponytail: taken from the build
# machine for the spike; the real app ships its own font set.
set(KRITA_WEB_FONT /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf CACHE FILEPATH "Fallback font to bundle")
target_link_options(kritaspike PRIVATE
    -fexceptions
    -sPROXY_TO_PTHREAD   # main() runs in a worker; the browser's main thread stays free
    -sPTHREAD_POOL_SIZE=16 -sINITIAL_MEMORY=512MB -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB
    "SHELL:--preload-file ${_data}/libs/ui/tests/data/load_test.kra@/data/load_test.kra"
    "SHELL:--preload-file ${_data}/krita/data/paintoppresets/b)_Basic-5_Size_default.kpp@/data/preset.kpp"
    "SHELL:--preload-file ${_data}/krita/data/profiles@/share/krita/profiles"
    "SHELL:--preload-file ${CMAKE_CURRENT_SOURCE_DIR}/fonts.conf@/etc/fonts/fonts.conf"
    "SHELL:--preload-file ${KRITA_WEB_FONT}@/usr/share/fonts/fallback.ttf")
