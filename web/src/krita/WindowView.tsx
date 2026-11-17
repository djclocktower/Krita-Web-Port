// One Krita window: its picture on a <canvas>, with pointer, wheel and key input sent back in window pixels.
import { useEffect, useRef } from 'preact/hooks';
import type { Engine, KritaWindowInput } from '../engine/protocol';
import { onPaint, pictures } from './state';

const button = (e: PointerEvent) => (e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left') as 'left' | 'right' | 'middle';

/** `scale` shows the picture smaller or larger than its own size (input still maps to window pixels). `twoFingerWheel`: two fingers dragging scroll the window. */
export function KritaWindowView({ engine, id, width, height, focus, scale = 1, twoFingerWheel }: { engine: Engine; id: number; width: number; height: number; focus?: boolean; scale?: number; twoFingerWheel?: boolean }) {
    const cv = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const el = cv.current!, g = el.getContext('2d')!;
        const show = (img: ImageData) => { if (el.width !== img.width || el.height !== img.height) { el.width = img.width; el.height = img.height; } g.putImageData(img, 0, 0); };
        const first = pictures.get(id);
        if (first) show(first);
        if (focus) el.focus();
        const off = onPaint((i, img) => { if (i === id) show(img); });
        // Window pixels are CSS pixels when the canvas is shown at its own size, but map through the rect so a scaled canvas still works.
        const at = (e: { clientX: number; clientY: number }) => {
            const r = el.getBoundingClientRect();
            return { x: (e.clientX - r.left) * (el.width / r.width), y: (e.clientY - r.top) * (el.height / r.height) };
        };
        const send = (ev: KritaWindowInput) => engine.kritaWindowInput(id, ev);
        let held = false;
        // Touch: a finger is a mouse, but its press waits for the finger to lift or to move, so a second finger (pinch, scroll) never clicks anything.
        const fingers = new Map<number, { x: number; y: number }>();
        let pend: PointerEvent | null = null, gesture = false, wy = 0;
        const mods = (e: PointerEvent) => ({ shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
        const press = (e: PointerEvent) => { held = true; send({ type: 'press', ...at(e), button: button(e), ...mods(e) }); };
        const down = (e: PointerEvent) => {
            el.setPointerCapture(e.pointerId); el.focus(); e.preventDefault();
            if (e.pointerType === 'touch') {
                fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (fingers.size > 1) {   // a gesture: undo what the first finger started
                    if (held) send({ type: 'release', ...at(e), button: 'left', ...mods(e) });
                    held = false; pend = null; gesture = true; wy = [...fingers.values()].reduce((a, f) => a + f.y, 0) / fingers.size; return;
                }
                if (gesture) return;
                pend = e; return;
            }
            press(e);
        };
        const move = (e: PointerEvent) => {
            if (e.pointerType === 'touch') {
                if (!fingers.has(e.pointerId)) return;
                fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (gesture) {
                    if (twoFingerWheel && fingers.size === 2) {
                        const y = [...fingers.values()].reduce((a, f) => a + f.y, 0) / 2;
                        send({ type: 'wheel', ...at(e), deltaY: (wy - y) / scale * 2, ...mods(e) }); wy = y;
                    }
                    return;
                }
                if (pend) {   // moved far enough to be a drag: the press happened where the finger went down
                    if (Math.hypot(e.clientX - pend.clientX, e.clientY - pend.clientY) < 6) return;
                    press(pend); pend = null;
                }
                if (!held) return;   // no hover on touch
            }
            send({ type: 'move', ...at(e), down: held, ...mods(e) });
        };
        const up = (e: PointerEvent) => {
            if (e.pointerType === 'touch') {
                fingers.delete(e.pointerId);
                if (gesture) { if (!fingers.size) gesture = false; return; }
                if (pend && e.type === 'pointerup') { press(pend); pend = null; } else pend = null;   // a tap: press and release together
                if (!held) return;
            }
            held = false; send({ type: 'release', ...at(e), button: button(e), ...mods(e) });
        };
        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            send({ type: 'wheel', ...at(e), deltaY: e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
        };
        const key = (type: 'keydown' | 'keyup') => (e: KeyboardEvent) => {
            e.preventDefault(); e.stopPropagation();
            send({ type, key: e.key, text: e.key.length === 1 ? e.key : undefined, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
        };
        const kd = key('keydown'), ku = key('keyup'), noMenu = (e: Event) => e.preventDefault();
        el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
        el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('contextmenu', noMenu);
        el.addEventListener('keydown', kd); el.addEventListener('keyup', ku);
        return () => {
            off();
            el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
            el.removeEventListener('wheel', wheel); el.removeEventListener('contextmenu', noMenu);
            el.removeEventListener('keydown', kd); el.removeEventListener('keyup', ku);
        };
    }, [engine, id, scale, twoFingerWheel]);
    return <canvas ref={cv} class={`krita-win${scale !== 1 ? ' scaled' : ''}`} data-kwin={id} tabIndex={0} aria-label="Krita window"
        style={`width:${Math.round(width * scale)}px;height:${Math.round(height * scale)}px`} />;
}
