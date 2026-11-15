// Canvas tools. Each tool lives in src/tools/<name>/index.ts(x) and default-exports a Tool.
// The canvas sends pointer input to the active tool; tools talk to the engine and may draw an
// overlay (marquee, gradient line, crop frame) in screen space. Tools never import each other.
import type { ComponentType } from 'preact';
import type { Engine, Point, StrokePoint } from './engine/protocol';

/** A pointer sample in image pixels, with the pen data the device reported. */
export type ToolPoint = StrokePoint;

export interface ToolContext {
    engine: Engine;
    /** Image pixels to canvas CSS pixels, for drawing overlays. */
    toScreen(p: Point): Point;
    /** Ask for drawOverlay to be called again (e.g. after a drag moved). */
    requestOverlay(): void;
    modifiers: { shift: boolean; ctrl: boolean; alt: boolean };
}

export interface Tool {
    id: string;
    title: string;
    /** A short glyph or inline SVG markup for the toolbox button. */
    icon: string;
    /** Krita's default shortcut, e.g. "B". */
    shortcut?: string;
    /** CSS cursor while the tool is active. */
    cursor?: string;
    /** Lower comes first in the toolbox. */
    order?: number;
    onPointerDown(ctx: ToolContext, p: ToolPoint): void;
    /** All samples since the last call, oldest first (coalesced events are not dropped). */
    onPointerMove(ctx: ToolContext, points: ToolPoint[]): void;
    onPointerUp(ctx: ToolContext, p: ToolPoint): void;
    /** The gesture was interrupted (Escape, a second finger, pointer capture lost). */
    onCancel?(ctx: ToolContext): void;
    drawOverlay?(ctx: ToolContext, g: CanvasRenderingContext2D): void;
    /** Tool options shown while the tool is active. */
    options?: ComponentType<{ engine: Engine }>;
}

const modules = import.meta.glob<{ default: Tool }>('./tools/*/index.{ts,tsx}', { eager: true });
export const tools: Tool[] = Object.values(modules).map(m => m.default).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

let activeId = 'brush';
const listeners = new Set<() => void>();
export const activeTool = () => tools.find(t => t.id === activeId) ?? tools[0];
export function setActiveTool(id: string) {
    if (id === activeId || !tools.some(t => t.id === id)) return;
    activeId = id;
    listeners.forEach(l => l());
}
export function onActiveToolChange(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
