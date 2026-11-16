// One Krita window: its picture on a <canvas>, with pointer, wheel and key input sent back in window pixels.
import { useEffect, useRef } from 'preact/hooks';
import type { Engine, KritaWindowInput } from '../engine/protocol';
import { onPaint, pictures } from './state';

const button = (e: PointerEvent) => (e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left') as 'left' | 'right' | 'middle';

export function KritaWindowView({ engine, id, width, height, focus }: { engine: Engine; id: number; width: number; height: number; focus?: boolean }) {
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
        const down = (e: PointerEvent) => {
            held = true; el.setPointerCapture(e.pointerId); el.focus(); e.preventDefault();
            send({ type: 'press', ...at(e), button: button(e), shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
        };
        const move = (e: PointerEvent) => {
            if (e.pointerType === 'touch' && !held) return;   // no hover on touch
            send({ type: 'move', ...at(e), down: held, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
        };
        const up = (e: PointerEvent) => { held = false; send({ type: 'release', ...at(e), button: button(e), shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey }); };
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
    }, [engine, id]);
    return <canvas ref={cv} class="krita-win" data-kwin={id} tabIndex={0} aria-label="Krita window" style={`width:${width}px;height:${height}px`} />;
}
