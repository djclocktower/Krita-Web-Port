# Sample files for `web/tests/import-wasm.mjs`

All files are small (largest 1.2 MB, 7.4 MB in total). Files marked "generated" were made for this test and can be
used freely (CC0). The other licences are those of the project the file was taken from. The full-size set (including the
files too big to copy) lives in `/opt/kw/samples/` on the build machine; the files in the last section are looked up there.

## Generated (CC0)

A 96x64 synthetic picture (colour gradient, red rectangle, blue disc), written with Pillow 12.3 and ImageMagick 6.9:
`png-rgb8.png`, `png-rgb16.png` (16-bit RGB, written by hand), `png-grey16.png`, `jpg-rgb8.jpg`, `jpg-grey8.jpg`, `jpg-cmyk.jpg`,
`jpg-icc.jpg` (ICC profile), `webp-lossless.webp`, `gif-rgb8.gif`, `gif-anim.gif` (5 frames, 64x48), `bmp-rgb8.bmp`, `tga-rgb8.tga`,
`tif-rgb8.tif`, `tif-deflate-predictor.tif`, `tif-rgb16.tif`, `tif-grey16.tif`, `tif-float32.tif`, `tif-cmyk.tif`,
`psd-rgb8.psd`, `psd-rgb16.psd`, `psd-grey8.psd`, `psd-cmyk8.psd`, `hdr-rgb8.hdr`, `jp2-rgb8.jp2`, `jp2-grey16.jp2`,
`j2k-codestream.j2k`, `ora-two-layers.ora` (zip written with Python).

- `kra-two-layers.kra`, `krz-two-layers.krz`: the same two-layer picture, written by the engine itself (so they only show that
  the engine reads what it writes).
- `raw-test.dng`: a 64x48 16-bit RGGB Bayer DNG written byte by byte with Python (a real camera file would be megabytes).
- `pdf-3pages.pdf`: three pages (Helvetica text and a coloured rectangle each), written by hand.

## From Krita (this repository; GPL-2.0-or-later unless the file says otherwise)

| Sample | Original |
|---|---|
| `jpg-exif.jpg` | `krita/plugins/impex/jpeg/tests/data/sources/transform_rotate_test_6.jpg` |
| `webp-anim.webp` | `krita/plugins/impex/webp/tests/data/sources/animated/animation_test.webp` |
| `tif-jpeg-tiled.tif` | `krita/plugins/impex/tiff/tests/data/sources/quad-tile-jpeg.tif` (libtiff test image) |
| `psd-cmyk16.psd`, `psd-indexed.psd` | `krita/plugins/impex/psd/tests/data/sources/100x100cmyk16.psd`, `100x100indexed.psd` |
| `psd-groups.psd` | `krita/plugins/impex/psd/tests/data/group_layers.psd` |
| `kra-load-test.kra` | `krita/libs/ui/tests/data/load_test.kra` |
| `exr-memorial.exr` | `krita/plugins/impex/exr/tests/data/sources/memorial.exr` |
| `hdr-objects.hdr`, `hdr-256box.hdr` | `krita/plugins/impex/rgbe/tests/data/sources/hdr/objects.hdr`, `256box.hdr` |
| `jxl-rgb.jxl`, `jxl-cmyk.jxl`, `jxl-anim.jxl` | `krita/plugins/impex/jxl/tests/data/sources/quad-lzw.jxl`, `cmyk-test.jxl`, `animated/animation_test.jxl` |
| `jxl-hdr.jxl` | `.../jxl/tests/data/sources/netflix/hdr_cosmos01000_cicp9-16-0_lossless.jxl`. **Netflix, CC BY-NC-ND 4.0**; already in the repository, delete it here if that matters |
| `avif-rgba10.avif`, `heif-rgba10.heif` | `krita/plugins/impex/heif/tests/data/test_rgba_10.avif`, `.heif` |
| `heightmap-512.r16`, `heightmap-512.r8` | `krita/plugins/impex/heightmap/tests/data/sources/test_512x512.r16`, `.r8` |
| `svg-units.svg`, `svg-gnu.svg` | `krita/plugins/impex/svg/tests/data/sources/SvgDifferentUnits.svg`, `official_gnu.svg` |
| `brush-grey.gbr`, `brush-rgba.gbr`, `brush-animated.gih` | `krita/libs/brush/tests/data/brush.gbr`, `pepper.gbr`, `brush.gih` |

## From other projects

| Sample | Original | Licence |
|---|---|---|
| `png-icc.png`, `bmp-rle8.bmp`, `tga-rle-alpha.tga` (`rgb32rle.tga`), `jp2-testcard.jp2` (`test-card-lossless.jp2`), `jp2-4comp.jp2` (`rgb_trns_ycbc.jp2`), `jpg-cmyk-adobe.jpg` (`pil_sample_cmyk.jpg`), `psd-layers.psd` (`hopper.psd`), `tif-webp.tif` (`hopper_webp.tif`), `ico-16.ico` (`hopper.ico`) | github.com/python-pillow/Pillow, `Tests/images/` | MIT-CMU (HPND) |
| `exr-half.exr` (`TestImages/GrayRampsHorizontal.exr`), `exr-float32.exr` (`TestImages/WideFloatRange.exr`) | github.com/AcademySoftwareFoundation/openexr-images | BSD-3-Clause |
| `heic-rainbow.heic` (`tests/data/rainbow-451x461.heic`), `heic-example.heic`, `avif-example.avif` (`examples/example.*`) | github.com/strukturag/libheif | LGPL-3.0-or-later (sample applications and examples MIT) |
| `jp2-subsampled.jp2` (`input/conformance/file3.jp2`) | github.com/uclouvain/openjpeg-data | BSD-2-Clause (see its COPYRIGHT) |
| `raw-kodak.kdc` (`test/RAW_KODAK_DC50_é.KDC`) | github.com/letmaik/rawpy, `test/` | rawpy is MIT; the file's own rights are not stated |
| `pdf-text.pdf` (`tests/text.pdf`), `pdf-image.pdf` (`tests/image.pdf`) | gitlab.freedesktop.org/poppler/test | GPL-2.0-or-later (poppler test repository) |

## Not copied (too big), looked up in `/opt/kw/samples/` (the test skips them when absent)

| File | Original |
|---|---|
| `rawpy/test/iss030e122639.NEF` (10 MB) | github.com/letmaik/rawpy `test/`, an ISS photo from NASA (public domain) |
| `rawpy/test/M0054341_01_00005.cr2` (9 MB) | github.com/letmaik/rawpy `test/` |
| `oexr/ScanLines/Blobbies.exr` (6 MB) | github.com/AcademySoftwareFoundation/openexr-images (BSD-3-Clause) |

## Tried and dropped

The camera files in exiftool's `t/images` (`.dng .nef .cr2 .crw .raf`) and exiv2's `test/data/IMG_1361.dng` are metadata-only
stubs (a few KB, no sensor data): they open blank or not at all and say nothing about the engine. CSV could not be sampled: Krita's
CSV is a `.csv` plus a `.frames/` folder of PNGs and the bridge takes one file. `.apng`, `.pfm` and Pillow's broken-file
tests (`balloon_eciRGBv2_aware.jp2` is truncated) are not Krita formats or not valid files.
