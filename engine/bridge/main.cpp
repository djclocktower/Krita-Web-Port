// The engine side of web/src/engine/protocol.ts: Krita's core, headless, in a worker thread,
// driven by JSON requests from the page and reporting back with JSON events (+ optional bytes).
//
//   page  -> kw_request(id, method, paramsJson, bytes)      (any thread; hops to Krita's thread)
//   core  -> Module.kwOnMessage(json, bytes|null)           (on the browser's main thread)
#define TESTUI
#include <kistest.h>            // Krita's own headless bootstrap (registerResources)

#include <QBuffer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QTimer>
#include <QtPlugin>
#include <emscripten.h>

#include <KisDocument.h>
#include <KisPart.h>
#include <KisViewManager.h>
#include <KisGlobalResourcesInterface.h>
#include <KisResourceModel.h>
#include <KisStorageModel.h>
#include <KoCanvasResourceProvider.h>
#include <KoCanvasResourcesIds.h>
#include <KoColor.h>
#include <KoColorProfile.h>
#include <KoColorSpaceRegistry.h>
#include <KoCompositeOpRegistry.h>
#include <KoDocumentInfo.h>
#include <KoShapeControllerBase.h>
#include <brushengine/kis_paint_information.h>
#include <brushengine/kis_paintop_preset.h>
#include <brushengine/kis_paintop_settings.h>
#include <commands/kis_image_layer_add_command.h>
#include <commands/kis_image_layer_move_command.h>
#include <commands/kis_image_layer_remove_command.h>
#include <commands/kis_node_compositeop_command.h>
#include <commands/kis_node_opacity_command.h>
#include <filter/kis_filter.h>
#include <filter/kis_filter_configuration.h>
#include <filter/kis_filter_registry.h>
#include <generator/kis_generator.h>
#include <generator/kis_generator_layer.h>
#include <generator/kis_generator_registry.h>
#include <kis_adjustment_layer.h>
#include <kis_clone_layer.h>
#include <lazybrush/kis_colorize_mask.h>
#include <kis_file_layer.h>
#include <kis_filter_mask.h>
#include <kis_group_layer.h>
#include <kis_image.h>
#include <kis_node_filter_interface.h>
#include <kis_paint_device.h>
#include <kis_paint_layer.h>
#include <kis_resources_snapshot.h>
#include <kis_selection_mask.h>
#include <flake/kis_shape_layer.h>
#include <kis_transaction.h>
#include <kis_transform_mask.h>
#include <kis_transparency_mask.h>
#include <kis_undo_adapter.h>
#include <kundo2stack.h>
#include <KisAsynchronousStrokeUpdateHelper.h>
#include <strokes/freehand_stroke.h>
#include <strokes/KisFreehandStrokeInfo.h>

#include "plugins.inc"                          // Q_IMPORT_PLUGIN for every linked Krita plugin
Q_IMPORT_PLUGIN(HeadlessPlugin)                 // display-less Qt platform (../spike/headless_qpa.cpp)

using Params = QJsonObject;

// ---------------------------------------------------------------------------------------- to the page

static void post(const QJsonObject &message, const QByteArray &bytes = QByteArray())
{
    const QByteArray json = QJsonDocument(message).toJson(QJsonDocument::Compact);
    char *j = static_cast<char *>(malloc(json.size() + 1));
    memcpy(j, json.constData(), json.size() + 1);
    char *b = nullptr;
    if (!bytes.isEmpty()) {
        b = static_cast<char *>(malloc(bytes.size()));
        memcpy(b, bytes.constData(), bytes.size());
    }
    // Asynchronous so Krita's thread never waits for the page; the page frees the buffers.
    MAIN_THREAD_ASYNC_EM_ASM({
        try { Module.kwOnMessage(UTF8ToString($0), $1 ? HEAPU8.subarray($1, $1 + $2) : null); }
        finally { _free($0); if ($1) _free($1); }
    }, j, b, int(bytes.size()));
}

static void emitEvent(const char *name, QJsonObject fields = QJsonObject(), const QByteArray &bytes = QByteArray())
{
    fields["event"] = name;
    post(fields, bytes);
}

struct Failure { QString message; };
[[noreturn]] static void fail(const QString &message) { throw Failure{message}; }

static QByteArray toPng(const QImage &image)
{
    QByteArray png;
    QBuffer buffer(&png);
    buffer.open(QIODevice::WriteOnly);
    image.save(&buffer, "PNG");
    return png;
}

// ---------------------------------------------------------------------------------------- the engine

class Engine : public QObject
{
    Q_OBJECT
public:
    Engine()
    {
        rgb8 = KoColorSpaceRegistry::instance()->rgb8();
        manager = new KoCanvasResourceProvider(this);
        KisViewManager::initializeResourceManager(manager);
        setResource(KoCanvasResource::ForegroundColor, KoColor(Qt::black, rgb8));
        setResource(KoCanvasResource::BackgroundColor, KoColor(Qt::white, rgb8));
        setResource(KoCanvasResource::CurrentCompositeOp, COMPOSITE_OVER);
        setResource(KoCanvasResource::Opacity, 1.0);

        flushTimer.setSingleShot(true);
        flushTimer.setInterval(8);
        connect(&flushTimer, &QTimer::timeout, this, &Engine::flushImage);
        layersTimer.setSingleShot(true);
        layersTimer.setInterval(0);
        connect(&layersTimer, &QTimer::timeout, this, [] { emitEvent("layersChanged"); });
    }

    QJsonValue handle(const QString &m, const Params &p, const QByteArray &data, QByteArray &out);

    /// Krita's own default brush, so the app opens ready to paint.
    void selectDefaultPreset()
    {
        KisResourceModel model(ResourceType::PaintOpPresets);
        int fallback = -1;
        for (int row = 0; row < model.rowCount(); row++) {
            const QModelIndex i = model.index(row, 0);
            const int id = model.data(i, Qt::UserRole + KisAbstractResourceModel::Id).toInt();
            if (fallback < 0) fallback = id;
            if (model.data(i, Qt::UserRole + KisAbstractResourceModel::Name).toString().contains("Basic-5 Size")) { fallback = id; break; }
        }
        if (fallback >= 0) selectPreset(model.resourceForId(fallback).dynamicCast<KisPaintOpPreset>(), QString::number(fallback));
    }

private:
    const KoColorSpace *rgb8 = nullptr;
    KoCanvasResourceProvider *manager = nullptr;
    KisDocument *doc = nullptr;
    KisNodeSP active;
    KisNodeSP previewMask;
    QString presetId;
    KisStrokeId stroke;
    KisPaintInformation last;
    QRect pending;
    QTimer flushTimer, layersTimer;

    template <class T> void setResource(int key, const T &value) { manager->setResource(key, QVariant::fromValue(value)); }
    KisImageSP image() const { if (!doc) fail("No document is open"); return doc->image(); }

    // --- documents
    void adopt(KisDocument *document)
    {
        if (doc) { doc->image()->disconnect(this); doc->undoStack()->disconnect(this); doc->deleteLater(); }
        doc = document; previewMask = nullptr; stroke.clear();
        KisImageSP img = doc->image();
        connect(img.data(), &KisImage::sigImageUpdated, this, [this](const QRect &rc) { pending |= rc; if (!flushTimer.isActive()) flushTimer.start(); });
        connect(img.data(), &KisImage::sigNodeAddedAsync, this, [this] { layersTimer.start(); });
        connect(img.data(), &KisImage::sigRemoveNodeAsync, this, [this] { layersTimer.start(); });
        connect(img.data(), &KisImage::sigNodeChanged, this, [this] { layersTimer.start(); });
        connect(img.data(), &KisImage::sigLayersChangedAsync, this, [this] { layersTimer.start(); });
        connect(doc->undoStack(), &KUndo2Stack::indexChanged, this, [this] { emitHistory(); });

        active = nullptr;
        for (KisNodeSP n = img->root()->lastChild(); n && !active; n = n->prevSibling())
            if (n->inherits("KisPaintLayer")) active = n;
        if (!active) active = img->root()->lastChild();
        setResource(KoCanvasResource::CurrentKritaNode, active);

        emitEvent("documentChanged", {{"info", info()}});
        emitEvent("layersChanged");
        emitEvent("activeNodeChanged", {{"id", active ? QJsonValue(idOf(active)) : QJsonValue()}});
        emitHistory();
        refresh();
    }
    QJsonObject info() const
    {
        KisImageSP img = image();
        const KoColorSpace *cs = img->colorSpace();
        QString name = doc->documentInfo()->aboutInfo("title");
        if (name.isEmpty()) name = QFileInfo(doc->path()).fileName();
        return {{"name", name.isEmpty() ? QString("Untitled") : name}, {"width", img->width()}, {"height", img->height()},
                {"resolutionPpi", img->xRes() * 72.0}, {"colorModel", cs->colorModelId().id()},
                {"colorDepth", cs->colorDepthId().id()}, {"profile", cs->profile() ? cs->profile()->name() : QString()},
                {"modified", doc->isModified()}};
    }
    void refresh() { pending = image()->bounds(); flushImage(); }
    void flushImage()
    {
        if (!doc || pending.isEmpty()) return;
        KisImageSP img = image();
        const QRect rc = pending & img->bounds();
        pending = QRect();
        if (rc.isEmpty()) return;
        // ponytail: converts the dirty rect on Krita's GUI thread and copies it twice; move to a
        // shared tile cache when profiling shows this in the stroke path.
        const QImage rgba = img->projection()->convertToQImage(nullptr, rc).convertToFormat(QImage::Format_RGBA8888);
        QByteArray bytes(rc.width() * rc.height() * 4, Qt::Uninitialized);
        for (int y = 0; y < rc.height(); y++) memcpy(bytes.data() + y * rc.width() * 4, rgba.constScanLine(y), rc.width() * 4);
        emitEvent("imageUpdate", {{"rect", QJsonObject{{"x", rc.x()}, {"y", rc.y()}, {"width", rc.width()}, {"height", rc.height()}}}}, bytes);
    }
    void emitHistory()
    {
        KUndo2Stack *s = doc->undoStack();
        emitEvent("historyChanged", {{"state", QJsonObject{{"canUndo", s->canUndo()}, {"canRedo", s->canRedo()},
                                                           {"undoText", s->undoText()}, {"redoText", s->redoText()}}}});
    }

    // --- nodes
    static QString idOf(KisNodeSP node) { return node->uuid().toString(QUuid::WithoutBraces); }
    KisNodeSP find(const QString &id, KisNodeSP from = nullptr) const
    {
        if (!from) from = image()->root();
        if (idOf(from) == id) return from;
        for (KisNodeSP c = from->firstChild(); c; c = c->nextSibling())
            if (KisNodeSP hit = find(id, c)) return hit;
        return nullptr;
    }
    KisNodeSP need(const QString &id) const { KisNodeSP n = find(id); if (!n) fail("No such node: " + id); return n; }
    static const char *typeOf(KisNodeSP n)
    {
        static const std::pair<const char *, const char *> types[] = {
            {"KisPaintLayer", "paint"}, {"KisGroupLayer", "group"}, {"KisAdjustmentLayer", "filter"}, {"KisGeneratorLayer", "fill"},
            {"KisCloneLayer", "clone"}, {"KisFileLayer", "file"}, {"KisShapeLayer", "vector"},
            {"KisTransparencyMask", "transparencyMask"}, {"KisFilterMask", "filterMask"}, {"KisColorizeMask", "colorizeMask"},
            {"KisTransformMask", "transformMask"}, {"KisSelectionMask", "selectionMask"}};
        for (const auto &t : types) if (n->inherits(t.first)) return t.second;
        return nullptr;
    }
    QJsonArray tree(KisNodeSP parent) const
    {
        QJsonArray list;
        for (KisNodeSP n = parent->lastChild(); n; n = n->prevSibling()) {
            const char *type = typeOf(n);
            if (!type || n == previewMask) continue;
            auto *paint = dynamic_cast<KisPaintLayer *>(n.data());
            QJsonObject o{{"id", idOf(n)}, {"type", type}, {"name", n->name()}, {"visible", n->visible()}, {"locked", n->userLocked()},
                          {"alphaLocked", paint && paint->alphaLocked()}, {"opacity", n->opacity() / 255.0},
                          {"blendMode", n->compositeOpId()}, {"collapsed", n->collapsed()}, {"children", tree(n)}};
            if (auto *f = dynamic_cast<KisNodeFilterInterface *>(n.data())) if (f->filter()) o["configId"] = f->filter()->name();
            list.append(o);
        }
        return list;
    }
    void setActive(KisNodeSP node)
    {
        active = node;
        setResource(KoCanvasResource::CurrentKritaNode, active);
        emitEvent("activeNodeChanged", {{"id", active ? QJsonValue(idOf(active)) : QJsonValue()}});
    }
    void insert(KisNodeSP node, const Params &p, const KUndo2MagicString &text)
    {
        KisImageSP img = image();
        KisNodeSP parent, above;
        if (p.contains("above")) { above = need(p["above"].toString()); parent = above->parent(); above = above; }
        else {
            parent = p.contains("parent") ? need(p["parent"].toString())
                   : (node->inherits("KisMask") && active ? (active->inherits("KisMask") ? active->parent() : active) : KisNodeSP(img->root()));
            above = parent->lastChild();
        }
        if (!parent->allowAsChild(node)) fail("That kind of node cannot be placed there");
        Q_UNUSED(text);
        img->undoAdapter()->addCommand(new KisImageLayerAddCommand(img, node, parent, above));
        setActive(node);
    }

    // --- settings <-> forms
    static QJsonValue toJson(const QVariant &v)
    {
        switch (v.typeId()) {
        case QMetaType::Bool: return v.toBool();
        case QMetaType::Int: case QMetaType::UInt: case QMetaType::LongLong: case QMetaType::ULongLong: return v.toDouble();
        case QMetaType::Double: case QMetaType::Float: return v.toDouble();
        case QMetaType::QColor: return v.value<QColor>().name();
        case QMetaType::QString: return v.toString();
        default: return QJsonValue(QJsonValue::Undefined);   // lists, blobs: no generic editor yet
        }
    }
    // ponytail: forms are inferred from each setting's stored type, so labels are raw keys and
    // numbers have no ranges. Per-filter and per-engine descriptions come with their dialogs.
    static QJsonObject describe(const KisPropertiesConfiguration &config, QJsonObject *values = nullptr)
    {
        static const QRegularExpression curve(QStringLiteral("^(-?[0-9.]+,-?[0-9.]+;)+$"));
        QJsonArray specs;
        QJsonObject defaults;
        const QMap<QString, QVariant> props = config.getProperties();
        for (auto it = props.begin(); it != props.end(); ++it) {
            const QJsonValue v = toJson(it.value());
            if (v.isUndefined()) continue;
            const char *kind = v.isBool() ? "boolean" : it.value().typeId() == QMetaType::QColor ? "color"
                : v.isString() ? (curve.match(v.toString()).hasMatch() ? "curve" : "string")
                : (it.value().typeId() == QMetaType::Double || it.value().typeId() == QMetaType::Float) ? "number" : "integer";
            specs.append(QJsonObject{{"key", it.key()}, {"label", it.key()}, {"kind", kind}});
            defaults[it.key()] = v;
        }
        if (values) *values = defaults;
        return {{"specs", specs}, {"defaults", defaults}};
    }
    static void apply(KisPropertiesConfiguration &config, const QJsonObject &values)
    {
        for (auto it = values.begin(); it != values.end(); ++it) {
            const QVariant current = config.getProperty(it.key());
            QVariant v = it.value().toVariant();
            if (current.isValid() && v.canConvert(current.metaType())) v.convert(current.metaType());
            config.setProperty(it.key(), v);
        }
    }
    KisFilterConfigurationSP filterConfig(const QString &id, const QJsonObject &values, bool generator = false) const
    {
        const KisBaseProcessor *f = nullptr;
        if (generator) f = KisGeneratorRegistry::instance()->value(id).data();
        else f = KisFilterRegistry::instance()->value(id).data();
        if (!f) fail("Unknown filter: " + id);
        KisFilterConfigurationSP cfg = f->defaultConfiguration(KisGlobalResourcesInterface::instance());
        apply(*cfg, values);
        return cfg;
    }
    void clearPreview()
    {
        if (!previewMask) return;
        KisNodeSP mask = previewMask;
        previewMask = nullptr;
        image()->removeNode(mask);
    }

    // --- brush
    KisPaintOpPresetSP preset() const { return manager->resource(KoCanvasResource::CurrentPaintOpPreset).value<KisPaintOpPresetSP>(); }
    QJsonObject brushJson() const
    {
        return QJsonObject{
            {"presetId", presetId.isEmpty() ? QJsonValue() : QJsonValue(presetId)},
            {"size", manager->resource(KoCanvasResource::Size).toDouble()},
            {"opacity", manager->resource(KoCanvasResource::Opacity).toDouble()},
            {"flow", manager->resource(KoCanvasResource::Flow).toDouble()},
            {"blendMode", manager->resource(KoCanvasResource::CurrentCompositeOp).toString()},
            {"eraser", manager->resource(KoCanvasResource::EraserMode).toBool()}};
    }
    void emitBrush() { emitEvent("brushChanged", {{"state", brushJson()}}); }
    static QJsonObject colorJson(const KoColor &c) { const QColor q = c.toQColor(); return {{"r", q.redF()}, {"g", q.greenF()}, {"b", q.blueF()}, {"a", q.alphaF()}}; }
    KoColor colorFrom(const QJsonObject &o) const
    {
        return KoColor(QColor::fromRgbF(o["r"].toDouble(), o["g"].toDouble(), o["b"].toDouble(), o["a"].toDouble(1.0)), rgb8);
    }
    static KisPaintInformation sample(const QJsonObject &o)
    {
        return KisPaintInformation(QPointF(o["x"].toDouble(), o["y"].toDouble()), qBound(0.0, o["pressure"].toDouble(1.0), 1.0),
                                   o["xTilt"].toDouble(), o["yTilt"].toDouble(), o["rotation"].toDouble(), 0.0, 1.0, o["timeMs"].toDouble(), 0.0);
    }
    void selectPreset(KisPaintOpPresetSP source, const QString &id)
    {
        if (!source) fail("Unknown preset: " + id);
        // a private copy, so editing the brush does not rewrite the stored resource
        KisPaintOpPresetSP copy = source->clone().dynamicCast<KisPaintOpPreset>();
        setResource(KoCanvasResource::CurrentPaintOpPreset, copy);
        presetId = id;
        emitBrush();
    }
};

QJsonValue Engine::handle(const QString &m, const Params &p, const QByteArray &data, QByteArray &out)
{
    // ---- documents
    if (m == "newDocument") {
        const int w = p["width"].toInt(), h = p["height"].toInt();
        if (w <= 0 || h <= 0 || qint64(w) * h > 400000000) fail("Invalid document size");
        KisDocument *d = KisPart::instance()->createDocument();
        d->setFileBatchMode(true);
        const KoColor bg = p.contains("background") ? colorFrom(p["background"].toObject()) : KoColor(Qt::white, rgb8);
        if (!d->newImage(p["name"].toString("Untitled"), w, h, rgb8, bg, KisConfig::RASTER_LAYER, 1, QString(), 300.0 / 72.0)) fail("Could not create the document");
        d->image()->waitForDone();
        adopt(d);
        return info();
    }
    if (m == "openDocument") {
        const QString path = "/tmp/" + QFileInfo(p["fileName"].toString("document.kra")).fileName();
        QFile f(path);
        if (!f.open(QIODevice::WriteOnly) || f.write(data) != data.size()) fail("Could not store the file");
        f.close();
        KisDocument *d = KisPart::instance()->createDocument();
        d->setFileBatchMode(true);
        if (!d->openPath(path, KisDocument::DontAddToRecent)) { const QString e = d->errorMessage(); d->deleteLater(); fail(e.isEmpty() ? "Could not open " + p["fileName"].toString() : e); }
        d->image()->waitForDone();
        adopt(d);
        return info();
    }
    if (m == "exportDocument") {
        const QString format = p["format"].toString();
        const char *mime = format == "kra" ? "application/x-krita" : format == "png" ? "image/png" : format == "jpg" ? "image/jpeg" : nullptr;
        if (!mime) fail("Unsupported format: " + format);
        image()->waitForDone();
        const QString path = "/tmp/export." + format;
        if (!doc->exportDocumentSync(path, mime)) fail(doc->errorMessage().isEmpty() ? "Export failed" : doc->errorMessage());
        QFile f(path);
        if (!f.open(QIODevice::ReadOnly)) fail("Export produced no file");
        out = f.readAll();
        f.remove();
        return QJsonValue();
    }
    if (m == "documentInfo") return doc ? QJsonValue(info()) : QJsonValue();
    if (m == "refresh") { if (doc) refresh(); return QJsonValue(); }

    // ---- layers
    if (m == "layers") return doc ? tree(image()->root()) : QJsonArray();
    if (m == "blendModes") {
        QJsonArray list;
        const KoCompositeOpRegistry &reg = KoCompositeOpRegistry::instance();
        for (const KoID &category : reg.getCategories())
            for (const KoID &op : reg.getCompositeOps(category, rgb8))
                list.append(QJsonObject{{"id", op.id()}, {"name", op.name()}, {"category", category.name()}});
        return list;
    }
    if (m == "addNode") {
        KisImageSP img = image();
        const QString type = p["type"].toString(), name = p["name"].toString(type);
        const QString configId = p["configId"].toString();
        const QJsonObject config = p["config"].toObject();
        KisNodeSP node;
        KisLayerSP layer = qobject_cast<KisLayer *>(active.data());
        if (!layer && active) layer = qobject_cast<KisLayer *>(active->parent().data());
        if (type == "paint") node = new KisPaintLayer(img, name, OPACITY_OPAQUE_U8);
        else if (type == "group") node = new KisGroupLayer(img, name, OPACITY_OPAQUE_U8);
        else if (type == "filter") node = new KisAdjustmentLayer(img, name, filterConfig(configId, config)->cloneWithResourcesSnapshot(), nullptr);
        else if (type == "fill") node = new KisGeneratorLayer(img, name, filterConfig(configId, config, true)->cloneWithResourcesSnapshot(), nullptr);
        else if (type == "clone") { if (!layer) fail("Select a layer to clone first"); node = new KisCloneLayer(layer, img, name, OPACITY_OPAQUE_U8); }
        else if (type == "vector") node = new KisShapeLayer(doc->shapeController(), img, name, OPACITY_OPAQUE_U8);
        else if (type == "transparencyMask") { auto *mk = new KisTransparencyMask(img, name); node = mk; if (layer) mk->initSelection(layer); }
        else if (type == "filterMask") { auto *mk = new KisFilterMask(img, name); node = mk; mk->setFilter(filterConfig(configId, config)->cloneWithResourcesSnapshot()); if (layer) mk->initSelection(layer); }
        else if (type == "colorizeMask") node = new KisColorizeMask(img, name);
        else if (type == "transformMask") node = new KisTransformMask(img, name);
        else if (type == "selectionMask") { auto *mk = new KisSelectionMask(img, name); node = mk; if (layer) mk->initSelection(layer); }
        else fail("Adding a " + type + " layer is not supported yet");
        insert(node, p, kundo2_i18n("Add Layer"));
        return idOf(node);
    }
    if (m == "removeNode") {
        KisNodeSP n = need(p["id"].toString());
        KisNodeSP next = n->prevSibling() ? n->prevSibling() : n->nextSibling() ? n->nextSibling() : n->parent();
        image()->undoAdapter()->addCommand(new KisImageLayerRemoveCommand(image(), n));
        if (active == n) setActive(next == image()->root() ? KisNodeSP() : next);
        return QJsonValue();
    }
    if (m == "duplicateNode") {
        KisNodeSP n = need(p["id"].toString());
        KisNodeSP copy = n->clone();
        copy->setName(i18nc("duplicated layer name", "Copy of %1", n->name()));
        image()->undoAdapter()->addCommand(new KisImageLayerAddCommand(image(), copy, n->parent(), n));
        setActive(copy);
        return idOf(copy);
    }
    if (m == "moveNode") {
        KisNodeSP n = need(p["id"].toString());
        KisNodeSP parent, above;
        if (p.contains("above")) { above = need(p["above"].toString()); parent = above->parent(); }
        else { parent = p.contains("parent") ? need(p["parent"].toString()) : KisNodeSP(image()->root()); above = parent->lastChild(); }
        for (KisNodeSP a = parent; a; a = a->parent()) if (a == n) fail("Cannot move a node into itself");
        if (above == n) return QJsonValue();
        if (!parent->allowAsChild(n)) fail("That kind of node cannot be placed there");
        image()->undoAdapter()->addCommand(new KisImageLayerMoveCommand(image(), n, parent, above));
        return QJsonValue();
    }
    if (m == "mergeDown") {
        KisLayerSP layer = qobject_cast<KisLayer *>(need(p["id"].toString()).data());
        if (!layer || !layer->prevSibling() || !qobject_cast<KisLayer *>(layer->prevSibling().data())) fail("There is no layer below to merge into");
        KisNodeSP below = layer->prevSibling();
        image()->mergeDown(layer, nullptr);
        image()->waitForDone();
        setActive(find(idOf(below)) ? below : KisNodeSP(image()->root()->lastChild()));
        return QJsonValue();
    }
    if (m == "setNodeProperties") {
        KisNodeSP n = need(p["id"].toString());
        const QJsonObject props = p["props"].toObject();
        if (props.contains("opacity")) {
            const double o = props["opacity"].toDouble(-1);
            if (o < 0 || o > 1) fail("Opacity must be between 0 and 1");
            image()->undoAdapter()->addCommand(new KisNodeOpacityCommand(n, qRound(o * 255)));
        }
        if (props.contains("blendMode")) image()->undoAdapter()->addCommand(new KisNodeCompositeOpCommand(n, props["blendMode"].toString()));
        // ponytail: these four change the node directly and are not on the undo stack yet (Krita uses KisNodePropertyListCommand)
        if (props.contains("name")) n->setName(props["name"].toString());
        if (props.contains("visible")) n->setVisible(props["visible"].toBool());
        if (props.contains("locked")) n->setUserLocked(props["locked"].toBool());
        if (props.contains("collapsed")) n->setCollapsed(props["collapsed"].toBool());
        if (props.contains("alphaLocked")) if (auto *paint = dynamic_cast<KisPaintLayer *>(n.data())) paint->setAlphaLocked(props["alphaLocked"].toBool());
        n->setDirty();
        layersTimer.start();
        return QJsonValue();
    }
    if (m == "setActiveNode") { setActive(need(p["id"].toString())); return QJsonValue(); }
    if (m == "nodeThumbnail") {
        KisNodeSP n = need(p["id"].toString());
        const int size = qBound(8, p["size"].toInt(64), 1024);
        image()->waitForDone();
        out = toPng(n->createThumbnail(size, size, Qt::KeepAspectRatio));
        return QJsonValue();
    }

    // ---- painting
    if (m == "beginStroke") {
        if (!active || !active->paintDevice()) fail("The active layer cannot be painted on");
        if (!preset()) fail("No brush preset is selected");
        KisImageSP img = image();
        if (stroke) img->endStroke(stroke);
        KisResourcesSnapshotSP resources = new KisResourcesSnapshot(img, active, manager);
        // ponytail: straight segments between samples, no stabiliser; switch to KisToolFreehandHelper for Krita's smoothing modes
        stroke = img->startStroke(new FreehandStrokeStrategy(resources, new KisFreehandStrokeInfo(), kundo2_i18n("Freehand Brush Stroke")));
        last = sample(p["first"].toObject());
        img->addJob(stroke, new FreehandStrokeStrategy::Data(0, last));
        img->addJob(stroke, new KisAsynchronousStrokeUpdateHelper::UpdateData(true));
        return QJsonValue();
    }
    if (m == "continueStroke") {
        if (!stroke) return QJsonValue();
        KisImageSP img = image();
        for (const QJsonValue &v : p["points"].toArray()) {
            const KisPaintInformation next = sample(v.toObject());
            img->addJob(stroke, new FreehandStrokeStrategy::Data(0, last, next));
            last = next;
        }
        img->addJob(stroke, new KisAsynchronousStrokeUpdateHelper::UpdateData(true));
        return QJsonValue();
    }
    if (m == "endStroke") { if (stroke) { image()->endStroke(stroke); stroke.clear(); } return QJsonValue(); }
    if (m == "setColors") {
        if (p.contains("foreground")) setResource(KoCanvasResource::ForegroundColor, colorFrom(p["foreground"].toObject()));
        if (p.contains("background")) setResource(KoCanvasResource::BackgroundColor, colorFrom(p["background"].toObject()));
        emitEvent("colorChanged", {{"foreground", colorJson(manager->foregroundColor())}, {"background", colorJson(manager->backgroundColor())}});
        return QJsonValue();
    }
    if (m == "setBrush") {
        const QJsonObject s = p["state"].toObject();
        if (s.contains("size")) setResource(KoCanvasResource::Size, qBound(0.01, s["size"].toDouble(), 10000.0));
        if (s.contains("opacity")) setResource(KoCanvasResource::Opacity, qBound(0.0, s["opacity"].toDouble(), 1.0));
        if (s.contains("flow")) setResource(KoCanvasResource::Flow, qBound(0.0, s["flow"].toDouble(), 1.0));
        if (s.contains("blendMode")) setResource(KoCanvasResource::CurrentCompositeOp, s["blendMode"].toString());
        if (s.contains("eraser")) setResource(KoCanvasResource::EraserMode, s["eraser"].toBool());
        emitBrush();
        return QJsonValue();
    }
    if (m == "brushState") return brushJson();
    if (m == "colors") return QJsonObject{{"foreground", colorJson(manager->foregroundColor())}, {"background", colorJson(manager->backgroundColor())}};
    if (m == "undo" || m == "redo") {
        image()->waitForDone();
        m == "undo" ? doc->undoStack()->undo() : doc->undoStack()->redo();
        if (active && !find(idOf(active))) setActive(image()->root()->lastChild());
        return QJsonValue();
    }

    // ---- presets and resources
    if (m == "presets" || m == "presetTags") {
        KisResourceModel model(ResourceType::PaintOpPresets);
        const QString search = p["search"].toString(), tag = p["tag"].toString();
        QJsonArray list;
        QSet<QString> allTags;
        for (int row = 0; row < model.rowCount(); row++) {
            const QModelIndex i = model.index(row, 0);
            const QString name = model.data(i, Qt::UserRole + KisAbstractResourceModel::Name).toString();
            const QStringList tags = model.data(i, Qt::UserRole + KisAbstractResourceModel::Tags).toStringList();
            for (const QString &t : tags) allTags.insert(t);
            if ((!search.isEmpty() && !name.contains(search, Qt::CaseInsensitive)) || (!tag.isEmpty() && !tags.contains(tag))) continue;
            const QMap<QString, QVariant> meta = model.data(i, Qt::UserRole + KisAbstractResourceModel::MetaData).toMap();
            list.append(QJsonObject{{"id", QString::number(model.data(i, Qt::UserRole + KisAbstractResourceModel::Id).toInt())},
                                    {"name", name}, {"engine", meta.value("paintopid").toString()}, {"tags", QJsonArray::fromStringList(tags)}});
        }
        if (m == "presets") return list;
        QStringList sorted = allTags.values();
        sorted.sort(Qt::CaseInsensitive);
        return QJsonArray::fromStringList(sorted);
    }
    if (m == "presetThumbnail" || m == "selectPreset") {
        KisResourceModel model(ResourceType::PaintOpPresets);
        const QString id = p["id"].toString();
        if (m == "selectPreset") { selectPreset(model.resourceForId(id.toInt()).dynamicCast<KisPaintOpPreset>(), id); return QJsonValue(); }
        for (int row = 0; row < model.rowCount(); row++) {
            const QModelIndex i = model.index(row, 0);
            if (model.data(i, Qt::UserRole + KisAbstractResourceModel::Id).toInt() != id.toInt()) continue;
            out = toPng(model.data(i, Qt::UserRole + KisAbstractResourceModel::Thumbnail).value<QImage>());
            return QJsonValue();
        }
        fail("Unknown preset: " + id);
    }
    if (m == "presetSettings") {
        if (!preset()) fail("No brush preset is selected");
        QJsonObject values;
        const QJsonObject description = describe(*preset()->settings(), &values);
        return QJsonObject{{"description", description}, {"values", values}};
    }
    if (m == "setPresetSetting") {
        if (!preset()) fail("No brush preset is selected");
        if (!preset()->settings()->hasProperty(p["key"].toString())) fail("Unknown setting: " + p["key"].toString());
        apply(*preset()->settings(), QJsonObject{{p["key"].toString(), p["value"]}});
        emitBrush();
        return QJsonValue();
    }
    if (m == "importResource") {
        const QString name = QFileInfo(p["fileName"].toString()).fileName(), suffix = QFileInfo(name).suffix().toLower();
        const QString path = "/tmp/" + name;
        QFile f(path);
        if (!f.open(QIODevice::WriteOnly) || f.write(data) != data.size()) fail("Could not store the file");
        f.close();
        static const QHash<QString, QString> types = {{"kpp", ResourceType::PaintOpPresets}, {"gbr", ResourceType::Brushes}, {"gih", ResourceType::Brushes},
            {"pat", ResourceType::Patterns}, {"ggr", ResourceType::Gradients}, {"kpl", ResourceType::Palettes}, {"gpl", ResourceType::Palettes}};
        bool ok = false;
        if (suffix == "bundle" || suffix == "abr" || suffix == "asl") ok = KisStorageModel::instance()->importStorage(path, KisStorageModel::None);
        else if (types.contains(suffix)) ok = bool(KisResourceModel(types[suffix]).importResourceFile(path, false));
        else fail("Krita cannot import ." + suffix + " files as resources");
        if (!ok) fail("Could not import " + name);
        return QJsonValue();
    }

    // ---- filters and generators
    if (m == "filters" || m == "generators") {
        QJsonArray list;
        if (m == "filters") {
            for (KisFilterSP f : KisFilterRegistry::instance()->values())
                list.append(QJsonObject{{"id", f->id()}, {"name", f->name()}, {"category", f->menuCategory().name()},
                                        {"supportsAdjustmentLayers", f->supportsAdjustmentLayers()}});
        } else {
            for (KisGeneratorSP g : KisGeneratorRegistry::instance()->values())
                list.append(QJsonObject{{"id", g->id()}, {"name", g->name()}, {"category", QString("Fill")}, {"supportsAdjustmentLayers", true}});
        }
        return list;
    }
    if (m == "filterConfig" || m == "generatorConfig") return describe(*filterConfig(p["id"].toString(), {}, m == "generatorConfig"));
    if (m == "applyFilter") {
        KisNodeSP n = need(p["nodeId"].toString());
        KisPaintDeviceSP device = n->paintDevice();
        if (!device) fail("Filters can only be applied to layers with pixels");
        clearPreview();
        const QString id = p["filterId"].toString();
        KisFilterSP filter = KisFilterRegistry::instance()->value(id);
        if (!filter) fail("Unknown filter: " + id);
        KisFilterConfigurationSP cfg = filterConfig(id, p["config"].toObject())->cloneWithResourcesSnapshot();
        KisImageSP img = image();
        img->waitForDone();
        img->barrierLock();
        const QRect rc = img->bounds();
        KisTransaction transaction(kundo2_i18n("Filter: %1", filter->name()), device);
        filter->process(device, rc, cfg);
        transaction.commit(img->undoAdapter());
        img->unlock();
        n->setDirty(rc);
        return QJsonValue();
    }
    if (m == "previewFilter") {
        clearPreview();
        if (p["filterId"].isNull()) return QJsonValue();
        KisNodeSP n = need(p["nodeId"].toString());
        // A temporary filter mask shows the effect without touching pixels or the undo stack.
        auto *mask = new KisFilterMask(image(), "preview");
        mask->setFilter(filterConfig(p["filterId"].toString(), p["config"].toObject())->cloneWithResourcesSnapshot());
        if (auto *layer = qobject_cast<KisLayer *>(n.data())) mask->initSelection(layer);
        previewMask = mask;
        image()->addNode(previewMask, n);
        return QJsonValue();
    }
    if (m == "nodeConfig" || m == "setNodeConfig") {
        KisNodeSP n = need(p["id"].toString());
        auto *f = dynamic_cast<KisNodeFilterInterface *>(n.data());
        if (!f || !f->filter()) fail("This node has no filter or generator settings");
        if (m == "nodeConfig") {
            QJsonObject values;
            describe(*f->filter(), &values);
            return QJsonObject{{"configId", f->filter()->name()}, {"values", values}};
        }
        // ponytail: not on the undo stack yet (Krita uses KisChangeFilterCmd)
        KisFilterConfigurationSP cfg = f->filter()->clone();
        apply(*cfg, p["config"].toObject());
        f->setFilter(cfg->cloneWithResourcesSnapshot());
        n->setDirty();
        return QJsonValue();
    }
    fail("Unknown method: " + m);
}

// ---------------------------------------------------------------------------------------- from the page

static Engine *g_engine = nullptr;

// Request bytes (a file to open, a resource to import) are written by the page to params.__file
// in the virtual filesystem, which avoids copying large buffers through the call stack.
extern "C" EMSCRIPTEN_KEEPALIVE void kw_request(int id, const char *method, const char *paramsJson)
{
    const QString m = QString::fromUtf8(method);
    const QJsonObject params = QJsonDocument::fromJson(paramsJson).object();
    QMetaObject::invokeMethod(g_engine, [id, m, params] {
        QJsonObject reply{{"id", id}};
        QByteArray data, out;
        if (params.contains("__file")) {
            QFile f(params["__file"].toString());
            if (f.open(QIODevice::ReadOnly)) data = f.readAll();
            f.remove();
        }
        try {
            reply["result"] = g_engine->handle(m, params, data, out);
        } catch (const Failure &f) {
            reply["error"] = f.message;
        } catch (const std::exception &e) {
            reply["error"] = QString::fromUtf8(e.what());
        }
        if (id) post(reply, out);                  // id 0 = fire-and-forget (stroke samples)
        else if (reply.contains("error")) emitEvent("error", {{"message", reply["error"]}, {"method", m}});
    }, Qt::QueuedConnection);
}

int main(int argc, char *argv[])
{
    qputenv("QT_QPA_PLATFORM", "kritaheadless");
    qputenv("FONTCONFIG_FILE", "/etc/fonts/fonts.conf");
    QStandardPaths::setTestModeEnabled(true);
    QApplication app(argc, argv);
    registerResources();
    g_engine = new Engine;
    g_engine->selectDefaultPreset();
    emitEvent("ready");
    return app.exec();
}

#include "main.moc"
