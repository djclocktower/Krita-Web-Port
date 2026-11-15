// Same idea as filters.ts, for fill-layer generators (krita/plugins/generators/<name>/).
import { grp, hide, r, type Table } from './types';

const UNITS: [string, string][] = [['pixels', 'Pixels'], ['percent_of_width', 'Percent of the Width'], ['percent_of_height', 'Percent of the Height'],
    ['percent_of_longest_side', 'Percent of the Longest Side'], ['percent_of_shortest_side', 'Percent of the Shortest Side']];
const POSITIONING: [string, string][] = [['absolute', 'Absolute'], ['relative', 'Relative']];

export const GENERATORS: Record<string, Table> = {
    simplex_noise: [
        r('frequency', 'Frequency', { min: 1, max: 500 }),
        r('looping', 'Looping'),
        ...grp('Ratio', [r('ratio_x', 'X', { min: 0, max: 2, step: 0.01 }), r('ratio_y', 'Y', { min: 0, max: 2, step: 0.01 })]),
        r('custom_seed_string', 'Use Custom Seed'),
        ...hide('seed'), // random, derived from the custom seed text when one is given
    ],
    gradient: [
        ...grp('General', [
            r('shape', 'Shape', { choices: [['linear', 'Linear'], ['bilinear', 'Bi-Linear'], ['radial', 'Radial'], ['square', 'Square'], ['conical', 'Conical'],
                ['conical_symetric', 'Conical Symmetric'], ['spiral', 'Spiral'], ['reverse_spiral', 'Reverse Spiral'], ['polygonal', 'Shaped']] }),
            r('repeat', 'Repeat', { choices: [['none', 'None'], ['forwards', 'Forwards'], ['alternate', 'Alternating']] }),
            r('antialias_threshold', 'Anti-alias threshold', { min: 0, max: 1 }),
            r('reverse', 'Reverse'),
        ]),
        ...grp('Position', [
            r('start_position_x', 'Start X'), r('start_position_x_units', 'Start X units', { choices: UNITS }),
            r('start_position_y', 'Start Y'), r('start_position_y_units', 'Start Y units', { choices: UNITS }),
            r('end_position_coordinate_system', 'End coordinates', { choices: [['cartesian', 'Cartesian Coordinates'], ['polar', 'Polar Coordinates']] }),
            r('end_position_x', 'End X'), r('end_position_x_positioning', 'End X positioning', { choices: POSITIONING }),
            r('end_position_x_units', 'End X units', { choices: UNITS }),
            r('end_position_y', 'End Y'), r('end_position_y_positioning', 'End Y positioning', { choices: POSITIONING }),
            r('end_position_y_units', 'End Y units', { choices: UNITS }),
            r('end_position_angle', 'End angle', { kind: 'angle' }),
            r('end_position_distance', 'End distance'), r('end_position_distance_units', 'End distance units', { choices: UNITS }),
        ]),
        ...hide('gradient'), // the "Gradient Colors" tab is a gradient picker; the engine only exposes its XML
    ],
    screentone: [
        ...grp('Screentone Type', [
            r('pattern', 'Pattern', { choices: ['Dots', 'Lines'] }),
            r('shape', 'Shape (choices depend on Pattern)'),
            r('interpolation', 'Interpolation (choices depend on Pattern and Shape)'),
            r('equalization_mode', 'Equalization', { choices: ['None', 'Function Based', 'Template Based'] }),
        ]),
        ...grp('Transformation', [
            r('size_mode', 'Size Mode', { choices: ['Resolution based', 'Pixel based'] }),
            r('units', 'Units', { choices: ['Inches', 'Centimeters'] }),
            r('resolution', 'Resolution', { min: 1, max: 9999 }),
            r('frequency_x', 'Frequency X'), r('frequency_y', 'Frequency Y'), r('constrain_frequency', 'Constrain frequency'),
            r('size_x', 'Size X (px)', { min: 1, max: 1000 }), r('size_y', 'Size Y (px)', { min: 1, max: 1000 }), r('keep_size_square', 'Keep size square'),
            r('shear_x', 'Shear X', { min: -10, max: 10, step: 0.1 }), r('shear_y', 'Shear Y', { min: -10, max: 10, step: 0.1 }),
            r('rotation', 'Rotation', { kind: 'angle' }),
            r('align_to_pixel_grid', 'Align to Pixel Grid'),
            r('align_to_pixel_grid_x', 'Align every N cells horizontally', { min: 1, max: 20 }),
            r('align_to_pixel_grid_y', 'Align every N cells vertically', { min: 1, max: 20 }),
            r('position_x', 'Position X (px)', { min: -1000, max: 1000, step: 1 }), r('position_y', 'Position Y (px)', { min: -1000, max: 1000, step: 1 }),
        ]),
        ...grp('Postprocessing', [
            r('foreground_opacity', 'Foreground opacity', { min: 0, max: 100 }), r('background_opacity', 'Background opacity', { min: 0, max: 100 }),
            r('invert', 'Invert'),
            r('brightness', 'Brightness (percent)', { min: 0, max: 100, step: 1 }), r('contrast', 'Contrast (percent)', { min: 0, max: 100, step: 1 }),
        ]),
    ],
    multigrid: [
        ...grp('Shapes', [
            r('divisions', 'Divisions', { min: 0, max: 100 }), r('dimensions', 'Dimensions', { min: 3, max: 36 }), r('offset', 'Offset', { min: 0.01, max: 0.49, step: 0.01 }),
        ]),
        ...grp('Lines', [
            r('lineWidth', 'Line Width'),
            r('connectorType', 'Connector Type', { choices: ['No Connectors', 'Acute Angles', 'Obtuse Angles', 'Cross Shape', 'Center Dot', 'Corner Dot'] }),
            r('connectorWidth', 'Connector Width'),
        ]),
        ...grp('Color Factors', [
            r('colorRatio', 'Ratio', { min: -2, max: 2, step: 0.01 }), r('colorIndex', 'Index', { min: -2, max: 2, step: 0.01 }),
            r('colorIntersect', 'Intersect', { min: -2, max: 2, step: 0.01 }),
        ]),
        ...hide('gradientXML'), // gradient picker in Krita
    ],
    pattern: [
        r('pattern', 'Pattern'),
        ...grp('Transform', [
            r('transform_scale_x', 'Size width (stored as ratio, 1 = 100%)', { min: 0, max: 100, step: 0.01 }),
            r('transform_scale_y', 'Size height (stored as ratio, 1 = 100%)', { min: 0, max: 100, step: 0.01 }),
            r('transform_keep_scale_aspect', 'Lock aspect ratio'),
            r('transform_offset_x', 'Position X', { min: -10000, max: 10000 }), r('transform_offset_y', 'Position Y', { min: -10000, max: 10000 }),
            r('transform_shear_x', 'Shear X (stored as ratio, 1 = 100%)', { min: -5, max: 5, step: 0.01 }),
            r('transform_shear_y', 'Shear Y (stored as ratio, 1 = 100%)', { min: -5, max: 5, step: 0.01 }),
            r('transform_rotation_x', 'Rotation X', { kind: 'angle' }), r('transform_rotation_y', 'Rotation Y', { kind: 'angle' }),
            r('transform_rotation_z', 'Rotation Z', { kind: 'angle' }),
            r('transform_align_to_pixel_grid', 'Align to Pixel Grid'),
            r('transform_align_to_pixel_grid_x', 'Align X', { min: 1, max: 20 }), r('transform_align_to_pixel_grid_y', 'Align Y', { min: 1, max: 20 }),
        ]),
        ...hide('fileName', 'md5sum'), // identify the chosen pattern resource
    ],
};
