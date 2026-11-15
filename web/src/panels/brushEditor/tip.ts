// The brush tip is XML in brush_definition (see the header of descriptions/brushes.ts). Attributes are read and
// written with plain regular expressions so this works in the browser and in Node. Only attributes that exist in
// Krita's own tip dialog are described, each with the range read from kis_auto_brush_widget.cpp and friends.
export interface TipField {
    tag: 'Brush' | 'MaskGenerator'; attr: string; label: string;
    kind: 'number' | 'integer' | 'boolean' | 'choice';
    min?: number; max?: number; step?: number;
    choices?: [value: string, label: string][];
    /** Stored value = shown value / scale (angle is stored in radians, shown in degrees). */
    scale?: number;
    /** Brush types ('type' attribute of <Brush>) the field applies to. */
    types: string[];
    note?: string;
}
const AUTO = ['auto_brush'], IMAGE = ['png_brush', 'gbr_brush'], ALL = [...AUTO, ...IMAGE];
export const TIP_FIELDS: TipField[] = [
    { tag: 'MaskGenerator', attr: 'type', label: 'Shape', kind: 'choice', choices: [['circle', 'Circle'], ['rect', 'Square']], types: AUTO },
    { tag: 'MaskGenerator', attr: 'id', label: 'Mask Type', kind: 'choice', choices: [['default', 'Default'], ['soft', 'Soft'], ['gauss', 'Gaussian']], types: AUTO },
    { tag: 'MaskGenerator', attr: 'diameter', label: 'Diameter (px)', kind: 'number', min: 0.01, step: 0.01, types: AUTO },
    { tag: 'MaskGenerator', attr: 'ratio', label: 'Ratio', kind: 'number', min: 0.01, max: 1, step: 0.01, types: AUTO },
    { tag: 'MaskGenerator', attr: 'hfade', label: 'Horizontal fade', kind: 'number', min: 0, max: 1, step: 0.01, types: AUTO },
    { tag: 'MaskGenerator', attr: 'vfade', label: 'Vertical fade', kind: 'number', min: 0, max: 1, step: 0.01, types: AUTO },
    { tag: 'MaskGenerator', attr: 'spikes', label: 'Spikes', kind: 'integer', min: 2, max: 20, types: AUTO },
    { tag: 'MaskGenerator', attr: 'antialiasEdges', label: 'Anti-alias', kind: 'boolean', types: AUTO },
    { tag: 'Brush', attr: 'scale', label: 'Scale', kind: 'number', min: 0, step: 0.01, types: IMAGE },
    { tag: 'Brush', attr: 'angle', label: 'Angle (degrees)', kind: 'number', scale: Math.PI / 180, step: 1, types: ALL },
    { tag: 'Brush', attr: 'spacing', label: 'Spacing', kind: 'number', min: 0.02, max: 10, step: 0.01, types: ALL },
    { tag: 'Brush', attr: 'useAutoSpacing', label: 'Auto spacing', kind: 'boolean', types: ALL },
    { tag: 'Brush', attr: 'autoSpacingCoeff', label: 'Auto spacing coefficient', kind: 'number', step: 0.01, types: ALL },
    { tag: 'Brush', attr: 'randomness', label: 'Randomness (stored 0..1, Krita shows percent)', kind: 'number', min: 0, max: 1, step: 0.01, types: AUTO },
    { tag: 'Brush', attr: 'density', label: 'Density (stored 0..1, Krita shows percent)', kind: 'number', min: 0, max: 1, step: 0.01, types: AUTO },
    { tag: 'Brush', attr: 'ColorAsMask', label: 'Color as mask', kind: 'boolean', types: IMAGE },
];

export const getAttr = (xml: string, tag: string, attr: string): string | null =>
    new RegExp(`<${tag}\\b[^>]*?\\s${attr}="([^"]*)"`).exec(xml)?.[1] ?? null;

/** Same XML with one attribute set (added when missing). Null when the element is not there. */
export function setAttr(xml: string, tag: string, attr: string, value: string): string | null {
    const has = new RegExp(`(<${tag}\\b[^>]*?\\s${attr}=")[^"]*(")`);
    if (has.test(xml)) return xml.replace(has, (_, a, c) => a + value + c);
    const open = new RegExp(`(<${tag}\\b[^>]*?)(\\s*/?>)`);
    return open.test(xml) ? xml.replace(open, (_, a, c) => `${a} ${attr}="${value}"${c}`) : null;
}

export const tipType = (xml: string): string => getAttr(xml, 'Brush', 'type') ?? '';
export const fieldsFor = (xml: string): TipField[] => TIP_FIELDS.filter(f => f.types.includes(tipType(xml)) && getAttr(xml, f.tag, f.attr) !== null);

/** Shown value of a field (boolean as true/false, angle in degrees). */
export function readField(xml: string, f: TipField): number | boolean | string | null {
    const raw = getAttr(xml, f.tag, f.attr);
    if (raw === null) return null;
    if (f.kind === 'boolean') return raw === '1' || raw === 'true';
    if (f.kind === 'choice') return raw;
    const n = Number(raw);
    return Number.isFinite(n) ? (f.scale ? Math.round(n / f.scale * 100) / 100 : n) : null;
}
export function writeField(xml: string, f: TipField, v: number | boolean | string): string | null {
    const s = f.kind === 'boolean' ? (v ? '1' : '0') : f.kind === 'choice' ? String(v) : String(f.scale ? Number(v) * f.scale : v);
    return setAttr(xml, f.tag, f.attr, s);
}
