// A brief message over the canvas: Krita's on-canvas messages (kritaMessage) and short confirmations such as "Undo".
import { useEffect } from 'preact/hooks';
import type { Engine } from '../engine/protocol';
import { store, useStore } from './store';

export const toast = store({ text: '', n: 0 });
let timer: ReturnType<typeof setTimeout> | undefined;
export function showToast(text: string, ms = 2500) {
    toast.set({ text, n: toast.get().n + 1 });
    clearTimeout(timer);
    timer = setTimeout(() => toast.set({ text: '' }), ms);
}

/** "Zoom: 150%" is Krita answering the page's own viewport sync, which is the page's own doing; it is not shown. */
export const isZoomMessage = (t: string) => /^\s*zoom\b/i.test(t);

export function Toast({ engine }: { engine: Engine }) {
    const { text } = useStore(toast);
    useEffect(() => engine.on('kritaMessage', t => { if (t.trim() && !isZoomMessage(t)) showToast(t); }), [engine]);
    return <div class="toast" role="status" aria-live="polite" hidden={!text}>{text}</div>;
}
