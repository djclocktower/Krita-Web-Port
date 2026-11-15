import type { Tool } from '../../tools';
import { fillOptions, FillOptionsForm, insideDoc, run, svg } from '../shared';

// Click to fill the region of similar colour with the foreground colour (Ctrl: background colour).
export default {
    id: 'fill', title: 'Fill', shortcut: 'F', cursor: 'crosshair', order: 20, options: FillOptionsForm,
    icon: svg('<path d="M12 3 4 11a2 2 0 0 0 0 3l5 5a2 2 0 0 0 3 0l8-8z"/><path d="M4 11h16"/><path d="M21 16c1 1.5 1 2.5 0 3-1-.5-1-1.5 0-3z"/>'),
    onPointerDown() {},
    onPointerMove() {},
    onPointerUp(ctx, p) {
        if (insideDoc(p)) run(ctx.engine.floodFill({ x: Math.floor(p.x), y: Math.floor(p.y) }, ctx.modifiers.ctrl ? 'background' : 'foreground', fillOptions.get()));
    },
} satisfies Tool;
