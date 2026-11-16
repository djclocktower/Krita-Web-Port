#!/usr/bin/env bash
# Builds everything Krita's engine needs for WebAssembly into $KW/prefix.
# Re-runnable: finished steps are skipped (delete $KW/stamps/<name> to redo one).
# Usage: engine/build-deps.sh [step ...]     (no args = all steps)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
source "$ROOT/engine/env.sh"
mkdir -p "$KW/src" "$KW/build" "$KW/stamps" "$PREFIX"/{lib/pkgconfig,include}

fetch_git() { # name url ref; applies patches/<name>.patch when present
    [ -d "$KW/src/$1" ] && return 0
    git -c advice.detachedHead=false clone -q --depth 1 --branch "$3" "$2" "$KW/src/$1" || return 1
    [ ! -f "$ROOT/patches/$1.patch" ] || git -C "$KW/src/$1" apply "$ROOT/patches/$1.patch"
    [ ! -f "$ROOT/patches/dep-$1.patch" ] || git -C "$KW/src/$1" apply "$ROOT/patches/dep-$1.patch"
}
fetch_tar() { # name url
    if [ ! -d "$KW/src/$1" ]; then
        mkdir -p "$KW/src/$1" && curl -fsSL "$2" | tar -xa -C "$KW/src/$1" --strip-components=1 \
            $( [[ "$2" == *.bz2 ]] && echo -j ) $( [[ "$2" == *.gz ]] && echo -z ) $( [[ "$2" == *.xz ]] && echo -J )
    fi
}
# Plain (non-Qt) CMake project
cm() { # name [cmake args...]
    local n=$1; shift; rm -rf "$KW/build/$n"
    emcmake cmake -S "$KW/src/$n" -B "$KW/build/$n" -G Ninja -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX="$PREFIX" -DCMAKE_PREFIX_PATH="$PREFIX" -DCMAKE_FIND_ROOT_PATH="$PREFIX" \
        -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF \
        -DCMAKE_C_FLAGS="$KW_CFLAGS" -DCMAKE_CXX_FLAGS="$KW_CFLAGS" "$@" >"$KW/build/$n.log" 2>&1 &&
    cmake --build "$KW/build/$n" >>"$KW/build/$n.log" 2>&1 &&
    cmake --install "$KW/build/$n" >>"$KW/build/$n.log" 2>&1
}
# Qt/KDE CMake project
qcm() { # name [cmake args...]
    local n=$1; shift; rm -rf "$KW/build/$n"
    cmake -S "$KW/src/$n" -B "$KW/build/$n" -G Ninja -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_TOOLCHAIN_FILE="$QT_WASM/lib/cmake/Qt6/qt.toolchain.cmake" -DQT_HOST_PATH="$QT_HOST" \
        -DCMAKE_INSTALL_PREFIX="$PREFIX" -DCMAKE_PREFIX_PATH="$PREFIX" -DCMAKE_FIND_ROOT_PATH="$PREFIX" \
        -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF -DBUILD_QCH=OFF -DBUILD_DESIGNERPLUGIN=OFF \
        -DBUILD_PYTHON_BINDINGS=OFF -DBUILD_WITH_QML=OFF -DKF_IGNORE_PLATFORM_CHECK=ON "-DCMAKE_EXE_LINKER_FLAGS=-lembind -fexceptions" -DUSE_DBUS=OFF -DWITH_X11=OFF -DWITH_WAYLAND=OFF -DKDE_INSTALL_USE_QT_SYS_PATHS=OFF \
        -DCMAKE_C_FLAGS="$KW_CFLAGS -I$PREFIX/include" -DCMAKE_CXX_FLAGS="$KW_CFLAGS -I$PREFIX/include" "$@" >"$KW/build/$n.log" 2>&1 &&
    cmake --build "$KW/build/$n" >>"$KW/build/$n.log" 2>&1 &&
    cmake --install "$KW/build/$n" >>"$KW/build/$n.log" 2>&1
}
# C library with no usable build system: compile the sources, archive, install headers
rawlib() { # libname "sources glob" "headers glob" [extra cflags]
    local o="$KW/build/$1"; rm -rf "$o"; mkdir -p "$o"
    for f in $2; do emcc $KW_CFLAGS -O2 ${4:-} -c "$f" -o "$o/$(basename "$f").o" || return 1; done
    emar rcs "$PREFIX/lib/lib$1.a" "$o"/*.o && cp $3 "$PREFIX/include/"
}
pc() { # name version libs
    printf 'prefix=%s\nlibdir=${prefix}/lib\nincludedir=${prefix}/include\nName: %s\nDescription: %s\nVersion: %s\nLibs: -L${libdir} %s\nCflags: -I${includedir}\n' \
        "$PREFIX" "$1" "$1" "$2" "$3" >"$PREFIX/lib/pkgconfig/$1.pc"
}

# zlib/libpng/freetype/harfbuzz are built from source rather than from Emscripten's ports,
# so the build only needs git access (the ports system downloads release archives).
s_zlib()     { fetch_git zlib https://github.com/madler/zlib.git v1.3.1   # its CMake build emits two libz.a rules under Emscripten
               git -C "$KW/src/zlib" checkout -q -- . && rawlib z "$KW/src/zlib/*.c" "$KW/src/zlib/zlib.h $KW/src/zlib/zconf.h" "-DHAVE_UNISTD_H" && pc zlib 1.3.1 -lz; }
s_png()      { fetch_git png https://github.com/pnggroup/libpng.git v1.6.44; cm png -DPNG_SHARED=OFF -DPNG_TESTS=OFF -DPNG_TOOLS=OFF; }
s_freetype() { fetch_git freetype https://github.com/freetype/freetype.git VER-2-13-3
               cm freetype -DFT_DISABLE_BROTLI=ON -DFT_DISABLE_BZIP2=ON -DFT_DISABLE_HARFBUZZ=ON -DFT_REQUIRE_ZLIB=ON -DFT_REQUIRE_PNG=ON; }
s_harfbuzz() { fetch_git harfbuzz https://github.com/harfbuzz/harfbuzz.git 10.1.0
               cm harfbuzz -DHB_HAVE_FREETYPE=ON -DHB_BUILD_UTILS=OFF -DHB_BUILD_SUBSET=OFF; }
s_boost() {
    fetch_tar boost https://archives.boost.io/release/1.86.0/source/boost_1_86_0.tar.bz2
    rm -rf "$PREFIX/include/boost" && cp -r "$KW/src/boost/boost" "$PREFIX/include/boost"
}
s_eigen()  { fetch_git eigen https://gitlab.com/libeigen/eigen.git 3.4.0; cm eigen -DEIGEN_BUILD_DOC=OFF -DEIGEN_BUILD_PKGCONFIG=OFF; }
s_immer()  { fetch_git immer https://github.com/arximboldi/immer.git v0.8.1; cm immer -Dimmer_BUILD_TESTS=OFF -Dimmer_BUILD_EXAMPLES=OFF -Dimmer_BUILD_DOCS=OFF -Dimmer_BUILD_EXTRAS=OFF; }
s_zug()    { fetch_git zug https://github.com/arximboldi/zug.git master; cm zug -Dzug_BUILD_TESTS=OFF -Dzug_BUILD_EXAMPLES=OFF -Dzug_BUILD_DOCS=OFF; }
s_lager()  { fetch_git lager https://github.com/arximboldi/lager.git master; cm lager -Dlager_BUILD_TESTS=OFF -Dlager_BUILD_EXAMPLES=OFF -Dlager_BUILD_DOCS=OFF -Dlager_BUILD_DEBUGGER_EXAMPLES=OFF; }
s_xsimd()  { fetch_git xsimd https://github.com/xtensor-stack/xsimd.git 13.2.0; cm xsimd; }
s_ecm()    { fetch_git ecm https://invent.kde.org/frameworks/extra-cmake-modules.git "$KF_TAG"; cm ecm -DBUILD_HTML_DOCS=OFF -DBUILD_MAN_DOCS=OFF &&
             # wasm-ld rejects --enable-new-dtags, which KDE's settings add on every Unix
             sed -i 's/if (UNIX AND NOT APPLE AND NOT CYGWIN)/if (UNIX AND NOT APPLE AND NOT CYGWIN AND NOT EMSCRIPTEN)/' "$PREFIX/share/ECM/kde-modules/KDECompilerSettings.cmake"; }
s_expat()  { fetch_git expat https://github.com/libexpat/libexpat.git R_2_6_4
             cm expat -S "$KW/src/expat/expat" -DEXPAT_BUILD_TOOLS=OFF -DEXPAT_BUILD_EXAMPLES=OFF -DEXPAT_BUILD_TESTS=OFF -DEXPAT_BUILD_DOCS=OFF; }
s_lcms2() {
    fetch_git lcms2 https://github.com/mm2/Little-CMS.git lcms2.16
    rawlib lcms2 "$KW/src/lcms2/src/*.c" "$KW/src/lcms2/include/*.h" "-I$KW/src/lcms2/include"
    pc lcms2 2.16 -llcms2
}
s_unibreak() {
    fetch_git unibreak https://github.com/adah1972/libunibreak.git libunibreak_6_1
    rawlib unibreak "$KW/src/unibreak/src/*.c" "$KW/src/unibreak/src/*.h"
    pc libunibreak 6.1 -lunibreak
}
s_intl() { # ponytail: stub libintl (no translations yet); swap for real gettext-runtime when i18n lands (Phase 8)
    fetch_git intl https://github.com/frida/proxy-libintl.git master
    rawlib intl "$KW/src/intl/libintl.c" "$KW/src/intl/libintl.h" "-DSTUB_ONLY"
}
s_quazip() { fetch_git quazip https://github.com/stachenov/quazip.git v1.4
             qcm quazip -DQUAZIP_QT_MAJOR_VERSION=6 -DQUAZIP_INSTALL=ON -DQUAZIP_BZIP2=OFF -DQUAZIP_ENABLE_TESTS=OFF; }

kf() { fetch_git "kf-$1" "https://invent.kde.org/frameworks/$1.git" "$KF_TAG"; local n=$1; shift; qcm "kf-$n" "$@"; }
s_ki18n()         { kf ki18n; }
s_kconfig()       { kf kconfig -DKCONFIG_USE_DBUS=OFF -DKCONFIG_USE_QML=OFF; }
s_kcoreaddons()   { kf kcoreaddons -DKCOREADDONS_USE_QML=OFF -DENABLE_INOTIFY=OFF -DHAVE_DLADDR=OFF; }
s_kcodecs()       { kf kcodecs; }
s_kwidgetsaddons(){ kf kwidgetsaddons; }
s_kitemviews()    { kf kitemviews; }
s_kcompletion()   { kf kcompletion; }
s_kguiaddons()    { kf kguiaddons -DWITH_WAYLAND=OFF -DWITH_X11=OFF -DUSE_DBUS=OFF -DBUILD_GEO_SCHEME_HANDLER=OFF; }
s_kcolorscheme()  { kf kcolorscheme; }

s_exiv2() { fetch_git exiv2 https://github.com/Exiv2/exiv2.git v0.28.3
            cm exiv2 -DEXIV2_BUILD_SAMPLES=OFF -DEXIV2_BUILD_EXIV2_COMMAND=OFF -DEXIV2_ENABLE_INIH=OFF -DEXIV2_ENABLE_BROTLI=OFF \
               -DEXIV2_ENABLE_NLS=OFF -DEXIV2_ENABLE_WEBREADY=OFF -DEXIV2_ENABLE_XMP=ON -DEXIV2_ENABLE_BMFF=OFF; }
mes() { # name [meson options...]   (Meson project)
    local n=$1; shift; rm -rf "$KW/build/$n"
    cat >"$KW/build/meson-cross.ini" <<EOF
[binaries]
c = 'emcc'
cpp = 'em++'
ar = 'emar'
pkg-config = 'pkg-config'
[built-in options]
c_args = ['-pthread']
[host_machine]
system = 'emscripten'
cpu_family = 'wasm32'
cpu = 'wasm32'
endian = 'little'
EOF
    meson setup "$KW/build/$n" "$KW/src/$n" --cross-file "$KW/build/meson-cross.ini" --prefix "$PREFIX" --libdir lib \
        --buildtype release --default-library static "$@" >"$KW/build/$n.log" 2>&1 &&
    meson install -C "$KW/build/$n" >>"$KW/build/$n.log" 2>&1
}
s_fontconfig() { fetch_git fontconfig https://gitlab.freedesktop.org/fontconfig/fontconfig.git 2.15.0
                 mes fontconfig -Ddoc=disabled -Dtests=disabled -Dtools=disabled -Dnls=disabled -Dcache-build=disabled; }
s_fribidi()    { fetch_git fribidi https://github.com/fribidi/fribidi.git v1.0.16
                 mes fribidi -Ddocs=false -Dtests=false -Dbin=false; }

s_gsl() { fetch_git gsl https://github.com/ampl/gsl.git v2.7.0   # GNU GSL with a CMake build
           cm gsl -DGSL_DISABLE_TESTS=ON -DNO_AMPL_BINDINGS=ON -DDOCUMENTATION=OFF; }

# --- image format libraries (all -pthread via KW_CFLAGS; C++ ones also -fexceptions) ---
s_jpeg() { fetch_git jpeg https://github.com/libjpeg-turbo/libjpeg-turbo.git 3.0.4
           cm jpeg -DENABLE_SHARED=OFF -DENABLE_STATIC=ON -DWITH_SIMD=OFF -DWITH_TURBOJPEG=ON -DWITH_JAVA=OFF -DWITH_TOOLS=OFF \
              -DCMAKE_INSTALL_DEFAULT_LIBDIR=lib; }
s_tiff() { fetch_git tiff https://gitlab.com/libtiff/libtiff.git v4.7.0
           cm tiff -Dtiff-tools=OFF -Dtiff-tests=OFF -Dtiff-contrib=OFF -Dtiff-docs=OFF -Dtiff-opengl=OFF \
              -Dlzma=OFF -Dzstd=OFF -Dwebp=OFF -Djbig=OFF -Dlerc=OFF -Dlibdeflate=OFF -Dcxx=OFF -Dzlib=ON -Djpeg=ON -Dpixarlog=ON; }
s_webp() { fetch_git webp https://github.com/webmproject/libwebp.git v1.4.0
           cm webp -DWEBP_BUILD_ANIM_UTILS=OFF -DWEBP_BUILD_CWEBP=OFF -DWEBP_BUILD_DWEBP=OFF -DWEBP_BUILD_GIF2WEBP=OFF \
              -DWEBP_BUILD_IMG2WEBP=OFF -DWEBP_BUILD_VWEBP=OFF -DWEBP_BUILD_WEBPINFO=OFF -DWEBP_BUILD_WEBPMUX=OFF \
              -DWEBP_BUILD_EXTRAS=OFF -DWEBP_BUILD_LIBWEBPMUX=ON -DWEBP_USE_THREAD=ON; }
s_giflib() { fetch_git giflib https://git.code.sf.net/p/giflib/code master   # no tags past 4.1.6 on this remote; master is giflib 6.1.3
             local g="$KW/src/giflib"
             rawlib gif "$g/dgif_lib.c $g/egif_lib.c $g/gifalloc.c $g/gif_err.c $g/gif_font.c $g/gif_hash.c $g/openbsd-reallocarray.c $g/quantize.c" "$g/gif_lib.h" "-I$g" &&
             pc giflib 6.1.3 -lgif; }
s_imath() { fetch_git imath https://github.com/AcademySoftwareFoundation/Imath.git v3.1.12
            cm imath -DIMATH_INSTALL_PKG_CONFIG=ON -DCMAKE_CXX_FLAGS="$KW_CFLAGS -fexceptions" -DPYTHON=OFF -DIMATH_BUILD_TESTING=OFF; }
s_openexr() { fetch_git openexr https://github.com/AcademySoftwareFoundation/openexr.git v3.3.2
              cm openexr -DCMAKE_CXX_FLAGS="$KW_CFLAGS -fexceptions" -DOPENEXR_BUILD_TOOLS=OFF -DOPENEXR_BUILD_EXAMPLES=OFF \
                 -DOPENEXR_INSTALL_TOOLS=OFF -DOPENEXR_INSTALL_PKG_CONFIG=ON -DOPENEXR_ENABLE_THREADING=ON -DOPENEXR_BUILD_PYTHON=OFF \
                 -DOPENEXR_FORCE_INTERNAL_IMATH=OFF -DOPENEXR_FORCE_INTERNAL_DEFLATE=OFF -DBUILD_TESTING=OFF -DOPENEXR_IS_SUBPROJECT=OFF; }

# --- plugin libraries: MyPaint, JPEG XL, HEIF/AVIF, RAW, JPEG 2000 (versions follow krita-deps-management ext_*) ---
# Built without -msimd128 and without hand-written asm; each step overrides KW_CFLAGS for itself.
s_json-c() { local KW_CFLAGS="-pthread -fexceptions"
             fetch_git json-c https://github.com/json-c/json-c.git json-c-0.18-20240915
             cm json-c -DDISABLE_WERROR=ON -DBUILD_APPS=OFF -DBUILD_STATIC_LIBS=ON -DDISABLE_EXTRA_LIBS=ON -DDISABLE_THREAD_LOCAL_STORAGE=ON; }
s_mypaint() { local KW_CFLAGS="-pthread -fexceptions"
              # Krita uses the 1.6.1 release tarball + CMake patches; the git tag lacks the generated headers, so make them here.
              # patches/dep-mypaint.patch = krita-deps-management's 0001..0006 minus the generated config.h hunk, static instead of SHARED.
              fetch_git mypaint https://github.com/mypaint/libmypaint.git v1.6.1 || return 1
              local m="$KW/src/mypaint"
              (cd "$m" && python3 generate.py mypaint-brush-settings-gen.h brushsettings-gen.h) || return 1
              printf '#define MYPAINT_CONFIG_USE_GLIB 0\n#define HAVE_GETTEXT 0\n#define PACKAGE_VERSION "1.6.1"\n' >"$m/config.h"
              cm mypaint; }

s_highway() { local KW_CFLAGS="-pthread -fexceptions"   # no -msimd128: Highway falls back to its scalar EMU128 target
              fetch_git highway https://github.com/google/highway.git 1.3.0
              cm highway -DHWY_ENABLE_TESTS=OFF -DHWY_ENABLE_EXAMPLES=OFF -DHWY_ENABLE_CONTRIB=OFF; }
s_brotli() { local KW_CFLAGS="-pthread -fexceptions"
             fetch_git brotli https://github.com/google/brotli.git v1.2.1
             cm brotli -DBROTLI_DISABLE_TESTS=ON; }
s_jxl() { local KW_CFLAGS="-pthread -fexceptions"   # same options as krita-deps-management ext_jpegxl, plus system highway/brotli/lcms2
          fetch_git jxl https://github.com/libjxl/libjxl.git v0.11.2
          cm jxl -DJPEGXL_VERSION=0.11.2 -DJPEGXL_FORCE_SYSTEM_HWY=ON -DJPEGXL_FORCE_SYSTEM_BROTLI=ON -DJPEGXL_FORCE_SYSTEM_LCMS2=ON \
             -DJPEGXL_STATIC=ON -DJPEGXL_BUNDLE_LIBPNG=OFF -DJPEGXL_ENABLE_BENCHMARK=OFF -DJPEGXL_ENABLE_COVERAGE=OFF -DJPEGXL_ENABLE_EXAMPLES=OFF \
             -DJPEGXL_ENABLE_FUZZERS=OFF -DJPEGXL_ENABLE_JNI=OFF -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_SKCMS=OFF \
             -DJPEGXL_ENABLE_TOOLS=OFF -DJPEGXL_ENABLE_VIEWERS=OFF -DJPEGXL_ENABLE_JPEGLI=OFF -DJPEGXL_ENABLE_JPEGLI_LIBJPEG=OFF \
             -DJPEGXL_ENABLE_DOXYGEN=OFF -DJPEGXL_ENABLE_MANPAGES=OFF -DJPEGXL_ENABLE_PLUGINS=OFF -DJPEGXL_ENABLE_OPENEXR=OFF \
             -DJPEGXL_ENABLE_TRANSCODE_JPEG=ON -DJPEGXL_ENABLE_BOXES=ON -DJPEGXL_ENABLE_WASM_THREADS=ON; }

ALL="zlib png freetype harfbuzz boost eigen immer zug lager xsimd ecm expat lcms2 unibreak intl quazip ki18n kconfig kcoreaddons kcodecs kwidgetsaddons kitemviews kcompletion kguiaddons kcolorscheme exiv2 fontconfig fribidi gsl jpeg tiff webp giflib imath openexr json-c mypaint highway brotli jxl"
for s in ${@:-$ALL}; do
    if [ -e "$KW/stamps/$s" ]; then echo "skip $s"; continue; fi
    echo "== $s"
    if ! "s_$s"; then echo "FAILED: $s"; tail -30 "$KW/build/$s.log" 2>/dev/null; exit 1; fi
    touch "$KW/stamps/$s"
done
