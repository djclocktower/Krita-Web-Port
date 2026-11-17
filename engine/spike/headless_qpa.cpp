// A minimal Qt platform plugin with no display, so Krita's core can run in a worker
// thread instead of the browser's main thread (which must never block).
#include <QImage>
#include <QCoreApplication>
#include <private/qtimerinfo_unix_p.h>
#include <condition_variable>
#include <mutex>
#include <optional>
#include <private/qfreetypefontdatabase_p.h>
#include <QMimeData>
#include <qpa/qplatformbackingstore.h>
#include <qpa/qplatformclipboard.h>
#include <qpa/qplatformintegration.h>
#include <qpa/qplatformintegrationplugin.h>
#include <qpa/qplatformscreen.h>
#include <qpa/qplatformwindow.h>
#include <qpa/qwindowsysteminterface.h>
#include <private/qeventdispatcher_wasm_p.h>

class HeadlessScreen : public QPlatformScreen
{
public:
    QRect geometry() const override { return QRect(0, 0, 1920, 1080); }
    int depth() const override { return 32; }
    QImage::Format format() const override { return QImage::Format_ARGB32_Premultiplied; }
};

class HeadlessBackingStore : public QPlatformBackingStore
{
public:
    using QPlatformBackingStore::QPlatformBackingStore;
    QPaintDevice *paintDevice() override { return &m_image; }
    void flush(QWindow *, const QRegion &, const QPoint &) override {}
    void resize(const QSize &size, const QRegion &) override
    {
        if (m_image.size() != size) m_image = QImage(size, QImage::Format_ARGB32_Premultiplied);
    }
private:
    QImage m_image;
};

// Qt's default clipboard returns a null QMimeData while nothing has been copied; Krita (like most
// applications) assumes a real platform, where it is never null. Keep an empty one instead.
// ponytail: in-process only; bridging to the browser clipboard hangs off this class later.
class HeadlessClipboard : public QPlatformClipboard
{
public:
    QMimeData *mimeData(QClipboard::Mode) override { return m_data; }
    void setMimeData(QMimeData *data, QClipboard::Mode mode) override
    {
        if (data != m_data) { delete m_data; m_data = data ? data : new QMimeData; }
        emitChanged(mode);
    }
    bool supportsMode(QClipboard::Mode mode) const override { return mode == QClipboard::Clipboard; }
    bool ownsMode(QClipboard::Mode) const override { return true; }
private:
    QMimeData *m_data = new QMimeData;
};

// Qt's own WebAssembly dispatcher treats the application's thread as "the main thread" and sets its
// timers with the browser's setTimeout, which from this worker means a synchronous round trip to
// the page's thread for every timer start. Krita starts timers constantly (signal compressors), so
// the engine stalled whenever the page was busy. Krita's thread never returns to the browser, so a
// plain blocking dispatcher is all it needs: posted events, timers, and a condition variable.
class HeadlessDispatcher : public QAbstractEventDispatcherV2
{
public:
    bool processEvents(QEventLoop::ProcessEventsFlags flags) override
    {
        { std::lock_guard<std::mutex> lock(m_mutex); m_wake = false; }
        Q_EMIT awake();
        QCoreApplication::sendPostedEvents();
        if ((flags & QEventLoop::WaitForMoreEvents) && !m_interrupt.fetchAndStoreRelaxed(0)) {
            Q_EMIT aboutToBlock();
            const std::optional<Duration> next = m_timers.timerWait();
            std::unique_lock<std::mutex> lock(m_mutex);
            if (!m_wake) {
                if (next) m_condition.wait_for(lock, *next);
                else m_condition.wait(lock);
            }
            lock.unlock();
            Q_EMIT awake();
        }
        m_interrupt.storeRelaxed(0);
        if (!(flags & QEventLoop::X11ExcludeTimers)) m_timers.activateTimers();
        QCoreApplication::sendPostedEvents();
        return true;
    }
    void registerSocketNotifier(QSocketNotifier *) override {}     // nothing here uses sockets
    void unregisterSocketNotifier(QSocketNotifier *) override {}
    void registerTimer(Qt::TimerId id, Duration interval, Qt::TimerType type, QObject *object) override { m_timers.registerTimer(id, interval, type, object); }
    bool unregisterTimer(Qt::TimerId id) override { return m_timers.unregisterTimer(id); }
    bool unregisterTimers(QObject *object) override { return m_timers.unregisterTimers(object); }
    QList<TimerInfoV2> timersForObject(QObject *object) const override { return m_timers.registeredTimers(object); }
    Duration remainingTime(Qt::TimerId id) const override { return m_timers.remainingDuration(id); }
    void wakeUp() override
    {
        { std::lock_guard<std::mutex> lock(m_mutex); m_wake = true; }
        m_condition.notify_one();
    }
    void interrupt() override { m_interrupt.storeRelaxed(1); wakeUp(); }
private:
    mutable QTimerInfoList m_timers;      // only touched on the dispatcher's own thread
    std::mutex m_mutex;
    std::condition_variable m_condition;
    bool m_wake = false;
    QAtomicInt m_interrupt;
};

// Without a window system nobody confirms a new size or position, so the window does it itself;
// otherwise widgets never learn that resize() or move() took effect.
class HeadlessWindow : public QPlatformWindow
{
public:
    using QPlatformWindow::QPlatformWindow;
    void setGeometry(const QRect &rect) override
    {
        QPlatformWindow::setGeometry(rect);
        QWindowSystemInterface::handleGeometryChange(window(), rect);
        if (window()->isVisible()) QWindowSystemInterface::handleExposeEvent(window(), QRect(QPoint(), rect.size()));
    }
};

class HeadlessIntegration : public QPlatformIntegration
{
public:
    HeadlessIntegration()
    {
        // Nothing here pumps a window-system queue, so events (new sizes, exposes, injected input) are delivered at once.
        QWindowSystemInterface::setSynchronousWindowSystemEvents(true);
        QWindowSystemInterface::handleScreenAdded(new HeadlessScreen);
    }
    bool hasCapability(Capability cap) const override { return cap == ThreadedPixmaps || cap == MultipleWindows || QPlatformIntegration::hasCapability(cap); }   // the base grants NonFullScreenWindows, without which every resize is ignored
    QPlatformWindow *createPlatformWindow(QWindow *window) const override { return new HeadlessWindow(window); }
    QPlatformBackingStore *createPlatformBackingStore(QWindow *window) const override { return new HeadlessBackingStore(window); }
    QAbstractEventDispatcher *createEventDispatcher() const override { return new HeadlessDispatcher; }
    // Reads the font files under QT_QPA_FONTDIR; the default database knows no fonts, so text came out as boxes.
    QPlatformFontDatabase *fontDatabase() const override { static QFreeTypeFontDatabase fonts; return &fonts; }
    QPlatformClipboard *clipboard() const override { static HeadlessClipboard clipboard; return &clipboard; }
};

class HeadlessPlugin : public QPlatformIntegrationPlugin
{
    Q_OBJECT
    Q_PLUGIN_METADATA(IID QPlatformIntegrationFactoryInterface_iid FILE "headless_qpa.json")
public:
    QPlatformIntegration *create(const QString &key, const QStringList &) override
    {
        return key == QLatin1String("kritaheadless") ? new HeadlessIntegration : nullptr;
    }
};

#include "headless_qpa.moc"
