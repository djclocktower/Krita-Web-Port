// Pointer Events -> the active tool, plus canvas navigation (pan, zoom, rotate, two-finger touch).
import { aids, guideCancel, guideDown, guideMove, guideUp, live, outlineShown, resizeBrush, snap, SNAP_TOOLS } from '../canvas/aids';
import { gesture, pan, rotateAbout, toImage, view, zoomAbout } from '../canvas/view';
import type { KritaPointer, StrokePoint } from '../engine/protocol';
import { kritaOn, krita } from '../krita/state';
import { getSetting } from '../settings/store';
import { showToast } from '../shell/toast';
import { activeTool, isBrush, type ToolContext } from '../tools';
import { loupe, palmDown, pen, sampleCanvas, touchMods } from './touch';

const LONG_PRESS_MS = 450, TAP_MS = 400, SLOP = 8;   // a finger that stays within SLOP CSS px is "still"

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
            type, x: p.x, y: p.y, down, button, shift: e.shiftKey || touchMods.get().shift, ctrl: e.ctrlKey || touchMods.get().ctrl, alt: e.altKey || touchMods.get().alt,
            ...(e.pointerType === 'pen' && { pressure: e.pressure, xTilt: e.tiltX, yTilt: e.tiltY, rotation: e.twist }),
        };
    };
    let krButton: 'left' | 'right' = 'left';

    const mods = (e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean }) => { const t = touchMods.get(); ctx.modifiers = { shift: e.shiftKey || t.shift, ctrl: e.ctrlKey || t.ctrl, alt: e.altKey || t.alt }; };
    const touches = new Map<number, { x: number; y: number }>();
    // 'pending': one finger is down and has not moved yet, so it may still become a long-press colour pick, a tap, or one finger of a gesture.
    // 'pick': long-press colour picker (the loupe follows the finger). 'palm': a finger ignored because a pen was seen a moment ago.
    let mode: 'none' | 'tool' | 'krita' | 'pan' | 'zoom' | 'rotate' | 'pinch' | 'guide' | 'resize' | 'pending' | 'pick' | 'palm' = 'none';
    let idType = '';   // pointerType of the pointer that owns the current gesture
    let pend: { e: PointerEvent; timer: ReturnType<typeof setTimeout> } | null = null;
    let tap: { t: number; n: number; moved: boolean; from: Map<number, { x: number; y: number }> } | null = null;   // a two- or three-finger tap candidate
    const dropPending = () => { if (pend) { clearTimeout(pend.timer); pend = null; } };
    let startSize = 0;
    let id = -1, last = { x: 0, y: 0 }, anchor = last, pinchPrev = { x: 0, y: 0, d: 1, a: 0 };
    const pinch = () => {
        const [p, q] = [...touches.values()];
        return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, d: Math.hypot(q.x - p.x, q.y - p.y) || 1, a: Math.atan2(q.y - p.y, q.x - p.x) };
    };

    /** A press that is really one finger's (or a mouse's, a pen's) tool stroke. */
    const start = (e: PointerEvent) => {
        const l = local(e);
        mods(e);
        (document.activeElement as HTMLElement | null)?.blur();   // so Space and Enter go to the canvas, not to the last button used
        cv.setPointerCapture(e.pointerId);
        id = e.pointerId; idType = e.pointerType; last = anchor = l;
        if (e.button === 1 || nav.space) { mode = e.ctrlKey ? 'zoom' : e.shiftKey ? 'rotate' : 'pan'; e.preventDefault(); return; }
        if (e.button !== 0 && !(e.button === 2 && kritaOn())) { mode = 'none'; return; }   // a right button reaches Krita's tools (pop-up palette, context menu)
        if (e.button === 0 && guideDown(l, e.pointerType === 'touch')) { mode = 'guide'; live.hover = null; ctx.requestOverlay(); return; }
        if (kritaOn()) { mode = 'krita'; krButton = e.button === 2 ? 'right' : 'left'; ctx.engine.kritaPointer(kp(e, 'press', true, krButton)); return; }
        if ((e.shiftKey || touchMods.get().shift) && e.pointerType !== 'touch' && isBrush()) {   // Krita: Shift+drag resizes the brush
            mode = 'resize'; live.resizing = true; startSize = live.size; live.hover = l; ctx.requestOverlay(); return;
        }
        mode = 'tool';
        if (e.pointerType === 'touch') { live.hover = l; ctx.requestOverlay(); }   // touch has no hover: the outline shows while a finger is down
        activeTool().onPointerDown(ctx, sample(e));
    };
    const pickAt = (x: number, y: number) => { loupe.set({ on: true, x, y, color: sampleCanvas(cv, x, y) }); };
    const down = (e: PointerEvent) => {
        const l = local(e);
        mods(e);
        if (e.pointerType === 'pen') pen.last = performance.now();
        if (e.pointerType === 'touch') {
            if (idType === 'pen' && mode !== 'none' && mode !== 'palm') return;   // a hand resting while the pen draws
            touches.set(e.pointerId, l);
            if (touches.size === 2) {
                dropPending();   // the first finger had not started anything yet: a pinch leaves no mark
                if (mode === 'guide') guideCancel();
                if (mode === 'krita') ctx.engine.kritaPointer(kp(e, 'release', false, krButton));   // ponytail: Krita has no cancel, so a pinch ends the stroke where the first finger was
                if (mode === 'tool') activeTool().onCancel?.(ctx);   // the first finger may have started a dab: a pinch leaves no mark
                if (mode === 'pick') loupe.set({ on: false });
                mode = 'pinch'; live.hover = null; ctx.requestOverlay(); pinchPrev = pinch();
                tap = { t: e.timeStamp, n: 2, moved: false, from: new Map(touches) };
                return;
            }
            if (touches.size > 2) { if (tap) { tap.n = Math.max(tap.n, touches.size); tap.from.set(e.pointerId, l); } return; }
            if (mode === 'pinch') return;
            if (mode === 'none' && palmDown(e.timeStamp)) { mode = 'palm'; id = e.pointerId; idType = 'touch'; return; }   // a palm next to the pen: ignored, but two fingers still pan and zoom
            if (mode !== 'none') return;
            // Wait to see what this finger does: a long hold picks a colour, anything else starts the tool where the finger went down.
            id = e.pointerId; idType = 'touch'; last = anchor = l; mode = 'pending';
            pend = { e, timer: setTimeout(() => {
                const p = pend; if (!p) return;
                pend = null; mode = 'pick'; cv.setPointerCapture(p.e.pointerId);
                navigator.vibrate?.(15);
                pickAt(p.e.clientX, p.e.clientY);
            }, LONG_PRESS_MS) };
            return;
        } else if (mode === 'palm') mode = 'none';   // the pen or mouse takes over from an ignored palm
        else if (mode !== 'none') return;
        start(e);
    };
    const move = (e: PointerEvent) => {
        const l = local(e);
        mods(e);
        if (e.pointerType === 'pen') pen.last = performance.now();
        if (e.pointerType !== 'touch') view.set({ pointer: toImage(l.x, l.y) });
        if (touches.has(e.pointerId)) touches.set(e.pointerId, l);
        if (mode === 'pending' && e.pointerId === id) {
            if (Math.hypot(l.x - anchor.x, l.y - anchor.y) < SLOP) return;
            const p = pend!.e; dropPending(); mode = 'none'; start(p);   // it moved: the stroke began where the finger went down
        } else if (mode === 'pick') { if (e.pointerId === id) pickAt(e.clientX, e.clientY); return; }
        if (e.pointerType !== 'touch' || e.pointerId === id) {
            live.hover = mode === 'resize' ? anchor : mode === 'none' || mode === 'tool' ? l : null;
            if (isBrush() || aids.get().rulers) ctx.requestOverlay();   // the outline and the ruler marker follow the pointer, drawn from this event
            updateCursor(cv);
        }
        if (mode === 'none' && e.pointerType !== 'touch' && kritaOn()) ctx.engine.kritaPointer(kp(e, 'move', false, 'left'));   // hover
        if (mode === 'pinch') {
            if (tap && !tap.moved) for (const [k, p] of touches) { const f = tap.from.get(k); if (f && Math.hypot(p.x - f.x, p.y - f.y) > SLOP * 1.5) tap.moved = true; }
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
        if (mode === 'pinch') {
            if (touches.size) return;
            mode = 'none';
            const t = tap; tap = null;
            if (t && !t.moved && e.timeStamp - t.t < TAP_MS && e.type === 'pointerup' && getSetting('touchGestures')) {   // two-finger tap undoes, three-finger tap redoes
                const redo = t.n >= 3;
                (redo ? ctx.engine.redo() : ctx.engine.undo()).then(() => showToast(redo ? 'Redo' : 'Undo'), () => {});
            }
            return;
        }
        if (e.pointerId !== id) return;
        if (mode === 'pending') { const p = pend!.e; dropPending(); mode = 'none'; start(p); if (mode === 'none') return; }   // a tap: press and release at the same spot
        if (mode === 'pick') {
            const c = sampleCanvas(cv, e.clientX, e.clientY);
            if (c) void ctx.engine.setColors({ foreground: c });
            loupe.set({ on: false }); mode = 'none'; return;
        }
        if (mode === 'palm') { mode = 'none'; return; }
        mods(e);
        if (mode === 'tool') activeTool().onPointerUp(ctx, sample(e));
        else if (mode === 'krita') ctx.engine.kritaPointer(kp(e, 'release', false, krButton));
        else if (mode === 'guide') guideUp(local(e));
        else if (mode === 'resize') live.resizing = false;
        mode = 'none';
        if (e.pointerType === 'touch') { live.hover = null; ctx.requestOverlay(); }
    };
    const cancel = (e: PointerEvent) => {
        if (e.pointerId === id && (mode === 'pending' || mode === 'pick' || mode === 'palm')) {   // the system took the touch (a swipe from the edge, a palm): nothing to commit
            touches.delete(e.pointerId); dropPending(); loupe.set({ on: false }); mode = 'none'; return;
        }
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
