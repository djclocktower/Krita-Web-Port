// Touch state shared by the canvas input and the on-screen controls: sticky modifier toggles, the colour-picker loupe, pen/palm tracking.
import type { Color } from '../engine/protocol';
import { store } from '../shell/store';

/** Shift, Ctrl and Alt for people without a keyboard: latched by on-screen toggles, ORed into every canvas pointer event. */
export const touchMods = store({ shift: false, ctrl: false, alt: false });

/** The colour-picker loupe shown while a finger is held down (long-press). Client pixels. */
export const loupe = store({ on: false, x: 0, y: 0, color: null as Color | null });

/** When a pen last touched or hovered over the page. A finger within PALM_MS of that is a palm: it does not paint. */
export const pen = { last: -1e9 };
export const PALM_MS = 3000;
export const palmDown = (now = performance.now()) => now - pen.last < PALM_MS;

/** The colour on screen under a client point, read back from the canvas. null outside the image.
 *  ponytail: this is the composite as displayed (over the checkerboard where transparent), not Krita's own sampler on the active layer. */
export function sampleCanvas(cv: HTMLCanvasElement, clientX: number, clientY: number): Color | null {
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const t = (sampleCanvas.tmp ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }));
    const g = t.getContext('2d', { willReadFrequently: true })!;
    g.clearRect(0, 0, 1, 1);
    g.drawImage(cv, (clientX - r.left) * k, (clientY - r.top) * k, 1, 1, 0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return d[3] ? { r: d[0] / 255, g: d[1] / 255, b: d[2] / 255, a: 1 } : null;
}
sampleCanvas.tmp = undefined as HTMLCanvasElement | undefined;
