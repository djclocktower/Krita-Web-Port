// The contract between the web UI and Krita's engine.
//
// The UI only ever talks to an `Engine`. Two implementations exist:
//   - mock.ts: a small in-browser stand-in, for UI development and tests
//   - wasm.ts: Krita's real core running in a worker thread (engine/bridge)
// Both must behave the same for everything declared here. If the UI needs something that is
// not here, add it here first; do not reach around this file.
//
// Conventions: ids are opaque strings. Coordinates are image pixels (floats allowed).
// Colours are sRGB, components 0..1. Opacity is 0..1. One document is open at a time
// (ponytail: single document; add a docId parameter when multi-document lands).

export type NodeId = string;

export type NodeType =
    | 'paint' | 'group' | 'filter' | 'fill' | 'clone' | 'file' | 'vector'
    | 'transparencyMask' | 'filterMask' | 'colorizeMask' | 'transformMask' | 'selectionMask';

export interface LayerNode {
    id: NodeId;
    type: NodeType;
    name: string;
    visible: boolean;
    locked: boolean;
    alphaLocked: boolean;      // paint layers only
    opacity: number;
    blendMode: string;         // a BlendMode.id
    collapsed: boolean;        // groups only
    /** Filter/generator id for filter and fill layers and filter masks. */
    configId?: string;
    /** Top-most child first, exactly as Krita's layer docker lists them. */
    children: LayerNode[];
}

export interface DocumentInfo {
    name: string;
    width: number;
    height: number;
    resolutionPpi: number;
    colorModel: string;        // e.g. "RGBA"
    colorDepth: string;        // e.g. "U8"
    profile: string;
    modified: boolean;
}

export interface BlendMode { id: string; name: string; category: string }
export interface Color { r: number; g: number; b: number; a: number }
export interface Rect { x: number; y: number; width: number; height: number }

/** One pen sample. Missing fields mean "not reported by the device". */
export interface StrokePoint {
    x: number; y: number;
    pressure: number;          // 0..1; 1 for a mouse
    xTilt?: number; yTilt?: number;   // degrees, -90..90
    rotation?: number;         // degrees
    timeMs: number;            // monotonic, from the pointer event
}

export interface Preset {
    id: string;
    name: string;
    /** Brush engine id, e.g. "paintbrush", "colorsmudge". */
    engine: string;
    tags: string[];
}

/** Current brush state shown in the toolbar. */
export interface BrushState {
    presetId: string | null;
    size: number;              // pixels
    opacity: number;
    flow: number;
    blendMode: string;
    eraser: boolean;
}

export type PropertyValue = string | number | boolean;

/** Describes one editable setting so a form can be generated for it. */
export interface PropertySpec {
    key: string;
    label: string;
    kind: 'number' | 'integer' | 'boolean' | 'choice' | 'color' | 'string' | 'curve' | 'angle';
    min?: number; max?: number; step?: number;
    choices?: { value: string; label: string }[];
    /** Optional section heading the setting belongs under. */
    group?: string;
}

export interface FilterInfo {
    id: string;
    name: string;
    category: string;
    /** False for filters that can only be applied destructively, not used as a filter layer or mask. */
    supportsAdjustmentLayers: boolean;
}

export interface ConfigDescription {
    specs: PropertySpec[];
    defaults: Record<string, PropertyValue>;
}

export interface HistoryState { canUndo: boolean; canRedo: boolean; undoText: string; redoText: string }

export type ExportFormat = 'kra' | 'png' | 'jpg' | 'psd' | 'ora' | 'tga' | 'bmp' | 'webp' | 'gif' | 'exr' | 'jxl' | 'avif' | 'krz' | 'hdr' | 'csv' | 'r16';

/** How a new selection combines with the existing one. */
export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';
export interface Point { x: number; y: number }

export interface FillOptions {
    /** 0..255: how different a pixel may be from the clicked one and still be filled. */
    threshold?: number;
    /** False fills every similar pixel in the image, not just the connected region. */
    contiguous?: boolean;
    /** Decide the region from the whole image instead of the active layer only. */
    sampleMerged?: boolean;
}
export interface GradientOptions {
    shape: 'linear' | 'bilinear' | 'radial' | 'square' | 'conical' | 'spiral';
    repeat?: 'none' | 'forwards' | 'alternating';
    reverse?: boolean;
}

export interface ColorSpaceInfo { model: string; modelName: string; depth: string; depthName: string; profiles: string[] }

/** One of Krita's own menu actions (there are several hundred). */
export interface KritaAction { name: string; text: string; shortcut: string; enabled: boolean; checkable: boolean; checked: boolean }
/** One of Krita's own canvas tools. */
export interface KritaTool { id: string; name: string; section: string; shortcut: string; active: boolean }
/** A pointer event for Krita's own canvas, in image pixels. Give `pressure` for a pen (it is then delivered as a tablet event). */
export interface KritaPointer {
    type: 'press' | 'move' | 'release';
    x: number; y: number;
    /** For 'move': whether the button or pen tip is down. */
    down?: boolean;
    pressure?: number; xTilt?: number; yTilt?: number; rotation?: number;
    shift?: boolean; ctrl?: boolean; alt?: boolean;
    /** Default 'left'. Right opens Krita's pop-up palette or a tool's context menu (as a Krita window). */
    button?: 'left' | 'right' | 'middle';
}

/** How the page is showing the image, so Krita's tools draw their handles and guides to match. */
export interface KritaViewport {
    /** Canvas element size in CSS pixels. */
    width: number; height: number;
    /** Screen pixels per image pixel. */
    zoom: number;
    /** Where image pixel (0,0) lands in the canvas element, in CSS pixels, after rotation and mirroring. */
    offsetX: number; offsetY: number;
    rotation?: number; mirror?: boolean;
}

/**
 * One of Krita's own windows: a dialog, a pop-up (menu, combo list, pop-up palette) or the active
 * tool's option panel. The engine paints them; the page shows the picture and forwards input.
 */
export interface KritaWindow {
    id: number;
    title: string;
    kind: 'dialog' | 'popup' | 'toolOptions';
    /** While a modal window is open, input belongs to it alone. */
    modal: boolean;
    /** Position on Krita's virtual screen (pop-ups are placed relative to their parent window's x/y). */
    x: number; y: number; width: number; height: number;
    parent?: number;
}
export interface KritaWindowInput {
    type: 'press' | 'move' | 'release' | 'wheel' | 'keydown' | 'keyup';
    /** Pointer position inside the window, in its pixels. */
    x?: number; y?: number;
    button?: 'left' | 'right' | 'middle';
    /** For 'move': whether a button is held. */
    down?: boolean;
    /** Wheel movement in pixels (positive = scroll down). */
    deltaY?: number;
    /** KeyboardEvent.key and the text it types, if any. */
    key?: string; text?: string;
    shift?: boolean; ctrl?: boolean; alt?: boolean;
}

export interface AnimationState {
    framesPerSecond: number;
    /** Playback range, inclusive. */
    startTime: number;
    endTime: number;
    currentTime: number;
}

export interface EngineEvents {
    /** Pixels changed. `pixels` is straight-alpha RGBA8 in sRGB, rect.width * rect.height * 4 bytes, valid only during the call. */
    imageUpdate: (rect: Rect, pixels: Uint8Array | Uint8ClampedArray) => void;
    documentChanged: (info: DocumentInfo | null) => void;
    /** The selection changed; `bounds` is null when nothing is selected. Call selectionOutline() to draw it. */
    selectionChanged: (bounds: Rect | null) => void;
    /** Frame rate, range or current time changed. */
    animationChanged: (state: AnimationState) => void;
    /** Keyframes of a node changed; call keyframes() again. */
    keyframesChanged: (id: NodeId) => void;
    /** The layer tree or a layer property changed; call layers() again. */
    layersChanged: () => void;
    activeNodeChanged: (id: NodeId | null) => void;
    historyChanged: (state: HistoryState) => void;
    brushChanged: (state: BrushState) => void;
    colorChanged: (foreground: Color, background: Color) => void;
    /** Krita switched tools (by request, shortcut or action). */
    kritaToolChanged: (id: string) => void;
    /**
     * What the active Krita tool draws over the image (handles, outlines, guides, assistants). `rect`
     * is the part of the canvas element (CSS pixels, same frame as the last kritaViewport()) that has
     * anything in it; `pixels` is straight-alpha RGBA8 for that rect, valid only during the call.
     * Each event replaces the whole previous overlay; `pixels` null means there is nothing to draw.
     */
    kritaOverlay: (rect: Rect, pixels: Uint8Array | null) => void;
    /** A Krita window opened, moved, resized or changed title. */
    kritaWindow: (window: KritaWindow) => void;
    /** New picture of a Krita window: straight-alpha RGBA8, width * height * 4 bytes, valid only during the call. */
    kritaWindowPaint: (id: number, width: number, height: number, pixels: Uint8Array) => void;
    kritaWindowClosed: (id: number) => void;
    /** Krita's cursor over the canvas or a Krita window changed: a CSS cursor name. */
    kritaCursor: (cursor: string) => void;
}

export interface Engine {
    on<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): () => void;

    // --- documents (Phase 1)
    newDocument(options: { width: number; height: number; name?: string; background?: Color }): Promise<DocumentInfo>;
    openDocument(fileName: string, bytes: Uint8Array): Promise<DocumentInfo>;
    exportDocument(format: ExportFormat): Promise<Uint8Array>;
    documentInfo(): Promise<DocumentInfo | null>;
    /** Asks for a full repaint through imageUpdate (e.g. after the canvas was recreated). */
    refresh(): Promise<void>;

    // --- layers (Phase 1: paint and group; Phase 3: the rest)
    layers(): Promise<LayerNode[]>;
    /** New node goes above `above`, or on top of `parent` (root when omitted). `configId`/`config` are for filter, fill and filter-mask nodes. */
    addNode(options: { type: NodeType; name?: string; parent?: NodeId; above?: NodeId;
                       configId?: string; config?: Record<string, PropertyValue> }): Promise<NodeId>;
    removeNode(id: NodeId): Promise<void>;
    duplicateNode(id: NodeId): Promise<NodeId>;
    moveNode(id: NodeId, target: { parent?: NodeId; above?: NodeId }): Promise<void>;
    mergeDown(id: NodeId): Promise<void>;
    setNodeProperties(id: NodeId, props: Partial<Pick<LayerNode,
        'name' | 'visible' | 'locked' | 'alphaLocked' | 'opacity' | 'blendMode' | 'collapsed'>>): Promise<void>;
    setActiveNode(id: NodeId): Promise<void>;
    /** The active node now, for panels that mount after the last activeNodeChanged event. */
    activeNode(): Promise<NodeId | null>;
    /** PNG bytes, at most `size` pixels on the longer side. */
    nodeThumbnail(id: NodeId, size: number): Promise<Uint8Array>;
    blendModes(): Promise<BlendMode[]>;

    // --- painting (Phase 1). Strokes go to the active node. Not awaited: order is preserved.
    beginStroke(first: StrokePoint): void;
    continueStroke(points: StrokePoint[]): void;
    endStroke(): void;
    setColors(colors: { foreground?: Color; background?: Color }): Promise<void>;
    setBrush(state: Partial<Omit<BrushState, 'presetId'>>): Promise<void>;
    /** Current values, for panels that mount after the last change event. */
    brushState(): Promise<BrushState>;
    colors(): Promise<{ foreground: Color; background: Color }>;
    undo(): Promise<void>;
    redo(): Promise<void>;

    // --- brush presets and resources (Phase 2)
    presets(filter?: { search?: string; tag?: string }): Promise<Preset[]>;
    presetTags(): Promise<string[]>;
    /** PNG bytes of the preset's own thumbnail. */
    presetThumbnail(id: string): Promise<Uint8Array>;
    selectPreset(id: string): Promise<void>;
    /** Editable settings of the current preset, for the brush editor. */
    presetSettings(): Promise<{ description: ConfigDescription; values: Record<string, PropertyValue> }>;
    setPresetSetting(key: string, value: PropertyValue): Promise<void>;
    /** Adds a .bundle, .kpp, .abr, .gbr, .gih, .pat, .ggr or .kpl file to the resources. */
    importResource(fileName: string, bytes: Uint8Array): Promise<void>;

    // --- filters and generators (Phase 3)
    filters(): Promise<FilterInfo[]>;
    filterConfig(id: string): Promise<ConfigDescription>;
    /** Applies a filter destructively to a node, as Filter > ... does. */
    applyFilter(nodeId: NodeId, filterId: string, config: Record<string, PropertyValue>): Promise<void>;
    /** Shows the filter's effect without committing it; `null` clears the preview. */
    previewFilter(nodeId: NodeId, filterId: string | null, config?: Record<string, PropertyValue>): Promise<void>;
    generators(): Promise<FilterInfo[]>;
    generatorConfig(id: string): Promise<ConfigDescription>;
    /** Current settings of a filter layer, fill layer or filter mask. */
    nodeConfig(id: NodeId): Promise<{ configId: string; values: Record<string, PropertyValue> }>;
    setNodeConfig(id: NodeId, config: Record<string, PropertyValue>): Promise<void>;

    // --- selections (Phase 4). All undoable. Painting, fills and filters are limited to the selection.
    selectAll(): Promise<void>;
    deselect(): Promise<void>;
    invertSelection(): Promise<void>;
    selectRect(rect: Rect, mode: SelectionMode): Promise<void>;
    selectEllipse(rect: Rect, mode: SelectionMode): Promise<void>;
    /** Freehand (lasso) or polygonal selection. */
    selectPolygon(points: Point[], mode: SelectionMode): Promise<void>;
    /** Contiguous ("magic wand") selection from a clicked point. */
    selectSimilar(at: Point, options: FillOptions, mode: SelectionMode): Promise<void>;
    /** Closed polygons in image pixels, each [x0, y0, x1, y1, ...], for drawing the marching ants. Empty when nothing is selected. */
    selectionOutline(): Promise<number[][]>;

    // --- fill and gradient tools (Phase 4). They act on the active node, inside the selection if there is one.
    floodFill(at: Point, source: 'foreground' | 'background', options: FillOptions): Promise<void>;
    /** Fills the selection (or the whole layer) with a colour, as Edit > Fill does. */
    fillSelection(source: 'foreground' | 'background'): Promise<void>;
    /** Clears the selection's pixels (or the whole layer), as Edit > Clear does. */
    clearSelection(): Promise<void>;
    /** Foreground-to-background gradient from one point to another. */
    drawGradient(from: Point, to: Point, options: GradientOptions): Promise<void>;

    // --- image operations (Phase 4, Image menu). All undoable.
    scaleImage(options: { width: number; height: number; filter?: 'Bicubic' | 'Bilinear' | 'NearestNeighbor' | 'Lanczos3' }): Promise<DocumentInfo>;
    /** Changes the canvas size without scaling; `offsetX/Y` place the old image inside the new canvas. */
    resizeCanvas(options: { width: number; height: number; offsetX: number; offsetY: number }): Promise<DocumentInfo>;
    cropImage(rect: Rect): Promise<DocumentInfo>;
    rotateImage(degrees: number): Promise<DocumentInfo>;
    mirrorImage(axis: 'horizontal' | 'vertical'): Promise<void>;
    flattenImage(): Promise<void>;

    // --- colour management (Phase 6)
    colorSpaces(): Promise<ColorSpaceInfo[]>;
    convertColorSpace(options: { model: string; depth: string; profile?: string }): Promise<DocumentInfo>;

    // --- animation (Phase 7). Times are frame numbers starting at 0.
    animation(): Promise<AnimationState>;
    setAnimation(state: Partial<AnimationState>): Promise<void>;
    /** Frame numbers that have a keyframe on this node, ascending. Empty for a node that is not animated. */
    keyframes(id: NodeId): Promise<number[]>;
    /** Adds a keyframe; `copy` duplicates the frame visible at that time instead of starting blank. */
    addKeyframe(id: NodeId, time: number, options?: { copy?: boolean }): Promise<void>;
    removeKeyframe(id: NodeId, time: number): Promise<void>;
    moveKeyframe(id: NodeId, from: number, to: number): Promise<void>;
    /** Onion skins show neighbouring frames faintly on this node while drawing. */
    setOnionSkin(id: NodeId, enabled: boolean): Promise<void>;

    // --- Krita's own actions and tools. These run Krita's real menu commands and canvas tools on the
    // same document, colours, brush and active layer as every call above. Only Krita's engine has
    // them: the mock lists none and rejects the rest.
    kritaActions(): Promise<KritaAction[]>;
    triggerKritaAction(name: string): Promise<void>;
    kritaTools(): Promise<KritaTool[]>;
    setKritaTool(id: string): Promise<void>;
    /** Not awaited: order is preserved. Other requests are held while a press is down, like strokes. */
    kritaPointer(event: KritaPointer): void;
    /** A key for Krita's canvas (Enter/Escape to finish or cancel a tool, modifiers, Krita shortcuts). Not awaited. */
    kritaKey(event: { type: 'keydown' | 'keyup'; key: string; text?: string; shift?: boolean; ctrl?: boolean; alt?: boolean }): void;
    /** Call whenever zoom, pan, rotation or canvas size changes while a Krita tool is active. Not awaited. */
    kritaViewport(viewport: KritaViewport): void;
    /** Krita windows currently open (the tool option panel is always one of them once a document is open). */
    kritaWindows(): Promise<KritaWindow[]>;
    /** Not awaited: order is preserved. */
    kritaWindowInput(id: number, event: KritaWindowInput): void;
    /** Asks the window to close, as its title-bar X would (the engine answers with kritaWindowClosed). */
    closeKritaWindow(id: number): Promise<void>;
    /** Gives a window the size the page has room for (the tool option panel follows its dock). */
    resizeKritaWindow(id: number, width: number, height: number): Promise<void>;
}
