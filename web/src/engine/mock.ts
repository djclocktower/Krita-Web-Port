// A small stand-in for Krita's engine so the UI can be built and tested without the WebAssembly binary.
// It is deliberately crude: normal blending only, round dabs, whole-layer undo snapshots.
// Nothing here is a reference for how Krita behaves; protocol.ts is the contract.
import type {
    BlendMode, BrushState, Color, ConfigDescription, DocumentInfo, Engine, EngineEvents, ExportFormat, FilterInfo,
    HistoryState, LayerNode, NodeId, NodeType, Preset, PropertyValue, Rect, StrokePoint,
} from './protocol';
import { createMockExtra } from './mock-extra';

export type Pixels = Uint8ClampedArray;
export interface MockNode extends LayerNode { children: MockNode[]; pixels?: Pixels; config?: Record<string, PropertyValue> }
interface Snapshot { text: string; tree: MockNode[]; activeId: NodeId | null; size: [number, number]; extra: unknown }

const BLEND_MODES: BlendMode[] = [
    { id: 'normal', name: 'Normal', category: 'Mix' }, { id: 'multiply', name: 'Multiply', category: 'Darken' },
    { id: 'screen', name: 'Screen', category: 'Lighten' }, { id: 'overlay', name: 'Overlay', category: 'Mix' },
    { id: 'erase', name: 'Erase', category: 'Mix' },
];
const PRESETS: (Preset & { size: number })[] = [
    { id: 'basic-5', name: 'Basic-5 Size', engine: 'paintbrush', tags: ['Digital', 'Favorites'], size: 12 },
    { id: 'basic-1', name: 'Basic-1', engine: 'paintbrush', tags: ['Digital'], size: 40 },
    { id: 'ink-2', name: 'Ink-2 Fineliner', engine: 'paintbrush', tags: ['Ink', 'Favorites'], size: 4 },
    { id: 'airbrush-soft', name: 'Airbrush Soft', engine: 'paintbrush', tags: ['Digital'], size: 120 },
    { id: 'smudge-soft', name: 'Blender Blur', engine: 'colorsmudge', tags: ['Blender'], size: 60 },
    { id: 'eraser-circle', name: 'Eraser Circle', engine: 'paintbrush', tags: ['Erasers'], size: 30 },
];
const FILTERS: (FilterInfo & ConfigDescription)[] = [
    { id: 'invert', name: 'Invert', category: 'Adjust', supportsAdjustmentLayers: true, specs: [], defaults: {} },
    { id: 'threshold', name: 'Threshold', category: 'Adjust', supportsAdjustmentLayers: true,
      specs: [{ key: 'threshold', label: 'Threshold', kind: 'integer', min: 0, max: 255 }], defaults: { threshold: 128 } },
    { id: 'pixelize', name: 'Pixelize', category: 'Artistic', supportsAdjustmentLayers: true,
      specs: [{ key: 'pixelWidth', label: 'Pixel width', kind: 'integer', min: 1, max: 256 },
              { key: 'pixelHeight', label: 'Pixel height', kind: 'integer', min: 1, max: 256 }],
      defaults: { pixelWidth: 10, pixelHeight: 10 } },
];
const GENERATORS: (FilterInfo & ConfigDescription)[] = [
    { id: 'color', name: 'Solid Color', category: 'Fill', supportsAdjustmentLayers: true,
      specs: [{ key: 'color', label: 'Color', kind: 'color' }], defaults: { color: '#3366cc' } },
];
const BRUSH_SETTINGS: ConfigDescription = {
    specs: [
        { key: 'diameter', label: 'Diameter', kind: 'number', min: 0.1, max: 1000, group: 'Brush Tip' },
        { key: 'spacing', label: 'Spacing', kind: 'number', min: 0.02, max: 10, step: 0.01, group: 'Brush Tip' },
        { key: 'fade', label: 'Fade', kind: 'number', min: 0, max: 1, step: 0.01, group: 'Brush Tip' },
        { key: 'pressureSize', label: 'Pressure controls size', kind: 'boolean', group: 'Size' },
        { key: 'pressureOpacity', label: 'Pressure controls opacity', kind: 'boolean', group: 'Opacity' },
        { key: 'pressureCurve', label: 'Pressure curve', kind: 'curve', group: 'Size' },
    ],
    defaults: { diameter: 12, spacing: 0.1, fade: 0.8, pressureSize: true, pressureOpacity: false, pressureCurve: '0,0;1,1;' },
};

const hasPixels = (type: NodeType) => type === 'paint' || type.endsWith('Mask');
const clone = <T>(value: T): T => structuredClone(value);

export function createMockEngine(): Engine {
    const handlers: { [K in keyof EngineEvents]?: Set<EngineEvents[K]> } = {};
    const emit = <K extends keyof EngineEvents>(event: K, ...args: Parameters<EngineEvents[K]>) =>
        handlers[event]?.forEach(h => (h as (...a: unknown[]) => void)(...args));

    let info: DocumentInfo | null = null;
    let tree: MockNode[] = [];
    let activeId: NodeId | null = null;
    let nextId = 1;
    let undoStack: Snapshot[] = [];
    let redoStack: Snapshot[] = [];
    let foreground: Color = { r: 0, g: 0, b: 0, a: 1 };
    let background: Color = { r: 1, g: 1, b: 1, a: 1 };
    let brush: BrushState = { presetId: 'basic-5', size: 12, opacity: 1, flow: 1, blendMode: 'normal', eraser: false };
    let presetValues = clone(BRUSH_SETTINGS.defaults);
    let last: StrokePoint | null = null;
    let preview: { nodeId: NodeId; filterId: string; config: Record<string, PropertyValue> } | null = null;

    const doc = () => { if (!info) throw new Error('No document is open'); return info; };
    const walk = function* (nodes: MockNode[], parent: MockNode | null = null): Generator<[MockNode, MockNode | null]> {
        for (const n of nodes) { yield [n, parent]; yield* walk(n.children, n); }
    };
    const find = (id: NodeId) => {
        for (const [n, parent] of walk(tree)) if (n.id === id) return { node: n, parent, siblings: parent ? parent.children : tree };
        throw new Error(`No such node: ${id}`);
    };
    const makeNode = (type: NodeType, name: string): MockNode => ({
        id: `n${nextId++}`, type, name, visible: true, locked: false, alphaLocked: false, opacity: 1, blendMode: 'normal',
        collapsed: false, children: [], pixels: hasPixels(type) ? new Uint8ClampedArray(doc().width * doc().height * 4) : undefined,
    });
    const history = (): HistoryState => ({
        canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
        undoText: undoStack.at(-1)?.text ?? '', redoText: redoStack.at(-1)?.text ?? '',
    });
    const snapshot = (text: string): Snapshot => ({ text, tree: clone(tree), activeId, size: [doc().width, doc().height], extra: extra.save() });
    const record = (text: string) => {
        undoStack.push(snapshot(text));
        if (undoStack.length > 30) undoStack.shift();
        redoStack = [];
        if (info) info.modified = true;
        emit('historyChanged', history());
    };

    function applyFilter(px: Pixels, w: number, h: number, id: string, config: Record<string, PropertyValue>) {
        if (id === 'invert') {
            for (let i = 0; i < px.length; i += 4) { px[i] = 255 - px[i]; px[i + 1] = 255 - px[i + 1]; px[i + 2] = 255 - px[i + 2]; }
        } else if (id === 'threshold') {
            const t = Number(config.threshold ?? 128);
            for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = (px[i] + px[i + 1] + px[i + 2]) / 3 >= t ? 255 : 0;
        } else if (id === 'pixelize') {
            const bw = Math.max(1, Number(config.pixelWidth ?? 10)), bh = Math.max(1, Number(config.pixelHeight ?? 10));
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const s = (Math.floor(y / bh) * bh * w + Math.floor(x / bw) * bw) * 4, d = (y * w + x) * 4;
                px[d] = px[s]; px[d + 1] = px[s + 1]; px[d + 2] = px[s + 2]; px[d + 3] = px[s + 3];
            }
        }
    }

    /** Composites `nodes` (top-most first) over `out`. */
    function composite(nodes: MockNode[], out: Pixels, w: number, h: number) {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            if (!n.visible) continue;
            if (n.type === 'filter') { applyFilter(out, w, h, n.configId ?? '', n.config ?? {}); continue; }
            let src: Pixels | undefined;
            if (n.type === 'group') { src = new Uint8ClampedArray(out.length); composite(n.children, src, w, h); }
            else if (n.type === 'fill') {
                const hex = String(n.config?.color ?? '#3366cc');
                src = new Uint8ClampedArray(out.length);
                for (let p = 0; p < src.length; p += 4) {
                    src[p] = parseInt(hex.slice(1, 3), 16); src[p + 1] = parseInt(hex.slice(3, 5), 16);
                    src[p + 2] = parseInt(hex.slice(5, 7), 16); src[p + 3] = 255;
                }
            } else if (n.type === 'paint') src = n.pixels;
            if (!src) continue;
            if (preview?.nodeId === n.id) { src = src.slice(); applyFilter(src, w, h, preview.filterId, preview.config); }
            for (let p = 0; p < out.length; p += 4) {
                const a = (src[p + 3] / 255) * n.opacity;
                if (a === 0) continue;
                const da = out[p + 3] / 255, oa = a + da * (1 - a);
                for (let c = 0; c < 3; c++) out[p + c] = (src[p + c] * a + out[p + c] * da * (1 - a)) / oa;
                out[p + 3] = oa * 255;
            }
        }
    }
    function repaint() {
        if (!info) return;
        const out = new Uint8ClampedArray(info.width * info.height * 4);
        composite(tree, out, info.width, info.height);
        emit('imageUpdate', { x: 0, y: 0, width: info.width, height: info.height } satisfies Rect, out);
    }
    const changed = (layers = true) => { if (layers) emit('layersChanged'); repaint(); };

    function dab(px: Pixels, x: number, y: number, radius: number, alpha: number) {
        const { width, height } = doc(), erase = brush.eraser;
        const [r, g, b] = [foreground.r * 255, foreground.g * 255, foreground.b * 255];
        for (let j = Math.max(0, Math.floor(y - radius)); j <= Math.min(height - 1, Math.ceil(y + radius)); j++) {
            for (let i = Math.max(0, Math.floor(x - radius)); i <= Math.min(width - 1, Math.ceil(x + radius)); i++) {
                const cover = Math.min(1, Math.max(0, radius - Math.hypot(i - x, j - y) + 0.5)) * alpha * extra.selected(i, j);
                if (cover <= 0) continue;
                const p = (j * width + i) * 4, da = px[p + 3] / 255;
                if (erase) { px[p + 3] = da * (1 - cover) * 255; continue; }
                const oa = cover + da * (1 - cover);
                px[p] = (r * cover + px[p] * da * (1 - cover)) / oa;
                px[p + 1] = (g * cover + px[p + 1] * da * (1 - cover)) / oa;
                px[p + 2] = (b * cover + px[p + 2] * da * (1 - cover)) / oa;
                px[p + 3] = oa * 255;
            }
        }
    }
    function paintSegment(a: StrokePoint, b: StrokePoint) {
        const target = activeId ? find(activeId).node : null;
        if (!target?.pixels || target.locked || !target.visible) return;
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, brush.size * 0.1)));
        for (let s = 1; s <= steps; s++) {
            const t = s / steps, pressure = a.pressure + (b.pressure - a.pressure) * t;
            dab(target.pixels, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t,
                Math.max(0.5, (brush.size / 2) * (presetValues.pressureSize ? pressure : 1)), brush.opacity * brush.flow);
        }
    }

    async function toPng(px: Pixels, w: number, h: number, maxSide?: number): Promise<Uint8Array> {
        const full = new OffscreenCanvas(w, h);
        full.getContext('2d')!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
        let canvas = full;
        if (maxSide && Math.max(w, h) > maxSide) {
            const k = maxSide / Math.max(w, h);
            canvas = new OffscreenCanvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
            canvas.getContext('2d')!.drawImage(full, 0, 0, canvas.width, canvas.height);
        }
        return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    }
    const restore = (from: Snapshot[], to: Snapshot[]) => {
        const snap = from.pop();
        if (!snap) return;
        to.push(snapshot(snap.text));
        tree = snap.tree; activeId = snap.activeId; [info!.width, info!.height] = snap.size; extra.restore(snap.extra);
        emit('documentChanged', clone(info)); emit('historyChanged', history()); emit('activeNodeChanged', activeId); changed();
    };
    const publicNode = (n: MockNode): LayerNode => {
        const { pixels: _p, config: _c, children, ...rest } = n;
        return { ...rest, children: children.map(publicNode) };
    };
    const describe = (list: (FilterInfo & ConfigDescription)[], id: string): ConfigDescription => {
        const f = list.find(x => x.id === id);
        if (!f) throw new Error(`Unknown id: ${id}`);
        return { specs: clone(f.specs), defaults: clone(f.defaults) };
    };

    // Selections, fills, image operations and animation live in mock-extra.ts.
    const extra = createMockExtra({
        doc, record, changed, emit, find, walk,
        tree: () => tree, setTree: t => { tree = t; },
        activeId: () => activeId,
        colors: () => ({ foreground, background }),
        composite,
    });

    const engine: Engine = {
        on(event, handler) {
            ((handlers[event] ??= new Set() as never) as Set<typeof handler>).add(handler);
            return () => { (handlers[event] as Set<typeof handler>).delete(handler); };
        },

        async newDocument({ width, height, name = 'Untitled', background: bg }) {
            if (!(width > 0 && height > 0 && width * height <= 64e6)) throw new Error('Invalid document size');
            info = { name, width, height, resolutionPpi: 300, colorModel: 'RGBA', colorDepth: 'U8', profile: 'sRGB-elle-V2-srgbtrc.icc', modified: false };
            tree = []; undoStack = []; redoStack = []; nextId = 1; preview = null; extra.reset();
            const base = makeNode('paint', 'Background');
            const fill = bg ?? { r: 1, g: 1, b: 1, a: 1 };
            for (let p = 0; p < base.pixels!.length; p += 4) base.pixels!.set([fill.r * 255, fill.g * 255, fill.b * 255, fill.a * 255], p);
            const top = makeNode('paint', 'Paint Layer 1');
            tree = [top, base]; activeId = top.id;
            emit('documentChanged', info); emit('historyChanged', history()); emit('activeNodeChanged', activeId); changed();
            return clone(info);
        },
        async openDocument(fileName, bytes) {
            // The mock only understands flat images the browser can decode.
            const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>]));
            await engine.newDocument({ width: bitmap.width, height: bitmap.height, name: fileName });
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d')!;
            ctx.drawImage(bitmap, 0, 0);
            tree.at(-1)!.pixels!.set(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data);
            changed(false);
            return clone(doc());
        },
        async exportDocument(format: ExportFormat) {
            if (format === 'kra') throw new Error('The mock engine cannot write .kra files');
            const { width, height } = doc(), out = new Uint8ClampedArray(width * height * 4);
            composite(tree, out, width, height);
            return toPng(out, width, height);
        },
        async documentInfo() { return info ? clone(info) : null; },
        async refresh() { repaint(); },

        async layers() { return tree.map(publicNode); },
        async addNode({ type, name, parent, above, configId, config }) {
            record(`Add ${type}`);
            const node = makeNode(type, name ?? type);
            node.configId = configId; node.config = config ?? (configId ? describe(type === 'fill' ? GENERATORS : FILTERS, configId).defaults : undefined);
            if (above) { const at = find(above); at.siblings.splice(at.siblings.indexOf(at.node), 0, node); }
            else (parent ? find(parent).node.children : tree).unshift(node);
            activeId = node.id; emit('activeNodeChanged', activeId); changed();
            return node.id;
        },
        async removeNode(id) {
            const at = find(id); record('Remove Layer');
            at.siblings.splice(at.siblings.indexOf(at.node), 1);
            if (activeId === id) { activeId = tree[0]?.id ?? null; emit('activeNodeChanged', activeId); }
            changed();
        },
        async duplicateNode(id) {
            const at = find(id); record('Duplicate Layer');
            const copy = clone(at.node);
            for (const [n] of walk([copy])) n.id = `n${nextId++}`;
            copy.name = `Copy of ${at.node.name}`;
            at.siblings.splice(at.siblings.indexOf(at.node), 0, copy);
            activeId = copy.id; emit('activeNodeChanged', activeId); changed();
            return copy.id;
        },
        async moveNode(id, { parent, above }) {
            const at = find(id);
            for (const [n] of walk([at.node])) if (n.id === parent || n.id === above) throw new Error('Cannot move a node into itself');
            record('Move Layer');
            at.siblings.splice(at.siblings.indexOf(at.node), 1);
            if (above) { const dest = find(above); dest.siblings.splice(dest.siblings.indexOf(dest.node), 0, at.node); }
            else (parent ? find(parent).node.children : tree).unshift(at.node);
            changed();
        },
        async mergeDown(id) {
            const at = find(id), index = at.siblings.indexOf(at.node), below = at.siblings[index + 1];
            if (!below?.pixels) throw new Error('There is no paint layer below to merge into');
            record('Merge Down');
            const { width, height } = doc(), out = below.pixels.slice();
            composite([{ ...at.node, visible: true }], out, width, height);
            below.pixels = out; at.siblings.splice(index, 1);
            activeId = below.id; emit('activeNodeChanged', activeId); changed();
        },
        async setNodeProperties(id, props) {
            const { node } = find(id);
            if (props.opacity !== undefined && !(props.opacity >= 0 && props.opacity <= 1)) throw new Error('Opacity must be between 0 and 1');
            record('Change Layer Properties');
            Object.assign(node, props); changed();
        },
        async setActiveNode(id) { find(id); activeId = id; emit('activeNodeChanged', id); },
        async activeNode() { return activeId; },
        async nodeThumbnail(id, size) {
            const { node } = find(id), { width, height } = doc(), out = new Uint8ClampedArray(width * height * 4);
            composite([{ ...node, visible: true, opacity: 1 }], out, width, height);
            return toPng(out, width, height, size);
        },
        async blendModes() { return clone(BLEND_MODES); },

        beginStroke(first) { record('Freehand Brush Stroke'); last = first; paintSegment(first, first); repaint(); },
        continueStroke(points) { for (const p of points) { if (last) paintSegment(last, p); last = p; } repaint(); },
        endStroke() { last = null; },
        async setColors(colors) {
            foreground = colors.foreground ?? foreground; background = colors.background ?? background;
            emit('colorChanged', foreground, background);
        },
        async setBrush(state) { brush = { ...brush, ...state }; emit('brushChanged', clone(brush)); },
        async brushState() { return clone(brush); },
        async colors() { return { foreground, background }; },
        async undo() { restore(undoStack, redoStack); },
        async redo() { restore(redoStack, undoStack); },

        async presets(filter) {
            const search = filter?.search?.toLowerCase();
            return PRESETS.filter(p => (!search || p.name.toLowerCase().includes(search)) && (!filter?.tag || p.tags.includes(filter.tag)))
                .map(({ size: _s, ...p }) => p);
        },
        async presetTags() { return [...new Set(PRESETS.flatMap(p => p.tags))].sort(); },
        async presetThumbnail(id) {
            const preset = PRESETS.find(p => p.id === id);
            if (!preset) throw new Error(`Unknown preset: ${id}`);
            const canvas = new OffscreenCanvas(64, 64), ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 64, 64);
            ctx.strokeStyle = '#222'; ctx.lineCap = 'round'; ctx.lineWidth = Math.min(28, Math.max(1.5, preset.size / 4));
            ctx.beginPath(); ctx.moveTo(10, 46); ctx.bezierCurveTo(24, 6, 40, 58, 54, 18); ctx.stroke();
            return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
        },
        async selectPreset(id) {
            const preset = PRESETS.find(p => p.id === id);
            if (!preset) throw new Error(`Unknown preset: ${id}`);
            presetValues = { ...clone(BRUSH_SETTINGS.defaults), diameter: preset.size };
            brush = { ...brush, presetId: id, size: preset.size, eraser: id.startsWith('eraser') };
            emit('brushChanged', clone(brush));
        },
        async presetSettings() { return { description: clone(BRUSH_SETTINGS), values: clone(presetValues) }; },
        async setPresetSetting(key, value) {
            if (!(key in presetValues)) throw new Error(`Unknown setting: ${key}`);
            presetValues[key] = value;
            if (key === 'diameter') { brush = { ...brush, size: Number(value) }; emit('brushChanged', clone(brush)); }
        },
        async importResource(fileName) { throw new Error(`The mock engine cannot import ${fileName}`); },

        async filters() { return FILTERS.map(({ specs: _s, defaults: _d, ...f }) => f); },
        async filterConfig(id) { return describe(FILTERS, id); },
        async applyFilter(nodeId, filterId, config) {
            const { node } = find(nodeId);
            if (!node.pixels) throw new Error('Filters can only be applied to layers with pixels');
            describe(FILTERS, filterId); record(`Filter: ${filterId}`);
            preview = null; applyFilter(node.pixels, doc().width, doc().height, filterId, config); changed(false);
        },
        async previewFilter(nodeId, filterId, config = {}) { preview = filterId ? { nodeId, filterId, config } : null; repaint(); },
        async generators() { return GENERATORS.map(({ specs: _s, defaults: _d, ...g }) => g); },
        async generatorConfig(id) { return describe(GENERATORS, id); },
        async nodeConfig(id) {
            const { node } = find(id);
            if (!node.configId) throw new Error('This node has no filter or generator settings');
            return { configId: node.configId, values: clone(node.config ?? {}) };
        },
        async setNodeConfig(id, config) {
            const { node } = find(id);
            if (!node.configId) throw new Error('This node has no filter or generator settings');
            record('Change Filter Settings'); node.config = clone(config); changed(false);
        },
        ...extra.methods,
        // Krita's own actions and tools exist only in Krita's engine.
        async kritaActions() { return []; },
        async kritaTools() { return []; },
        async triggerKritaAction(name) { throw new Error(`"${name}" needs Krita's engine; the mock engine has no Krita actions`); },
        async setKritaTool(id) { throw new Error(`"${id}" needs Krita's engine; the mock engine has no Krita tools`); },
        kritaPointer() { /* nothing to drive */ },
    };
    return engine;
}
