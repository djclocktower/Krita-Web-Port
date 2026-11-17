// Krita's dialogs and pop-ups, floating over the page. The tool option window is embedded in the Tool Options panel instead.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useUiMode } from '../mobile/mode';
import type { Engine, KritaWindow } from '../engine/protocol';
import { report } from '../shell/state';
import { useStore } from '../shell/store';
import { ActionSearch } from './ActionSearch';
import { KeyboardButton } from './Keyboard';
import { krita, startKrita } from './state';
import { KritaWindowView } from './WindowView';
import './krita.css';

type Pos = { x: number; y: number };

function Dialog({ engine, w, pos, setPos }: { engine: Engine; w: KritaWindow; pos?: Pos; setPos: (p: Pos) => void }) {
    const box = useRef<HTMLDivElement>(null);
    const drag = useRef<{ dx: number; dy: number } | null>(null);
    const style = pos ? `left:${pos.x}px;top:${pos.y}px` : 'left:50%;top:50%;transform:translate(-50%,-50%)';   // centred until moved
    return (
        <div ref={box} class="krita-dialog" role="dialog" aria-modal={w.modal} aria-label={w.title} style={style}>
            <div class="krita-title"
                onPointerDown={e => {
                    if ((e.target as Element).closest('button')) return;
                    const r = box.current!.getBoundingClientRect();
                    e.currentTarget.setPointerCapture(e.pointerId); drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
                }}
                onPointerMove={e => {
                    const d = drag.current;
                    if (d) setPos({ x: Math.max(0, Math.min(innerWidth - 60, e.clientX - d.dx)), y: Math.max(0, Math.min(innerHeight - 30, e.clientY - d.dy)) });
                }}
                onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
                <span>{w.title}</span>
                <button type="button" aria-label="Close" onClick={() => engine.closeKritaWindow(w.id).catch(report)}>✕</button>
            </div>
            <KritaWindowView engine={engine} id={w.id} width={w.width} height={w.height} focus />
        </div>
    );
}

/** At its x/y relative to the parent window's picture (or to the canvas without a parent). If that picture is shown scaled (a dialog on a
 *  small screen) the pop-up is scaled the same way; on touch devices it is also made larger so its rows are easy to hit. */
function Popup({ engine, w, parent, touch }: { engine: Engine; w: KritaWindow; parent?: KritaWindow; touch: boolean }) {
    const box = useRef<HTMLDivElement>(null);
    const [k, setK] = useState(1);
    useLayoutEffect(() => {   // every render: the parent may have moved
        const base = document.querySelector(w.parent != null ? `[data-kwin="${w.parent}"]` : 'canvas.view')?.getBoundingClientRect();
        const el = box.current!, fit = base && parent ? base.width / parent.width : 1, s = touch ? Math.max(fit, 1) * 1.3 : fit;
        const x = (base?.left ?? 0) + (w.x - (parent?.x ?? 0)) * fit, y = (base?.top ?? 0) + (w.y - (parent?.y ?? 0)) * fit;
        el.style.left = `${Math.max(0, Math.min(x, innerWidth - w.width * s))}px`; el.style.top = `${Math.max(0, Math.min(y, innerHeight - w.height * s))}px`;
        if (s !== k) setK(s);
    });
    return <div ref={box} class="krita-popup"><KritaWindowView engine={engine} id={w.id} width={w.width} height={w.height} scale={k} /></div>;
}

/** A dialog on a phone or tablet: a sheet that fills the screen. The picture is fitted to it (never clipped); pinch to zoom, two fingers to
 *  scroll, or the buttons. A narrower window is asked of the engine first, for dialogs whose layout can shrink. */
function TouchDialog({ engine, w }: { engine: Engine; w: KritaWindow }) {
    const scroll = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState<number | null>(null);   // null: fit
    const [room, setRoom] = useState({ w: innerWidth, h: innerHeight });
    const keep = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null);   // window pixel to keep under a screen point while zooming
    const fit = Math.min(2, (room.w - 2) / w.width, (room.h - 2) / w.height), k = zoom ?? fit;
    useEffect(() => {
        const ro = new ResizeObserver(() => setRoom({ w: scroll.current!.clientWidth, h: scroll.current!.clientHeight }));
        ro.observe(scroll.current!);
        return () => ro.disconnect();
    }, []);
    const asked = useRef(false);
    useEffect(() => {   // ponytail: asked once per window; a dialog that has a minimum width answers with its own size and is fitted instead
        if (asked.current || w.width <= innerWidth - 8) return;
        asked.current = true;
        engine.resizeKritaWindow(w.id, Math.max(240, Math.floor(innerWidth - 8)), w.height).catch(() => {});
    }, [w.id, w.width]);
    useLayoutEffect(() => {
        const t = keep.current, el = scroll.current;
        if (!t || !el) return;
        el.scrollLeft = t.fx * k - t.cx; el.scrollTop = t.fy * k - t.cy;
    }, [k]);
    const zoomTo = (next: number, cx = room.w / 2, cy = room.h / 2) => {
        const el = scroll.current!, n = Math.min(4, Math.max(0.3, next));
        keep.current = { fx: (el.scrollLeft + cx) / k, fy: (el.scrollTop + cy) / k, cx, cy };
        setZoom(n);
    };
    // two fingers: pinch to zoom, drag to scroll
    useEffect(() => {
        const el = scroll.current!, f = new Map<number, { x: number; y: number }>();
        let g: { d: number; k: number } | null = null, prev = { x: 0, y: 0 };
        const mid = () => { const [a, b] = [...f.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
        const down = (e: PointerEvent) => {
            if (e.pointerType !== 'touch') return;
            f.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (f.size === 2) { const m = mid(); g = { d: m.d, k }; prev = m; }
        };
        const move = (e: PointerEvent) => {
            if (!f.has(e.pointerId)) return;
            f.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (f.size !== 2 || !g) return;
            const m = mid(), r = el.getBoundingClientRect();
            el.scrollLeft -= m.x - prev.x; el.scrollTop -= m.y - prev.y; prev = m;
            if (Math.abs(m.d / g.d - 1) > 0.02) zoomTo(g.k * m.d / g.d, m.x - r.left, m.y - r.top);
        };
        const up = (e: PointerEvent) => { f.delete(e.pointerId); if (f.size < 2) g = null; };
        el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
        return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    }, [k, room.w, room.h]);
    return (
        <div class="krita-dialog touch" role="dialog" aria-modal={w.modal} aria-label={w.title}>
            <div class="krita-title">
                <span>{w.title}</span>
                <span class="krita-title-btns">
                    <KeyboardButton send={ev => engine.kritaWindowInput(w.id, ev)} />
                    <button type="button" aria-label="Close" onClick={() => engine.closeKritaWindow(w.id).catch(report)}>✕</button>
                </span>
            </div>
            <div class="krita-scroll" ref={scroll}>
                <div class="krita-fit"><KritaWindowView engine={engine} id={w.id} width={w.width} height={w.height} focus scale={k} /></div>
            </div>
            <div class="krita-zoom" role="group" aria-label="Zoom dialog">
                <button type="button" aria-label="Zoom out" onClick={() => zoomTo(k / 1.25)}>−</button>
                <button type="button" aria-label="Fit dialog to screen" aria-pressed={zoom === null} onClick={() => setZoom(null)}>{Math.round(k * 100)}%</button>
                <button type="button" aria-label="Zoom in" onClick={() => zoomTo(k * 1.25)}>+</button>
            </div>
        </div>
    );
}

export function KritaUI({ engine }: { engine: Engine }) {
    useEffect(() => startKrita(engine), [engine]);
    const { windows } = useStore(krita);
    const touch = useUiMode() !== 'desktop';
    const [pos, setPos] = useState<Record<number, Pos>>({});
    const dialogs = windows.filter(w => w.kind === 'dialog'), popups = windows.filter(w => w.kind === 'popup');
    const top = useRef<KritaWindow | undefined>();
    top.current = popups[popups.length - 1];
    useEffect(() => {
        if (!popups.length) return;
        // A click anywhere outside the pop-ups dismisses the newest one, as Qt does: with Escape.
        const h = (e: PointerEvent) => {
            const t = top.current;
            if (!t || (e.target as Element).closest('.krita-popup')) return;
            engine.kritaWindowInput(t.id, { type: 'keydown', key: 'Escape' }); engine.kritaWindowInput(t.id, { type: 'keyup', key: 'Escape' });
        };
        document.addEventListener('pointerdown', h, true);
        return () => document.removeEventListener('pointerdown', h, true);
    }, [engine, popups.length > 0]);
    return (<>
        {dialogs.some(d => d.modal) && <div class="krita-backdrop" onPointerDown={() => document.querySelector<HTMLElement>('.krita-dialog canvas')?.focus()} />}
        {dialogs.map(d => touch ? <TouchDialog key={d.id} engine={engine} w={d} /> : <Dialog key={d.id} engine={engine} w={d} pos={pos[d.id]} setPos={p => setPos(o => ({ ...o, [d.id]: p }))} />)}
        {popups.map(p => <Popup key={p.id} engine={engine} w={p} parent={windows.find(x => x.id === p.parent)} touch={touch} />)}
        <ActionSearch engine={engine} />
    </>);
}
