#!/usr/bin/env bash
# Compiles and runs one small program per image library (jpeg tiff webp gif exr) under node.
# Usage: engine/check-deps.sh [name ...]   (no args = all checks)   Exit status is non-zero if any check fails.
source "$(dirname "$0")/env.sh" 2>/dev/null
ONLY="$*"; T=$(mktemp -d); P=$PREFIX
F="-pthread -sPROXY_TO_PTHREAD -sEXIT_RUNTIME=1 -sALLOW_MEMORY_GROWTH -O1 -I$P/include -I$P/include/OpenEXR -I$P/include/Imath -L$P/lib"
fail=0
run() { # name lang libs  (source on stdin)
    local n=$1 lang=$2 cc=emcc ext=c; shift 2
    [ -n "${ONLY:-}" ] && [[ " $ONLY " != *" $n "* ]] && return
    [ "$lang" = cxx ] && cc=em++ && ext=cpp
    cat >"$T/$n.$ext"
    if $cc $KW_CFLAGS -fexceptions $F "$T/$n.$ext" -o "$T/$n.js" "$@" >"$T/$n.log" 2>&1 && node "$T/$n.js" >>"$T/$n.log" 2>&1
    then echo "PASS $n"; else echo "FAIL $n"; tail -15 "$T/$n.log"; fail=1; fi
}

run jpeg c -lturbojpeg -ljpeg <<'EOF'
#include <turbojpeg.h>
#include <stdio.h>
#include <stdlib.h>
int main(void) {
    enum { W = 32, H = 24 };
    unsigned char img[W*H*3], out[W*H*3];
    for (int i = 0; i < W*H; i++) { img[3*i] = 200; img[3*i+1] = 100; img[3*i+2] = 50; } /* flat colour: lossy-safe */
    tjhandle c = tj3Init(TJINIT_COMPRESS);
    tj3Set(c, TJPARAM_QUALITY, 95); tj3Set(c, TJPARAM_SUBSAMP, TJSAMP_444);
    unsigned char *jpg = NULL; size_t n = 0;
    if (tj3Compress8(c, img, W, 0, H, TJPF_RGB, &jpg, &n)) { puts(tj3GetErrorStr(c)); return 1; }
    tjhandle d = tj3Init(TJINIT_DECOMPRESS);
    if (tj3DecompressHeader(d, jpg, n)) return 2;
    if (tj3Get(d, TJPARAM_JPEGWIDTH) != W || tj3Get(d, TJPARAM_JPEGHEIGHT) != H) return 3;
    if (tj3Decompress8(d, jpg, n, out, 0, TJPF_RGB)) return 4;
    for (int i = 0; i < W*H*3; i++) if (abs(out[i] - img[i]) > 4) { printf("pixel %d: %d vs %d\n", i, out[i], img[i]); return 5; }
    printf("jpeg %zu bytes ok\n", n); return 0;
}
EOF

run tiff c -ltiff -ljpeg -lz <<'EOF'
#include <tiffio.h>
#include <stdio.h>
#include <string.h>
int main(void) {
    enum { W = 8, H = 8 };
    unsigned char px[W*3], row[W*3];
    TIFF *t = TIFFOpen("t.tif", "w"); if (!t) return 1;
    TIFFSetField(t, TIFFTAG_IMAGEWIDTH, W); TIFFSetField(t, TIFFTAG_IMAGELENGTH, H);
    TIFFSetField(t, TIFFTAG_SAMPLESPERPIXEL, 3); TIFFSetField(t, TIFFTAG_BITSPERSAMPLE, 8);
    TIFFSetField(t, TIFFTAG_PHOTOMETRIC, PHOTOMETRIC_RGB); TIFFSetField(t, TIFFTAG_PLANARCONFIG, PLANARCONFIG_CONTIG);
    TIFFSetField(t, TIFFTAG_COMPRESSION, COMPRESSION_ADOBE_DEFLATE); TIFFSetField(t, TIFFTAG_ROWSPERSTRIP, H);
    unsigned char psd[4] = {1,2,3,4};                      /* what Krita's PSD-tag check does */
    if (!TIFFSetField(t, TIFFTAG_PHOTOSHOP, 4u, psd)) return 6;
    for (int y = 0; y < H; y++) { for (int x = 0; x < W*3; x++) px[x] = y*16 + x; if (TIFFWriteScanline(t, px, y, 0) < 0) return 2; }
    TIFFClose(t);
    t = TIFFOpen("t.tif", "r"); if (!t) return 3;
    unsigned w, h; TIFFGetField(t, TIFFTAG_IMAGEWIDTH, &w); TIFFGetField(t, TIFFTAG_IMAGELENGTH, &h);
    if (w != W || h != H) return 4;
    for (int y = 0; y < H; y++) { TIFFReadScanline(t, row, y, 0); for (int x = 0; x < W*3; x++) if (row[x] != (unsigned char)(y*16 + x)) return 5; }
    TIFFClose(t); printf("tiff %s ok\n", TIFFGetVersion()); return 0;
}
EOF

run webp c -lwebpmux -lwebpdemux -lwebp -lsharpyuv <<'EOF'
#include <webp/encode.h>
#include <webp/decode.h>
#include <webp/mux.h>
#include <webp/demux.h>
#include <stdio.h>
#include <stdlib.h>
int main(void) {
    enum { W = 16, H = 16 };
    uint8_t rgba[W*H*4]; for (int i = 0; i < W*H; i++) { rgba[4*i]=10; rgba[4*i+1]=200; rgba[4*i+2]=90; rgba[4*i+3]=255; }
    uint8_t *webp = NULL; size_t n = WebPEncodeLosslessRGBA(rgba, W, H, W*4, &webp);
    if (!n) return 1;
    int w, h; uint8_t *dec = WebPDecodeRGBA(webp, n, &w, &h);
    if (!dec || w != W || h != H) return 2;
    for (int i = 0; i < W*H*4; i++) if (dec[i] != rgba[i]) return 3;      /* lossless: exact */
    WebPData d = { webp, n }, out = {0};
    WebPMux *m = WebPMuxCreate(&d, 1); if (!m) return 4;
    WebPData icc = { (const uint8_t*)"icc", 3 };
    if (WebPMuxSetChunk(m, "ICCP", &icc, 1) != WEBP_MUX_OK) return 5;
    if (WebPMuxAssemble(m, &out) != WEBP_MUX_OK) return 6;
    WebPDemuxer *dm = WebPDemux(&out); if (!dm) return 7;
    if (WebPDemuxGetI(dm, WEBP_FF_CANVAS_WIDTH) != W || WebPDemuxGetI(dm, WEBP_FF_FRAME_COUNT) != 1) return 8;
    printf("webp encoder 0x%x ok\n", WebPGetEncoderVersion()); return 0;
}
EOF

run gif c -lgif <<'EOF'
#include <gif_lib.h>
#include <stdio.h>
int main(void) {
    int err; enum { W = 4, H = 4 };
    GifFileType *g = EGifOpenFileName("t.gif", 0, &err); if (!g) return 1;
    GifColorType c[2] = {{0,0,0},{255,255,255}};
    ColorMapObject *cm = GifMakeMapObject(2, c);
    if (EGifPutScreenDesc(g, W, H, 1, 0, cm) != GIF_OK) return 2;
    if (EGifPutImageDesc(g, 0, 0, W, H, 0, NULL) != GIF_OK) return 3;
    GifByteType row[W]; for (int y = 0; y < H; y++) { for (int x = 0; x < W; x++) row[x] = (x+y)&1; if (EGifPutLine(g, row, W) != GIF_OK) return 4; }
    if (EGifCloseFile(g, &err) != GIF_OK) return 5;
    g = DGifOpenFileName("t.gif", &err); if (!g) return 6;
    if (DGifSlurp(g) != GIF_OK || g->SWidth != W || g->SHeight != H || g->ImageCount != 1) return 7;
    for (int i = 0; i < W*H; i++) if (g->SavedImages[0].RasterBits[i] != ((i%W + i/W)&1)) return 8;
    DGifCloseFile(g, &err); puts("gif ok"); return 0;
}
EOF

run exr cxx -lOpenEXR-3_3 -lOpenEXRCore-3_3 -lIlmThread-3_3 -lIex-3_3 -lImath-3_1 <<'EOF'
#include <ImfRgbaFile.h>
#include <ImfArray.h>
#include <ImathVec.h>
#include <ImathMatrix.h>
#include <cstdio>
using namespace Imf; using namespace Imath;
int main() {
    const int W = 16, H = 8;
    Array2D<Rgba> px(H, W);
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) px[y][x] = Rgba(x / 16.0f, y / 8.0f, 0.5f, 1.0f);
    try {
        { RgbaOutputFile o("t.exr", W, H, WRITE_RGBA); o.setFrameBuffer(&px[0][0], 1, W); o.writePixels(H); }
        RgbaInputFile i("t.exr"); Box2i dw = i.dataWindow();
        if (dw.max.x - dw.min.x + 1 != W || dw.max.y - dw.min.y + 1 != H) return 2;
        Array2D<Rgba> rd(H, W); i.setFrameBuffer(&rd[0][0], 1, W); i.readPixels(dw.min.y, dw.max.y);
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
            if (rd[y][x].r != px[y][x].r || rd[y][x].g != px[y][x].g || (float)rd[y][x].b != 0.5f) return 3;   /* half is exact for these */
    } catch (const std::exception &e) { puts(e.what()); return 1; }
    V3f v(1, 2, 3); M44f m; m.setScale(V3f(2, 2, 2)); V3f r = v * m;
    if (r.x != 2 || r.z != 6) return 4;
    puts("exr ok"); return 0;
}
EOF

run mypaint c -lmypaint -ljson-c -lm <<'EOF2'
#include <libmypaint/mypaint-brush.h>
#include <libmypaint/mypaint-fixed-tiled-surface.h>
#include <stdio.h>
#include <string.h>
int main(void) {
    MyPaintBrush *b = mypaint_brush_new();
    /* json-c path: parse a brush definition (Krita's MyPaint op does this for every .myb) */
    const char *json = "{\"version\":3,\"settings\":{\"radius_logarithmic\":{\"base_value\":1.5,\"inputs\":{}}}}";
    if (!mypaint_brush_from_string(b, json)) return 1;
    float r = mypaint_brush_get_base_value(b, MYPAINT_BRUSH_SETTING_RADIUS_LOGARITHMIC);
    if (r < 1.49f || r > 1.51f) { printf("radius %f\n", r); return 2; }
    /* draw one dab on a real surface so the tiled-surface/brush maths actually runs */
    MyPaintFixedTiledSurface *s = mypaint_fixed_tiled_surface_new(64, 64);
    mypaint_brush_new_stroke(b);
    mypaint_surface_begin_atomic((MyPaintSurface*)s);
    mypaint_brush_stroke_to(b, (MyPaintSurface*)s, 20, 20, 0.5f, 0, 0, 0.1);
    mypaint_brush_stroke_to(b, (MyPaintSurface*)s, 40, 40, 0.5f, 0, 0, 0.1);
    MyPaintRectangle r2; mypaint_surface_end_atomic((MyPaintSurface*)s, &r2);
    mypaint_surface_unref((MyPaintSurface*)s); mypaint_brush_unref(b);
    puts("mypaint ok"); return 0;
}
EOF2
run jxl cxx -ljxl_threads -ljxl -ljxl_cms -llcms2 -lhwy -lbrotlienc -lbrotlidec -lbrotlicommon <<'EOF2'
#include <jxl/encode.h>
#include <jxl/encode_cxx.h>
#include <jxl/decode.h>
#include <jxl/thread_parallel_runner.h>
#include <cstdio>
#include <vector>
int main() {
    enum { W = 24, H = 16 };
    std::vector<uint8_t> px(W*H*4), out;
    for (int i = 0; i < W*H; i++) { px[4*i] = i; px[4*i+1] = 3*i; px[4*i+2] = 255 - i; px[4*i+3] = 255; }
    void *runner = JxlThreadParallelRunnerCreate(NULL, 2);              /* real pthreads */
    JxlEncoder *e = JxlEncoderCreate(NULL);
    JxlEncoderSetParallelRunner(e, JxlThreadParallelRunner, runner);
    JxlBasicInfo bi; JxlEncoderInitBasicInfo(&bi);
    bi.xsize = W; bi.ysize = H; bi.bits_per_sample = 8; bi.num_color_channels = 3; bi.num_extra_channels = 1; bi.alpha_bits = 8; bi.uses_original_profile = JXL_TRUE;
    if (JxlEncoderSetBasicInfo(e, &bi)) return 1;
    JxlColorEncoding ce; JxlColorEncodingSetToSRGB(&ce, JXL_FALSE);
    if (JxlEncoderSetColorEncoding(e, &ce)) return 2;
    JxlEncoderFrameSettings *fs = JxlEncoderFrameSettingsCreate(e, NULL);
    JxlEncoderSetFrameLossless(fs, JXL_TRUE);
    JxlPixelFormat pf = { 4, JXL_TYPE_UINT8, JXL_NATIVE_ENDIAN, 0 };
    if (JxlEncoderAddImageFrame(fs, &pf, px.data(), px.size())) return 3;
    JxlEncoderCloseInput(e);
    out.resize(4096); uint8_t *next = out.data(); size_t avail = out.size();
    JxlEncoderStatus st; while ((st = JxlEncoderProcessOutput(e, &next, &avail)) == JXL_ENC_NEED_MORE_OUTPUT) { size_t o = next - out.data(); out.resize(out.size()*2); next = out.data() + o; avail = out.size() - o; }
    if (st != JXL_ENC_SUCCESS) return 4;
    out.resize(next - out.data());
    JxlDecoder *d = JxlDecoderCreate(NULL);
    JxlDecoderSetParallelRunner(d, JxlThreadParallelRunner, runner);
    JxlDecoderSubscribeEvents(d, JXL_DEC_BASIC_INFO | JXL_DEC_FULL_IMAGE);
    JxlDecoderSetInput(d, out.data(), out.size()); JxlDecoderCloseInput(d);
    std::vector<uint8_t> dec(W*H*4); bool got = false;
    for (;;) { JxlDecoderStatus r = JxlDecoderProcessInput(d);
        if (r == JXL_DEC_BASIC_INFO) { JxlBasicInfo b; JxlDecoderGetBasicInfo(d, &b); if (b.xsize != W || b.ysize != H) return 5; }
        else if (r == JXL_DEC_NEED_IMAGE_OUT_BUFFER) { if (JxlDecoderSetImageOutBuffer(d, &pf, dec.data(), dec.size())) return 6; }
        else if (r == JXL_DEC_FULL_IMAGE) got = true;
        else if (r == JXL_DEC_SUCCESS) break; else return 7; }
    if (!got || dec != px) return 8;                                         /* lossless: exact */
    printf("jxl %u bytes, lib 0x%x ok\n", (unsigned)out.size(), JxlEncoderVersion()); return 0;
}
EOF2

run heif cxx -lheif -lde265 -laom <<'EOF2'
#include <libheif/heif.h>
#include <libde265/de265.h>
#include <cstdio>
#include <cstring>
#include <vector>
static heif_error wr(heif_context*, const void *d, size_t n, void *u) { auto *v = (std::vector<uint8_t>*)u; v->insert(v->end(), (const uint8_t*)d, (const uint8_t*)d + n); return {heif_error_Ok, heif_suberror_Unspecified, ""}; }
int main() {
    printf("heif %s, libde265 %s\n", heif_get_version(), de265_get_version());
    /* capability query: HEVC decode (libde265) and AV1 decode+encode (libaom) */
    if (!heif_have_decoder_for_format(heif_compression_HEVC)) return 1;
    if (!heif_have_decoder_for_format(heif_compression_AV1)) return 2;
    if (!heif_have_encoder_for_format(heif_compression_AV1)) return 3;
    printf("HEVC encoder: %s\n", heif_have_encoder_for_format(heif_compression_HEVC) ? "yes" : "no");
    /* real AVIF round trip: encode a flat RGB image with libaom, decode it again */
    enum { W = 64, H = 64 };
    heif_context *c = heif_context_alloc(); heif_encoder *enc;
    if (heif_context_get_encoder_for_format(c, heif_compression_AV1, &enc).code) return 4;
    heif_encoder_set_lossless(enc, 1);
    heif_image *img; if (heif_image_create(W, H, heif_colorspace_RGB, heif_chroma_interleaved_RGB, &img).code) return 5;
    if (heif_image_add_plane(img, heif_channel_interleaved, W, H, 8).code) return 6;
    int stride; uint8_t *p = heif_image_get_plane(img, heif_channel_interleaved, &stride);
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) { p[y*stride+3*x] = 200; p[y*stride+3*x+1] = 100; p[y*stride+3*x+2] = 50; }
    heif_image_handle *h; if (heif_context_encode_image(c, img, enc, NULL, &h).code) return 7;
    std::vector<uint8_t> out; heif_writer w = {1, wr};
    if (heif_context_write(c, &w, &out).code) return 8;
    heif_context *c2 = heif_context_alloc();
    if (heif_context_read_from_memory_without_copy(c2, out.data(), out.size(), NULL).code) return 9;
    heif_image_handle *h2; if (heif_context_get_primary_image_handle(c2, &h2).code) return 10;
    if (heif_image_handle_get_width(h2) != W) return 11;
    heif_image *d; if (heif_decode_image(h2, &d, heif_colorspace_RGB, heif_chroma_interleaved_RGB, NULL).code) return 12;
    const uint8_t *q = heif_image_get_plane_readonly(d, heif_channel_interleaved, &stride);
    if (q[0] != 200 || q[1] != 100 || q[2] != 50) { printf("px %d %d %d\n", q[0], q[1], q[2]); return 13; }
    printf("avif %zu bytes ok\n", out.size()); return 0;
}
EOF2

rm -rf "$T"; [ $fail = 0 ] && echo "all checks passed"; exit $fail
