# Toolchain locations and versions, sourced by the build scripts.
# One-time setup of $KW is described in engine/README.md.
export KW=${KW:-/opt/kw}
export PREFIX=$KW/prefix
export QT_VERSION=6.8.3            # Emscripten version below is the one this Qt release is built with
export EMSCRIPTEN_VERSION=3.1.56
export KF_TAG=v6.9.0
export QT_WASM=$KW/qt/$QT_VERSION/wasm_multithread
export QT_HOST=$KW/qt/$QT_VERSION/gcc_64
export KW_CFLAGS="-pthread -msimd128"
export PKG_CONFIG_LIBDIR=$PREFIX/lib/pkgconfig
export EMSDK_QUIET=1
source "$KW/emsdk/emsdk_env.sh"
