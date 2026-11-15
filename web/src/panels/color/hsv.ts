import type { Color } from '../../engine/protocol';

export type Hsv = [h: number, s: number, v: number];   // h 0..360, s and v 0..1

export const hex = (c: Color) => '#' + [c.r, c.g, c.b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
export function parseHex(s: string): Color | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
}

export function fromHsv([h, s, v]: Hsv): Color {
    const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return { r: f(5), g: f(3), b: f(1), a: 1 };
}
/** `hue` is kept when the colour is grey and so has none of its own. */
export function toHsv({ r, g, b }: Color, hue = 0): Hsv {
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    if (!d) return [hue, 0, max];
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, d / max, max];
}
export const near = (p: Color, q: Color) => Math.abs(p.r - q.r) + Math.abs(p.g - q.g) + Math.abs(p.b - q.b) < 3 / 255;
