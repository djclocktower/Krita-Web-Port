import { useEffect, useRef, useState } from 'preact/hooks';
import type { Panel } from '../../panels';
import type { Engine } from '../../engine/protocol';
import { fit, pan, resetRotation, rotateBy, toggleMirror, toImage, toScreen, view, zoomBy, zoomTo } from '../../canvas/view';
import './overview.css';

const MAX = 256;   // thumbnail resolution, longer side

/** Re-render when the parts of the view this panel shows change (not on pointer hover). */
function useView() {
    const [, bump] = useState(0);
    useEffect(() => {
        let p = view.get();
        return view.sub(() => {
            const n = view.get();
            if (n.scale !== p.scale || n.rot !== p.rot || n.mirror !== p.mirror || n.panX !== p.panX || n.panY !== p.panY
                || n.w !== p.w || n.h !== p.h || n.docW !== p.docW || n.docH !== p.docH) bump(k => k + 1);
            p = n;
        });
    }, []);
    return view.get();
}

function Overview({ engine }: { engine: Engine }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const thumb = useRef<{ c: HTMLCanvasElement; g: CanvasRenderingContext2D; w: number; h: number; k: number; dw: number; dh: number } | null>(null);
    const raf = useRef(0);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const v = useView();

    const draw = () => {
        raf.current = 0;
        const t = thumb.current, el = canvas.current, g = el?.getContext('2d');
        if (!t || !el || !g) return;
        g.clearRect(0, 0, el.width, el.height);
        g.drawImage(t.c, 0, 0);
        const s = view.get();
        if (!s.w || !s.h) return;
        const pts = [[0, 0], [s.w, 0], [s.w, s.h], [0, s.h]].map(([x, y]) => { const p = toImage(x, y); return [p.x * t.k, p.y * t.k]; });
        g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.6)'; g.stroke();
        g.lineWidth = 1.5; g.strokeStyle = getComputedStyle(el).getPropertyValue('--accent') || '#3daee9'; g.stroke();
    };
    const schedule = () => { if (!raf.current) raf.current = requestAnimationFrame(draw); };

    useEffect(() => {
        let alive = true;
        const build = (dw: number, dh: number, repopulate: boolean) => {
            const k = MAX / Math.max(dw, dh), w = Math.max(1, Math.round(dw * k)), h = Math.max(1, Math.round(dh * k));
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            thumb.current = { c, g: c.getContext('2d')!, w, h, k: w / dw, dw, dh };
            setSize({ w, h });
            if (repopulate) void engine.refresh();
        };
        // Copy one updated rect into the thumbnail: box-average a few samples per thumbnail pixel (premultiplied).
        // ponytail: thumbnail pixels on the rect's edge average only inside the rect; the error is under one thumbnail pixel.
        const offUpdate = engine.on('imageUpdate', (r, px) => {
            const t = thumb.current;
            if (!t || r.width < 1 || r.height < 1) return;
            const x0 = Math.max(0, Math.floor(r.x * t.k)), y0 = Math.max(0, Math.floor(r.y * t.k));
            const x1 = Math.min(t.w, Math.ceil((r.x + r.width) * t.k)), y1 = Math.min(t.h, Math.ceil((r.y + r.height) * t.k));
            if (x1 <= x0 || y1 <= y0) return;
            const out = t.g.createImageData(x1 - x0, y1 - y0), o = out.data, inv = 1 / t.k;
            const n = Math.min(4, Math.max(1, Math.ceil(inv)));
            for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
                let R = 0, G = 0, B = 0, A = 0, cnt = 0;
                for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
                    const sx = Math.min(r.x + r.width - 1, Math.max(r.x, Math.floor((tx + (i + .5) / n) * inv)));
                    const sy = Math.min(r.y + r.height - 1, Math.max(r.y, Math.floor((ty + (j + .5) / n) * inv)));
                    const p = ((sy - r.y) * r.width + (sx - r.x)) * 4, a = px[p + 3];
                    R += px[p] * a; G += px[p + 1] * a; B += px[p + 2] * a; A += a; cnt++;
                }
                const q = ((ty - y0) * (x1 - x0) + (tx - x0)) * 4;
                if (A) { o[q] = R / A; o[q + 1] = G / A; o[q + 2] = B / A; o[q + 3] = A / cnt; }
            }
            t.g.putImageData(out, x0, y0);
            schedule();
        });
        const offDoc = engine.on('documentChanged', info => {
            if (!info) { thumb.current = null; setSize({ w: 0, h: 0 }); return; }
            const t = thumb.current;
            if (!t || t.dw !== info.width || t.dh !== info.height) build(info.width, info.height, true);
        });
        void engine.documentInfo().then(info => { if (alive && info && !thumb.current) build(info.width, info.height, true); });
        return () => { alive = false; offUpdate(); offDoc(); cancelAnimationFrame(raf.current); raf.current = 0; thumb.current = null; };
    }, [engine]);
    useEffect(schedule);   // after every render: the view moved or the thumbnail was rebuilt

    // Drag pans the main view to centre on the pointer; two fingers pinch-zoom; wheel zooms.
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef(0);
    const panTo = (e: PointerEvent) => {
        const t = thumb.current, r = canvas.current!.getBoundingClientRect(), s = view.get();
        if (!t || !s.w) return;
        const sc = toScreen((e.clientX - r.left) / r.width * t.dw, (e.clientY - r.top) / r.height * t.dh);
        pan(s.w / 2 - sc.x, s.h / 2 - sc.y);
    };
    const dist = () => { const [a, b] = [...pointers.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const down = (e: PointerEvent) => {
        e.currentTarget && (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) pinch.current = dist(); else if (pointers.current.size === 1) panTo(e);
    };
    const move = (e: PointerEvent) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) { const d = dist(); if (pinch.current > 0 && d > 0) zoomBy(d / pinch.current); pinch.current = d; }
        else panTo(e);
    };
    const up = (e: PointerEvent) => { pointers.current.delete(e.pointerId); };

    const deg = Math.round(((v.rot * 180 / Math.PI + 180) % 360 + 360) % 360 - 180);
    const zlog = Math.log2(v.scale || 1);
    return (
        <div class="ovw">
            <div class="ovw-box" style={{ aspectRatio: size.w ? `${size.w} / ${size.h}` : '4 / 3', maxWidth: size.w ? `${220 * size.w / size.h}px` : undefined }}>
                <canvas ref={canvas} class="ovw-canvas" width={size.w || 1} height={size.h || 1} role="img"
                    aria-label="Overview of the image. Drag to move the view, scroll or pinch to zoom."
                    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                    onWheel={e => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.002)); }} />
            </div>
            <div class="ovw-row">
                <label for="ovw-zoom">Zoom</label>
                <input id="ovw-zoom" type="range" min={-5.5} max={6} step={0.01} value={Math.min(6, Math.max(-5.5, zlog))}
                    aria-label="Zoom" aria-valuetext={`${Math.round(v.scale * 100)}%`} onInput={e => zoomTo(2 ** Number(e.currentTarget.value))} />
                <output>{Math.round(v.scale * 100)}%</output>
            </div>
            <div class="ovw-row">
                <label for="ovw-rot">Rotate</label>
                <input id="ovw-rot" type="range" min={-180} max={180} step={1} value={deg} aria-label="Rotation" aria-valuetext={`${deg} degrees`}
                    onInput={e => rotateBy((Number(e.currentTarget.value) - deg) * Math.PI / 180)} />
                <output>{deg}°</output>
            </div>
            <div class="ovw-btns">
                <button aria-pressed={v.mirror} onClick={toggleMirror}>Mirror</button>
                <button onClick={() => { resetRotation(); }}>Reset rotation</button>
                <button onClick={fit}>Fit</button>
            </div>
        </div>
    );
}

export default { id: 'overview', title: 'Overview', area: 'right', order: 1, component: Overview } satisfies Panel;
