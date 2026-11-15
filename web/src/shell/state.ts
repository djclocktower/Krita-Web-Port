import type { BrushState, Color, DocumentInfo, Engine, HistoryState } from '../engine/protocol';
import { store } from './store';

export const app = store({
    doc: null as DocumentInfo | null,
    brush: { presetId: null, size: 12, opacity: 1, flow: 1, blendMode: 'normal', eraser: false } as BrushState,
    fg: { r: 0, g: 0, b: 0, a: 1 } as Color,
    bg: { r: 1, g: 1, b: 1, a: 1 } as Color,
    history: { canUndo: false, canRedo: false, undoText: '', redoText: '' } as HistoryState,
    newOpen: false,
    message: '',
});

let timer = 0;
export function report(e: unknown) {
    app.set({ message: e instanceof Error ? e.message : String(e) });
    clearTimeout(timer);
    timer = window.setTimeout(() => app.set({ message: '' }), 6000);
}

export function trackEngine(engine: Engine): () => void {
    const offs = [
        engine.on('documentChanged', doc => app.set({ doc })),
        engine.on('brushChanged', brush => app.set({ brush })),
        engine.on('colorChanged', (fg, bg) => app.set({ fg, bg })),
        engine.on('historyChanged', history => app.set({ history })),
    ];
    return () => offs.forEach(f => f());
}
