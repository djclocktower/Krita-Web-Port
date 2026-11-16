// Canvas aids: brush outline cursor, rulers, grid, guides and snapping. State is in memory only.
import type { Engine, Point } from '../engine/protocol';
import { store } from '../shell/store';
import { toImage, toScreen, view } from './view';

export const RULER = 20;   // ruler thickness in CSS px
export const aids = store({
    rulers: false, grid: false, guides: true, lock: false,
    snapGuides: false, snapGrid: false, snapBounds: false, snapCenter: false,
    gx: 20, gy: 20, sub: 2, color: '#8c8c8c', pixelGrid: true, pixelAt: 24,   // pixelAt: zoom as a scale, 24 = 2400%
    rev: 0,                                                                    // bumped when guides change
});
/** Pointer and brush state that changes too often for a store. `hover` is canvas CSS px. */
export const live = { hover: null as Point | null, size: 12, resizing: false };

const bump = () => aids.set({ rev: aids.get().rev + 1 });
const dpr = () => devicePixelRatio;
const rotated = () => { const r = view.get().rot; return Math.abs(Math.sin(r)) > 1e-6 || Math.cos(r) < 0; };
/** Rulers are axis-aligned to the screen, so they are hidden while the view is rotated. */
export const rulersOn = () => aids.get().rulers && !rotated();
let colors: Record<string, string> | null = null;
const color = (n: string) => (colors ??= Object.fromEntries(['--panel', '--border', '--text-dim', '--accent']
    .map(k => [k, getComputedStyle(document.documentElement).getPropertyValue(k).trim()])))[n];

// ---- guides, per document name
type Guides = { h: number[]; v: number[] };
const docs = new Map<string, Guides>();
let cur = '';
const guides = (): Guides => { let g = docs.get(cur); if (!g) docs.set(cur, g = { h: [], v: [] }); return g; };
export const setDocName = (n: string) => { cur = n; bump(); };
export const guidesOf = () => ({ h: [...guides().h], v: [...guides().v] });

let drag: { o: 'h' | 'v'; i: number; orig: number | null } | null = null;

/** Pointer down at canvas px `l`. True when the press belongs to the rulers or a guide, so the tool must not see it. */
export function guideDown(l: Point, touch: boolean): boolean {
    const a = aids.get(), g = guides();
    if (rulersOn() && (l.x < RULER || l.y < RULER)) {
        if (l.x < RULER && l.y < RULER) return true;
        if (a.lock) return true;
        const o = l.y < RULER ? 'h' : 'v', p = toImage(l.x, l.y);
        if (!a.guides) aids.set({ guides: true });
        g[o].push(Math.round(o === 'h' ? p.y : p.x));
        drag = { o, i: g[o].length - 1, orig: null }; bump();
        return true;
    }
    if (!a.guides || a.lock) return false;
    const p = toImage(l.x, l.y), tol = (touch ? 10 : 5) / view.get().scale;
    for (const o of ['h', 'v'] as const) {
        const i = g[o].findIndex(v => Math.abs(v - (o === 'h' ? p.y : p.x)) <= tol);
        if (i >= 0) { drag = { o, i, orig: g[o][i] }; return true; }
    }
    return false;
}
export function guideMove(l: Point) {
    if (!drag) return;
    const p = toImage(l.x, l.y);
    guides()[drag.o][drag.i] = Math.round(drag.o === 'h' ? p.y : p.x); bump();
}
/** Dropping a guide on its ruler, or outside the canvas, deletes it. */
export function guideUp(l: Point) {
    if (!drag) return;
    const { w, h } = view.get(), { o, i } = drag;
    guideMove(l);
    const onRuler = rulersOn() && (o === 'h' ? l.y < RULER : l.x < RULER);
    if (onRuler || l.x < 0 || l.y < 0 || l.x > w || l.y > h) guides()[o].splice(i, 1);
    drag = null; bump();
}
export function guideCancel() {
    if (!drag) return;
    const { o, i, orig } = drag;
    if (orig === null) guides()[o].splice(i, 1); else guides()[o][i] = orig;
    drag = null; bump();
}

// ---- snapping: one place, applied to the points of tools that opt in
export const SNAP_TOOLS = new Set(['selectRect', 'selectEllipse', 'gradient', 'crop']);
export function snap(p: Point): Point {
    const a = aids.get(), s = view.get(), thr = 8 / s.scale;
    const one = (v: number, lines: number[], step: number, size: number) => {
        const c = [...(a.snapGuides ? lines : []), ...(a.snapGrid ? [Math.round(v / step) * step] : []),
            ...(a.snapBounds ? [0, size] : []), ...(a.snapCenter ? [size / 2] : [])];
        return c.reduce((best, t) => (Math.abs(t - v) < Math.abs(best - v) ? t : best), v + 2 * thr);
    };
    const g = guides(), x = one(p.x, g.v, a.gx, s.docW), y = one(p.y, g.h, a.gy, s.docH);
    return { x: Math.abs(x - p.x) <= thr ? x : p.x, y: Math.abs(y - p.y) <= thr ? y : p.y };
}

// ---- brush size by Shift+drag
export function resizeBrush(engine: Engine, start: number, dx: number) {
    live.size = Math.min(1000, Math.max(1, Math.round(start + (dx * 2) / view.get().scale)));
    engine.setBrush({ size: live.size }).catch(() => {});
}

// ---- drawing
const nice = (x: number) => {
    const e = 10 ** Math.floor(Math.log10(x));
    return e * ([1, 2, 5, 10].find(m => m * e >= x) ?? 10);
};
/** Image-space range that is on screen, clamped to the document. */
function visible() {
    const s = view.get(), c = [[0, 0], [s.w, 0], [0, s.h], [s.w, s.h]].map(([x, y]) => toImage(x, y)), xs = c.map(p => p.x), ys = c.map(p => p.y);
    return { x0: Math.max(0, Math.min(...xs)), x1: Math.min(s.docW, Math.max(...xs)), y0: Math.max(0, Math.min(...ys)), y1: Math.min(s.docH, Math.max(...ys)) };
}
/** Lines at every multiple of sx / sy (0 skips that direction), one device pixel wide. */
function lines(g: CanvasRenderingContext2D, sx: number, sy: number, r: ReturnType<typeof visible>) {
    const k = dpr(), crisp = !rotated(), q = (v: number) => (crisp ? (Math.floor(v * k) + 0.5) / k : v);
    g.beginPath();
    const seg = (a: Point, b: Point) => { g.moveTo(q(a.x), q(a.y)); g.lineTo(q(b.x), q(b.y)); };
    if (sx) for (let x = Math.ceil(r.x0 / sx) * sx; x <= r.x1; x += sx) seg(toScreen(x, r.y0), toScreen(x, r.y1));
    if (sy) for (let y = Math.ceil(r.y0 / sy) * sy; y <= r.y1; y += sy) seg(toScreen(r.x0, y), toScreen(r.x1, y));
    g.lineWidth = 1; g.setLineDash([]); g.stroke();
}
export function drawGrid(g: CanvasRenderingContext2D) {
    const a = aids.get(), { scale } = view.get(), r = visible();
    if (!view.get().docW) return;
    g.save(); g.strokeStyle = a.color;
    if (a.grid) {
        const sub = Math.max(1, a.sub), ok = (step: number) => (step * scale >= 4 ? step : 0);
        if (sub > 1 && (ok(a.gx / sub) || ok(a.gy / sub))) { g.globalAlpha = 0.3; lines(g, ok(a.gx / sub), ok(a.gy / sub), r); }
        if (ok(a.gx) || ok(a.gy)) { g.globalAlpha = 0.7; lines(g, ok(a.gx), ok(a.gy), r); }
    }
    if (a.pixelGrid && scale >= a.pixelAt) { g.globalAlpha = 0.4; lines(g, 1, 1, r); }
    g.restore();
}
export function drawGuides(g: CanvasRenderingContext2D) {
    const a = aids.get(), s = view.get();
    if (!a.guides || !s.docW) return;
    const gd = guides(), k = dpr(), crisp = !rotated(), q = (v: number) => (crisp ? (Math.floor(v * k) + 0.5) / k : v), far = 2 * (s.w + s.h);
    g.save(); g.strokeStyle = color('--accent'); g.lineWidth = 1; g.beginPath();
    for (const o of ['h', 'v'] as const) for (const v of gd[o]) {
        const p0 = o === 'h' ? toScreen(0, v) : toScreen(v, 0), p1 = o === 'h' ? toScreen(1, v) : toScreen(v, 1);
        const d = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1, ux = ((p1.x - p0.x) / d) * far, uy = ((p1.y - p0.y) / d) * far;
        g.moveTo(q(p0.x - ux), q(p0.y - uy)); g.lineTo(q(p0.x + ux), q(p0.y + uy));
    }
    g.stroke(); g.restore();
}
export function drawRulers(g: CanvasRenderingContext2D) {
    if (!rulersOn() || !view.get().docW) return;
    const s = view.get(), label = nice(50 / s.scale), m = label / 10 ** Math.floor(Math.log10(label)), minor = Math.max(1, label / (m === 2 ? 2 : 5)), ratio = Math.round(label / minor);
    g.save();
    g.fillStyle = color('--panel'); g.fillRect(0, 0, s.w, RULER); g.fillRect(0, 0, RULER, s.h);
    g.strokeStyle = color('--border'); g.lineWidth = 1; g.beginPath();
    g.moveTo(RULER, RULER - 0.5); g.lineTo(s.w, RULER - 0.5); g.moveTo(RULER - 0.5, RULER); g.lineTo(RULER - 0.5, s.h); g.stroke();
    g.fillStyle = color('--text-dim'); g.strokeStyle = color('--text-dim'); g.font = '10px system-ui, sans-serif'; g.textBaseline = 'alphabetic';
    const axis = (top: boolean) => {
        const a = top ? toImage(0, 0).x : toImage(0, 0).y, b = top ? toImage(s.w, s.h).x : toImage(s.w, s.h).y, lo = Math.min(a, b), hi = Math.max(a, b);
        g.beginPath();
        const texts: [string, number][] = [];
        for (let i = Math.floor(lo / minor); i * minor <= hi && i < 1e5; i++) {
            const v = i * minor, big = i % ratio === 0, sp = top ? toScreen(v, 0).x : toScreen(0, v).y;
            if (sp < RULER) continue;
            const t = Math.floor(sp) + 0.5, len = big ? RULER : RULER * 0.35;
            if (top) { g.moveTo(t, RULER - len); g.lineTo(t, RULER); } else { g.moveTo(RULER - len, t); g.lineTo(RULER, t); }
            if (big) texts.push([String(Math.round(v)), sp]);
        }
        g.stroke();
        for (const [txt, sp] of texts) {
            if (top) g.fillText(txt, sp + 2, 10);
            else { g.save(); g.translate(10, sp - 2); g.rotate(-Math.PI / 2); g.fillText(txt, 0, 0); g.restore(); }
        }
    };
    axis(true); axis(false);
    const h = live.hover;
    if (h) { g.strokeStyle = color('--accent'); g.beginPath(); const mx = Math.floor(h.x) + 0.5, my = Math.floor(h.y) + 0.5; g.moveTo(mx, 0); g.lineTo(mx, RULER); g.moveTo(0, my); g.lineTo(RULER, my); g.stroke(); }
    g.restore();
}

export let lastOutline: { x: number; y: number; d: number; cross: boolean } | null = null;
/** The brush outline at the pointer: a circle in screen pixels, a crosshair when it would be under 4 px. */
export const outlineShown = (on: boolean) => on && !!live.hover && !!view.get().docW;
export function drawOutline(g: CanvasRenderingContext2D, on: boolean) {
    lastOutline = null;
    const h = live.hover;
    if (!outlineShown(on) || !h) return;
    const d = live.size * view.get().scale, cross = d < 4;
    lastOutline = { x: h.x, y: h.y, d, cross };
    g.save(); g.setLineDash([]);
    g.beginPath();
    if (cross) { g.moveTo(h.x - 5, h.y); g.lineTo(h.x + 5, h.y); g.moveTo(h.x, h.y - 5); g.lineTo(h.x, h.y + 5); } else g.arc(h.x, h.y, d / 2, 0, Math.PI * 2);
    g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
    g.lineWidth = 1; g.strokeStyle = '#000'; g.stroke();
    g.restore();
}

if (import.meta.env.DEV) (window as unknown as { __aids: unknown }).__aids = { aids, live, guides: guidesOf, outline: () => lastOutline };
