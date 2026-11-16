# Included with -DCMAKE_PROJECT_INCLUDE=<this file>. Turns every Krita unit test executable
# (any add_executable called from a directory named "tests") into a browser-runnable one,
# without touching Krita's sources. See README.md.
if (NOT EMSCRIPTEN OR COMMAND _kw_finish_test)   # included once per project() call
    return()
endif()

set(_KW_TESTS_DIR ${CMAKE_CURRENT_LIST_DIR})
set(_KW_SPIKE_DIR ${CMAKE_CURRENT_LIST_DIR}/../spike)
set(KRITA_WEB_FONT /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf CACHE FILEPATH "Fallback font to bundle")
# Plugins every test gets: "<cmake target>:<Qt plugin class>". The colour engine is needed by anything that makes a colour space.
set(KRITA_WEB_TEST_PLUGINS "kritalcmsengine:PluginFactory" CACHE STRING "Static plugins linked into every test")
# Krita libraries kept whole (static initialisers and embedded resources); only those a test really depends on are used.
set(_KW_WHOLE kritaversion kritaglobal kritaplugin kritastore kritaresources kritacommand kritawidgetutils
    kritamultiarch kritapigment kritaflake kritawidgets kritaresourcewidgets kritametadata
    kritapsdutils kritaimage kritaimpex kritalibbrush kritaui kritalibpaintop kritalibkra)

function(_kw_closure target out)      # transitive link dependencies that are real targets
    set(seen ${${out}})
    get_target_property(_t ${target} TYPE)
    set(_deps "")
    get_target_property(_a ${target} LINK_LIBRARIES)
    if (_a)
        list(APPEND _deps ${_a})
    endif()
    if (NOT _t STREQUAL "EXECUTABLE")
        get_target_property(_b ${target} INTERFACE_LINK_LIBRARIES)
        if (_b)
            list(APPEND _deps ${_b})
        endif()
    endif()
    foreach (d IN LISTS _deps)
        if (TARGET ${d} AND NOT d IN_LIST seen)
            list(APPEND seen ${d})
            set(${out} ${seen})
            _kw_closure(${d} ${out})
            set(seen ${${out}})
        endif()
    endforeach()
    set(${out} ${seen} PARENT_SCOPE)
endfunction()

function(_kw_finish_test target)
    # shared support library: display-less Qt platform + environment set-up
    if (NOT TARGET kwtestsupport)
        add_library(kwtestsupport STATIC ${_KW_SPIKE_DIR}/headless_qpa.cpp ${_KW_TESTS_DIR}/test_env.cpp)
        set_target_properties(kwtestsupport PROPERTIES AUTOMOC ON)
        target_link_libraries(kwtestsupport PRIVATE Qt6::Gui Qt6::GuiPrivate Qt6::CorePrivate)
        target_compile_definitions(kwtestsupport PRIVATE QT_STATICPLUGIN)
    endif()
    # generated plugin imports
    set(_imports "#include <QtPlugin>\nQ_IMPORT_PLUGIN(HeadlessPlugin)\n")
    set(_plugin_targets "")
    foreach (p IN LISTS KRITA_WEB_TEST_PLUGINS)
        string(REPLACE ":" ";" pp ${p})
        list(GET pp 0 _tg)
        list(GET pp 1 _cls)
        if (TARGET ${_tg})
            list(APPEND _plugin_targets ${_tg})
            string(APPEND _imports "Q_IMPORT_PLUGIN(${_cls})\n")
        endif()
    endforeach()
    file(GENERATE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/${target}_kwplugins.cpp CONTENT "${_imports}")
    target_sources(${target} PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/${target}_kwplugins.cpp)
    target_link_libraries(${target} kwtestsupport ${_plugin_targets} Qt6::GuiPrivate Qt6::CorePrivate
        ${CMAKE_PREFIX_PATH}/lib/libintl.a ${CMAKE_PREFIX_PATH}/lib/libexpat.a)

    set(_all "")
    _kw_closure(${target} _all)
    target_link_options(${target} PRIVATE -Wl,--whole-archive)
    foreach (l IN LISTS _KW_WHOLE)
        if (l IN_LIST _all)
            target_link_options(${target} PRIVATE $<TARGET_FILE:${l}>)
        endif()
    endforeach()
    target_link_options(${target} PRIVATE -Wl,--no-whole-archive)

    set_target_properties(${target} PROPERTIES SUFFIX ".js")
    target_link_options(${target} PRIVATE -fexceptions -sPROXY_TO_PTHREAD -sEXIT_RUNTIME=1
        -sPTHREAD_POOL_SIZE=16 -sINITIAL_MEMORY=512MB -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB)
    # virtual filesystem: this directory's test data and the shared test data, at their absolute build-time paths
    foreach (d ${CMAKE_CURRENT_SOURCE_DIR}/data ${CMAKE_SOURCE_DIR}/sdk/tests/data)
        if (IS_DIRECTORY ${d})
            target_link_options(${target} PRIVATE "SHELL:--preload-file ${d}@${d}")
        endif()
    endforeach()
    # FILES_OUTPUT_DIR must exist
    file(WRITE ${CMAKE_CURRENT_BINARY_DIR}/kw_keep "")
    target_link_options(${target} PRIVATE
        "SHELL:--preload-file ${CMAKE_CURRENT_BINARY_DIR}/kw_keep@${CMAKE_CURRENT_BINARY_DIR}/kw_keep"
        "SHELL:--preload-file ${CMAKE_SOURCE_DIR}/krita/data/profiles@/share/krita/profiles"
        "SHELL:--preload-file ${CMAKE_SOURCE_DIR}/krita/data/profiles@${CMAKE_SOURCE_DIR}/krita/data/profiles"
        "SHELL:--preload-file ${_KW_SPIKE_DIR}/fonts.conf@/etc/fonts/fonts.conf"
        "SHELL:--preload-file ${KRITA_WEB_FONT}@/usr/share/fonts/fallback.ttf")
    set_property(TARGET ${target} PROPERTY KW_UNIT_TEST TRUE)
endfunction()

function(add_executable name)
    _add_executable(${name} ${ARGN})
    if (BUILD_TESTING AND NOT "IMPORTED" IN_LIST ARGN AND NOT "ALIAS" IN_LIST ARGN
        AND CMAKE_CURRENT_SOURCE_DIR MATCHES "/tests?$" AND NOT CMAKE_CURRENT_SOURCE_DIR MATCHES "sdk/tests$")
        cmake_language(EVAL CODE "cmake_language(DEFER CALL _kw_finish_test ${name})")   # DEFER would evaluate ${name} too late
    endif()
endfunction()
