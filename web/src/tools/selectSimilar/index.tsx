import type { Tool } from '../../tools';
import { fillOptions, FillOptionsForm, insideDoc, modeFor, ModeOptions, run, svg } from '../shared';

const Options = () => <><ModeOptions /><FillOptionsForm /></>;

// Contiguous selection (magic wand): click a pixel to select the region of similar colour around it.
export default {
    id: 'selectSimilar', title: 'Contiguous Selection', cursor: 'crosshair', order: 13, options: Options,
    icon: svg('<path d="M4 20 14 10"/><path d="M15 3v4M13 5h4M19 9v3M17.5 10.5h3M8 4v2M7 5h2"/>'),
    onPointerDown() {},
    onPointerMove() {},
    onPointerUp(ctx, p) {
        if (insideDoc(p)) run(ctx.engine.selectSimilar({ x: Math.floor(p.x), y: Math.floor(p.y) }, fillOptions.get(), modeFor(ctx.modifiers)));
    },
} satisfies Tool;
