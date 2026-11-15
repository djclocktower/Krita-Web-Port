# Engine build

Builds Krita's engine for WebAssembly. Everything is installed outside the repository, under `$KW` (default `/opt/kw`).

One-time toolchain setup (versions are pinned in `env.sh`):

```sh
source engine/env.sh 2>/dev/null || true
mkdir -p $KW && cd $KW
git clone --depth 1 https://github.com/emscripten-core/emsdk.git
emsdk/emsdk install $EMSCRIPTEN_VERSION && emsdk/emsdk activate $EMSCRIPTEN_VERSION
pip install aqtinstall meson
aqt install-qt -O $KW/qt linux desktop $QT_VERSION linux_gcc_64 -m qt5compat
aqt install-qt -O $KW/qt all_os wasm $QT_VERSION wasm_multithread -m qt5compat qtimageformats
apt-get install -y gperf gettext ninja-build cmake pkg-config
git submodule update --init --depth 1 krita
```

Then:

```sh
engine/build-deps.sh     # third-party libraries and KDE Frameworks -> $KW/prefix
engine/build-krita.sh    # Krita libraries -> $KW/build/krita
```

Changes to third-party sources are kept as patch files in `patches/` and applied automatically.
