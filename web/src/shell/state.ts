import type { BrushState, Color, DocumentInfo, Engine, HistoryState, Rect } from '../engine/protocol';
import { reportError } from './errors';
import { store } from './store';

export type DialogId = 'export' | 'scale' | 'resize' | 'rotate' | 'convert' | 'recent' | 'settings' | 'about' | 'workspaces';

export const app = store({
    doc: null as DocumentInfo | null,
    sel: null as Rect | null,
    brush: { presetId: null, size: 12, opacity: 1, flow: 1, blendMode: 'normal', eraser: false } as BrushState,
    fg: { r: 0, g: 0, b: 0, a: 1 } as Color,
    bg: { r: 1, g: 1, b: 1, a: 1 } as Color,
    history: { canUndo: false, canRedo: false, undoText: '', redoText: '' } as HistoryState,
    newOpen: false,
    dialog: null as DialogId | null,
});

export const report = (e: unknown) => reportError(e instanceof Error ? e.message : String(e));

export function trackEngine(engine: Engine): () => void {
    const offs = [
        engine.on('documentChanged', doc => app.set(doc ? { doc } : { doc, sel: null })),
        engine.on('selectionChanged', sel => app.set({ sel })),
        engine.on('brushChanged', brush => app.set({ brush })),
        engine.on('colorChanged', (fg, bg) => app.set({ fg, bg })),
        engine.on('historyChanged', history => app.set({ history })),
    ];
    return () => offs.forEach(f => f());
}
