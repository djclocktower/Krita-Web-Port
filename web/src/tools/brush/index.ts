import type { Tool } from '../../tools';
import Options from './Options';

// Freehand painting: every pointer sample goes to the engine with its pen data.
let drawing = false;

export default {
    id: 'brush', title: 'Freehand Brush', shortcut: 'B', cursor: 'crosshair', order: 0, options: Options,
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4c-6 1-9 5-10 9l2 2c4-1 8-4 8-11z"/><path d="M9 14c-3 0-4 2-4 4-1 1-2 1-2 2 3 1 8 1 8-4"/></svg>',
    onPointerDown(ctx, p) { drawing = true; ctx.engine.beginStroke(p); },
    onPointerMove(ctx, points) { if (drawing) ctx.engine.continueStroke(points); },
    onPointerUp(ctx) { if (drawing) { drawing = false; ctx.engine.endStroke(); } },
    // an interrupted stroke leaves no mark
    onCancel(ctx) { if (drawing) { drawing = false; ctx.engine.endStroke(); void ctx.engine.undo(); } },
} satisfies Tool;
