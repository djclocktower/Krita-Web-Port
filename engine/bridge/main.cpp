// The engine side of web/src/engine/protocol.ts: Krita's core, headless, in a worker thread,
// driven by JSON requests from the page and reporting back with JSON events (+ optional bytes).
//
//   page  -> kw_request(id, method, paramsJson, bytes)      (any thread; hops to Krita's thread)
//   core  -> Module.kwOnMessage(json, bytes|null)           (on the browser's main thread)
#define TESTUI
#define KRITA_KEEP_RESOURCE_CACHE   // a prebuilt resource database may already be in place (see make-resource-cache.mjs)
#include <kistest.h>            // Krita's own headless bootstrap (registerResources)

#include <QBuffer>
#include <QElapsedTimer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QThread>
#include <QTimer>
#include <QtPlugin>
#include <emscripten.h>
#include <utime.h>

#include <KisApplication.h>
#include <KisDocument.h>
#include <KisMainWindow.h>
#include <kis_canvas_resource_provider.h>
#include <kis_node_manager.h>
#include <KisView.h>
#include <kis_canvas2.h>
#include <kis_config.h>
#include <KoToolManager.h>
#include <KoZoomMode.h>
#include <qpa/qwindowsysteminterface.h>
#include <kis_canvas_controller.h>
#include <kis_coordinates_converter.h>
#include <QMouseEvent>
#include <QApplication>
#include <QDockWidget>
#include <QDir>
#include <KisResourceLoaderRegistry.h>
#include <KisResourceLoader.h>
#include <brushengine/kis_paintop_registry.h>
#include <kis_canvas_decoration.h>
#include <QPainter>
#include <QSet>
#include <kis_canvas_widget_base.h>
#include <QPointer>
#include <kactioncollection.h>
#include <KisImportExportManager.h>
#include <KisMimeDatabase.h>
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

#include <processing/kis_mirror_processing_visitor.h>
#include <KoColorConversionTransformation.h>
#include <KoColorModelStandardIds.h>
#include <KoStopGradient.h>
#include <commands/kis_deselect_global_selection_command.h>
#include <commands/kis_set_global_selection_command.h>
#include <kis_command_utils.h>
#include <kis_default_bounds.h>
#include <KisImageResolutionProxy.h>
#include <kis_fill_painter.h>
#include <kis_filter_strategy.h>
#include <kis_gradient_painter.h>
#include <kis_image_animation_interface.h>
#include <kis_keyframe_channel.h>
#include <kis_painter.h>
#include <kis_pixel_selection.h>
#include <kis_processing_applicator.h>
#include <kis_selection.h>
#include <kis_time_span.h>

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

static QAtomicInt g_updatesInFlight;

struct Failure { QString message; };

/// KeyboardEvent.key -> Qt::Key
static int qtKey(const QString &key)
{
    static const QHash<QString, int> names{
        {"Enter", Qt::Key_Return}, {"Escape", Qt::Key_Escape}, {"Backspace", Qt::Key_Backspace}, {"Delete", Qt::Key_Delete},
        {"Tab", Qt::Key_Tab}, {"ArrowLeft", Qt::Key_Left}, {"ArrowRight", Qt::Key_Right}, {"ArrowUp", Qt::Key_Up},
        {"ArrowDown", Qt::Key_Down}, {"Home", Qt::Key_Home}, {"End", Qt::Key_End}, {"PageUp", Qt::Key_PageUp},
        {"PageDown", Qt::Key_PageDown}, {"Insert", Qt::Key_Insert}, {"Shift", Qt::Key_Shift}, {"Control", Qt::Key_Control},
        {"Alt", Qt::Key_Alt}, {"Meta", Qt::Key_Meta}, {" ", Qt::Key_Space}};
    if (names.contains(key)) return names[key];
    if (key.size() == 1) return key.at(0).toUpper().unicode();
    bool ok = false;
    const int f = key.mid(1).toInt(&ok);
    return key.startsWith('F') && ok ? Qt::Key_F1 + f - 1 : Qt::Key_unknown;
}

static const char *cssCursor(Qt::CursorShape shape)
{
    switch (shape) {
    case Qt::ArrowCursor: return "default";
    case Qt::IBeamCursor: return "text";
    case Qt::SizeVerCursor: return "ns-resize";
    case Qt::SizeHorCursor: return "ew-resize";
    case Qt::SizeBDiagCursor: return "nesw-resize";
    case Qt::SizeFDiagCursor: return "nwse-resize";
    case Qt::SizeAllCursor: return "move";
    case Qt::BlankCursor: return "none";
    case Qt::PointingHandCursor: return "pointer";
    case Qt::ForbiddenCursor: return "not-allowed";
    case Qt::OpenHandCursor: return "grab";
    case Qt::ClosedHandCursor: return "grabbing";
    case Qt::WaitCursor: return "wait";
    case Qt::BusyCursor: return "progress";
    default: return "crosshair";   // ponytail: Krita's picture cursors are not sent; the page shows a crosshair
    }
}

static Qt::KeyboardModifiers modifiers(const QJsonObject &p)
{
    Qt::KeyboardModifiers mods;
    if (p["shift"].toBool()) mods |= Qt::ShiftModifier;
    if (p["ctrl"].toBool()) mods |= Qt::ControlModifier;
    if (p["alt"].toBool()) mods |= Qt::AltModifier;
    return mods;
}
static Qt::MouseButton mouseButton(const QJsonObject &p)
{
    const QString b = p["button"].toString();
    return b == "right" ? Qt::RightButton : b == "middle" ? Qt::MiddleButton : Qt::LeftButton;
}
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

/// Records the mouse events a widget receives (spike diagnostics).
class EventRecorder : public QObject
{
public:
    QStringList seen;
    bool eventFilter(QObject *, QEvent *e) override
    {
        if (e->type() == QEvent::MouseButtonPress || e->type() == QEvent::MouseButtonRelease || e->type() == QEvent::MouseMove) {
            auto *m = static_cast<QMouseEvent *>(e);
            seen << QString("%1@%2,%3 b%4 %5").arg(e->type() == QEvent::MouseButtonPress ? "press" : e->type() == QEvent::MouseButtonRelease ? "release" : "move")
                        .arg(qRound(m->position().x())).arg(qRound(m->position().y())).arg(int(m->buttons())).arg(e->spontaneous() ? "spont" : "synth");
        } else if (e->type() == QEvent::Enter || e->type() == QEvent::Leave || e->type() == QEvent::FocusOut || e->type() == QEvent::FocusIn) {
            seen << (e->type() == QEvent::Enter ? "enter" : e->type() == QEvent::Leave ? "leave" : e->type() == QEvent::FocusOut ? "focusOut" : "focusIn");
        }
        return false;
    }
};

class Engine : public QObject
{
    Q_OBJECT
public:
    Engine()
    {
        rgb8 = KoColorSpaceRegistry::instance()->rgb8();
        // Krita's own main window, created once with no display. Its view manager owns the canvas
        // resources (colours, brush preset, opacity) and the active layer, so the calls below and
        // Krita's own tools and menu actions all see and change the same state.
        KisConfig(false).disableOpenGL();
        window = KisPart::instance()->createMainWindow();
        window->resize(1600, 1000);
        window->show();
        // Krita's tool option panel becomes a window of its own, so the page can show it in its dock.
        if (auto *dock = window->findChild<QDockWidget *>("sharedtooldocker")) {
            toolOptions = dock;
            dock->setTitleBarWidget(new QWidget(dock));
            dock->setFloating(true);
            dock->resize(300, 500);
            dock->show();
        }
        windowTimer.setSingleShot(true);
        windowTimer.setInterval(30);
        connect(&windowTimer, &QTimer::timeout, this, &Engine::paintWindows);
        overlayTimer.setSingleShot(true);
        overlayTimer.setInterval(30);
        connect(&overlayTimer, &QTimer::timeout, this, &Engine::paintOverlay);
        connect(KoToolManager::instance(), &KoToolManager::changedTool, this, [] {
            emitEvent("kritaToolChanged", {{"id", KoToolManager::instance()->activeToolId()}});
        });
        if (toolOptions) trackWindow(toolOptions);
        manager = window->viewManager()->canvasResourceProvider()->resourceManager();
        connect(window->viewManager()->nodeManager(), &KisNodeManager::sigNodeActivated, this, [this](KisNodeSP node) {
            if (node == active || !doc) return;       // a Krita tool or action changed the active layer
            active = node;
            emitEvent("activeNodeChanged", {{"id", active ? QJsonValue(idOf(active)) : QJsonValue()}});
        });
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
    Q_INVOKABLE void flushPending() { flushImage(); }

    // While a stroke is open the image is busy, and many handlers wait for it to go idle. A request
    // that waits would block the queue that the stroke's own endStroke arrives on, deadlocking the
    // engine. So everything except the stroke itself is held until the stroke ends, then run in order.
    bool strokeOpen() const { return bool(stroke) || gestureOpen; }
    bool hasDeferred() const { return !deferred.isEmpty(); }
    void defer(std::function<void()> request) { deferred.append(std::move(request)); }
    void runDeferred()
    {
        while (!deferred.isEmpty() && !strokeOpen()) deferred.takeFirst()();
    }

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
    KisNodeSP previewNode;
    std::unique_ptr<KisTransaction> previewTransaction;
    QString presetId;
    KisStrokeId stroke;
    KisPaintInformation last;
    QRect pending;
    QTimer flushTimer, layersTimer;
    QList<std::function<void()>> deferred;

    template <class T> void setResource(int key, const T &value) { manager->setResource(key, QVariant::fromValue(value)); }
    KisImageSP image() const { if (!doc) fail("No document is open"); return doc->image(); }

    // --- Krita's own window and the view showing the current document
    KisMainWindow *window = nullptr;
    QPointer<KisView> view;
    bool pointerInside = false;
    bool gestureOpen = false;     // between a press and its release on Krita's canvas
    EventRecorder recorder;
    QPointer<QWidget> recorded;
    // --- Krita's own windows (dialogs, pop-ups, the tool option panel). Nothing displays them here,
    // so the page shows their picture and sends back the input.
    QHash<QWidget *, int> windows;
    QHash<QWidget *, size_t> painted;     // hash of the picture last sent
    QSet<QWidget *> dirtyWindows;
    QPointer<QWidget> toolOptions;
    QTimer windowTimer, overlayTimer;
    int nextWindowId = 1, filterEvents = 0, shows = 0, updateRequests = 0;
    bool grabbing = false, overlayShown = false;
    size_t overlayHash = 0;
    QSize viewportSize;
    QPointF viewportShift;                // where the page has image (0,0), minus where Krita's canvas managed to put it

    QJsonObject describe(QWidget *w) const
    {
        const QRect g = w->geometry();
        const bool popup = w->windowType() == Qt::Popup;
        QJsonObject o{{"id", windows.value(w)}, {"title", w->windowTitle()}, {"modal", w->isModal()},
                      {"kind", w == toolOptions ? "toolOptions" : qobject_cast<QDockWidget *>(w) ? "docker" : popup ? "popup" : "dialog"},
                      {"x", g.x()}, {"y", g.y()}, {"width", g.width()}, {"height", g.height()}};
        if (qobject_cast<QDockWidget *>(w) && w != toolOptions) o["docker"] = w->objectName();
        QWidget *parent = w->parentWidget() ? w->parentWidget()->window() : nullptr;
        if (parent && windows.contains(parent)) o["parent"] = windows.value(parent);
        return o;
    }
    void trackWindow(QWidget *w)
    {
        if (!windows.contains(w)) {
            windows[w] = nextWindowId++;
            connect(w, &QObject::destroyed, this, [this, w] { dropWindow(w); });
        }
        emitEvent("kritaWindow", {{"window", describe(w)}});
        dirtyWindows << w;
        if (!windowTimer.isActive()) windowTimer.start();
    }
    void dropWindow(QWidget *w)
    {
        if (!windows.contains(w)) return;
        emitEvent("kritaWindowClosed", {{"id", windows.take(w)}});
        dirtyWindows.remove(w);
        painted.remove(w);
    }
    void paintWindows()
    {
        const QSet<QWidget *> list = dirtyWindows;
        dirtyWindows.clear();
        grabbing = true;
        for (QWidget *w : list) {
            if (!windows.contains(w) || !w->isVisible()) continue;
            const QImage img = w->grab().toImage().convertToFormat(QImage::Format_RGBA8888);
            const size_t hash = qHashBits(img.constBits(), img.sizeInBytes());
            if (painted.value(w) == hash && painted.contains(w)) continue;      // a widget that repaints itself identically
            painted[w] = hash;
            emitEvent("kritaWindowPaint", {{"id", windows.value(w)}, {"width", img.width()}, {"height", img.height()}},
                      QByteArray(reinterpret_cast<const char *>(img.constBits()), img.sizeInBytes()));
        }
        grabbing = false;
    }
    /// What Krita draws over the image: the tool's handles and outlines, assistants, guides.
    void paintOverlay()
    {
        if (!view || !view->canvasBase() || viewportSize.isEmpty()) return;
        auto *base = dynamic_cast<KisCanvasWidgetBase *>(view->canvasBase()->canvasWidget());
        if (!base) return;
        QImage img(viewportSize, QImage::Format_ARGB32_Premultiplied);
        img.fill(Qt::transparent);
        {
            QPainter gc(&img);
            gc.translate(viewportShift);
            grabbing = true;
            base->drawDecorations(gc, QRect(QPoint(), viewportSize).translated(-viewportShift.toPoint()));
            grabbing = false;
        }
        // Only the part that has anything in it travels to the page.
        QRect used;
        for (int y = 0; y < img.height(); y++) {
            const quint32 *line = reinterpret_cast<const quint32 *>(img.constScanLine(y));
            int first = -1, last = -1;
            for (int x = 0; x < img.width(); x++) if (line[x]) { if (first < 0) first = x; last = x; }
            if (first >= 0) used |= QRect(first, y, last - first + 1, 1);
        }
        if (used.isEmpty()) {
            if (overlayShown) emitEvent("kritaOverlay");
            overlayShown = false;
            overlayHash = 0;
            return;
        }
        const QImage part = img.copy(used).convertToFormat(QImage::Format_RGBA8888);
        const size_t hash = qHashBits(part.constBits(), part.sizeInBytes(), size_t(used.x() * 7919 + used.y()));
        if (overlayShown && hash == overlayHash) return;
        overlayShown = true;
        overlayHash = hash;
        emitEvent("kritaOverlay", {{"rect", QJsonObject{{"x", used.x()}, {"y", used.y()}, {"width", used.width()}, {"height", used.height()}}}},
                  QByteArray(reinterpret_cast<const char *>(part.constBits()), part.sizeInBytes()));
    }
public:
    /// Sees every event before its receiver does (see WebApplication).
    void watch(QObject *o, QEvent *e)
    {
        filterEvents++;
        if (grabbing || !o->isWidgetType()) return;
        auto *w = static_cast<QWidget *>(o);
        if (e->type() == QEvent::Show && w->isWindow()) shows++;
        if (e->type() == QEvent::UpdateRequest) updateRequests++;
        switch (e->type()) {
        case QEvent::Show:
            if (w->isWindow() && w != window && w->windowType() != Qt::ToolTip && w->windowType() != Qt::Desktop) trackWindow(w);
            break;
        case QEvent::Hide:
            dropWindow(w);
            break;
        case QEvent::Resize:
        case QEvent::Move:
        case QEvent::WindowTitleChange:
            if (windows.contains(w)) trackWindow(w);
            break;
        case QEvent::UpdateRequest:
            if (windows.contains(w)) { dirtyWindows << w; if (!windowTimer.isActive()) windowTimer.start(); }
            else if (w == window && !overlayTimer.isActive()) overlayTimer.start();
            break;
        case QEvent::CursorChange:
            if (view && view->canvasBase() && w == view->canvasBase()->canvasWidget())
                emitEvent("kritaCursor", {{"cursor", cssCursor(w->cursor().shape())}});
            break;
        default:
            break;
        }
        return;
    }

private:
    KisView *kritaView()
    {
        image();
        if (!view) fail("Krita's view is not available");
        return view;
    }
    /// Shows `document` in Krita's window and makes it the current view. There is no window system,
    /// so no focus events: Krita has to be told explicitly which view and canvas are current.
    void showInWindow(KisDocument *document)
    {
        QPointer<KisView> oldView = view;
        KisPart::instance()->addDocument(document);
        view = window->addViewAndNotifyLoadingCompleted(document);
        QCoreApplication::processEvents();
        view->canvasController()->setZoom(KoZoomMode::ZOOM_CONSTANT, 1.0);
        window->setActiveView(view);
        view->canvasBase()->canvasWidget()->setFocus();
        // The page draws the selection outline itself (from selectionOutline()); Krita's would double it in the overlay.
        if (KisCanvasDecorationSP ants = view->canvasBase()->decoration("selection")) ants->setVisible(false);
        QFocusEvent focusIn(QEvent::FocusIn);
        QCoreApplication::sendEvent(view->canvasBase()->canvasWidget(), &focusIn);
        QCoreApplication::processEvents();
        pointerInside = false;
        if (oldView) {
            if (oldView->document()) oldView->document()->setModified(false);   // or closing asks "save changes?" in a dialog nobody can see
            oldView->closeView();
            QCoreApplication::processEvents();
        }
    }

    /// Krita's tools and actions finish through queued events and strokes. Run the event loop until
    /// the image has been idle for a while (or a time limit passes), without ever blocking on a
    /// stroke that is still open.
    void settle(int quietMs = 150, int limitMs = 3000)
    {
        QElapsedTimer total, quiet;
        total.start();
        quiet.start();
        while (total.elapsed() < limitMs) {
            QCoreApplication::processEvents(QEventLoop::AllEvents, 10);
            if (!doc || !doc->image()->isIdle()) quiet.restart();
            else if (quiet.elapsed() >= quietMs) return;
            QThread::msleep(2);
        }
    }

    // --- documents
    void adopt(KisDocument *document)
    {
        QPointer<KisDocument> oldDoc = doc;
        if (doc) { doc->image()->disconnect(this); doc->undoStack()->disconnect(this); }
        previewTransaction.reset(); previewNode = nullptr; doc = document; stroke.clear();
        showInWindow(doc);
        if (oldDoc) oldDoc->deleteLater();
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
        if (active) { window->viewManager()->nodeManager()->slotNonUiActivatedNode(active); window->viewManager()->nodeManager()->slotSetSelectedNodes(KisNodeList{active}); }   // tools act on the selected nodes, not only the active one
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
        // Back-pressure: one update in flight at a time. While the page is still drawing the last
        // one, dirty rects just keep accumulating here, so a slow brush cannot flood the page.
        if (g_updatesInFlight.loadAcquire() > 0) return;
        g_updatesInFlight.ref();
        KisImageSP img = image();
        const QRect rc = pending & img->bounds();
        pending = QRect();
        if (rc.isEmpty()) { g_updatesInFlight.deref(); return; }
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
            if (!type) continue;
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
        if (active) { window->viewManager()->nodeManager()->slotNonUiActivatedNode(active); window->viewManager()->nodeManager()->slotSetSelectedNodes(KisNodeList{active}); }   // tools act on the selected nodes, not only the active one
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

    // --- selections
    void emitSelection()
    {
        KisSelectionSP sel = doc ? doc->image()->globalSelection() : nullptr;
        const QRect rc = sel ? sel->selectedExactRect() : QRect();
        emitEvent("selectionChanged", {{"bounds", rc.isEmpty() ? QJsonValue()
            : QJsonValue(QJsonObject{{"x", rc.x()}, {"y", rc.y()}, {"width", rc.width()}, {"height", rc.height()}})}});
    }
    static QRect rectFrom(const QJsonObject &o)
    {
        return QRectF(o["x"].toDouble(), o["y"].toDouble(), o["width"].toDouble(), o["height"].toDouble()).toAlignedRect();
    }
    /// Combines `shape` with the current selection and makes the result the global selection (undoable).
    void select(KisPixelSelectionSP shape, const QString &mode)
    {
        static const QHash<QString, SelectionAction> actions = {{"replace", SELECTION_REPLACE}, {"add", SELECTION_ADD},
                                                                {"subtract", SELECTION_SUBTRACT}, {"intersect", SELECTION_INTERSECT}};
        if (!actions.contains(mode)) fail("Unknown selection mode: " + mode);
        KisImageSP img = image();
        img->waitForDone();
        KisSelectionSP next = new KisSelection(new KisDefaultBounds(img), toQShared(new KisImageResolutionProxy(img)));
        KisSelectionSP current = img->globalSelection();
        if (current && mode != "replace") next->pixelSelection()->applySelection(current->pixelSelection(), SELECTION_REPLACE);
        next->pixelSelection()->applySelection(shape, mode == "replace" || !current ? (mode == "subtract" || mode == "intersect" ? actions[mode] : SELECTION_REPLACE) : actions[mode]);
        next->pixelSelection()->invalidateOutlineCache();
        if (next->selectedExactRect().isEmpty()) { if (current) img->undoAdapter()->addCommand(new KisDeselectGlobalSelectionCommand(img)); }
        else img->undoAdapter()->addCommand(new KisSetGlobalSelectionCommand(img, next));
        img->waitForDone();
        emitSelection();
    }
    /// A pixel selection with a shape painted into it, antialiased, the way Krita's selection tools do.
    KisPixelSelectionSP paintedSelection(const std::function<void(KisPainter &)> &draw) const
    {
        KisPixelSelectionSP shape = new KisPixelSelection(new KisDefaultBounds(image()));
        KisPainter painter(shape);
        painter.setPaintColor(KoColor(Qt::black, shape->colorSpace()));
        painter.setFillStyle(KisPainter::FillStyleForegroundColor);
        painter.setStrokeStyle(KisPainter::StrokeStyleNone);
        painter.setAntiAliasPolygonFill(true);
        draw(painter);
        painter.end();
        return shape;
    }
    KisPaintDeviceSP paintTarget() const
    {
        if (!active || !active->paintDevice()) fail("The active layer has no pixels");
        if (active->userLocked()) fail("The active layer is locked");
        return active->paintDevice();
    }
    /// Runs `edit` on the active layer's pixels as one undoable step, limited to the selection by the painters used.
    void editPixels(const KUndo2MagicString &text, const std::function<void(KisPaintDeviceSP, KisSelectionSP)> &edit)
    {
        KisPaintDeviceSP device = paintTarget();
        KisImageSP img = image();
        img->waitForDone();
        img->barrierLock();
        KisTransaction transaction(text, device);
        edit(device, img->globalSelection());
        transaction.commit(img->undoAdapter());
        img->unlock();
        active->setDirty(img->bounds());
    }
    QJsonValue afterResize()
    {
        image()->waitForDone();
        if (active && !find(idOf(active))) setActive(image()->root()->lastChild());
        emitEvent("documentChanged", {{"info", info()}});
        emitSelection();
        refresh();
        return info();
    }

    // --- animation
    QJsonObject animationJson() const
    {
        KisImageAnimationInterface *a = image()->animationInterface();
        return {{"framesPerSecond", a->framerate()}, {"startTime", a->documentPlaybackRange().start()},
                {"endTime", a->documentPlaybackRange().end()}, {"currentTime", a->currentUITime()}};
    }
    static int frameFrom(const QJsonValue &v)
    {
        const double t = v.toDouble(-1);
        if (t < 0 || t != std::floor(t) || t > 100000) fail("Frame numbers are whole numbers from 0");
        return int(t);
    }
    /// Runs a keyframe edit inside a stroke, as Krita's timeline does, so it is undoable and frames regenerate.
    void editKeyframes(KisNodeSP node, const KUndo2MagicString &text, const std::function<void(KisKeyframeChannel *, KUndo2Command *)> &edit)
    {
        if (!node->paintDevice()) fail("Only layers with pixels can be animated");
        KisImageSP img = image();
        img->waitForDone();
        KisKeyframeChannel *channel = node->getKeyframeChannel(KisKeyframeChannel::Raster.id(), true);
        if (!channel) fail("This layer cannot be animated");
        KisProcessingApplicator::runSingleCommandStroke(img, new KisCommandUtils::LambdaCommand(text, [channel, edit]() -> KUndo2Command * {
            auto *cmd = new KUndo2Command();
            edit(channel, cmd);
            return cmd;
        }), KisStrokeJobData::BARRIER, KisStrokeJobData::EXCLUSIVE);
        img->waitForDone();
        node->setDirty();
        emitEvent("keyframesChanged", {{"id", idOf(node)}});
    }
    QList<int> keyframeTimes(KisNodeSP node) const
    {
        KisKeyframeChannel *channel = node->getKeyframeChannel(KisKeyframeChannel::Raster.id());
        QList<int> times = channel ? channel->allKeyframeTimes().values() : QList<int>();
        std::sort(times.begin(), times.end());
        return times;
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
    // A filter preview is the filter applied inside a transaction that is never committed:
    // clearing the preview reverts it, so pixels and the undo stack end up untouched.
    void clearPreview()
    {
        if (!previewTransaction) return;
        image()->waitForDone();
        previewTransaction->revert();
        previewTransaction.reset();
        if (previewNode) previewNode->setDirty();
        previewNode = nullptr;
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
    // An uncommitted preview must never leak into strokes, undo, or saved files.
    static const QSet<QString> keepsPreview = {"previewFilter", "applyFilter", "layers", "blendModes", "filters", "generators",
        "filterConfig", "generatorConfig", "documentInfo", "refresh", "nodeThumbnail", "brushState", "colors", "presets",
        "presetTags", "presetThumbnail", "presetSettings", "nodeConfig", "setColors", "setBrush"};
    if (previewTransaction && !keepsPreview.contains(m)) clearPreview();

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
        static const QHash<QString, const char *> mimes = {{"kra", "application/x-krita"}, {"png", "image/png"}, {"jpg", "image/jpeg"},
            {"psd", "image/vnd.adobe.photoshop"}, {"ora", "image/openraster"}, {"tga", "image/x-tga"}, {"bmp", "image/bmp"},
            {"tiff", "image/tiff"}, {"webp", "image/webp"}, {"gif", "image/gif"}, {"exr", "image/x-exr"}};
        // Anything else goes by its file extension through Krita's own file-type table.
        const QString mime = mimes.contains(format) ? QString::fromLatin1(mimes.value(format)) : KisMimeDatabase::mimeTypeForSuffix(format);
        if (mime.isEmpty()) fail("Unsupported format: " + format);
        // Krita's TIFF writer calls a missing function in this build and takes the engine down; refuse until that is fixed.
        if (format == "tiff") fail("TIFF export does not work in this build yet");
        if (!KisImportExportManager::supportedMimeTypes(KisImportExportManager::Export).contains(mime)) fail("This build of the engine cannot write ." + format + " files");
        image()->waitForDone();
        const QString path = "/tmp/export." + format;
        if (!doc->exportDocumentSync(path, mime.toLatin1())) fail(doc->errorMessage().isEmpty() ? "Export failed" : doc->errorMessage());
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
        // transform masks need the transform tool plugin (it registers their parameter factories); that arrives with the transform tool
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
    if (m == "activeNode") return active ? QJsonValue(idOf(active)) : QJsonValue();
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
        image()->waitForDone();
        // an undone step may have been a resize, a selection or a keyframe edit
        emitEvent("documentChanged", {{"info", info()}});
        emitSelection();
        emitEvent("animationChanged", {{"state", animationJson()}});
        std::function<void(KisNodeSP)> announce = [&](KisNodeSP n) {
            if (n->isAnimated()) emitEvent("keyframesChanged", {{"id", idOf(n)}});
            for (KisNodeSP c = n->firstChild(); c; c = c->nextSibling()) announce(c);
        };
        announce(image()->root());
        refresh();
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
        KisPaintDeviceSP device = n->paintDevice();
        if (!device) fail("Filters can only be previewed on layers with pixels");
        const QString id = p["filterId"].toString();
        KisFilterSP filter = KisFilterRegistry::instance()->value(id);
        if (!filter) fail("Unknown filter: " + id);
        KisFilterConfigurationSP cfg = filterConfig(id, p["config"].toObject())->cloneWithResourcesSnapshot();
        KisImageSP img = image();
        img->waitForDone();
        img->barrierLock();
        previewTransaction.reset(new KisTransaction(device));
        filter->process(device, img->bounds(), cfg);
        img->unlock();
        previewNode = n;
        n->setDirty();
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
    // ---- selections
    if (m == "selectAll") { KisPixelSelectionSP all = new KisPixelSelection(new KisDefaultBounds(image())); all->select(image()->bounds()); select(all, "replace"); return QJsonValue(); }
    if (m == "deselect") {
        if (image()->globalSelection()) image()->undoAdapter()->addCommand(new KisDeselectGlobalSelectionCommand(image()));
        image()->waitForDone();
        emitSelection();
        return QJsonValue();
    }
    if (m == "invertSelection") {
        KisPixelSelectionSP inverted = new KisPixelSelection(new KisDefaultBounds(image()));
        if (KisSelectionSP current = image()->globalSelection()) inverted->applySelection(current->pixelSelection(), SELECTION_REPLACE);
        inverted->invert();
        inverted->crop(image()->bounds());
        select(inverted, "replace");
        return QJsonValue();
    }
    if (m == "selectRect") {
        const QRect rc = rectFrom(p["rect"].toObject());
        KisPixelSelectionSP shape = new KisPixelSelection(new KisDefaultBounds(image()));
        shape->select(rc);
        select(shape, p["mode"].toString());
        return QJsonValue();
    }
    if (m == "selectEllipse") {
        const QJsonObject o = p["rect"].toObject();
        const QRectF rc(o["x"].toDouble(), o["y"].toDouble(), o["width"].toDouble(), o["height"].toDouble());
        select(paintedSelection([rc](KisPainter &g) { g.paintEllipse(rc); }), p["mode"].toString());
        return QJsonValue();
    }
    if (m == "selectPolygon") {
        QVector<QPointF> points;
        for (const QJsonValue &v : p["points"].toArray()) points.append(QPointF(v.toObject()["x"].toDouble(), v.toObject()["y"].toDouble()));
        if (points.size() < 3) fail("A polygon needs at least three points");
        select(paintedSelection([points](KisPainter &g) { g.paintPolygon(points); }), p["mode"].toString());
        return QJsonValue();
    }
    if (m == "selectSimilar") {
        const QJsonObject at = p["at"].toObject(), options = p["options"].toObject();
        // ponytail: contiguous only; Krita's "similar colour" (non-contiguous) selection is a separate tool
        if (!options["contiguous"].toBool(true)) fail("Selecting similar colours across the whole image is not supported yet");
        KisImageSP img = image();
        img->waitForDone();
        KisPaintDeviceSP source = options["sampleMerged"].toBool() ? img->projection() : paintTarget();
        KisFillPainter filler(source);
        filler.setWidth(img->width());
        filler.setHeight(img->height());
        filler.setFillThreshold(qBound(0, options["threshold"].toInt(20), 255));
        select(filler.createFloodSelection(int(at["x"].toDouble()), int(at["y"].toDouble()), source, nullptr), p["mode"].toString());
        return QJsonValue();
    }
    if (m == "selectionOutline") {
        QJsonArray outlines;
        if (KisSelectionSP sel = image()->globalSelection()) {
            for (const QPolygon &polygon : sel->pixelSelection()->outline()) {
                QJsonArray flat;
                for (const QPoint &pt : polygon) { flat.append(pt.x()); flat.append(pt.y()); }
                if (!polygon.isEmpty()) { flat.append(polygon.first().x()); flat.append(polygon.first().y()); }
                outlines.append(flat);
            }
        }
        return outlines;
    }

    // ---- fill and gradient
    if (m == "floodFill") {
        const QJsonObject at = p["at"].toObject(), options = p["options"].toObject();
        if (!options["contiguous"].toBool(true)) fail("Filling similar colours across the whole image is not supported yet");
        const KoColor color = p["source"].toString() == "background" ? manager->backgroundColor() : manager->foregroundColor();
        KisImageSP img = image();
        const bool merged = options["sampleMerged"].toBool();
        editPixels(kundo2_i18n("Fill"), [&](KisPaintDeviceSP device, KisSelectionSP selection) {
            KisFillPainter filler(device, selection);
            filler.setPaintColor(color);
            filler.setFillThreshold(qBound(0, options["threshold"].toInt(20), 255));
            filler.setWidth(img->width());
            filler.setHeight(img->height());
            filler.setCareForSelection(true);
            filler.fillColor(int(at["x"].toDouble()), int(at["y"].toDouble()), merged ? img->projection() : device);
        });
        return QJsonValue();
    }
    if (m == "fillSelection") {
        const KoColor color = p["source"].toString() == "background" ? manager->backgroundColor() : manager->foregroundColor();
        const QRect bounds = image()->bounds();
        editPixels(kundo2_i18n("Fill"), [&](KisPaintDeviceSP device, KisSelectionSP selection) {
            KisFillPainter filler(device, selection);
            filler.fillRect(bounds, color.convertedTo(device->colorSpace()));
        });
        return QJsonValue();
    }
    if (m == "clearSelection") {
        const QRect bounds = image()->bounds();
        editPixels(kundo2_i18n("Clear"), [&](KisPaintDeviceSP device, KisSelectionSP selection) {
            if (selection) device->clearSelection(selection); else device->clear(bounds);
        });
        return QJsonValue();
    }
    if (m == "drawGradient") {
        static const QHash<QString, KisGradientPainter::enumGradientShape> shapes = {
            {"linear", KisGradientPainter::GradientShapeLinear}, {"bilinear", KisGradientPainter::GradientShapeBiLinear},
            {"radial", KisGradientPainter::GradientShapeRadial}, {"square", KisGradientPainter::GradientShapeSquare},
            {"conical", KisGradientPainter::GradientShapeConical}, {"spiral", KisGradientPainter::GradientShapeSpiral}};
        static const QHash<QString, KisGradientPainter::enumGradientRepeat> repeats = {
            {"none", KisGradientPainter::GradientRepeatNone}, {"forwards", KisGradientPainter::GradientRepeatForwards},
            {"alternating", KisGradientPainter::GradientRepeatAlternate}};
        const QJsonObject from = p["from"].toObject(), to = p["to"].toObject(), options = p["options"].toObject();
        if (!shapes.contains(options["shape"].toString())) fail("Unknown gradient shape: " + options["shape"].toString());
        const QString repeat = options["repeat"].toString("none");
        if (!repeats.contains(repeat)) fail("Unknown gradient repeat: " + repeat);
        QLinearGradient stops;
        stops.setColorAt(0, manager->foregroundColor().toQColor());
        stops.setColorAt(1, manager->backgroundColor().toQColor());
        KoAbstractGradientSP gradient = KoStopGradient::fromQGradient(&stops);
        const QRect bounds = image()->bounds();
        editPixels(kundo2_i18n("Gradient"), [&](KisPaintDeviceSP device, KisSelectionSP selection) {
            KisGradientPainter painter(device, selection);
            painter.setGradient(gradient);
            painter.setGradientShape(shapes[options["shape"].toString()]);
            painter.paintGradient(QPointF(from["x"].toDouble(), from["y"].toDouble()), QPointF(to["x"].toDouble(), to["y"].toDouble()),
                                  repeats[repeat], 0.2, options["reverse"].toBool(), bounds);
        });
        return QJsonValue();
    }

    // ---- image operations
    if (m == "scaleImage") {
        const int w = p["width"].toInt(), h = p["height"].toInt();
        if (w <= 0 || h <= 0 || qint64(w) * h > 400000000) fail("Invalid image size");
        KisFilterStrategy *strategy = KisFilterStrategyRegistry::instance()->value(p["filter"].toString("Bicubic"));
        if (!strategy) fail("Unknown scaling filter: " + p["filter"].toString());
        image()->scaleImage(QSize(w, h), image()->xRes(), image()->yRes(), strategy);
        return afterResize();
    }
    if (m == "resizeCanvas") {
        const int w = p["width"].toInt(), h = p["height"].toInt();
        if (w <= 0 || h <= 0 || qint64(w) * h > 400000000) fail("Invalid canvas size");
        image()->resizeImage(QRect(-qRound(p["offsetX"].toDouble()), -qRound(p["offsetY"].toDouble()), w, h));
        return afterResize();
    }
    if (m == "cropImage") {
        const QRect rc = rectFrom(p["rect"].toObject());
        if (rc.width() < 1 || rc.height() < 1) fail("The crop area is empty");
        image()->cropImage(rc);
        return afterResize();
    }
    if (m == "rotateImage") {
        const double degrees = p["degrees"].toDouble();
        if (!std::isfinite(degrees)) fail("Invalid angle");
        image()->rotateImage(degrees * M_PI / 180.0);
        return afterResize();
    }
    if (m == "mirrorImage") {
        const QString axis = p["axis"].toString();
        if (axis != "horizontal" && axis != "vertical") fail("Unknown axis: " + axis);
        KisImageSP img = image();
        KisProcessingApplicator applicator(img, img->root(), KisProcessingApplicator::RECURSIVE, KisImageSignalVector(), kundo2_i18n("Mirror Image"));
        applicator.applyVisitor(new KisMirrorProcessingVisitor(img->bounds(), axis == "horizontal" ? Qt::Horizontal : Qt::Vertical), KisStrokeJobData::CONCURRENT);
        applicator.end();
        img->waitForDone();
        emitSelection();
        return QJsonValue();
    }
    if (m == "flattenImage") {
        image()->flatten(active);
        image()->waitForDone();
        setActive(image()->root()->lastChild());
        return QJsonValue();
    }

    // ---- colour management
    if (m == "colorSpaces") {
        QJsonArray list;
        KoColorSpaceRegistry *reg = KoColorSpaceRegistry::instance();
        for (const KoID &model : reg->colorModelsList(KoColorSpaceRegistry::OnlyUserVisible)) {
            for (const KoID &depth : reg->colorDepthList(model, KoColorSpaceRegistry::OnlyUserVisible)) {
                QStringList profiles;
                for (const KoColorProfile *profile : reg->profilesFor(reg->colorSpaceId(model, depth))) profiles << profile->name();
                profiles.sort(Qt::CaseInsensitive);
                list.append(QJsonObject{{"model", model.id()}, {"modelName", model.name()}, {"depth", depth.id()},
                                        {"depthName", depth.name()}, {"profiles", QJsonArray::fromStringList(profiles)}});
            }
        }
        return list;
    }
    if (m == "convertColorSpace") {
        const QString model = p["model"].toString(), depth = p["depth"].toString(), profile = p["profile"].toString();
        const KoColorSpace *cs = KoColorSpaceRegistry::instance()->colorSpace(model, depth, profile);
        if (!cs) fail(QString("Unsupported colour space: %1 %2 %3").arg(model, depth, profile));
        image()->convertImageColorSpace(cs, KoColorConversionTransformation::internalRenderingIntent(),
                                        KoColorConversionTransformation::internalConversionFlags());
        return afterResize();
    }

    // ---- animation
    if (m == "animation") return animationJson();
    if (m == "setAnimation") {
        const QJsonObject st = p["state"].toObject();
        KisImageAnimationInterface *a = image()->animationInterface();
        const int fps = st.contains("framesPerSecond") ? st["framesPerSecond"].toInt() : a->framerate();
        const int start = st.contains("startTime") ? frameFrom(st["startTime"]) : a->documentPlaybackRange().start();
        const int end = st.contains("endTime") ? frameFrom(st["endTime"]) : a->documentPlaybackRange().end();
        if (fps < 1 || fps > 240) fail("Frame rate must be between 1 and 240");
        if (start > end) fail("The range must start before it ends");
        if (fps != a->framerate()) a->setFramerate(fps);
        if (start != a->documentPlaybackRange().start() || end != a->documentPlaybackRange().end()) a->setDocumentRange(KisTimeSpan::fromTimeToTime(start, end));
        if (st.contains("currentTime")) {
            a->requestTimeSwitchNonGUI(frameFrom(st["currentTime"]));
            image()->waitForDone();
        }
        emitEvent("animationChanged", {{"state", animationJson()}});
        return QJsonValue();
    }
    if (m == "keyframes") {
        QJsonArray list;
        for (int t : keyframeTimes(need(p["id"].toString()))) list.append(t);
        return list;
    }
    if (m == "addKeyframe") {
        KisNodeSP n = need(p["id"].toString());
        const int t = frameFrom(p["time"]);
        const bool copy = p["copy"].toBool();
        if (keyframeTimes(n).contains(t)) fail(QString("There is already a keyframe at frame %1").arg(t));
        editKeyframes(n, kundo2_i18n("Add Keyframe"), [t, copy](KisKeyframeChannel *channel, KUndo2Command *cmd) {
            if (copy && channel->activeKeyframeTime(t) >= 0 && channel->keyframeAt(channel->activeKeyframeTime(t))) channel->copyKeyframe(channel->activeKeyframeTime(t), t, cmd);
            else channel->addKeyframe(t, cmd);
        });
        return QJsonValue();
    }
    if (m == "removeKeyframe") {
        KisNodeSP n = need(p["id"].toString());
        const int t = frameFrom(p["time"]);
        if (!keyframeTimes(n).contains(t)) fail(QString("There is no keyframe at frame %1").arg(t));
        editKeyframes(n, kundo2_i18n("Remove Keyframe"), [t](KisKeyframeChannel *channel, KUndo2Command *cmd) { channel->removeKeyframe(t, cmd); });
        return QJsonValue();
    }
    if (m == "moveKeyframe") {
        KisNodeSP n = need(p["id"].toString());
        const int from = frameFrom(p["from"]), to = frameFrom(p["to"]);
        const QList<int> times = keyframeTimes(n);
        if (!times.contains(from)) fail(QString("There is no keyframe at frame %1").arg(from));
        if (from == to) return QJsonValue();
        if (times.contains(to)) fail(QString("There is already a keyframe at frame %1").arg(to));
        editKeyframes(n, kundo2_i18n("Move Keyframe"), [from, to](KisKeyframeChannel *channel, KUndo2Command *cmd) { channel->moveKeyframe(from, to, cmd); });
        return QJsonValue();
    }
    if (m == "setOnionSkin") {
        auto *paint = dynamic_cast<KisPaintLayer *>(need(p["id"].toString()).data());
        if (!paint) fail("Onion skins are only available on paint layers");
        paint->setOnionSkinEnabled(p["enabled"].toBool());
        return QJsonValue();
    }
    // ---- Krita's own main window, view, actions and tools, with no display.
    // ponytail: the hand-written handlers above and this path both edit the document; the plan is
    // to move tools and menu commands onto this path and retire the hand-written ones.
    if (m == "krita.debug") {
        QJsonArray tops;
        for (QWidget *w : QApplication::topLevelWidgets())
            tops.append(QString("%1 '%2' visible=%3 %4x%5 type=%6 handle=%7").arg(w->metaObject()->className(), w->windowTitle()).arg(w->isVisible())
                            .arg(w->width()).arg(w->height()).arg(int(w->windowType())).arg(w->windowHandle() != nullptr));
        QJsonObject res;
        res["paintops"] = QJsonArray::fromStringList(KisPaintOpRegistry::instance()->keys());
        res["presetFilesInstalled"] = QJsonArray::fromStringList(QDir("/share/krita/paintoppresets").entryList(QDir::Files).mid(0, 4));
        const QString data = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
        res["dataDir"] = data;
        res["presetFilesCopied"] = QJsonArray::fromStringList(QDir(data + "/paintoppresets").entryList(QDir::Files).mid(0, 4));
        res["dataDirEntries"] = QJsonArray::fromStringList(QDir(data).entryList(QDir::AllEntries | QDir::NoDotAndDotDot));
        QStringList loaders;
        for (KisResourceLoaderBase *l : KisResourceLoaderRegistry::instance()->resourceTypeLoaders(ResourceType::PaintOpPresets)) loaders << l->id() + ":" + l->mimetypes().join(",");
        res["presetLoaders"] = QJsonArray::fromStringList(loaders);
        return QJsonObject{{"resources", res}, {"topLevel", tops}, {"filterEvents", filterEvents}, {"shows", shows}, {"updateRequests", updateRequests},
                           {"tracked", windows.size()}, {"mainWindow", QString("%1x%2").arg(window->width()).arg(window->height())}};
    }
    if (m == "krita.dockers") {
        QJsonArray list;
        for (QDockWidget *dock : window->dockWidgets())
            if (dock != toolOptions)
                list.append(QJsonObject{{"id", dock->objectName()}, {"title", dock->windowTitle().remove('&')}, {"visible", dock->isVisible() && dock->isFloating()}});
        return list;
    }
    if (m == "krita.showDocker") {
        QDockWidget *dock = nullptr;
        for (QDockWidget *d : window->dockWidgets()) if (d->objectName() == p["id"].toString()) dock = d;
        if (!dock || dock == toolOptions) fail("Unknown docker: " + p["id"].toString());
        if (p["visible"].toBool()) {
            // On its own, without a title bar: the page gives it a panel and a title.
            if (!dock->property("kwBare").toBool()) { dock->setTitleBarWidget(new QWidget(dock)); dock->setProperty("kwBare", true); }
            dock->setFloating(true);
            dock->show();
        } else {
            dock->hide();
        }
        return QJsonValue();
    }
    if (m == "krita.windows") {
        QJsonArray list;
        for (auto it = windows.constBegin(); it != windows.constEnd(); ++it) list.append(describe(it.key()));
        // Whoever asks is (re)starting to show them, so send every picture again.
        painted.clear();
        for (auto it = windows.constBegin(); it != windows.constEnd(); ++it) dirtyWindows << it.key();
        windowTimer.start();
        return list;
    }
    if (m == "krita.closeWindow" || m == "krita.resizeWindow" || m == "krita.windowInput") {
        QWidget *w = windows.key(p["id"].toInt(), nullptr);
        if (!w) return QJsonValue();          // it closed while the request was on its way
        if (m == "krita.closeWindow") { w->close(); return QJsonValue(); }
        if (m == "krita.resizeWindow") { w->resize(qMax(50, p["width"].toInt()), qMax(50, p["height"].toInt())); return QJsonValue(); }
        QWindow *target = w->windowHandle();
        if (!target) return QJsonValue();
        const QString type = p["type"].toString();
        const QPointF local(p["x"].toDouble(), p["y"].toDouble());
        const QPointF global = w->mapToGlobal(local);
        const Qt::KeyboardModifiers mods = modifiers(p);
        const Qt::MouseButton button = mouseButton(p);
        if (type == "keydown" || type == "keyup") {
            QWindowSystemInterface::handleKeyEvent(target, type == "keyup" ? QEvent::KeyRelease : QEvent::KeyPress, qtKey(p["key"].toString()), mods,
                                                   p.contains("text") ? p["text"].toString() : p["key"].toString().size() == 1 ? p["key"].toString() : QString());
        } else if (type == "wheel") {
            const int dy = -qRound(p["deltaY"].toDouble());
            QWindowSystemInterface::handleWheelEvent(target, local, global, QPoint(0, dy), QPoint(0, dy * 120 / 100), mods);
        } else {
            const bool press = type == "press", release = type == "release";
            if (press && w->windowType() != Qt::Popup) QWindowSystemInterface::handleFocusWindowChanged(target);
            QWindowSystemInterface::handleMouseEvent(target, local, global, press || (!release && p["down"].toBool()) ? button : Qt::NoButton,
                                                     press || release ? button : Qt::NoButton,
                                                     press ? QEvent::MouseButtonPress : release ? QEvent::MouseButtonRelease : QEvent::MouseMove, mods);
        }
        QWindowSystemInterface::sendWindowSystemEvents(QEventLoop::AllEvents);
        QCoreApplication::processEvents();
        return QJsonValue();
    }
    if (m.startsWith("krita.")) {
        KisView *view = kritaView();
        if (m == "krita.info") {
            QStringList tools;
            for (KoToolAction *t : KoToolManager::instance()->toolActionList()) tools << t->id();
            return QJsonObject{{"actions", int(window->actionCollection()->count())}, {"tools", QJsonArray::fromStringList(tools)},
                               {"activeTool", KoToolManager::instance()->activeToolId()},
                               {"canvasWidget", view->canvasBase()->canvasWidget()->metaObject()->className()},
                               {"canvasSize", QString("%1x%2").arg(view->canvasBase()->canvasWidget()->width()).arg(view->canvasBase()->canvasWidget()->height())}};
        }
        if (m == "krita.tools") {
            QJsonArray list;
            for (KoToolAction *t : KoToolManager::instance()->toolActionList())
                list.append(QJsonObject{{"id", t->id()}, {"name", t->toolTip()}, {"section", t->section()}, {"shortcut", t->shortcut().toString()},
                                        {"active", t->id() == KoToolManager::instance()->activeToolId()}});
            return list;
        }
        if (m == "krita.actions") {
            QJsonArray list;
            for (QAction *a : window->actionCollection()->actions())
                list.append(QJsonObject{{"name", a->objectName()}, {"text", a->text().remove('&')}, {"shortcut", a->shortcut().toString()},
                                        {"enabled", a->isEnabled()}, {"checkable", a->isCheckable()}, {"checked", a->isChecked()}});
            return list;
        }
        if (m == "krita.trigger") {
            QAction *a = window->actionCollection()->action(p["name"].toString());
            if (!a) fail("Unknown action: " + p["name"].toString());
            if (!a->isEnabled()) fail("Action is not available right now: " + p["name"].toString());
            a->trigger();
            settle();
            emitSelection();
            return QJsonValue();
        }
        if (m == "krita.tool") {
            KoToolManager::instance()->switchToolRequested(p["id"].toString());
            QCoreApplication::processEvents();
            bool known = false;
            for (KoToolAction *t : KoToolManager::instance()->toolActionList()) known = known || t->id() == p["id"].toString();
            if (!known) fail("Unknown tool: " + p["id"].toString());
            KoToolManager::instance()->switchToolRequested(p["id"].toString());
            QCoreApplication::processEvents();
            if (KoToolManager::instance()->activeToolId() != p["id"].toString()) fail("Could not switch to tool " + p["id"].toString());
            return QJsonValue();
        }
        if (m == "krita.pointer") {
            // A pointer event in image pixels, delivered to Krita's canvas widget exactly as a mouse would be.
            QWidget *canvas = view->canvasBase()->canvasWidget();
            const QPointF pos = view->canvasBase()->coordinatesConverter()->imageToWidget(QPointF(p["x"].toDouble(), p["y"].toDouble()));
            const QString type = p["type"].toString();
            const QEvent::Type t = type == "press" ? QEvent::MouseButtonPress : type == "release" ? QEvent::MouseButtonRelease : QEvent::MouseMove;
            const Qt::KeyboardModifiers mods = modifiers(p);
            const Qt::MouseButton button = mouseButton(p);
            if (recorded != canvas) { canvas->installEventFilter(&recorder); recorded = canvas; }
            if (!pointerInside) {     // Krita ignores input until the pointer has entered the canvas
                QEnterEvent enter(pos, pos, canvas->mapToGlobal(pos));
                QCoreApplication::sendEvent(canvas, &enter);
                pointerInside = true;
            }
            // Injected through the window-system interface, as a real platform would, so Krita sees
            // genuine ("spontaneous") input; some tools cancel on events that are not.
            // Krita batches mouse moves on a short timer; let the pending ones land before a release ends the gesture.
            // (Events only: the tool's stroke is still open here, so waiting for the image to go idle would never return.)
            if (t == QEvent::MouseButtonRelease) {
                QElapsedTimer flush;
                flush.start();
                while (flush.elapsed() < 40) { QCoreApplication::processEvents(); QThread::msleep(2); }   // processEvents alone returns at once
            }
            const bool held = t == QEvent::MouseButtonPress || (t == QEvent::MouseMove && p["down"].toBool());
            QWindow *target = canvas->window()->windowHandle();
            if (!target) fail("Krita's window has no native handle");
            const QPointF local = canvas->mapTo(canvas->window(), pos);
            if (p.contains("pressure")) {
                // A pen: delivered as a tablet event, which is Krita's main input path (pressure, tilt, rotation).
                QWindowSystemInterface::handleTabletEvent(target, local, canvas->mapToGlobal(pos), int(QInputDevice::DeviceType::Stylus),
                                                          int(QPointingDevice::PointerType::Pen), held ? Qt::LeftButton : Qt::NoButton,
                                                          held ? qBound(0.0, p["pressure"].toDouble(), 1.0) : 0.0,
                                                          qRound(p["xTilt"].toDouble()), qRound(p["yTilt"].toDouble()), 0.0,
                                                          p["rotation"].toDouble(), 0, 1, mods);
            } else {
                QWindowSystemInterface::handleMouseEvent(target, local, canvas->mapToGlobal(pos), held ? button : Qt::NoButton,
                                                         t == QEvent::MouseMove ? Qt::NoButton : button, t, mods);
            }
            if (t == QEvent::MouseButtonPress) { gestureOpen = true; QWindowSystemInterface::handleFocusWindowChanged(target); }
            QWindowSystemInterface::sendWindowSystemEvents(QEventLoop::AllEvents);
            QCoreApplication::processEvents();
            if (t == QEvent::MouseButtonRelease) { gestureOpen = false; settle(250); emitSelection(); }
            QJsonObject reply{{"widgetX", pos.x()}, {"widgetY", pos.y()}, {"seen", QJsonArray::fromStringList(recorder.seen)}};
            recorder.seen.clear();
            return reply;
        }
        if (m == "krita.key") {
            QWindowSystemInterface::handleKeyEvent(window->windowHandle(), p["type"].toString() == "keyup" ? QEvent::KeyRelease : QEvent::KeyPress,
                                                   qtKey(p["key"].toString()), modifiers(p),
                                                   p.contains("text") ? p["text"].toString() : p["key"].toString().size() == 1 ? p["key"].toString() : QString());
            QWindowSystemInterface::sendWindowSystemEvents(QEventLoop::AllEvents);
            QCoreApplication::processEvents();
            return QJsonValue();
        }
        if (m == "krita.viewport") {
            // Krita's canvas takes the page's zoom, rotation and scroll position, so tools size and place
            // their handles for what the user is looking at.
            QWidget *canvas = view->canvasBase()->canvasWidget();
            viewportSize = QSize(p["width"].toInt(), p["height"].toInt());
            const QSize grow = (viewportSize - canvas->size()).expandedTo(QSize(0, 0));
            if (!grow.isEmpty() || grow.width() > 0 || grow.height() > 0) {
                window->resize(window->size() + grow);
                QCoreApplication::processEvents();
            }
            auto *controller = dynamic_cast<KisCanvasController *>(view->canvasController());
            if (!controller) fail("Krita's canvas controller is not available");
            const auto *converter = view->canvasBase()->coordinatesConverter();
            controller->mirrorCanvas(p["mirror"].toBool());
            const qreal turn = p["rotation"].toDouble() - controller->rotation();
            if (!qFuzzyIsNull(turn)) controller->rotateCanvas(turn);
            controller->setZoom(KoZoomMode::ZOOM_CONSTANT, p["zoom"].toDouble(1.0));
            const QPointF want(p["offsetX"].toDouble(), p["offsetY"].toDouble());
            controller->pan((converter->imageToWidget(QPointF(0, 0)) - want).toPoint());
            viewportShift = want - converter->imageToWidget(QPointF(0, 0));
            overlayTimer.start();
            return QJsonObject{{"shiftX", viewportShift.x()}, {"shiftY", viewportShift.y()},
                               {"canvas", QString("%1x%2").arg(canvas->width()).arg(canvas->height())}};
        }
        fail("Unknown method: " + m);
    }
    fail("Unknown method: " + m);
}

// ---------------------------------------------------------------------------------------- from the page

// Exiv2's build turns on the stack protector, whose two runtime symbols Emscripten's libc lacks.
// ponytail: provided here; rebuild Exiv2 without -fstack-protector to drop them.
extern "C" {
uintptr_t __stack_chk_guard = 0x595e9fbd;
void __stack_chk_fail() { abort(); }
}

static Engine *g_engine = nullptr;

// Qt only runs application-wide event filters on what it considers the main thread, and here that is
// the browser's (static initialisers run there) while Krita lives in a worker. notify() has no such rule.
class WebApplication : public KisApplication
{
public:
    using KisApplication::KisApplication;
    bool notify(QObject *receiver, QEvent *event) override
    {
        if (g_engine) g_engine->watch(receiver, event);
        return KisApplication::notify(receiver, event);
    }
};

// The page writes each request as /tmp/kw-<seq>.json ({method, params}) and then calls this.
// Going through the virtual filesystem needs nothing exported beyond this one function, and
// request bytes (a file to open, a resource to import) travel the same way via params.__file.
extern "C" EMSCRIPTEN_KEEPALIVE void kw_request(int id, int seq)
{
    QFile request(QString("/tmp/kw-%1.json").arg(seq));
    if (!request.open(QIODevice::ReadOnly)) return;
    const QJsonObject envelope = QJsonDocument::fromJson(request.readAll()).object();
    request.remove();
    const QString m = envelope["method"].toString();
    const QJsonObject params = envelope["params"].toObject();
    QMetaObject::invokeMethod(g_engine, [id, m, params] {
      const bool strokeCall = m == "beginStroke" || m == "continueStroke" || m == "endStroke" || m == "krita.pointer"
                              || m == "krita.key" || m == "krita.viewport" || m == "krita.windowInput";
      auto run = [id, m, params] {
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
      };
      if (!strokeCall && (g_engine->strokeOpen() || g_engine->hasDeferred())) { g_engine->defer(run); return; }
      run();
      if (strokeCall) g_engine->runDeferred();
    }, Qt::QueuedConnection);
}

/// The page calls this after it has drawn an imageUpdate.
extern "C" EMSCRIPTEN_KEEPALIVE void kw_ack()
{
    g_updatesInFlight.deref();
    if (g_engine) QMetaObject::invokeMethod(g_engine, "flushPending", Qt::QueuedConnection);
}

int main(int argc, char *argv[])
{
    // Uncaught errors in this worker reach the page without a stack; log it here first.
    EM_ASM({ self.addEventListener('error', function (e) { console.error('ENGINE STACK ' + (e.error && e.error.stack ? e.error.stack : e.message)); }); });
    qputenv("QT_QPA_PLATFORM", "kritaheadless");
    qputenv("FONTCONFIG_FILE", "/etc/fonts/fonts.conf");
    qputenv("QT_QPA_FONTDIR", "/usr/share/fonts");
    QStandardPaths::setTestModeEnabled(true);
    QElapsedTimer t;
    t.start();
    QJsonObject startup;
    auto lap = [&](const char *what) { startup[what] = t.restart(); };
    // Krita's own application class: parts of Krita cast qApp to it (e.g. the input manager).
    WebApplication app(QStringLiteral("krita-web"), argc, argv);
    app.setApplicationDisplayName(QStringLiteral("Krita"));
    lap("applicationMs");
    // Preloaded files get "now" as their modification time on every page load, which would make
    // Krita think the bundle changed and re-import it. Pin it so a stored database stays valid.
    const struct utimbuf pinned = {1700000000, 1700000000};
    utime("/share/krita/bundles/Krita_4_Default_Resources.bundle", &pinned);
    // Brush engine plugins register their own preset file types (MyPaint's .myb); that has to
    // happen before the resource folders are scanned, or those presets are never found.
    KisPaintOpRegistry::instance();
    lap("brushEnginesMs");
    registerResources();
    lap("resourcesMs");
    g_engine = new Engine;
    lap("engineMs");
    g_engine->selectDefaultPreset();
    lap("defaultPresetMs");
    emitEvent("ready", {{"startup", startup}, {"dataDir", QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)}});
    return app.exec();
}

#include "main.moc"
