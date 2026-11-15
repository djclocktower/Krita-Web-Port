import { pan, view, zoomAbout } from '../../canvas/view';
import type { Point } from '../../engine/protocol';
import { store, useStore } from '../../shell/store';
import type { Tool } from '../../tools';
import { outline, svg } from '../shared';

// Click zooms in (Alt+click: out); dragging a rectangle zooms to it.
const mode = store({ out: false });   // for touch, where there is no Alt key
let from: Point | null = null, to: Point = { x: 0, y: 0 }, out = false;

function Options() {
    const { out } = useStore(mode);
    return (
        <div class="row" role="group" aria-label="Zoom direction">
            <span>Click</span>
            <span class="seg">
                <button type="button" aria-pressed={!out} onClick={() => mode.set({ out: false })}>Zoom in</button>
                <button type="button" aria-pressed={out} onClick={() => mode.set({ out: true })}>Zoom out</button>
            </span>
        </div>
    );
}

export default {
    id: 'zoom', title: 'Zoom', shortcut: 'Z', cursor: 'zoom-in', order: 41, options: Options,
    icon: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5M8 10.5h5M10.5 8v5"/>'),
    onPointerDown(ctx, p) { from = to = p; out = ctx.modifiers.alt || mode.get().out; ctx.requestOverlay(); },
    onPointerMove(ctx, pts) { if (from) { to = pts[pts.length - 1]; ctx.requestOverlay(); } },
    onPointerUp(ctx) {
        if (!from) return;
        const a = ctx.toScreen(from), b = ctx.toScreen(to), { w, h } = view.get();
        from = null; ctx.requestOverlay();
        if (Math.hypot(a.x - b.x, a.y - b.y) < 5 || out) { zoomAbout(out ? 0.5 : 2, a.x, a.y); return; }
        // zoom so the rectangle just fits, then centre it
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        zoomAbout(Math.min(w / Math.abs(a.x - b.x), h / Math.abs(a.y - b.y)), cx, cy);
        pan(w / 2 - cx, h / 2 - cy);
    },
    onCancel(ctx) { from = null; ctx.requestOverlay(); },
    drawOverlay(ctx, g) {
        if (!from) return;
        const a = ctx.toScreen(from), b = ctx.toScreen(to);
        outline(g, [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }]);
    },
} satisfies Tool;
