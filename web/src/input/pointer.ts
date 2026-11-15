// Pointer Events -> engine strokes, plus canvas navigation (pan, zoom, rotate, two-finger touch).
import { gesture, pan, rotateAbout, toImage, view, zoomAbout } from '../canvas/view';
import type { Engine, StrokePoint } from '../engine/protocol';

/** Set by the keyboard handler while Space is held. */
export const nav = { space: false };

export function attachPointer(engine: Engine, cv: HTMLCanvasElement): () => void {
    const local = (e: { clientX: number; clientY: number }) => {
        const r = cv.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const sample = (e: PointerEvent): StrokePoint => {
        const p = toImage(local(e).x, local(e).y), pen = e.pointerType === 'pen';
        return {
            x: p.x, y: p.y, pressure: pen ? e.pressure : 1, timeMs: e.timeStamp,
            ...(pen && { xTilt: e.tiltX, yTilt: e.tiltY, rotation: e.twist }),
        };
    };

    const touches = new Map<number, { x: number; y: number }>();
    let mode: 'none' | 'stroke' | 'pan' | 'zoom' | 'rotate' | 'pinch' = 'none';
    let id = -1, last = { x: 0, y: 0 }, anchor = last, pinchPrev = { x: 0, y: 0, d: 1, a: 0 };
    const pinch = () => {
        const [p, q] = [...touches.values()];
        return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, d: Math.hypot(q.x - p.x, q.y - p.y) || 1, a: Math.atan2(q.y - p.y, q.x - p.x) };
    };

    const down = (e: PointerEvent) => {
        const l = local(e);
        if (e.pointerType === 'touch') {
            touches.set(e.pointerId, l);
            if (touches.size === 2) {
                // ponytail: the first finger already started a dab; undo it so a pinch leaves no mark
                if (mode === 'stroke') { engine.endStroke(); void engine.undo(); }
                mode = 'pinch'; pinchPrev = pinch(); return;
            }
            if (touches.size > 2 || mode === 'pinch') return;
        } else if (mode !== 'none') return;
        cv.setPointerCapture(e.pointerId);
        id = e.pointerId; last = anchor = l;
        if (e.button === 1 || nav.space) { mode = e.ctrlKey ? 'zoom' : e.shiftKey ? 'rotate' : 'pan'; e.preventDefault(); return; }
        if (e.button !== 0) return;
        mode = 'stroke';
        engine.beginStroke(sample(e));
    };
    const move = (e: PointerEvent) => {
        const l = local(e);
        if (e.pointerType !== 'touch') view.set({ pointer: toImage(l.x, l.y) });
        if (touches.has(e.pointerId)) touches.set(e.pointerId, l);
        if (mode === 'pinch') {
            if (touches.size === 2) { const n = pinch(); gesture(pinchPrev, n, n.d / pinchPrev.d, n.a - pinchPrev.a); pinchPrev = n; }
            return;
        }
        if (e.pointerId !== id) return;
        if (mode === 'stroke') {
            const list = e.getCoalescedEvents?.() ?? [];
            engine.continueStroke((list.length ? list : [e]).map(sample));
        } else if (mode === 'pan') pan(l.x - last.x, l.y - last.y);
        else if (mode === 'zoom') zoomAbout(Math.exp(-(l.y - last.y) * 0.01), anchor.x, anchor.y);
        else if (mode === 'rotate') {
            const c = { x: view.get().w / 2, y: view.get().h / 2 };
            rotateAbout(Math.atan2(l.y - c.y, l.x - c.x) - Math.atan2(last.y - c.y, last.x - c.x), c.x, c.y);
        }
        last = l;
    };
    const up = (e: PointerEvent) => {
        touches.delete(e.pointerId);
        if (mode === 'pinch') { if (!touches.size) mode = 'none'; return; }
        if (e.pointerId !== id) return;
        if (mode === 'stroke') engine.endStroke();
        mode = 'none';
    };
    const wheel = (e: WheelEvent) => {
        e.preventDefault();
        const l = local(e), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        zoomAbout(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.001)), l.x, l.y);   // ctrl+wheel is also how browsers report a trackpad pinch
    };
    const leave = () => view.set({ pointer: null });
    const noMenu = (e: Event) => e.preventDefault();

    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', leave);
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('contextmenu', noMenu);
    return () => {
        cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move);
        cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up);
        cv.removeEventListener('pointerleave', leave); cv.removeEventListener('wheel', wheel);
        cv.removeEventListener('contextmenu', noMenu);
    };
}
