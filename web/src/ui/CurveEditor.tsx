// Editor for Krita's sensor-curve string. Drag points, click the curve to add one, double-click / Delete /
// the Remove button to delete, arrow keys to nudge. Endpoints keep x = 0 and x = 1.
import { useEffect, useRef, useState } from 'preact/hooks';
import { curveAt, parseCurve, serializeCurve, type CurvePoint } from './curve';
import './CurveEditor.css';

const EPS = 0.001, SIZE = 100;
const round = (v: number) => Math.round(v * 10000) / 10000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function CurveEditor({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
    const [pts, setPts] = useState(() => parseCurve(value));
    const [sel, setSel] = useState(0);
    const svg = useRef<SVGSVGElement>(null);
    const drag = useRef<number | null>(null);
    useEffect(() => { if (serializeCurve(pts) !== value) setPts(parseCurve(value)); }, [value]);

    const commit = (next: CurvePoint[]) => { setPts(next); onChange(serializeCurve(next)); };
    const at = (e: { clientX: number; clientY: number }) => {
        const r = svg.current!.getBoundingClientRect();
        return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp(1 - (e.clientY - r.top) / r.height, 0, 1) };
    };
    const move = (i: number, x: number, y: number) => {
        const last = pts.length - 1;
        const nx = i === 0 ? 0 : i === last ? 1 : clamp(x, pts[i - 1].x + EPS, pts[i + 1].x - EPS);
        commit(pts.map((p, j) => j === i ? { x: round(nx), y: round(clamp(y, 0, 1)) } : p));
    };
    const remove = (i: number) => {
        if (pts.length <= 2 || i === 0 || i === pts.length - 1) return;
        commit(pts.filter((_, j) => j !== i)); setSel(i - 1);
    };
    const add = (e: PointerEvent) => {
        const { x, y } = at(e), i = pts.findIndex(p => p.x > x);
        if (i < 1 || x - pts[i - 1].x < EPS || pts[i].x - x < EPS) return;
        commit([...pts.slice(0, i), { x: round(x), y: round(y) }, ...pts.slice(i)]); setSel(i);
    };
    const key = (e: KeyboardEvent, i: number) => {
        const step = e.shiftKey ? 0.05 : 0.01, p = pts[i];
        const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (delta[e.key]) { e.preventDefault(); move(i, p.x + delta[e.key][0], p.y + delta[e.key][1]); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(i); }
    };

    const path = Array.from({ length: 101 }, (_, k) => {
        const x = k / 100;
        return `${k ? 'L' : 'M'}${x * SIZE},${(1 - curveAt(pts, x)) * SIZE}`;
    }).join('');

    return (
        <div class="curve-editor" role="group" aria-label={label}>
            <svg ref={svg} viewBox={`-4 -4 ${SIZE + 8} ${SIZE + 8}`} class="curve-svg"
                 onPointerMove={e => { if (drag.current !== null) { const p = at(e); move(drag.current, p.x, p.y); } }}
                 onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
                <rect x="0" y="0" width={SIZE} height={SIZE} class="curve-frame" />
                <path d={path} class="curve-line" />
                <path d={path} class="curve-hit" data-testid="curve-hit" onPointerDown={e => { e.preventDefault(); add(e); }} />
                {pts.map((p, i) => (
                    <circle key={i} cx={p.x * SIZE} cy={(1 - p.y) * SIZE} r={i === sel ? 4 : 3} tabIndex={0}
                            class={'curve-point' + (i === sel ? ' selected' : '')} role="slider"
                            aria-label={`${label} point ${i + 1} of ${pts.length}`}
                            aria-valuemin={0} aria-valuemax={1} aria-valuenow={p.y}
                            aria-valuetext={`x ${p.x}, y ${p.y}`}
                            onFocus={() => setSel(i)} onKeyDown={e => key(e, i)}
                            onPointerDown={e => { e.stopPropagation(); setSel(i); drag.current = i; (e.target as Element).setPointerCapture(e.pointerId); }}
                            onDblClick={() => remove(i)} />
                ))}
            </svg>
            <button type="button" class="curve-remove" disabled={pts.length <= 2 || sel === 0 || sel === pts.length - 1}
                    onClick={() => remove(sel)}>Remove point</button>
        </div>
    );
}
