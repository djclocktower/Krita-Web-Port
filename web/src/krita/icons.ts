// Icons of Krita's own tools: Krita's SVGs (krita/krita/pics/tools/SVG/16/light_*.svg), copied to ./icons.
// They are shown as a CSS mask filled with the text colour, so one file follows every theme and the pressed state.
const urls = import.meta.glob<string>('./icons/light_*.svg', { query: '?url', import: 'default', eager: true });

/** Last part of Krita's tool id -> icon name (what the tool factory passes to setIconName). */
const ICON: Record<string, string> = {
    KarbonCalligraphyTool: 'calligraphy', InteractionTool: 'select', PathTool: 'shape_handling', SvgTextTool: 'draw-text',
    KisToolSmartPatch: 'krita_tool_smart_patch', KisToolEllipse: 'krita_tool_ellipse', KisToolCrop: 'tool_crop', KisToolMeasure: 'krita_tool_measure',
    KisToolSelectRectangular: 'tool_rect_selection', KisToolPolygon: 'krita_tool_polygon', KisToolSelectElliptical: 'tool_elliptical_selection',
    KisToolSelectContiguous: 'tool_contiguous_selection', KisToolLazyBrush: 'krita_tool_lazybrush', ToolReferenceImages: 'krita_tool_reference_images',
    KisToolGradient: 'krita_tool_gradient', KisToolPencil: 'krita_tool_freehandvector', KisToolMove: 'krita_tool_move', KisToolPath: 'krita_draw_path',
    KisToolBrush: 'krita_tool_freehand', KisToolLine: 'krita_tool_line', KisToolDyna: 'krita_tool_dyna', KisToolRectangle: 'krita_tool_rectangle',
    KisToolPolyline: 'polyline', KisToolEncloseAndFill: 'krita_tool_enclose_and_fill', KisToolMultiBrush: 'krita_tool_multihand',
    KisToolSelectMagnetic: 'tool_magnetic_selection', KisToolKnife: 'tool_comic_panel', KisToolSelectSimilar: 'tool_similar_selection',
    KisToolColorSampler: 'krita_tool_color_sampler', KisToolSelectOutline: 'tool_outline_selection', KisToolSelectPolygonal: 'tool_polygonal_selection',
    KisToolTransform: 'krita_tool_transform', KisToolFill: 'krita_tool_color_fill', KisAssistantTool: 'krita_tool_assistant', KisToolSelectPath: 'tool_path_selection',
};

/** URL of the icon of a Krita tool id ("KritaShape/KisToolBrush"), or undefined for a tool not in the table. */
export const kritaToolIcon = (id: string): string | undefined => urls[`./icons/light_${ICON[id.split('/').pop()!]}.svg`];
