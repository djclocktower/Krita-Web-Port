// Krita's sensor-curve string: "x0,y0;x1,y1;..." with x and y in 0..1 and x strictly increasing.
// Plain functions, no DOM, so they can be unit-tested.
export interface CurvePoint { x: number; y: number }

export const DEFAULT_CURVE = '0,0;1,1;';

/** Malformed input (bad numbers, out of range, x not increasing, fewer than two points) gives the default curve. */
export function parseCurve(text: string): CurvePoint[] {
    const pts: CurvePoint[] = [];
    for (const part of String(text).split(';')) {
        if (part.trim() === '') continue;
        const xy = part.split(',');
        const x = Number(xy[0]), y = Number(xy[1]);
        const ok = xy.length === 2 && xy[0].trim() !== '' && xy[1].trim() !== '' &&
                   x >= 0 && x <= 1 && y >= 0 && y <= 1 && (!pts.length || x > pts[pts.length - 1].x);
        if (!ok) return parseCurve(DEFAULT_CURVE);
        pts.push({ x, y });
    }
    return pts.length >= 2 ? pts : parseCurve(DEFAULT_CURVE);
}

export const serializeCurve = (pts: CurvePoint[]) => pts.map(p => `${p.x},${p.y};`).join('');

/** Value of the monotone cubic (Fritsch-Carlson) through `pts` at x. Passes through every point, never overshoots. */
export function curveAt(pts: CurvePoint[], x: number): number {
    const n = pts.length;
    if (x <= pts[0].x) return pts[0].y;
    if (x >= pts[n - 1].x) return pts[n - 1].y;
    const h: number[] = [], d: number[] = [];
    for (let i = 0; i < n - 1; i++) { h.push(pts[i + 1].x - pts[i].x); d.push((pts[i + 1].y - pts[i].y) / h[i]); }
    const m = [d[0]];
    for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
    m.push(d[n - 2]);
    for (let i = 0; i < n - 1; i++) {
        if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
        const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
        if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    let i = 0;
    while (x > pts[i + 1].x) i++;
    const t = (x - pts[i].x) / h[i], t2 = t * t, t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * pts[i].y + (t3 - 2 * t2 + t) * h[i] * m[i] +
              (-2 * t3 + 3 * t2) * pts[i + 1].y + (t3 - t2) * h[i] * m[i + 1];
    return Math.min(1, Math.max(0, y));
}
