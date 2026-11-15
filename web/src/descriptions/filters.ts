// One table per filter id, in Krita's dialog order. Wording, ranges and choices come from the .ui files and
// config-widget .cpp files under krita/plugins/filters/<name>/ . A range is only given where Krita sets one
// explicitly (a KisSliderSpinBox with no setRange() is left unranged). Stored units are kept as they are.
import { grp, hide, r, type Table } from './types';

const ASPECT = 'Keep aspect ratio';
const THRESHOLD_MODE = ['Pattern', 'Noise'];
const PATTERN_VALUE_MODE = ['Auto', 'Lightness', 'Alpha'];
/** KisDitherWidget (libs/ui/widgets), shared by Gradient Map and Palettize; `p` is the key prefix. */
const dither = (p: string, group: string): Table => grp(group, [
    r(p + 'thresholdMode', 'Threshold Mode', { choices: THRESHOLD_MODE }),
    r(p + 'pattern', 'Pattern'),
    r(p + 'patternValueMode', 'Value Mode', { choices: PATTERN_VALUE_MODE }),
    r(p + 'spread', 'Spread', { min: 0, max: 1, step: 0.001 }),
    r(p + 'noiseSeed', 'Seed'),
]);
const SWIZZLE = ['X+', 'X-', 'Y+', 'Y-', 'Z+', 'Z-'];
const PREWITT: [string, string][] = [['prewitt', 'Prewitt'], ['sobol', 'Sobel'], ['simple', 'Simple']];
const light = (n: number): Table => grp(`Light Source ${n + 1}`, [
    r(`illuminantIsEnabled${n}`, 'Enabled'), r(`illuminantColor${n}`, 'Color'),
    r(`Azimuth${n}`, 'Azimuth', { kind: 'angle' }), r(`Inclination${n}`, 'Inclination', { kind: 'angle' }),
]);
const balance = (when: 'shadows' | 'midtones' | 'highlights', group: string): Table => grp(group, [
    // The engine reports yellow_green_* / magenta_blue_* (Krita's defaultConfiguration) although the filter and
    // the dialog use magenta_green_* / yellow_blue_*; only cyan_red_* is a key the filter really reads.
    r(`cyan_red_${when}`, 'Cyan - Red', { min: -100, max: 100 }),
]);

export const FILTERS: Record<string, Table> = {
    // --- blur
    'gaussian blur': [
        r('horizRadius', 'Horizontal Radius', { min: 0, max: 1000, step: 0.2 }),
        r('vertRadius', 'Vertical Radius', { min: 0, max: 1000, step: 0.2 }),
        r('lockAspect', ASPECT),
    ],
    blur: [
        r('halfWidth', 'Horizontal Radius'), r('halfHeight', 'Vertical Radius'), r('lockAspect', ASPECT),
        r('strength', 'Strength'),
        r('shape', 'Shape', { choices: ['Circle', 'Rectangle'] }),
        r('rotate', 'Angle', { kind: 'angle' }),
    ],
    'motion blur': [r('blurAngle', 'Angle', { kind: 'angle' }), r('blurLength', 'Length')],
    'lens blur': [
        ...grp('Iris', [
            r('irisShape', 'Shape', { choices: ['Triangle', 'Quadrilateral (4)', 'Pentagon (5)', 'Hexagon (6)', 'Heptagon (7)', 'Octagon (8)'].map(s => [s, s] as [string, string]) }),
            r('irisRadius', 'Radius'),
            r('irisRotation', 'Rotation', { kind: 'angle' }),
        ]),
        ...hide('halfWidth', 'halfHeight'), // derived from the iris radius in KisWdgLensBlur::configuration
    ],
    // --- colours
    colortoalpha: [r('targetcolor', 'Color'), r('threshold', 'Threshold', { min: 1, max: 255 })],
    fastcoloroverlay: grp('Fast Color Overlay', [
        r('color', 'Color'),
        r('compositeop', 'Blend Mode', { choices: [['normal', 'Normal (layers with transparency)'], ['tint', 'Tint (opaque layers)']] }),
        r('opacity', 'Opacity', { min: 0, max: 100 }),
    ]),
    desaturate: [r('type', 'Desaturation method', { choices: ['Lightness', 'Luminosity (ITU-R BT.709)', 'Luminosity (ITU-R BT.601)', 'Average', 'Min', 'Max'] })],
    hsvadjustment: [
        r('type', 'Type', { choices: ['Hue/Saturation/Value', 'Hue/Saturation/Lightness', 'Hue/Saturation/Intensity', 'Hue/Saturation/Luma', 'Blue Chroma/Red Chroma/Luma'] }),
        // Ranges are the ones Krita uses with Colorize off (SliderSettings minRelative/maxRelative); Colorize widens them.
        r('h', 'Hue', { min: -180, max: 180 }),
        r('s', 'Saturation', { min: -100, max: 100 }),
        r('v', 'Value (Lightness, Intensity or Luma, by Type)', { min: -100, max: 100 }),
        r('colorize', 'Colorize'),
        r('compatibilityMode', 'Legacy mode (before Krita 4.3)'),
    ],
    colorbalance: [
        ...balance('shadows', 'Shadows'), ...balance('midtones', 'Midtones'), ...balance('highlights', 'Highlights'),
        r('preserve_luminosity', 'Preserve Luminosity'),
    ],
    levels: [
        // Krita 5 keeps the levels in the 'lightness' string; the engine still reports the legacy
        // blackvalue/whitevalue/gammavalue/outblackvalue/outwhitevalue keys, but changing them has no effect
        // (checked against the real engine in tests/filter-forms.mjs), so they are hidden.
        ...hide('blackvalue', 'gammavalue', 'whitevalue', 'outblackvalue', 'outwhitevalue'),
        r('mode', 'Mode', { choices: [['lightness', 'Lightness'], ['channels', 'All Channels']] }),
        r('lightness', 'Lightness levels (input black;input white;gamma;output black;output white, each 0..1)'),
        ...hide('histogram_mode', 'number_of_channels'),
    ],
    threshold: [r('threshold', 'Threshold level', { min: 0, max: 255 })],
    posterize: [r('steps', 'Steps', { min: 2, max: 128 })],
    dodge: [r('type', 'Mode', { choices: ['Shadows', 'Midtones', 'Highlights'] }), r('exposure', 'Exposure (stored 0..1, Krita shows percent)')],
    burn: [r('type', 'Mode', { choices: ['Shadows', 'Midtones', 'Highlights'] }), r('exposure', 'Exposure (stored 0..1, Krita shows percent)')],
    indexcolors: [
        ...grp('Gradient Steps', [r('reduceColorsEnabled', 'Limit to'), r('colorLimit', 'Number of colors', { min: 3, max: 256 })]),
        ...grp('Indexing Factors', [
            r('LFactor', 'L*', { min: 0, max: 2, step: 0.01 }), r('aFactor', 'a*', { min: 0, max: 2, step: 0.01 }), r('bFactor', 'b*', { min: 0, max: 2, step: 0.01 }),
        ]),
        ...grp('Other', [r('alphaSteps', 'Alpha Steps', { min: 0, max: 32 })]),
    ],
    gradientmap: [
        r('colorMode', 'Color Mode', { choices: ['Blend', 'Nearest', 'Dither'] }),
        ...dither('dither/', 'Dither'),
        ...hide('gradientXML'), // chosen with a gradient picker in Krita; the engine only exposes its XML
    ],
    palettize: [
        r('palette', 'Palette'),
        r('colorspace', 'Color Space', { choices: ['Lab', 'RGB'] }),
        r('ditherEnabled', 'Dither', { group: 'Dither' }),
        ...dither('dither/', 'Dither'),
        r('dither/colorMode', 'Color Mode', { group: 'Dither', choices: ['Per Channel Offset', 'Nearest Colors'] }),
        r('dither/offsetScale', 'Offset Scale', { group: 'Dither', min: 0, max: 1, step: 0.125 }),
        r('alphaEnabled', 'Alpha', { group: 'Alpha' }),
        r('alphaMode', 'Alpha Mode', { group: 'Alpha', choices: ['Clip', 'Index', 'Dither'] }),
        r('alphaClip', 'Clip', { group: 'Alpha', min: 0, max: 1, step: 0.125 }),
        r('alphaIndex', 'Index', { group: 'Alpha', min: 0, max: 255 }),
        ...dither('alphaDither/', 'Alpha'),
    ],
    // --- edges and maps
    'edge detection': [
        r('type', 'Formula', { choices: PREWITT }),
        r('horizRadius', 'Horizontal Radius', { min: 1, max: 100, step: 0.01 }),
        r('vertRadius', 'Vertical Radius', { min: 1, max: 100, step: 0.01 }),
        r('lockAspect', ASPECT),
        r('output', 'Output', { choices: [['pythagorean', 'All sides'], ['xGrowth', 'Top Edge'], ['xFall', 'Bottom Edge'], ['yGrowth', 'Right Edge'], ['yFall', 'Left Edge'], ['radian', 'Direction in Radians']] }),
        r('transparency', 'Apply result to alpha channel'),
    ],
    'height to normal': [
        r('type', 'Formula', { choices: PREWITT }),
        r('channelToConvert', 'Channel'),
        r('horizRadius', 'Horizontal Radius', { min: 1, max: 100, step: 0.01 }),
        r('vertRadius', 'Vertical Radius', { min: 1, max: 100, step: 0.01 }),
        r('lockAspect', ASPECT),
        r('redSwizzle', 'XYZ: Red', { choices: SWIZZLE }),
        r('greenSwizzle', 'XYZ: Green', { choices: SWIZZLE }),
        r('blueSwizzle', 'XYZ: Blue', { choices: SWIZZLE }),
    ],
    phongbumpmap: [
        r('useNormalMapIsEnabled', 'Use Normal map'),
        ...grp('Specular', [r('specularReflectivityIsEnabled', 'Enabled'), r('specularReflectivity', 'Reflectivity'), r('shinynessExponent', 'Shinyness exponent')]),
        ...grp('Diffuse', [r('diffuseReflectivityIsEnabled', 'Enabled'), r('diffuseReflectivity', 'Reflectivity')]),
        ...grp('Ambient', [r('ambientReflectivity', 'Reflectivity')]),
        ...light(0), ...light(1), ...light(2), ...light(3),
    ],
    // --- artistic / noise
    noise: [
        r('level', 'Level', { min: 0, max: 100 }), r('opacity', 'Opacity', { min: 0, max: 100 }), r('grayscale', 'Grayscale'),
        ...hide('seedThreshold', 'seedRed', 'seedGreen', 'seedBlue'),
    ],
    randompick: [
        r('level', 'Level'), r('windowsize', 'Size of the window'), r('opacity', 'Opacity'),
        ...hide('seedH', 'seedV', 'seedThreshold'),
    ],
    wave: [
        ...grp('Horizontal Wave', [
            r('horizontalwavelength', 'Wavelength'), r('horizontalshift', 'Shift'), r('horizontalamplitude', 'Amplitude'),
            r('horizontalshape', 'Shape', { choices: ['Sinusoidal', 'Triangle'] }),
        ]),
        ...grp('Vertical Wave', [
            r('verticalwavelength', 'Wavelength'), r('verticalshift', 'Shift'), r('verticalamplitude', 'Amplitude'),
            r('verticalshape', 'Shape', { choices: ['Sinusoidal', 'Triangle'] }),
        ]),
    ],
    oilpaint: [r('brushSize', 'Brush size', { min: 1, max: 5 }), r('smooth', 'Smooth', { min: 10, max: 255 })],
    raindrops: [
        r('dropsize', 'Drop size', { min: 1, max: 200 }), r('number', 'Number of drops', { min: 1, max: 500 }),
        r('fishEyes', 'Fish eyes', { min: 1, max: 100 }),
        ...hide('seed'), // set from rand() by the filter, not in the dialog
    ],
    pixelize: [
        r('pixelWidth', 'Pixel width', { min: 2, max: 512 }), r('pixelHeight', 'Pixel height', { min: 2, max: 512 }), r('keepAspect', ASPECT),
    ],
    smalltiles: [r('numberOfTiles', 'Number of tiles', { min: 2, max: 5 })],
    roundcorners: [r('radius', 'Radius', { min: 2, max: 100 })],
    emboss: [r('depth', 'Depth', { min: 10, max: 300 })],
    // --- sharpen / denoise
    unsharp: [
        r('halfSize', 'Radius', { min: 0, max: 99.99, step: 1 }), r('amount', 'Amount', { min: 0, max: 99.99, step: 0.2 }),
        r('threshold', 'Threshold'), r('lightnessOnly', 'Lightness Only'),
    ],
    gaussianhighpass: [r('blurAmount', 'Radius', { min: 0, max: 250, step: 1 })],
    gaussiannoisereducer: [r('threshold', 'Threshold', { min: 0, max: 255 }), r('windowsize', 'Window size', { min: 0, max: 10 })],
    waveletnoisereducer: [r('threshold', 'Threshold', { min: 0, max: 256 })],
    propagatecolors: [
        r('distanceMetric', 'Expansion Pattern', { choices: [['chessboard', 'Rectangle'], ['cityBlock', 'Diamond'], ['euclidean', 'Octagon']] }),
        r('expansionMode', 'Expansion Distance', { choices: [['unbounded', 'Unrestricted'], ['bounded', 'Restricted']] }),
        r('expansionAmount', 'Maximum Distance (px)', { min: 0, max: 500, step: 0.01 }),
        r('alphaChannelMode', 'Transparency Behavior', { choices: [['expand', 'Expand'], ['preserve', 'Preserve']] }),
    ],
    colortransfer: [r('filename', 'Reference image')],
    // perchannel/crosschannel/asccdl/halftone: Krita's dialogs edit curves or per-channel blobs the engine does not report.
    perchannel: hide('nTransfers'),
    crosschannel: hide('nTransfers'),
};
