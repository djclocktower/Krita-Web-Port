// Helpers several tools use. Not a tool itself (src/tools.ts only loads src/tools/<id>/index.ts[x]).
import type { Engine, FillOptions, Point, Rect, SelectionMode } from '../engine/protocol';
import { view } from '../canvas/view';
import { report } from '../shell/state';
import { store, useStore } from '../shell/store';
import { useEffect, useReducer } from 'preact/hooks';
import { activeTool, onActiveToolChange, type Tool, type ToolContext } from '../tools';

/** Runs an engine call and shows its error (e.g. "Unknown method") in the shell's banner instead of dropping it. */
export const run = (p: Promise<unknown>) => { p.catch(report); };
export const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const insideDoc = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < view.get().docW && p.y < view.get().docH;

// ---- options shared between tools
export const selection = store({ mode: 'replace' as SelectionMode });
export const fillOptions = store<Required<FillOptions>>({ threshold: 8, contiguous: true, sampleMerged: false });

/** Krita: Shift adds, Alt subtracts, both intersect; otherwise the mode chosen in the tool options. */
export const modeFor = (m: ToolContext['modifiers']): SelectionMode =>
    m.shift && m.alt ? 'intersect' : m.shift ? 'add' : m.alt ? 'subtract' : selection.get().mode;

const MODES: [SelectionMode, string][] = [['replace', 'Replace'], ['add', 'Add'], ['subtract', 'Subtract'], ['intersect', 'Intersect']];
export function ModeOptions() {
    const { mode } = useStore(selection);
    return (
        <div class="row" role="group" aria-label="Selection mode">
            <span>Mode</span>
            <span class="seg">
                {MODES.map(([m, label]) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => selection.set({ mode: m })}>{label}</button>)}
            </span>
        </div>
    );
}

export function FillOptionsForm() {
    const o = useStore(fillOptions);
    return (<>
        <label class="row">Threshold
            <input type="range" min={0} max={255} value={o.threshold} onInput={e => fillOptions.set({ threshold: Number(e.currentTarget.value) })} />
            <output>{o.threshold}</output>
        </label>
        <label class="check"><input type="checkbox" checked={o.contiguous} onChange={e => fillOptions.set({ contiguous: e.currentTarget.checked })} /> Contiguous</label>
        <label class="check"><input type="checkbox" checked={o.sampleMerged} onChange={e => fillOptions.set({ sampleMerged: e.currentTarget.checked })} /> Sample merged</label>
    </>);
}

// ---- drawing
/** A dashed white/black outline, readable on any image. Points are canvas CSS pixels. */
export function outline(g: CanvasRenderingContext2D, pts: Point[], close = true) {
    if (pts.length < 2) return;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    if (close) g.closePath();
    g.lineWidth = 1; g.setLineDash([]); g.strokeStyle = '#fff'; g.stroke();
    g.setLineDash([4, 4]); g.strokeStyle = '#000'; g.stroke();
}

/** Rectangle and ellipse selection: drag a box; Shift (pressed after the drag starts) makes it square, Ctrl draws from the centre. */
export function dragSelect(t: Pick<Tool, 'id' | 'title' | 'icon' | 'shortcut' | 'order'> & {
    shape(r: Rect): Point[];
    select(engine: Engine, r: Rect, mode: SelectionMode): Promise<void>;
}): Tool {
    let a: Point | null = null, b: Point = { x: 0, y: 0 }, mode: SelectionMode = 'replace', armed = false;
    const rect = (m: ToolContext['modifiers']): Rect => {
        let dx = b.x - a!.x, dy = b.y - a!.y;
        if (m.shift && armed) { const k = Math.max(Math.abs(dx), Math.abs(dy)); dx = k * (dx < 0 ? -1 : 1); dy = k * (dy < 0 ? -1 : 1); }
        const [x0, x1] = m.ctrl ? [a!.x - dx, a!.x + dx] : [a!.x, a!.x + dx], [y0, y1] = m.ctrl ? [a!.y - dy, a!.y + dy] : [a!.y, a!.y + dy];
        const { docW, docH } = view.get();
        const l = Math.max(0, Math.round(Math.min(x0, x1))), r = Math.min(docW, Math.round(Math.max(x0, x1)));
        const tp = Math.max(0, Math.round(Math.min(y0, y1))), bt = Math.min(docH, Math.round(Math.max(y0, y1)));
        return { x: l, y: tp, width: r - l, height: bt - tp };
    };
    return {
        ...t, cursor: 'crosshair',
        onPointerDown(ctx, p) { a = b = p; mode = modeFor(ctx.modifiers); armed = !ctx.modifiers.shift; ctx.requestOverlay(); },
        onPointerMove(ctx, pts) { if (!a) return; b = pts[pts.length - 1]; if (!ctx.modifiers.shift) armed = true; ctx.requestOverlay(); },
        onPointerUp(ctx, p) {
            if (!a) return;
            b = p;
            const r = rect(ctx.modifiers);
            a = null; ctx.requestOverlay();
            if (r.width >= 1 && r.height >= 1) run(t.select(ctx.engine, r, mode));
            else if (mode === 'replace') run(ctx.engine.deselect());   // a plain click clears the selection, as in Krita
        },
        onCancel(ctx) { a = null; ctx.requestOverlay(); },
        drawOverlay(ctx, g) { if (a) outline(g, t.shape(rect(ctx.modifiers)).map(ctx.toScreen)); },
    };
}

export const svg = (body: string) =>
    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** The active tool, re-rendering the component when it changes. */
export function useActiveTool(): Tool {
    const [, bump] = useReducer((n: number) => n + 1, 0);
    useEffect(() => onActiveToolChange(() => bump(0)), []);
    return activeTool();
}
