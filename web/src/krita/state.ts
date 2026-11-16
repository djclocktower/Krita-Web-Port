// What the page knows about Krita's own tools and windows. Filled by startKrita() from the engine's events.
import type { Engine, KritaDocker, KritaTool, KritaWindow } from '../engine/protocol';
import { store } from '../shell/store';

export const krita = store({
    tools: [] as KritaTool[],      // empty on engines without Krita's tools (the plain mock): the page's own tools are used then
    active: '',                    // id of Krita's active tool
    page: false,                   // the page's own Pan or Zoom is active instead of a Krita tool
    windows: [] as KritaWindow[],
    dockers: [] as KritaDocker[],  // Krita's own dockers (empty on engines without them)
    cursor: '',                    // CSS cursor Krita wants over the canvas
});
/** Krita's tools drive the canvas (pointer, keys, overlay, viewport). */
export const kritaOn = () => krita.get().tools.length > 0 && !krita.get().page;

// The page has its own Pan and Zoom (they also work with Space, pinch and wheel).
const HIDDEN = /(^|\/)(PanTool|ZoomTool)$/;

// Latest picture of each window; a view that mounts later still has something to show.
export const pictures = new Map<number, ImageData>();
const paintSubs = new Set<(id: number, img: ImageData) => void>();
export const onPaint = (fn: (id: number, img: ImageData) => void) => { paintSubs.add(fn); return () => { paintSubs.delete(fn); }; };

let current: Engine | null = null;
export const kritaEngine = () => current;

const upsert = (list: KritaWindow[], w: KritaWindow) => list.some(x => x.id === w.id) ? list.map(x => x.id === w.id ? w : x) : [...list, w];

export function startKrita(engine: Engine): () => void {
    current = engine;
    const sync = () => engine.kritaTools().then(list => {
        const tools = list.filter(t => !HIDDEN.test(t.id));
        krita.set({ tools, active: list.find(t => t.active)?.id ?? krita.get().active });
    }, () => {});
    const syncDockers = () => engine.kritaDockers().then(dockers => krita.set({ dockers }), () => {});
    const offs = [
        engine.on('documentChanged', () => { void sync(); void syncDockers(); }),   // the real engine may only list tools once a document is open
        engine.on('kritaToolChanged', id => krita.set({ active: id, page: false })),
        engine.on('kritaWindow', w => { const isNew = !krita.get().windows.some(x => x.id === w.id); krita.set({ windows: upsert(krita.get().windows, w) }); if (isNew && w.kind === 'docker') void syncDockers(); }),
        engine.on('kritaWindowClosed', id => {
            const was = krita.get().windows.find(w => w.id === id);
            pictures.delete(id); if (was?.kind === 'docker') void syncDockers();
            krita.set({ windows: krita.get().windows.filter(w => w.id !== id) });
        }),
        engine.on('kritaWindowPaint', (id, w, h, px) => {
            const img = new ImageData(new Uint8ClampedArray(px), w, h);   // px is only valid during this call
            pictures.set(id, img);
            paintSubs.forEach(f => f(id, img));
        }),
        engine.on('kritaCursor', cursor => krita.set({ cursor })),
    ];
    void sync(); void syncDockers();
    // events that arrived while this list was on its way are newer than it
    engine.kritaWindows().then(ws => krita.set({ windows: ws.reduce((l, w) => l.some(x => x.id === w.id) ? l : upsert(l, w), krita.get().windows) }), () => {});
    return () => { offs.forEach(f => f()); current = null; };
}
