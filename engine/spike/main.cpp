// Phase 0 spike: Krita's real engine, headless, in a browser.
// Opens a .kra, renders it, replays a brush stroke with a bundled preset, and hands
// the resulting PNGs and timings to the page (window.kritaSpike).
#define TESTUI
#include <kistest.h>            // Krita's own headless bootstrap (registerResources)

#include <QBuffer>
#include <QElapsedTimer>
#include <QJsonDocument>
#include <QJsonObject>
#include <QtPlugin>
#include <emscripten.h>

#include <KisDocument.h>
#include <KisPart.h>
#include <KisViewManager.h>
#include <KoCanvasResourceProvider.h>
#include <KoCanvasResourcesIds.h>
#include <KoColor.h>
#include <KoColorSpaceRegistry.h>
#include <KoCompositeOpRegistry.h>
#include <KisGlobalResourcesInterface.h>
#include <brushengine/kis_paint_information.h>
#include <brushengine/kis_paintop_preset.h>
#include <kis_image.h>
#include <kis_paint_device.h>
#include <kis_paint_layer.h>
#include <kis_resources_snapshot.h>
#include <kis_stroke_strategy.h>
#include <KisAsynchronousStrokeUpdateHelper.h>
#include <strokes/freehand_stroke.h>
#include <strokes/KisFreehandStrokeInfo.h>
#include <kis_painter.h>

Q_IMPORT_PLUGIN(PluginFactory)                  // LittleCMS colour engine
Q_IMPORT_PLUGIN(DefaultPaintOpsPluginFactory)   // pixel brush and friends
Q_IMPORT_PLUGIN(KraImportFactory)                  // .kra import
Q_IMPORT_PLUGIN(HeadlessPlugin)                 // display-less Qt platform (headless_qpa.cpp)

static void publish(const char *name, const QImage &image)
{
    QByteArray png;
    QBuffer buffer(&png);
    buffer.open(QIODevice::WriteOnly);
    image.save(&buffer, "PNG");
    MAIN_THREAD_EM_ASM({
        (window.kritaSpike = window.kritaSpike || { images: {} }).images[UTF8ToString($0)] =
            URL.createObjectURL(new Blob([HEAPU8.slice($1, $1 + $2)], { type: 'image/png' }));
    }, name, png.constData(), int(png.size()));
}

static void step(const char *what)
{
    MAIN_THREAD_EM_ASM({ console.log('[spike] ' + UTF8ToString($0)); }, what);
}

static QImage render(KisImageSP image)
{
    image->waitForDone();
    return image->projection()->convertToQImage(nullptr, image->bounds());
}

int main(int argc, char *argv[])
{
    QElapsedTimer total, t;
    total.start();
    QJsonObject report;

    qputenv("QT_QPA_PLATFORM", "kritaheadless");
    qputenv("FONTCONFIG_FILE", "/etc/fonts/fonts.conf");
    QStandardPaths::setTestModeEnabled(true);
    QApplication app(argc, argv);
    t.start();
    step("registerResources");
    registerResources();
    step("colour spaces");
    const KoColorSpace *rgb8 = KoColorSpaceRegistry::instance()->rgb8();
    report["initMs"] = t.elapsed();
    report["colorSpace"] = rgb8->name();
    report["blendModes"] = int(rgb8->compositeOps().size());

    step("open .kra");
    // 1. open and render a real Krita document
    t.start();
    KisDocument *doc = KisPart::instance()->createDocument();
    doc->setFileBatchMode(true);
    const bool opened = doc->openPath("/data/load_test.kra", KisDocument::DontAddToRecent);
    report["kraOpened"] = opened;
    if (!opened) report["kraError"] = doc->errorMessage();
    if (opened) {
        KisImageSP image = doc->image();
        step("render .kra");
        const QImage rendered = render(image);
        report["kraLoadAndRenderMs"] = t.elapsed();
        report["kraSize"] = QString("%1x%2").arg(image->width()).arg(image->height());
        report["kraLayers"] = int(image->root()->childCount());
        publish("document", rendered);
    }

    // 2. replay a brush stroke through Krita's stroke system with a bundled preset
    step("create stroke image");
    const int side = 1024;
    KisImageSP image = new KisImage(nullptr, side, side, rgb8, "stroke");
    KisPaintLayerSP layer = new KisPaintLayer(image, "paint", OPACITY_OPAQUE_U8);
    layer->paintDevice()->fill(image->bounds(), KoColor(Qt::white, rgb8));
    image->addNode(layer);
    image->initialRefreshGraph();

    step("load preset");
    KisPaintOpPresetSP preset(new KisPaintOpPreset("/data/preset.kpp"));
    report["presetLoaded"] = preset->load(KisGlobalResourcesInterface::instance());

    KoCanvasResourceProvider *manager = new KoCanvasResourceProvider();
    KisViewManager::initializeResourceManager(manager);
    QVariant v;
    v.setValue(KoColor(QColor(20, 60, 160), rgb8)); manager->setResource(KoCanvasResource::ForegroundColor, v);
    v.setValue(KoColor(Qt::white, rgb8));           manager->setResource(KoCanvasResource::BackgroundColor, v);
    v.setValue(KisNodeSP(layer));                   manager->setResource(KoCanvasResource::CurrentKritaNode, v);
    v.setValue(preset);                             manager->setResource(KoCanvasResource::CurrentPaintOpPreset, v);
    v.setValue(COMPOSITE_OVER);                     manager->setResource(KoCanvasResource::CurrentCompositeOp, v);
    v.setValue(1.0);                                manager->setResource(KoCanvasResource::Opacity, v);

    t.start();
    step("stroke");
    KisResourcesSnapshotSP resources = new KisResourcesSnapshot(image, layer, manager);
    KisStrokeId stroke = image->startStroke(
        new FreehandStrokeStrategy(resources, new KisFreehandStrokeInfo(), kundo2_noi18n("Freehand Stroke")));

    // an S-curve with pressure rising then falling, as a pen would deliver it
    const int segments = 400;
    auto sample = [&](int i) {
        const qreal u = qreal(i) / segments;
        KisPaintInformation pi(QPointF(100 + 824 * u, 512 + 300 * std::sin(u * 2 * M_PI)),
                               0.15 + 0.85 * std::sin(u * M_PI));
        pi.setCurrentTime(i * 4);
        return pi;
    };
    for (int i = 0; i < segments; i++) {
        image->addJob(stroke, new FreehandStrokeStrategy::Data(0, sample(i), sample(i + 1)));
        image->addJob(stroke, new KisAsynchronousStrokeUpdateHelper::UpdateData(true));
    }
    step("stroke queued");
    image->endStroke(stroke);
    image->waitForDone();
    const qint64 strokeMs = t.elapsed();
    report["strokeSegments"] = segments;
    report["strokeMs"] = strokeMs;
    report["msPerSegment"] = double(strokeMs) / segments;
    publish("stroke", render(image));

    report["totalMs"] = total.elapsed();
    const QByteArray json = QJsonDocument(report).toJson(QJsonDocument::Compact);
    MAIN_THREAD_EM_ASM({
        (window.kritaSpike = window.kritaSpike || { images: {} }).report = JSON.parse(UTF8ToString($0));
        window.dispatchEvent(new Event('kritaspike'));
    }, json.constData());
    return 0;
}
