import type { Point, SelectionMode } from '../../engine/protocol';
import type { Tool } from '../../tools';
import { modeFor, ModeOptions, outline, run } from '../shared';

// Freehand lasso: drag around the area; letting go closes the outline.
let points: Point[] = [], mode: SelectionMode = 'replace';

export default {
    id: 'selectPolygon', title: 'Freehand Selection', cursor: 'crosshair', order: 12, options: ModeOptions,
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8c3-4 10-5 14-1 2 3-1 6-5 6-2 0-3 3-6 4-3 0-5-4-3-9z" stroke-dasharray="3 2"/></svg>',
    onPointerDown(ctx, p) { points = [p]; mode = modeFor(ctx.modifiers); ctx.requestOverlay(); },
    onPointerMove(ctx, pts) {
        for (const p of pts) { const q = points[points.length - 1]; if (q && Math.hypot(p.x - q.x, p.y - q.y) >= 1) points.push(p); }   // ponytail: no simplification; a long drag sends many points
        ctx.requestOverlay();
    },
    onPointerUp(ctx) {
        const done = points;
        points = []; ctx.requestOverlay();
        if (done.length >= 3) run(ctx.engine.selectPolygon(done.map(({ x, y }) => ({ x, y })), mode));
        else if (mode === 'replace') run(ctx.engine.deselect());
    },
    onCancel(ctx) { points = []; ctx.requestOverlay(); },
    drawOverlay(ctx, g) { outline(g, points.map(ctx.toScreen), false); },
} satisfies Tool;
