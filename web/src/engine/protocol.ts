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

export type ExportFormat = 'kra' | 'png' | 'jpg';

export interface EngineEvents {
    /** Pixels changed. `pixels` is straight-alpha RGBA8 in sRGB, rect.width * rect.height * 4 bytes, valid only during the call. */
    imageUpdate: (rect: Rect, pixels: Uint8Array | Uint8ClampedArray) => void;
    documentChanged: (info: DocumentInfo | null) => void;
    /** The layer tree or a layer property changed; call layers() again. */
    layersChanged: () => void;
    activeNodeChanged: (id: NodeId | null) => void;
    historyChanged: (state: HistoryState) => void;
    brushChanged: (state: BrushState) => void;
    colorChanged: (foreground: Color, background: Color) => void;
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
}
