#!/usr/bin/env bash
# Configures and builds Krita's engine libraries for WebAssembly.
# Usage: engine/build-krita.sh [ninja targets...]   (default: kritaimage)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
source "$ROOT/engine/env.sh"
B=$KW/build/krita

# Our changes to Krita live in patches/krita.patch (regenerate with: git -C krita diff > patches/krita.patch)
if git -C "$ROOT/krita" apply --check "$ROOT/patches/krita.patch" 2>/dev/null; then
    git -C "$ROOT/krita" apply "$ROOT/patches/krita.patch"
fi

# Qt's prebuilt WebAssembly libraries use Emscripten (JS) exceptions, so Krita must too.
# ponytail: scalar only (no -msimd128): Krita's multi-arch SIMD layer has no wasm backend.
# Adding an xsimd::wasm architecture there is the first performance upgrade to make.
FLAGS="-pthread -fexceptions -I$PREFIX/include"

if [ ! -f "$B/build.ninja" ] || [ -n "${RECONFIGURE:-}" ]; then
    cmake -S "$ROOT/krita" -B "$B" -G Ninja -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_TOOLCHAIN_FILE="$QT_WASM/lib/cmake/Qt6/qt.toolchain.cmake" -DQT_HOST_PATH="$QT_HOST" \
        -DCMAKE_INSTALL_PREFIX="$KW/krita-install" -DCMAKE_PREFIX_PATH="$PREFIX" -DCMAKE_FIND_ROOT_PATH="$PREFIX" \
        -DBUILD_WITH_QT6=ON -DALLOW_UNSTABLE=QT6 -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=${BUILD_TESTING:-OFF} \
        -DKF_IGNORE_PLATFORM_CHECK=ON -DENABLE_UPDATERS=OFF -DKRITA_ENABLE_PCH=OFF -DKRITA_WEB_SPIKE_DIR="$ROOT/engine/spike" -DKRITA_WEB_BRIDGE_DIR="$ROOT/engine/bridge" -DKRITA_WEB_PREFIX="$PREFIX" -DKRITA_WEB_PROFILING=${KW_PROFILING:-OFF} \
        "-DKRITA_WEB_PLUGIN_TARGETS=$(tr ' ' ';' < "$ROOT/engine/bridge/plugin-targets.txt")" \
        -DKRITA_QT_HAS_ENTER_LEAVE_PATCH=OFF -DKRITA_QT_HAS_UNBALANCED_KEY_PRESS_RELEASE_PATCH=OFF \
        -DKRITA_QT_HAS_UPDATE_COMPRESSION_PATCH=OFF \
        -DCMAKE_C_FLAGS="$FLAGS" -DCMAKE_CXX_FLAGS="$FLAGS" \
        "-DCMAKE_EXE_LINKER_FLAGS=-lembind -fexceptions" ${KW_EXTRA_CMAKE:-}
fi
cmake --build "$B" --target "${@:-kritaimage}" -- ${NINJA_ARGS:-}
