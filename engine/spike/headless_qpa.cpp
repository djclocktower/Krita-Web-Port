// A minimal Qt platform plugin with no display, so Krita's core can run in a worker
// thread instead of the browser's main thread (which must never block).
#include <QImage>
#include <qpa/qplatformbackingstore.h>
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

class HeadlessIntegration : public QPlatformIntegration
{
public:
    HeadlessIntegration() { QWindowSystemInterface::handleScreenAdded(new HeadlessScreen); }
    bool hasCapability(Capability cap) const override { return cap == ThreadedPixmaps || cap == MultipleWindows; }
    QPlatformWindow *createPlatformWindow(QWindow *window) const override { return new QPlatformWindow(window); }
    QPlatformBackingStore *createPlatformBackingStore(QWindow *window) const override { return new HeadlessBackingStore(window); }
    QAbstractEventDispatcher *createEventDispatcher() const override { return new QEventDispatcherWasm; }
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
