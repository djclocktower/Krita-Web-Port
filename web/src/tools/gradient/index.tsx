import type { GradientOptions, Point } from '../../engine/protocol';
import type { Tool } from '../../tools';
import { outline, run, svg } from '../shared';
import { store, useStore } from '../../shell/store';

const options = store<Required<GradientOptions>>({ shape: 'linear', repeat: 'none', reverse: false });
const SHAPES = ['linear', 'bilinear', 'radial', 'square', 'conical', 'spiral'] as const;
const REPEATS = ['none', 'forwards', 'alternating'] as const;

function Options() {
    const o = useStore(options);
    return (<>
        <label class="row">Shape
            <select value={o.shape} onChange={e => options.set({ shape: e.currentTarget.value as GradientOptions['shape'] })}>
                {SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
        </label>
        <label class="row">Repeat
            <select value={o.repeat} onChange={e => options.set({ repeat: e.currentTarget.value as Required<GradientOptions>['repeat'] })}>
                {REPEATS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
        </label>
        <label class="check"><input type="checkbox" checked={o.reverse} onChange={e => options.set({ reverse: e.currentTarget.checked })} /> Reverse</label>
    </>);
}

// Drag from where the foreground colour starts to where the background colour ends.
let from: Point | null = null, to: Point = { x: 0, y: 0 };

export default {
    id: 'gradient', title: 'Gradient', shortcut: 'G', cursor: 'crosshair', order: 21, options: Options,
    icon: svg('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 16 16 4M4 11l7-7M9 20 20 9"/>'),
    onPointerDown(ctx, p) { from = to = p; ctx.requestOverlay(); },
    onPointerMove(ctx, pts) { if (from) { to = pts[pts.length - 1]; ctx.requestOverlay(); } },
    onPointerUp(ctx, p) {
        if (!from) return;
        const a = from;
        from = null; ctx.requestOverlay();
        if ((p.x !== a.x || p.y !== a.y)) run(ctx.engine.drawGradient(a, { x: p.x, y: p.y }, options.get()));
    },
    onCancel(ctx) { from = null; ctx.requestOverlay(); },
    drawOverlay(ctx, g) {
        if (!from) return;
        const a = ctx.toScreen(from), b = ctx.toScreen(to);
        outline(g, [a, b], false);
        for (const p of [a, b]) { g.beginPath(); g.arc(p.x, p.y, 4, 0, 2 * Math.PI); g.setLineDash([]); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#000'; g.stroke(); }
    },
} satisfies Tool;
