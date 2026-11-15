// View transform: image pixel -> CSS pixel on the canvas element. Rotation and mirror are about the image centre.
import { store } from '../shell/store';

export const view = store({
    scale: 1, rot: 0, mirror: false,           // scale = CSS px per image px; rot in radians, clockwise
    panX: 0, panY: 0,                          // offset of the image centre from the viewport centre
    w: 0, h: 0,                                // viewport size in CSS px
    docW: 0, docH: 0,
    pointer: null as { x: number; y: number } | null,   // image coords under the hover pointer
});
const v = view.get;
let needFit = false;

/** Linear part of the map: screen = (a*dx + c*dy, b*dx + d*dy) + centre, with (dx, dy) relative to the image centre. */
export function matrix() {
    const { scale, rot, mirror } = v(), cos = Math.cos(rot), sin = Math.sin(rot), f = mirror ? -1 : 1;
    return { a: cos * scale * f, b: sin * scale * f, c: -sin * scale, d: cos * scale };
}

export function toImage(sx: number, sy: number) {
    const { a, b, c, d } = matrix(), s = v(), X = sx - s.w / 2 - s.panX, Y = sy - s.h / 2 - s.panY, det = a * d - b * c;
    return { x: (d * X - c * Y) / det + s.docW / 2, y: (-b * X + a * Y) / det + s.docH / 2 };
}

/** Applies `next`, then pans so image point `img` lands on screen point (sx, sy). */
function place(img: { x: number; y: number }, sx: number, sy: number, next: Partial<ReturnType<typeof v>>) {
    view.set(next);
    const s = v(), { a, b, c, d } = matrix(), dx = img.x - s.docW / 2, dy = img.y - s.docH / 2;
    view.set({ panX: sx - s.w / 2 - (a * dx + c * dy), panY: sy - s.h / 2 - (b * dx + d * dy) });
}
const clampScale = (k: number) => Math.min(64, Math.max(0.02, k));

export const pan = (dx: number, dy: number) => view.set({ panX: v().panX + dx, panY: v().panY + dy });
export const zoomAbout = (factor: number, sx: number, sy: number) =>
    place(toImage(sx, sy), sx, sy, { scale: clampScale(v().scale * factor) });
export const rotateAbout = (delta: number, sx: number, sy: number) =>
    place(toImage(sx, sy), sx, sy, { rot: v().rot + delta });
/** Two-finger gesture: the image point under `from` follows to `to`, with relative zoom and rotation. */
export const gesture = (from: { x: number; y: number }, to: { x: number; y: number }, zoom: number, rotate: number) =>
    place(toImage(from.x, from.y), to.x, to.y, { scale: clampScale(v().scale * zoom), rot: v().rot + rotate });

const centre = () => ({ x: v().w / 2, y: v().h / 2 });
export const zoomBy = (factor: number) => zoomAbout(factor, centre().x, centre().y);
export const zoomTo = (scale: number) => zoomBy(scale / v().scale);
export const rotateBy = (delta: number) => rotateAbout(delta, centre().x, centre().y);
export const resetRotation = () => rotateBy(-v().rot);
export const toggleMirror = () => place(toImage(centre().x, centre().y), centre().x, centre().y, { mirror: !v().mirror });

export function fit() {
    const s = v();
    if (!s.w || !s.docW) { needFit = true; return; }
    needFit = false;
    view.set({ scale: clampScale(Math.min(s.w / s.docW, s.h / s.docH) * 0.95), panX: 0, panY: 0 });
}
export function setViewport(w: number, h: number) { view.set({ w, h }); if (needFit) fit(); }
