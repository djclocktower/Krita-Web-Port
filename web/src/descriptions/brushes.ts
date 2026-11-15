// Brush-engine editor descriptions: one table per brush engine id, in the order of Krita's own brush editor
// (left-hand option list). Labels, ranges and choices come from krita/plugins/paintops/<engine>/*OptionData.cpp,
// the *OptionWidget.cpp slider ranges and the .ui files; shared options live in krita/plugins/paintops/libpaintop.
// A range or choice mapping is only given where it was read there; anything else is left unranged.
//
// WHAT THE REAL ENGINE REPORTS (see tests/data/brush-configs.json, dumped from presets()/selectPreset()/presetSettings())
//   * Every value is a string ("true", "0.3", "50"); every PropertySpec has kind 'string' (or 'curve' for a few
//     legacy "Curve<Id>" keys). Booleans, numbers and colours are not typed, so every row below sets its own kind.
//     setPresetSetting(key, value) stringifies what it gets: a boolean true is stored as "true", 0.3 as "0.3".
//   * Only keys the preset already holds can be written ("Unknown setting: SizecommonCurve" otherwise). Krita options
//     whose key a preset lacks (e.g. Sharpness/softness, Spray/radialDistributionType) therefore cannot be edited.
//   * Curve options (Size, Opacity, Flow, Spacing, Rotation, Scatter, ...) are stored as a set of keys sharing the
//     option id (KisKritaSensorPack.cpp):  Pressure<Id> = enabled (only for options that can be switched off; Opacity
//     and Flow are always on), <Id>UseCurve = "Enable pen settings", <Id>Value = strength 0..1 (Softness 0.1..1,
//     Scatter 0..5), <Id>UseSameCurve, <Id>curveMode (0 multiply, 1 addition, 2 maximum, 3 minimum, 4 difference),
//     <Id>Sensor = XML, e.g.
//        <!DOCTYPE params> <params id="pressure"> <curve>0,0;0.413655,0.333333;1,1;</curve> </params>
//     or, with several sensors,
//        <!DOCTYPE params> <params id="sensorslist"> <ChildSensor id="speed"> <curve>0,1;1,0;</curve> </ChildSensor> ... </params>
//     The curve is in the "x,y;x,y;" form CurveEditor handles, but inside the XML. Editing the <curve> text of a
//     single-sensor XML was verified on the real engine to change strokes (tests/brush-forms.mjs); sensor lists are
//     shown read-only. Option ids with odd spelling are real: "h"/"s"/"v" (hue, saturation, value), "Line width",
//     "Curves opacity", "Offset scale", "Texture/Strength/". With a prefix (masked brush) the keys become
//     "MaskingBrush/Preset/PressureSize" etc.
//   * The brush tip is XML in brush_definition, e.g.
//        <Brush type="auto_brush" useAutoSpacing="1" autoSpacingCoeff="1.2" spacing="0.1" angle="0" randomness="0"
//         density="1"> <MaskGenerator id="default" type="circle" diameter="50" ratio="1" hfade="0.87" vfade="0.87"
//         spikes="2" antialiasEdges="1"/> </Brush>
//     or <Brush type="png_brush" filename="chalk_round_hard.png" scale="0.27" spacing="0.05" angle="0" .../> (also
//     gbr_brush). angle is in radians. Edits to the attributes were verified to change strokes (diameter, spacing).
//   * Not reported at all: colours (the dump has none), real booleans/numbers, resource choices (pattern, tip brush
//     file) as anything but their file names, and the sensor choice list.
import { grp, hide, r, type Row, type Table } from './types';

const b = (key: string, label: string, o: Partial<Row> = {}): Row => r(key, label, { kind: 'boolean', ...o });
const num = (key: string, label: string, min?: number, max?: number, step?: number): Row => r(key, label, { kind: 'number', min, max, step });
const int = (key: string, label: string, min?: number, max?: number): Row => r(key, label, { kind: 'integer', min, max });
const pick = (key: string, label: string, choices: Row['choices']): Row => r(key, label, { choices });

/** Rows the editor shows as text because the engine only reports a resource file name or XML. */
export const READ_ONLY = new Set<string>();
const ro = (...rows: Row[]): Row[] => { rows.forEach(x => READ_ONLY.add(x.key)); return rows; };

/** A curve option's sensor keys, handled together by the editor (checkbox + strength + curve). */
export interface SensorGroup { id: string; prefix: string; checkable: boolean }
export const SENSOR_GROUPS: Record<string, SensorGroup> = {};
/** Groups with an enable checkbox of their own (Airbrush, Pattern, ...): the key that holds it. */
export const GROUP_ENABLE: Record<string, string> = {};
/** Groups whose raw key is a brush tip (brush_definition XML) edited by the tip editor. */
export const TIP_GROUPS: Record<string, string> = {};

const LEGACY_CURVE_IDS = new Set(['Opacity', 'Size', 'Rotation', 'Mirror', 'Scatter', 'Sharpness', 'Softness', 'Darken', 'Mix', 'h', 's', 'v']);
export const CURVE_MODES = ['multiply', 'addition', 'maximum', 'minimum', 'difference'];

/** All keys of one curve option, see the header. `checkable` is false only for Opacity and Flow. */
function curveOption(group: string, id: string, o: { checkable?: boolean; prefix?: string; min?: number; max?: number; unranged?: boolean } = {}): Table {
    const prefix = o.prefix ?? '', checkable = o.checkable ?? true, k = (s: string) => prefix + s;
    SENSOR_GROUPS[group] = { id, prefix, checkable };
    return grp(group, [
        ...(checkable ? [b(k(`Pressure${id}`), group)] : id === 'Opacity' && !prefix ? hide('PressureOpacity') : []),
        b(k(`${id}UseCurve`), 'Enable pen settings'),
        num(k(`${id}Value`), 'Strength', o.unranged ? undefined : o.min ?? 0, o.unranged ? undefined : o.max ?? 1, 0.01),
        b(k(`${id}UseSameCurve`), 'Share curve across all settings'),
        pick(k(`${id}curveMode`), 'Curves calculation mode', CURVE_MODES.map((m, i) => [String(i), m] as [string, string])),
        ...ro(r(k(`${id}Sensor`), 'Sensors and curve')),
        // Old presets (seen in the dump for these ids only): "Custom<Id>" / "Curve<Id>" are read only when the sensor XML holds no curve.
        ...(!prefix && LEGACY_CURVE_IDS.has(id) ? hide(k(`Custom${id}`), k(`Curve${id}`)) : []),
    ]);
}
/** Keys a preset of this engine carries although Krita's dialog for the engine has no option for them. */
const unused = (...keys: string[]): Table => hide(...keys);
const toggle = (group: string, key: string): void => { GROUP_ENABLE[group] = key; };
const on = (group: string, key: string, rows: Table): Table => (toggle(group, key), rows);

/** KoCompositeOpRegistry.cpp: id and name of every blending mode ("normal" is the registry's default). */
const OPS: [string, string][] = [
    ['normal', 'Normal'], ['add', 'Addition'], ['subtract', 'Subtract'], ['multiply', 'Multiply'], ['divide', 'Divide'],
    ['inverse_subtract', 'Inverse Subtract'], ['xor', 'XOR'], ['or', 'OR'], ['and', 'AND'], ['nand', 'NAND'], ['nor', 'NOR'], ['xnor', 'XNOR'],
    ['implication', 'IMPLICATION'], ['not_implication', 'NOT IMPLICATION'], ['converse', 'CONVERSE'], ['not_converse', 'NOT CONVERSE'], ['burn', 'Burn'],
    ['linear_burn', 'Linear Burn'], ['darken', 'Darken'], ['gamma_dark', 'Gamma Dark'], ['darker color', 'Darker Color'],
    ['shade_ifs_illusions', 'Shade (IFS Illusions)'], ['fog_darken_ifs_illusions', 'Fog Darken (IFS Illusions)'], ['easy burn', 'Easy Burn'],
    ['dodge', 'Color Dodge'], ['dodge_hdr', 'Color Dodge HDR'], ['linear_dodge', 'Linear Dodge'], ['lighten', 'Lighten'],
    ['linear light', 'Linear Light'], ['screen', 'Screen'], ['pin_light', 'Pin Light'], ['vivid_light', 'Vivid Light'],
    ['vivid_light_hdr', 'Vivid Light HDR'], ['flat_light', 'Flat Light'], ['hard_light', 'Hard Light'],
    ['soft_light_ifs_illusions', 'Soft Light (IFS Illusions)'], ['soft_light_pegtop_delphi', 'Soft Light (Pegtop-Delphi)'],
    ['soft_light', 'Soft Light (Photoshop)'], ['soft_light_svg', 'Soft Light (SVG)'], ['gamma_light', 'Gamma Light'],
    ['gamma_illumination', 'Gamma Illumination'], ['lighter color', 'Lighter Color'], ['pnorm_a', 'P-Norm A'], ['pnorm_b', 'P-Norm B'],
    ['super_light', 'Super Light'], ['tint_ifs_illusions', 'Tint (IFS Illusions)'], ['fog_lighten_ifs_illusions', 'Fog Lighten (IFS Illusions)'],
    ['easy dodge', 'Easy Dodge'], ['luminosity_sai', 'Luminosity/Shine (SAI)'], ['modulo', 'Modulo'], ['modulo_continuous', 'Modulo - Continuous'],
    ['divisive_modulo', 'Divisive Modulo'], ['divisive_modulo_continuous', 'Divisive Modulo - Continuous'], ['modulo_shift', 'Modulo Shift'],
    ['modulo_shift_continuous', 'Modulo Shift - Continuous'], ['diff', 'Difference'], ['equivalence', 'Equivalence'],
    ['additive_subtractive', 'Additive Subtractive'], ['exclusion', 'Exclusion'], ['arc_tangent', 'Arcus Tangent'], ['negation', 'Negation'],
    ['behind', 'Behind'], ['greater', 'Greater'], ['overlay', 'Overlay'], ['lambert_lighting', 'Lambert Lighting (Linear)'],
    ['lambert_lighting_gamma2.2', 'Lambert Lighting (Gamma 2.2)'], ['erase', 'Erase'], ['alphadarken', 'Alpha Darken'], ['marker', 'Marker'],
    ['hard mix', 'Hard Mix'], ['hard_mix_hdr', 'Hard Mix HDR'], ['hard_mix_photoshop', 'Hard Mix (Photoshop)'],
    ['hard_mix_softer_photoshop', 'Hard Mix Softer (Photoshop)'], ['grain_merge', 'Grain Merge'], ['grain_extract', 'Grain Extract'],
    ['parallel', 'Parallel'], ['allanon', 'Allanon'], ['geometric_mean', 'Geometric Mean'], ['destination-atop', 'Destination Atop'],
    ['destination-in', 'Destination In'], ['hard overlay', 'Hard Overlay'], ['hard_overlay_hdr', 'Hard Overlay HDR'], ['interpolation', 'Interpolation'],
    ['interpolation 2x', 'Interpolation - 2X'], ['penumbra a', 'Penumbra A'], ['penumbra b', 'Penumbra B'], ['penumbra c', 'Penumbra C'],
    ['penumbra d', 'Penumbra D'], ['bumpmap', 'Bumpmap'], ['combine_normal', 'Combine Normal Map'], ['dissolve', 'Dissolve'], ['copy_red', 'Copy Red'],
    ['copy_green', 'Copy Green'], ['copy_blue', 'Copy Blue'], ['copy', 'Copy'], ['tangent_normalmap', 'Tangent Normalmap'], ['color', 'Color'],
    ['hue', 'Hue'], ['tint', 'Tint'], ['saturation', 'Saturation'], ['luminize', 'Luminosity'], ['dec_saturation', 'Decrease Saturation'],
    ['inc_saturation', 'Increase Saturation'], ['dec_luminosity', 'Decrease Luminosity'], ['inc_luminosity', 'Increase Luminosity'],
    ['color_hsi', 'Color HSI'], ['hue_hsi', 'Hue HSI'], ['saturation_hsi', 'Saturation HSI'], ['intensity', 'Intensity'],
    ['dec_saturation_hsi', 'Decrease Saturation HSI'], ['inc_saturation_hsi', 'Increase Saturation HSI'], ['dec_intensity', 'Decrease Intensity'],
    ['inc_intensity', 'Increase Intensity'], ['color_hsl', 'Color HSL'], ['hue_hsl', 'Hue HSL'], ['saturation_hsl', 'Saturation HSL'],
    ['lightness', 'Lightness'], ['dec_saturation_hsl', 'Decrease Saturation HSL'], ['inc_saturation_hsl', 'Increase Saturation HSL'],
    ['dec_lightness', 'Decrease Lightness'], ['inc_lightness', 'Increase Lightness'], ['color_hsv', 'Color HSV'], ['hue_hsv', 'Hue HSV'],
    ['saturation_hsv', 'Saturation HSV'], ['value', 'Value'], ['dec_saturation_hsv', 'Decrease Saturation HSV'],
    ['inc_saturation_hsv', 'Increase Saturation HSV'], ['dec_value', 'Decrease Value'], ['inc_value', 'Increase Value'], ['reflect', 'Reflect'],
    ['glow', 'Glow'], ['freeze', 'Freeze'], ['heat', 'Heat'], ['glow_heat', 'Glow-Heat'], ['heat_glow', 'Heat-Glow'],
    ['reflect_freeze', 'Reflect-Freeze'], ['freeze_reflect', 'Freeze-Reflect'], ['heat_glow_freeze_reflect_hybrid', 'Heat-Glow & Freeze-Reflect Hybrid'],
];
/** KisMaskingBrushCompositeOpFactory::supportedCompositeOpIds(), in Krita's order. */
const MASK_OPS: [string, string][] = ['multiply', 'darken', 'overlay', 'dodge', 'burn', 'linear_burn', 'linear_dodge', 'hard_mix_photoshop', 'hard_mix_softer_photoshop', 'subtract']
    .map(id => [id, OPS.find(o => o[0] === id)![1]]);
/** KisTextureOptionData::TexturingMode (stored value) with the names of kis_texture_chooser.cpp. */
const TEXTURING: [string, string][] = [['0', 'Multiply'], ['1', 'Subtract'], ['2', 'Lightness Map'], ['3', 'Gradient Map'], ['4', 'Darken'], ['5', 'Overlay'],
    ['6', 'Color Dodge'], ['7', 'Color Burn'], ['8', 'Linear Dodge'], ['9', 'Linear Burn'], ['10', 'Hard Mix (Photoshop)'], ['11', 'Hard Mix Softer (Photoshop)'],
    ['12', 'Height'], ['13', 'Linear Height'], ['14', 'Height (Photoshop)'], ['15', 'Linear Height (Photoshop)']];
const COLOR_SOURCES: [string, string][] = [['plain', 'Plain color'], ['gradient', 'Gradient'], ['uniform_random', 'Uniform random'],
    ['total_random', 'Total random'], ['pattern', 'Pattern'], ['lockedpattern', 'Locked pattern']];
const MASK = 'MaskingBrush/Preset/';
const SWIZZLE = ['+ X', '- X', '+ Y', '- Y', '+ Z', '- Z']; // kis_tangent: combo order = stored 0..5, defaults red 0, green 2, blue 4

// ---------------------------------------------------------------- shared option groups (libpaintop)
/** The tip itself is brush_definition (XML, edited by tip.ts); the precision keys exist only on engines with SupportsPrecision. */
const tip = (precision: boolean): Table => {
    TIP_GROUPS['Brush Tip'] = 'brush_definition';
    return [
        ...grp('Brush Tip', [r('brush_definition', 'Brush tip')]),
        ...(precision
            ? grp('Brush Tip', [int('KisPrecisionOption/precisionLevel', 'Precision', 1, 5), b('KisPrecisionOption/AutoPrecisionEnabled', 'Auto precision')])
            : hide('KisPrecisionOption/precisionLevel', 'KisPrecisionOption/AutoPrecisionEnabled')),
        // Never read by Krita 5 (grep of krita/): old precision keys and the legacy auto-precision tuning.
        ...hide('KisPresisionOption/precisionLevel', 'KisPrecisionOption/SizeToStartFrom', 'KisPrecisionOption/DeltaValue'),
        ...hide('requiredBrushFile', 'requiredBrushFilesList'), // resource dependency list, written by Krita on save
    ];
};
const blending = (): Table => grp('Blending Mode', [pick('CompositeOp', 'Blending Mode', OPS), b('EraserMode', 'Eraser mode')]);
const opacity = (): Table => curveOption('Opacity', 'Opacity', { checkable: false });
const flow = (): Table => curveOption('Flow', 'Flow', { checkable: false });
const size = (): Table => curveOption('Size', 'Size');
const ratio = (): Table => curveOption('Ratio', 'Ratio');
const spacing = (): Table => [
    ...curveOption('Spacing', 'Spacing'),
    ...grp('Spacing', [b('Spacing/Isotropic', 'Isotropic Spacing'), b('PaintOpSettings/updateSpacingBetweenDabs', 'Update Between Dabs')]),
];
const mirror = (): Table => [
    ...curveOption('Mirror', 'Mirror'),
    ...grp('Mirror', [b('HorizontalMirrorEnabled', 'Horizontally'), b('VerticalMirrorEnabled', 'Vertically')]),
];
const softness = (): Table => curveOption('Softness', 'Softness', { min: 0.1 });
const rotation = (): Table => curveOption('Rotation', 'Rotation');
const sharpness = (): Table => [
    ...curveOption('Sharpness', 'Sharpness'),
    // Krita 5 reads Sharpness/softness and Sharpness/alignoutline; presets only carry the pre-5 threshold, which nothing reads.
    ...hide('Sharpness/threshold', 'Sharpness/factor'),
];
const scatter = (): Table => [
    ...curveOption('Scatter', 'Scatter', { max: 5 }),
    ...grp('Scatter', [b('Scattering/AxisX', 'Axis X'), b('Scattering/AxisY', 'Axis Y')]),
    ...hide('Scattering/Amount'), // legacy: only read when ScatterValue is absent
];
const source = (): Table => grp('Source', [pick('ColorSource/Type', 'Color source', COLOR_SOURCES)]);
const darken = (): Table => curveOption('Darken', 'Darken');
const mix = (): Table => curveOption('Mix', 'Mix');
const hue = (): Table => curveOption('Hue', 'h');
const saturation = (): Table => curveOption('Saturation', 's');
const value = (): Table => curveOption('Value', 'v');
const airbrush = (): Table => {
    toggle('Airbrush', 'PaintOpSettings/isAirbrushing');
    return [
        ...grp('Airbrush', [b('PaintOpSettings/isAirbrushing', 'Airbrush'), num('PaintOpSettings/rate', 'Rate', 1, 1000, 0.01), b('PaintOpSettings/ignoreSpacing', 'Override Spacing')]),
        ...hide('AirbrushOption/isAirbrushing', 'AirbrushOption/rate'), // old names, no longer read
    ];
};
const rate = (): Table => curveOption('Rate', 'Rate');
const paintingMode = (): Table => grp('Painting Mode', [pick('PaintOpAction', 'Painting mode', [['1', 'Build up'], ['2', 'Wash']])]);
const pattern = (maps: boolean): Table => {
    toggle('Pattern', 'Texture/Pattern/Enabled');
    const P = 'Texture/Pattern/';
    return [
        ...grp('Pattern', [
            b(P + 'Enabled', 'Pattern'),
            ...ro(r(P + 'Name', 'Pattern name')),
            num(P + 'Scale', 'Scale', 0),
            num(P + 'Brightness', 'Brightness', -1, 1, 0.01),
            num(P + 'Contrast', 'Contrast', 0, 2, 0.01),
            int(P + 'OffsetX', 'Horizontal Offset'), b(P + 'isRandomOffsetX', 'Random Offset (horizontal)'),
            int(P + 'OffsetY', 'Vertical Offset'), b(P + 'isRandomOffsetY', 'Random Offset (vertical)'),
            pick(P + 'TexturingMode', 'Texturing Mode', maps ? TEXTURING : TEXTURING.filter(t => t[0] !== '2' && t[0] !== '3')),
            pick(P + 'CutoffPolicy', 'Cutoff Policy', [['0', 'Cut Off Disabled'], ['1', 'Cut Off Brush'], ['2', 'Cut Off Pattern']]),
            int(P + 'CutoffLeft', 'Cutoff (low)', 0, 255), int(P + 'CutoffRight', 'Cutoff (high)', 0, 255),
            b(P + 'Invert', 'Invert Pattern'),
        ]),
        // Set by the pattern chooser (the data is not loaded back: KisTextureOptionData::read) or not read at all.
        ...hide(P + 'PatternFileName', P + 'MaximumOffsetX', P + 'MaximumOffsetY', P + 'Strength'),
    ];
};
const strength = (): Table => [...curveOption('Strength', 'Texture/Strength/'), ...hide('Texture/Strength/StrengthVersion')];
const instantPreview = (): Table => grp('Instant Preview', [b('lodUserAllowed', 'Instant Preview')]);
/** Keys every preset carries that are not options. */
const internal = (): Table => hide('paintop', 'OpacityVersion', 'runtimeCanvasMirroredX', 'runtimeCanvasMirroredY', 'runtimeCanvasRotation',
    'Krita/opacity', 'Krita/compositeop', 'Krita/erase', 'Krita/mirrorhorizontal', 'Krita/mirrorvertical');

/** The masked brush of the paintbrush engine: its own tip plus a prefixed copy of the curve options. */
const masked = (): Table => {
    toggle('Masked: Brush Tip', 'MaskingBrush/Enabled');
    TIP_GROUPS['Masked: Brush Tip'] = MASK + 'brush_definition';
    return [
        ...grp('Masked: Brush Tip', [
            b('MaskingBrush/Enabled', 'Masked brush'),
            pick('MaskingBrush/MaskingCompositeOp', 'Blending Mode', MASK_OPS),
            r(MASK + 'brush_definition', 'Brush tip'),
            b('MaskingBrush/UseMasterSize', 'Use master brush size'),
            num('MaskingBrush/MasterSizeCoeff', 'Size relative to master brush size', 0),
        ]),
        ...hide(MASK + 'requiredBrushFile', MASK + 'requiredBrushFilesList'),
        ...curveOption('Masked: Opacity', 'Opacity', { prefix: MASK, checkable: false }),
        ...curveOption('Masked: Flow', 'Flow', { prefix: MASK, checkable: false }),
        ...curveOption('Masked: Size', 'Size', { prefix: MASK }),
        ...curveOption('Masked: Ratio', 'Ratio', { prefix: MASK }),
        ...curveOption('Masked: Rotation', 'Rotation', { prefix: MASK }),
        ...curveOption('Masked: Mirror', 'Mirror', { prefix: MASK }),
        ...grp('Masked: Mirror', [b(MASK + 'HorizontalMirrorEnabled', 'Horizontally'), b(MASK + 'VerticalMirrorEnabled', 'Vertically')]),
        ...curveOption('Masked: Scatter', 'Scatter', { prefix: MASK, max: 5 }),
        ...grp('Masked: Scatter', [b(MASK + 'Scattering/AxisX', 'Axis X'), b(MASK + 'Scattering/AxisY', 'Axis Y')]),
    ];
};
const colorOptions = (): Table => {
    const C = 'ColorOption/';
    return grp('Color options', [
        b(C + 'useRandomHSV', 'Random HSV'),
        int(C + 'hue', 'Hue', -180, 180), int(C + 'saturation', 'Saturation', -100, 100), int(C + 'value', 'Value', -100, 100),
        b(C + 'useRandomOpacity', 'Random opacity'), b(C + 'sampleInputColor', 'Sample Input layer'),
        b(C + 'colorPerParticle', 'Color per particle'), b(C + 'fillBackground', 'Fill background'), b(C + 'mixBgColor', 'Mix with background color'),
    ]);
};

// ---------------------------------------------------------------- engines
export const BRUSHES: Record<string, Table> = {
    paintbrush: [
        ...tip(true), ...blending(), ...opacity(), ...flow(), ...size(), ...ratio(), ...spacing(), ...mirror(), ...softness(), ...rotation(),
        ...sharpness(), ...scatter(), ...source(), ...darken(), ...mix(), ...hue(), ...saturation(), ...value(), ...airbrush(), ...rate(),
        ...paintingMode(), ...pattern(true), ...strength(), ...masked(), ...instantPreview(), ...internal(),
        // Smudge-engine keys that some paintbrush presets still carry; the paintbrush dialog has no such options.
        ...hide('ColorRateSensor', 'ColorRateUseCurve', 'ColorRateValue', 'GradientSensor', 'GradientUseCurve', 'GradientValue', 'MergedPaint',
            'PressureColorRate', 'PressureGradient', 'PressureSmudgeRate', 'SmudgeRateSensor', 'SmudgeRateUseCurve', 'SmudgeRateValue'),
    ],
    colorsmudge: [
        ...tip(true), ...blending(), ...opacity(), ...size(), ...ratio(), ...spacing(), ...mirror(),
        ...curveOption('Smudge Length', 'SmudgeRate'),
        ...grp('Smudge Length', [pick('SmudgeRateMode', 'Smudge mode', [['0', 'Smearing'], ['1', 'Dulling']])]),
        // SmudgeRadiusValue is divided by 100 when SmudgeRadiusVersion is below 2 and capped at 3 (1 with the new
        // smudge algorithm): no single range is right for every preset, so it is left unranged.
        ...curveOption('Smudge Radius', 'SmudgeRadius', { unranged: true }),
        ...curveOption('Color Rate', 'ColorRate'),
        ...rotation(), ...scatter(),
        ...grp('Overlay Mode', [b('MergedPaint', 'Overlay Mode')]),
        ...curveOption('Gradient', 'Gradient'),
        ...hue(), ...saturation(), ...value(), ...airbrush(), ...rate(), ...pattern(false), ...strength(), ...instantPreview(), ...internal(),
        ...unused('FlowValue'),
    ],
    hairybrush: [
        ...tip(false),
        ...grp('Bristle options', [
            b('HairyBristle/useMousePressure', 'Mouse pressure'), b('HairyBristle/threshold', 'Threshold'),
            num('HairyBristle/scale', 'Scale', -10, 10, 0.01), num('HairyBristle/random', 'Random offset', -10, 10, 0.01),
            num('HairyBristle/shear', 'Shear', -2, 2, 0.01), num('HairyBristle/density', 'Density', 0, 100, 1),
            b('HairyBristle/isConnected', 'Connect hairs'), b('HairyBristle/antialias', 'Anti-aliasing'), b('HairyBristle/useCompositing', 'Composite bristles'),
        ]),
        ...on('Ink depletion', 'HairyInk/enabled', grp('Ink depletion', [
            b('HairyInk/enabled', 'Ink depletion'), int('HairyInk/inkAmount', 'Ink Amount', 0, 10000),
            b('HairyInk/useOpacity', 'Opacity'), b('HairyInk/useSaturation', 'Saturation'), b('HairyInk/soak', 'Soak ink from the initial position of the stroke'),
            b('HairyInk/useWeights', 'Weighted saturation'),
            int('HairyInk/pressureWeights', 'Pressure Weight', 0, 100), int('HairyInk/bristleLengthWeights', 'Bristle Length Weight', 0, 100),
            int('HairyInk/bristleInkAmountWeight', 'Bristle Ink Weight', 0, 100), int('HairyInk/inkDepletionWeight', 'Ink Depletion Curve Weight', 0, 100),
            r('HairyInk/inkDepletionCurve', 'Ink Depletion Curve', { kind: 'curve' }),
        ])),
        ...blending(), ...opacity(), ...size(), ...rotation(), ...paintingMode(), ...instantPreview(), ...internal(),
    ],
    sketchbrush: [
        ...tip(true),
        ...grp('Brush size', [
            int('Sketch/lineWidth', 'Line width', 1, 100),
            num('Sketch/offset', 'Offset scale (percent)', 0, 200, 1),
            num('Sketch/probability', 'Density (stored 0..1, Krita shows percent)', 0, 1, 0.01),
            b('Sketch/distanceDensity', 'Use distance density'), b('Sketch/simpleMode', 'Simple mode'), b('Sketch/magnetify', 'Magnetify'),
            b('Sketch/makeConnection', 'Paint connection line'), b('Sketch/randomOpacity', 'Random opacity'), b('Sketch/randomRGB', 'Random RGB'),
            b('Sketch/distanceOpacity', 'Distance opacity'),
        ]),
        ...blending(), ...opacity(), ...size(), ...rotation(),
        ...curveOption('Line width', 'Line width'), ...curveOption('Offset scale', 'Offset scale'), ...curveOption('Density', 'Density'),
        ...airbrush(), ...rate(), ...paintingMode(), ...instantPreview(), ...internal(),
    ],
    spraybrush: [
        ...grp('Spray Area', [
            int('Spray/diameter', 'Diameter', 1, 1000), num('Spray/aspect', 'Aspect ratio', 0, 2, 0.01), num('Spray/rotation', 'Angle'),
            num('Spray/scale', 'Scale', 0, 10, 0.01), num('Spray/spacing', 'Spacing', 0, 5, 0.01),
            b('Spray/jitterMovement', 'Jitter Movement'), num('Spray/jitterMoveAmount', 'Jitter Movement amount', 0, 5, 0.1),
            b('Spray/useDensity', 'Density (instead of Count)'), int('Spray/particleCount', 'Particle count', 1, 1000),
            // The dialog edits coverage as 0.001..0.02 "%"; Spray/coverage is stored 100 times that (KisSprayOpOptionData::read divides by 100).
            num('Spray/coverage', 'Density coverage (percent)', 0.1, 2, 0.01),
            b('Spray/gaussianDistribution', 'Gaussian distribution (legacy; used when no radial distribution is stored)'),
        ]),
        ...on('Spray Shape', 'SprayShape/enabled', grp('Spray Shape', [
            b('SprayShape/enabled', 'Spray Shape'),
            pick('SprayShape/shape', 'Shape', ['Ellipse', 'Rectangle', 'Anti-aliased pixel', 'Pixel', 'Image']),
            int('SprayShape/width', 'Width', 1, 1000), int('SprayShape/height', 'Height', 1, 1000), b('SprayShape/proportional', 'Proportional'),
            ...ro(r('SprayShape/imageUrl', 'Texture')),
        ])),
        ...tip(false), ...opacity(), ...size(), ...blending(),
        ...on('Shape dynamics', 'ShapeDynamics/enabled', grp('Shape dynamics', [
            b('ShapeDynamics/enabled', 'Shape dynamics'), b('ShapeDynamics/randomSize', 'Random size'),
            b('ShapeDynamics/fixedRotation', 'Fixed rotation'), int('ShapeDynamics/fixedAngle', 'Fixed rotation angle'),
            b('ShapeDynamics/randomRotation', 'Randomize rotation'), num('ShapeDynamics/randomRotationWeight', 'Randomize rotation weight', 0, 1, 0.01),
            b('ShapeDynamics/followCursor', 'Follow cursor'), num('ShapeDynamics/followCursorWeigth', 'Follow cursor weight', 0, 1, 0.01),
            b('ShapeDynamics/followDrawingAngle', 'Follow drawing angle'), num('ShapeDynamics/followDrawingAngleWeigth', 'Angle weight', 0, 1, 0.01),
        ])),
        ...colorOptions(), ...rotation(), ...airbrush(), ...rate(), ...paintingMode(), ...instantPreview(),
        // Dialog keys of presets saved with ShapeDynamicsVersion 2.2 (read only then), and an unused one.
        ...hide('ShapeDynamicsVersion', 'SprayShape/useAspect', 'SprayShape/randomSize', 'SprayShape/fixedRotation', 'SprayShape/fixedAngle',
            'SprayShape/randomRotation', 'SprayShape/randomRotationWeight', 'SprayShape/followCursor', 'SprayShape/followCursorWeigth'),
        ...internal(),
    ],
    deformbrush: [
        ...grp('Brush size', [
            int('Brush/diameter', 'Diameter', 1, 1000), num('Brush/scale', 'Scale', 0.01, 10, 0.01), num('Brush/aspect', 'Aspect ratio', 0.01, 2, 0.01),
            num('Brush/spacing', 'Spacing', 0.01, 5, 0.01), num('Brush/rotation', 'Angle'),
            num('Brush/density', 'Density (stored 0..1, Krita shows percent)'), b('Brush/jitterMovementEnabled', 'Jitter Movement'),
            num('Brush/jitterMovement', 'Jitter Movement amount', 0, 5, 0.01),
        ]),
        ...grp('Deform Options', [
            pick('Deform/deformAction', 'Deform Mode', [['1', 'Grow'], ['2', 'Shrink'], ['3', 'Swirl CW'], ['4', 'Swirl CCW'], ['5', 'Move'], ['6', 'Lens zoom in'], ['7', 'Lens zoom out'], ['8', 'Color deformation']]),
            num('Deform/deformAmount', 'Deform amount', 0, 1, 0.01), b('Deform/bilinear', 'Bilinear interpolation'),
            b('Deform/useCounter', 'Use counter'), b('Deform/useOldData', 'Use undeformed image'),
        ]),
        ...hide('Deform/useMovementPaint'),
        ...blending(), ...opacity(), ...size(), ...rotation(), ...airbrush(), ...rate(), ...instantPreview(), ...internal(),
        ...unused('FlowValue'),
    ],
    curvebrush: [
        ...grp('Curve', [
            int('Curve/lineWidth', 'Line width', 1, 100), int('Curve/strokeHistorySize', 'History size', 2, 300),
            num('Curve/curvesOpacity', 'Curves opacity', 0, 1, 0.01), b('Curve/makeConnection', 'Paint connection line'), b('Curve/smoothing', 'Smoothing'),
        ]),
        ...opacity(), ...curveOption('Line width', 'Line width'), ...curveOption('Curves opacity', 'Curves opacity'),
        ...blending(), ...paintingMode(), ...instantPreview(), ...internal(),
    ],
    gridbrush: [
        ...grp('Brush size', [
            int('Grid/gridWidth', 'Grid width', 1, 999), int('Grid/gridHeight', 'Grid height', 1, 999),
            int('Grid/divisionLevel', 'Division level', 0, 25), b('Grid/pressureDivision', 'Division by pressure'),
            num('Grid/scale', 'Scale', 0.1, 10, 0.01), num('Grid/verticalBorder', 'Vertical border', 0, 100, 0.01),
            num('Grid/horizontalBorder', 'Horizontal border', 0, 100, 0.01), b('Grid/randomBorder', 'Jitter borders'),
        ]),
        ...grp('Particle type', [pick('GridShape/shape', 'Shape', ['Ellipse', 'Rectangle', 'Line', 'Pixel', 'Anti-aliased pixel'])]),
        ...blending(), ...colorOptions(), ...paintingMode(), ...instantPreview(), ...internal(),
    ],
    particlebrush: [
        ...grp('Brush size', [
            int('Particle/count', 'Particles', 1, 500), int('Particle/iterations', 'Iterations', 1, 200),
            num('Particle/gravity', 'Gravity', -1, 1, 0.001), num('Particle/weight', 'Opacity weight', 0.01, 1, 0.01),
            num('Particle/scaleX', 'dx scale', -10, 10, 0.01), num('Particle/scaleY', 'dy scale', -10, 10, 0.01),
        ]),
        ...blending(), ...airbrush(), ...rate(), ...paintingMode(), ...instantPreview(), ...internal(),
    ],
    experimentbrush: [
        ...grp('Experiment Option', [
            b('Experiment/speedEnabled', 'Speed'), num('Experiment/speed', 'Speed (percent)', 0, 100, 1),
            b('Experiment/smoothing', 'Smooth'), num('Experiment/smoothingValue', 'Smooth threshold (px)', 0, 100, 1),
            b('Experiment/displacementEnabled', 'Displace'), num('Experiment/displacement', 'Displace (percent)', 0, 100, 1),
            b('Experiment/windingFill', 'Winding fill'), b('Experiment/hardEdge', 'Hard edge'),
        ]),
        ...blending(), ...instantPreview(), ...internal(),
        // The experiment dialog has no colour, opacity, size or rotation options; presets still carry their keys.
        ...unused('PaintOpAction', 'ColorOption/colorPerParticle', 'ColorOption/fillBackground', 'ColorOption/hue', 'ColorOption/mixBgColor', 'ColorOption/sampleInputColor',
            'ColorOption/saturation', 'ColorOption/useRandomHSV', 'ColorOption/useRandomOpacity', 'ColorOption/value', 'PressureOpacity', 'PressureRotation', 'PressureSize',
            'OpacitySensor', 'OpacityUseCurve', 'OpacityValue', 'RotationSensor', 'RotationUseCurve', 'RotationValue', 'SizeSensor', 'SizeUseCurve', 'SizeValue',
            'CurveOpacity', 'CurveRotation', 'CurveSize', 'CustomOpacity', 'CustomRotation', 'CustomSize'),
    ],
    hatchingbrush: [
        ...grp('Hatching options', [
            num('Hatching/angle', 'Angle', -90, 90, 1), num('Hatching/separation', 'Separation', 1, 30, 0.1), num('Hatching/thickness', 'Thickness', 1, 30, 0.1),
            num('Hatching/origin_x', 'Origin X', -300, 300, 1), num('Hatching/origin_y', 'Origin Y', -300, 300, 1),
            // Krita shows these five as one radio group and reads the first one that is true, in this order.
            b('Hatching/bool_nocrosshatching', 'Crosshatching: none'), b('Hatching/bool_perpendicular', 'Crosshatching: perpendicular plane only'),
            b('Hatching/bool_minusthenplus', 'Crosshatching: -45° plane then +45° plane'), b('Hatching/bool_plusthenminus', 'Crosshatching: +45° plane then -45° plane'),
            b('Hatching/bool_moirepattern', 'Crosshatching: Moiré pattern'),
            int('Hatching/separationintervals', 'Input-based intervals'),
        ]),
        ...grp('Hatching preferences', [b('Hatching/bool_antialias', 'Antialiased lines'), b('Hatching/bool_subpixelprecision', 'Subpixel precision'), b('Hatching/bool_opaquebackground', 'Color background')]),
        ...blending(),
        ...curveOption('Separation', 'Separation'), ...curveOption('Thickness', 'Thickness'), ...curveOption('Angle', 'Angle'), ...curveOption('Crosshatching', 'Crosshatching'),
        ...opacity(), ...size(), ...mirror(), ...paintingMode(), ...pattern(false), ...strength(), ...instantPreview(), ...internal(),
        // The hatching dialog has no brush tip.
        ...unused('brush_definition', 'requiredBrushFile', 'requiredBrushFilesList', 'KisPrecisionOption/AutoPrecisionEnabled', 'KisPrecisionOption/DeltaValue', 'KisPrecisionOption/SizeToStartFrom', 'KisPrecisionOption/precisionLevel'),
    ],
    roundmarker: [
        ...grp('Brush', [num('diameter', 'Diameter', 0.01), num('spacing', 'Spacing', 0.02, 10, 0.01), b('useAutoSpacing', 'Auto spacing'), num('autoSpacingCoeff', 'Auto spacing coefficient')]),
        ...blending(), ...size(), ...spacing(), ...instantPreview(), ...internal(),
        ...unused('FlowValue', 'OpacityValue'),
    ],
    tangentnormal: [
        ...blending(), ...opacity(), ...flow(), ...size(),
        ...grp('Tangent Tilt', [
            pick('Tangent/swizzleRed', 'Red', SWIZZLE), pick('Tangent/swizzleGreen', 'Green', SWIZZLE), pick('Tangent/swizzleBlue', 'Blue', SWIZZLE),
            pick('Tangent/directionType', 'Tilt Options', [['0', 'Tilt'], ['1', 'Direction'], ['2', 'Rotation'], ['3', 'Direction/Tilt Mix']]),
            num('Tangent/elevationSensitivity', 'Elevation Sensitivity (percent)', 0, 100, 1), num('Tangent/mixValue', 'Direction/Tilt Mix Value (percent)', 0, 100, 1),
        ]),
        ...tip(false), ...spacing(), ...mirror(), ...softness(), ...sharpness(), ...scatter(), ...rotation(), ...airbrush(), ...rate(), ...paintingMode(),
        ...pattern(false), ...strength(), ...instantPreview(), ...internal(),
    ],
    duplicate: [
        ...tip(false), ...blending(), ...opacity(), ...size(), ...rotation(), ...mirror(),
        ...grp('Painting Mode', [
            b('Duplicateop/Healing', 'Healing'), b('Duplicateop/CorrectPerspective', 'Correct the perspective'),
            b('Duplicateop/MoveSourcePoint', 'Source point move'),
            b('Duplicateop/CloneFromProjection', 'Clone From All Visible Layers'),
        ]),
        ...pattern(false), ...strength(), ...instantPreview(), ...internal(),
    ],
    filter: [
        ...tip(true), ...blending(), ...opacity(), ...size(), ...rotation(), ...mirror(),
        ...grp('Filter', [...ro(r('Filter/id', 'Filter')), b('Filter/smudgeMode', 'Smudge Mode'), ...ro(r('Filter/configuration', 'Filter Settings'))]),
        ...instantPreview(), ...internal(),
        ...unused('FlowValue'),
    ],
};
