// Pointer Events -> the active tool, plus canvas navigation (pan, zoom, rotate, two-finger touch).
import { aids, guideCancel, guideDown, guideMove, guideUp, live, outlineShown, resizeBrush, snap, SNAP_TOOLS } from '../canvas/aids';
import { gesture, pan, rotateAbout, toImage, view, zoomAbout } from '../canvas/view';
import type { KritaPointer, StrokePoint } from '../engine/protocol';
import { kritaOn, krita } from '../krita/state';
import { activeTool, isBrush, type ToolContext } from '../tools';

/** Set by the keyboard handler while Space is held. */
export const nav = { space: false };

/** The canvas shows the tool's cursor, or a hand while Space is held. */
export const updateCursor = (cv: HTMLElement | null) => {
    if (cv) cv.style.cursor = nav.space ? 'grab' : kritaOn() ? krita.get().cursor : outlineShown(isBrush()) ? 'none' : activeTool().cursor ?? '';
};

export function attachPointer(ctx: ToolContext, cv: HTMLCanvasElement): () => void {
    const local = (e: { clientX: number; clientY: number }) => {
        const r = cv.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const sample = (e: PointerEvent): StrokePoint => {
        const p0 = toImage(local(e).x, local(e).y), p = SNAP_TOOLS.has(activeTool().id) ? snap(p0) : p0, pen = e.pointerType === 'pen';
        return {
            x: p.x, y: p.y, pressure: pen ? e.pressure : 1, timeMs: e.timeStamp,
            ...(pen && { xTilt: e.tiltX, yTilt: e.tiltY, rotation: e.twist }),
        };
    };

    /** A pointer event for Krita's tool, in image pixels. */
    const kp = (e: PointerEvent, type: KritaPointer['type'], down: boolean, button: 'left' | 'right'): KritaPointer => {
        const l = local(e), p = toImage(l.x, l.y);
        return {
            type, x: p.x, y: p.y, down, button, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey,
            ...(e.pointerType === 'pen' && { pressure: e.pressure, xTilt: e.tiltX, yTilt: e.tiltY, rotation: e.twist }),
        };
    };
    let krButton: 'left' | 'right' = 'left';

    const mods = (e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean }) => { ctx.modifiers = { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey }; };
    const touches = new Map<number, { x: number; y: number }>();
    let mode: 'none' | 'tool' | 'krita' | 'pan' | 'zoom' | 'rotate' | 'pinch' | 'guide' | 'resize' = 'none';
    let startSize = 0;
    let id = -1, last = { x: 0, y: 0 }, anchor = last, pinchPrev = { x: 0, y: 0, d: 1, a: 0 };
    const pinch = () => {
        const [p, q] = [...touches.values()];
        return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, d: Math.hypot(q.x - p.x, q.y - p.y) || 1, a: Math.atan2(q.y - p.y, q.x - p.x) };
    };

    const down = (e: PointerEvent) => {
        const l = local(e);
        mods(e);
        if (e.pointerType === 'touch') {
            touches.set(e.pointerId, l);
            if (touches.size === 2) {
                if (mode === 'guide') guideCancel();
                if (mode === 'krita') ctx.engine.kritaPointer(kp(e, 'release', false, krButton));   // ponytail: Krita has no cancel, so a pinch ends the stroke where the first finger was
                if (mode === 'tool') activeTool().onCancel?.(ctx);   // the first finger may have started a dab: a pinch leaves no mark
                mode = 'pinch'; live.hover = null; ctx.requestOverlay(); pinchPrev = pinch(); return;
            }
            if (touches.size > 2 || mode === 'pinch') return;
        } else if (mode !== 'none') return;
        (document.activeElement as HTMLElement | null)?.blur();   // so Space and Enter go to the canvas, not to the last button used
        cv.setPointerCapture(e.pointerId);
        id = e.pointerId; last = anchor = l;
        if (e.button === 1 || nav.space) { mode = e.ctrlKey ? 'zoom' : e.shiftKey ? 'rotate' : 'pan'; e.preventDefault(); return; }
        if (e.button !== 0 && !(e.button === 2 && kritaOn())) return;   // a right button reaches Krita's tools (pop-up palette, context menu)
        if (e.button === 0 && guideDown(l, e.pointerType === 'touch')) { mode = 'guide'; live.hover = null; ctx.requestOverlay(); return; }
        if (kritaOn()) { mode = 'krita'; krButton = e.button === 2 ? 'right' : 'left'; ctx.engine.kritaPointer(kp(e, 'press', true, krButton)); return; }
        if (e.shiftKey && e.pointerType !== 'touch' && isBrush()) {   // Krita: Shift+drag resizes the brush
            mode = 'resize'; live.resizing = true; startSize = live.size; live.hover = l; ctx.requestOverlay(); return;
        }
        mode = 'tool';
        if (e.pointerType === 'touch') { live.hover = l; ctx.requestOverlay(); }   // touch has no hover: the outline shows while a finger is down
        activeTool().onPointerDown(ctx, sample(e));
    };
    const move = (e: PointerEvent) => {
        const l = local(e);
        mods(e);
        if (e.pointerType !== 'touch') view.set({ pointer: toImage(l.x, l.y) });
        if (touches.has(e.pointerId)) touches.set(e.pointerId, l);
        if (e.pointerType !== 'touch' || e.pointerId === id) {
            live.hover = mode === 'resize' ? anchor : mode === 'none' || mode === 'tool' ? l : null;
            if (isBrush() || aids.get().rulers) ctx.requestOverlay();   // the outline and the ruler marker follow the pointer, drawn from this event
            updateCursor(cv);
        }
        if (mode === 'none' && e.pointerType !== 'touch' && kritaOn()) ctx.engine.kritaPointer(kp(e, 'move', false, 'left'));   // hover
        if (mode === 'pinch') {
            if (touches.size === 2) { const n = pinch(); gesture(pinchPrev, n, n.d / pinchPrev.d, n.a - pinchPrev.a); pinchPrev = n; }
            return;
        }
        if (e.pointerId !== id) return;
        if (mode === 'tool') {
            const list = e.getCoalescedEvents?.() ?? [];
            activeTool().onPointerMove(ctx, (list.length ? list : [e]).map(sample));
        } else if (mode === 'krita') {
            const list = e.getCoalescedEvents?.() ?? [];
            for (const c of list.length ? list : [e]) ctx.engine.kritaPointer(kp(c, 'move', true, krButton));
        } else if (mode === 'guide') guideMove(l);
        else if (mode === 'resize') resizeBrush(ctx.engine, startSize, l.x - anchor.x);
        else if (mode === 'pan') pan(l.x - last.x, l.y - last.y);
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
        mods(e);
        if (mode === 'tool') activeTool().onPointerUp(ctx, sample(e));
        else if (mode === 'krita') ctx.engine.kritaPointer(kp(e, 'release', false, krButton));
        else if (mode === 'guide') guideUp(local(e));
        else if (mode === 'resize') live.resizing = false;
        mode = 'none';
        if (e.pointerType === 'touch') { live.hover = null; ctx.requestOverlay(); }
    };
    const cancel = (e: PointerEvent) => {
        if (mode === 'tool' && e.pointerId === id) { activeTool().onCancel?.(ctx); mode = 'none'; } else up(e);
    };
    const key = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && mode === 'tool') { activeTool().onCancel?.(ctx); mode = 'none'; }
    };
    const wheel = (e: WheelEvent) => {
        e.preventDefault();
        const l = local(e), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        zoomAbout(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.001)), l.x, l.y);   // ctrl+wheel is also how browsers report a trackpad pinch
    };
    const leave = () => { view.set({ pointer: null }); live.hover = null; ctx.requestOverlay(); };
    const noMenu = (e: Event) => e.preventDefault();

    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', cancel);
    cv.addEventListener('pointerleave', leave);
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('contextmenu', noMenu);
    addEventListener('keydown', key);
    return () => {
        removeEventListener('keydown', key);
        cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move);
        cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', cancel);
        cv.removeEventListener('pointerleave', leave); cv.removeEventListener('wheel', wheel);
        cv.removeEventListener('contextmenu', noMenu);
    };
}
