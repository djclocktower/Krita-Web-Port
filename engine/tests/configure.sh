#!/usr/bin/env bash
# Configures Krita with BUILD_TESTING=ON in its own tree ($KW/build/krita-tests). Same arguments as engine/build-krita.sh.
# Usage: engine/tests/configure.sh   then   ninja -C $KW/build/krita-tests -j2 <test targets>
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
source "$ROOT/engine/env.sh"
B=$KW/build/krita-tests
FLAGS="-pthread -fexceptions -I$PREFIX/include"
cmake -S "$ROOT/krita" -B "$B" -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_TOOLCHAIN_FILE="$QT_WASM/lib/cmake/Qt6/qt.toolchain.cmake" -DQT_HOST_PATH="$QT_HOST" \
    -DCMAKE_INSTALL_PREFIX="$KW/krita-install" -DCMAKE_PREFIX_PATH="$PREFIX" -DCMAKE_FIND_ROOT_PATH="$PREFIX" \
    -DBUILD_WITH_QT6=ON -DALLOW_UNSTABLE=QT6 -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=ON \
    -DKF_IGNORE_PLATFORM_CHECK=ON -DENABLE_UPDATERS=OFF -DKRITA_ENABLE_PCH=OFF -DKRITA_WEB_PROFILING=OFF \
    -DKRITA_QT_HAS_ENTER_LEAVE_PATCH=OFF -DKRITA_QT_HAS_UNBALANCED_KEY_PRESS_RELEASE_PATCH=OFF \
    -DKRITA_QT_HAS_UPDATE_COMPRESSION_PATCH=OFF \
    -DCMAKE_C_FLAGS="$FLAGS" -DCMAKE_CXX_FLAGS="$FLAGS" \
    "-DCMAKE_EXE_LINKER_FLAGS=-lembind -fexceptions" \
    -DCMAKE_PROJECT_INCLUDE="$ROOT/engine/tests/KritaWebTests.cmake" "$@"
