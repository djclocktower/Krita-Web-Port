import type { Engine, Point, Rect } from '../../engine/protocol';
import { view } from '../../canvas/view';
import { store, useStore } from '../../shell/store';
import type { Tool } from '../../tools';
import { css, run, svg } from '../shared';

// Drag a frame, adjust it by its handles or by dragging inside it, then Enter (or Apply) crops the image.
const crop = store({ rect: null as Rect | null });
let engine: Engine | null = null;
let drag: { kind: 'new' | 'move' | 'resize'; hx: number; hy: number; start: Point; orig: Rect } | null = null;
const HANDLE = 12;   // grab radius in CSS pixels, big enough for a finger

const bounds = (a: Point, b: Point): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });
const handles = (r: Rect) => [0, 1, 2].flatMap(hy => [0, 1, 2].filter(hx => hx !== 1 || hy !== 1).map(hx => ({ hx: hx - 1, hy: hy - 1, x: r.x + hx * r.width / 2, y: r.y + hy * r.height / 2 })));

function apply() {
    const r = crop.get().rect;
    if (!r || !engine) return;
    const { docW, docH } = view.get();
    const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
    const width = Math.min(docW, Math.round(r.x + r.width)) - x, height = Math.min(docH, Math.round(r.y + r.height)) - y;
    crop.set({ rect: null });
    if (width >= 1 && height >= 1) run(engine.cropImage({ x, y, width, height }));
}
const cancel = () => crop.set({ rect: null });

addEventListener('keydown', e => {
    if (!crop.get().rect || (e.target as Element).closest('input,select,textarea,button,dialog')) return;
    if (e.key === 'Enter') { e.preventDefault(); apply(); }
    else if (e.key === 'Escape') cancel();
});

function Options() {
    const { rect } = useStore(crop);
    return (<>
        <p class="hint">{rect ? `${Math.round(rect.width)} × ${Math.round(rect.height)} px` : 'Drag on the canvas to choose the area to keep.'}</p>
        <div class="row buttons">
            <button type="button" disabled={!rect} onClick={apply}>Apply</button>
            <button type="button" disabled={!rect} onClick={cancel}>Cancel</button>
        </div>
    </>);
}

export default {
    id: 'crop', title: 'Crop', shortcut: 'C', cursor: 'crosshair', order: 30, options: Options,
    icon: svg('<path d="M7 3v14h14M3 7h14v14"/>'),
    onPointerDown(ctx, p) {
        engine = ctx.engine;
        const r = crop.get().rect, s = ctx.toScreen(p);
        const h = r && handles(r).find(h => Math.hypot(ctx.toScreen(h).x - s.x, ctx.toScreen(h).y - s.y) <= HANDLE);
        if (r && h) drag = { kind: 'resize', hx: h.hx, hy: h.hy, start: p, orig: r };
        else if (r && p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height) drag = { kind: 'move', hx: 0, hy: 0, start: p, orig: r };
        else { drag = { kind: 'new', hx: 0, hy: 0, start: p, orig: { x: p.x, y: p.y, width: 0, height: 0 } }; crop.set({ rect: null }); }
    },
    onPointerMove(ctx, pts) {
        if (!drag) return;
        const p = pts[pts.length - 1], { kind, hx, hy, start, orig } = drag, dx = p.x - start.x, dy = p.y - start.y;
        if (kind === 'new') crop.set({ rect: bounds(start, p) });
        else if (kind === 'move') crop.set({ rect: { ...orig, x: orig.x + dx, y: orig.y + dy } });
        else {
            const l = orig.x + (hx < 0 ? dx : 0), r = orig.x + orig.width + (hx > 0 ? dx : 0);
            const t = orig.y + (hy < 0 ? dy : 0), b = orig.y + orig.height + (hy > 0 ? dy : 0);
            crop.set({ rect: bounds({ x: l, y: t }, { x: r, y: b }) });
        }
        ctx.requestOverlay();
    },
    onPointerUp(ctx) {
        const r = crop.get().rect;
        drag = null;
        if (r && (r.width < 1 || r.height < 1)) crop.set({ rect: null });   // a click without a drag leaves no frame
        ctx.requestOverlay();
    },
    onCancel(ctx) { drag = null; cancel(); ctx.requestOverlay(); },
    drawOverlay(ctx, g) {
        const r = crop.get().rect;
        if (!r) return;
        const { w, h } = view.get();
        const c = [[r.x, r.y], [r.x + r.width, r.y], [r.x + r.width, r.y + r.height], [r.x, r.y + r.height]].map(([x, y]) => ctx.toScreen({ x, y }));
        g.beginPath(); g.rect(0, 0, w, h);
        c.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath(); g.fillStyle = 'rgba(0, 0, 0, 0.5)'; g.fill('evenodd');
        g.beginPath(); c.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath(); g.lineWidth = 1.5; g.strokeStyle = css('--accent'); g.stroke();
        for (const hd of handles(r)) {
            const p = ctx.toScreen(hd);
            g.fillStyle = css('--text'); g.fillRect(p.x - 4, p.y - 4, 8, 8); g.lineWidth = 1; g.strokeRect(p.x - 4, p.y - 4, 8, 8);
        }
    },
} satisfies Tool;
