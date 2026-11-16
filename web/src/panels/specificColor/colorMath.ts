// Colour models for the Specific Color Selector. Pure maths, no DOM. RGB is sRGB floats 0..1.
export type Rgb = [number, number, number];
export type ModelId = 'rgb' | 'hsv' | 'hsl' | 'lab';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function rgbToHsv([r, g, b]: Rgb, hue = 0): Rgb {   // h 0..360, s, v 0..1; `hue` is kept for greys
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    if (!d) return [hue, 0, max];
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, d / max, max];
}
export function hsvToRgb([h, s, v]: Rgb): Rgb {
    const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5), f(3), f(1)];
}
export function rgbToHsl([r, g, b]: Rgb, hue = 0): Rgb {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    if (!d) return [hue, 0, l];
    return [rgbToHsv([r, g, b])[0], d / (1 - Math.abs(2 * l - 1)), l];
}
export function hslToRgb([h, s, l]: Rgb): Rgb {
    const a = s * Math.min(l, 1 - l), f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)];
}

const lin = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const unlin = (c: number) => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
const WHITE = [0.95047, 1, 1.08883];   // D65
const eps = 216 / 24389, kappa = 24389 / 27;
const fwd = (t: number) => t > eps ? Math.cbrt(t) : (kappa * t + 16) / 116;
const inv = (t: number) => t ** 3 > eps ? t ** 3 : (116 * t - 16) / kappa;

export function rgbToLab([r, g, b]: Rgb): Rgb {
    const R = lin(r), G = lin(g), B = lin(b);
    const x = fwd((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / WHITE[0]);
    const y = fwd(0.2126729 * R + 0.7151522 * G + 0.0721750 * B);
    const z = fwd((0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / WHITE[2]);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** Lab values outside the sRGB gamut are clamped; `clamped` says so. */
export function labToRgb([L, a, b]: Rgb): { rgb: Rgb; clamped: boolean } {
    const fy = (L + 16) / 116, X = inv(fy + a / 500) * WHITE[0], Y = inv(fy), Z = inv(fy - b / 200) * WHITE[2];
    const lr = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
    const lg = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
    const lb = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
    const raw = [lr, lg, lb].map(v => v < 0 ? -unlin(-v) : unlin(v)), tol = 0.5 / 255;   // under half an 8-bit step is rounding, not gamut
    const clamped = raw.some(v => v < -tol || v > 1 + tol);
    return { rgb: raw.map(clamp01) as Rgb, clamped };
}

export interface Channel { label: string; min: number; max: number; unit: string }
export interface Model { id: ModelId; name: string; channels: Channel[] }
const ch = (label: string, min: number, max: number, unit = ''): Channel => ({ label, min, max, unit });
export const MODELS: Model[] = [
    { id: 'rgb', name: 'RGB', channels: [ch('R', 0, 255), ch('G', 0, 255), ch('B', 0, 255)] },
    { id: 'hsv', name: 'HSV', channels: [ch('H', 0, 360, '°'), ch('S', 0, 100, '%'), ch('V', 0, 100, '%')] },
    { id: 'hsl', name: 'HSL', channels: [ch('H', 0, 360, '°'), ch('S', 0, 100, '%'), ch('L', 0, 100, '%')] },
    { id: 'lab', name: 'Lab', channels: [ch('L*', 0, 100), ch('a*', -128, 127), ch('b*', -128, 127)] },
];

/** Channel values in the model's own units (see MODELS). `prev` supplies the hue for greys. */
export function toChannels(id: ModelId, rgb: Rgb, prev: number[] = [0, 0, 0]): number[] {
    if (id === 'rgb') return rgb.map(x => x * 255);
    if (id === 'lab') return rgbToLab(rgb);
    const [h, s, x] = (id === 'hsv' ? rgbToHsv : rgbToHsl)(rgb, prev[0]);
    return [h, s * 100, x * 100];
}
export function fromChannels(id: ModelId, v: number[]): { rgb: Rgb; clamped: boolean } {
    if (id === 'rgb') return { rgb: v.map(x => clamp01(x / 255)) as Rgb, clamped: false };
    if (id === 'lab') return labToRgb(v as Rgb);
    const f = id === 'hsv' ? hsvToRgb : hslToRgb;
    return { rgb: f([v[0], v[1] / 100, v[2] / 100]).map(clamp01) as Rgb, clamped: false };
}
