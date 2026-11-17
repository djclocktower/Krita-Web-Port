// The mock's selections, fills, image operations and animation. As crude as the rest of the mock:
// hard-edged selections, nearest-neighbour scaling, rotation in 90-degree steps only, and the
// selection outline is traced along pixel edges. protocol.ts is the contract, not this file.
import type {
    AnimationState, Color, ColorSpaceInfo, DocumentInfo, Engine, EngineEvents, FillOptions, GradientOptions, NodeId, Point, Rect,
    SelectionMode,
} from './protocol';
import type { MockNode, Pixels } from './mock';

interface Context {
    doc(): DocumentInfo;
    record(text: string): void;
    changed(layers?: boolean): void;
    emit<K extends keyof EngineEvents>(event: K, ...args: Parameters<EngineEvents[K]>): void;
    find(id: NodeId): { node: MockNode };
    walk(nodes: MockNode[]): Generator<[MockNode, MockNode | null]>;
    tree(): MockNode[];
    setTree(tree: MockNode[]): void;
    activeId(): NodeId | null;
    colors(): { foreground: Color; background: Color };
    composite(nodes: MockNode[], out: Pixels, w: number, h: number): void;
}
type Frames = Map<number, Pixels>;
type ExtraMethods = Pick<Engine,
    'selectAll' | 'deselect' | 'invertSelection' | 'selectRect' | 'selectEllipse' | 'selectPolygon' | 'selectSimilar' | 'selectionOutline'
    | 'floodFill' | 'fillSelection' | 'clearSelection' | 'drawGradient'
    | 'scaleImage' | 'resizeCanvas' | 'cropImage' | 'rotateImage' | 'mirrorImage' | 'flattenImage'
    | 'colorSpaces' | 'convertColorSpace'
    | 'animation' | 'setAnimation' | 'keyframes' | 'addKeyframe' | 'removeKeyframe' | 'moveKeyframe' | 'setOnionSkin'>;

const COLOR_SPACES: ColorSpaceInfo[] = [
    { model: 'RGBA', modelName: 'RGB/Alpha', depth: 'U8', depthName: '8-bit integer/channel', profiles: ['sRGB-elle-V2-srgbtrc.icc'] },
    { model: 'RGBA', modelName: 'RGB/Alpha', depth: 'U16', depthName: '16-bit integer/channel', profiles: ['sRGB-elle-V2-srgbtrc.icc', 'Rec2020-elle-V4-g10.icc'] },
    { model: 'RGBA', modelName: 'RGB/Alpha', depth: 'F32', depthName: '32-bit float/channel', profiles: ['sRGB-elle-V2-g10.icc'] },
    { model: 'GRAYA', modelName: 'Grayscale/Alpha', depth: 'U8', depthName: '8-bit integer/channel', profiles: ['Gray-D50-elle-V2-srgbtrc.icc'] },
    { model: 'CMYKA', modelName: 'CMYK/Alpha', depth: 'U8', depthName: '8-bit integer/channel', profiles: ['Chemical proof'] },
];

export function createMockExtra(ctx: Context) {
    let selection: Uint8Array | null = null;        // one byte per pixel, 0 or 1
    let anim: AnimationState = { framesPerSecond: 24, startTime: 0, endTime: 100, currentTime: 0 };
    let frames = new Map<NodeId, Frames>();
    const onion = new Set<NodeId>();

    const size = () => { const { width, height } = ctx.doc(); return [width, height] as const; };
    const bounds = (): Rect | null => {
        if (!selection) return null;
        const [w, h] = size();
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (selection[y * w + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    };
    const setSelection = (next: Uint8Array | null, text: string) => {
        ctx.record(text);
        selection = next && next.some(Boolean) ? next : null;
        ctx.emit('selectionChanged', bounds());
    };
    const combine = (shape: (x: number, y: number) => boolean, mode: SelectionMode, text: string) => {
        const [w, h] = size(), next = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const a = selection ? selection[y * w + x] === 1 : false, b = shape(x, y);
            next[y * w + x] = (mode === 'replace' ? b : mode === 'add' ? a || b : mode === 'subtract' ? a && !b : a && b) ? 1 : 0;
        }
        setSelection(next, text);
    };
    const target = (): Pixels => {
        const id = ctx.activeId(), node = id ? ctx.find(id).node : null;
        if (!node?.pixels) throw new Error('The active layer has no pixels');
        if (node.locked) throw new Error('The active layer is locked');
        return node.pixels;
    };
    const rgba = (c: Color) => [c.r * 255, c.g * 255, c.b * 255, c.a * 255];
    /** Connected (or all) pixels within `threshold` of the pixel at `at`. */
    const similar = (px: Pixels, at: Point, { threshold = 20, contiguous = true }: FillOptions) => {
        const [w, h] = size(), x0 = Math.floor(at.x), y0 = Math.floor(at.y), out = new Uint8Array(w * h);
        if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return out;
        const ref = px.slice((y0 * w + x0) * 4, (y0 * w + x0) * 4 + 4);
        const near = (i: number) => Math.max(Math.abs(px[i * 4] - ref[0]), Math.abs(px[i * 4 + 1] - ref[1]), Math.abs(px[i * 4 + 2] - ref[2]), Math.abs(px[i * 4 + 3] - ref[3])) <= threshold;
        if (!contiguous) { for (let i = 0; i < w * h; i++) out[i] = near(i) ? 1 : 0; return out; }
        const stack = [y0 * w + x0];
        while (stack.length) {
            const i = stack.pop()!;
            if (out[i] || !near(i)) continue;
            out[i] = 1;
            const x = i % w;
            if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1);
            if (i >= w) stack.push(i - w); if (i < w * (h - 1)) stack.push(i + w);
        }
        return out;
    };
    const source = (px: Pixels, options: FillOptions) => {
        if (!options.sampleMerged) return px;
        const [w, h] = size(), out = new Uint8ClampedArray(w * h * 4);
        ctx.composite(ctx.tree(), out, w, h);
        return out;
    };
    /** Rebuilds every pixel buffer for a new canvas size. `map` gives the source pixel for a destination pixel, or -1. */
    const remap = (text: string, nw: number, nh: number, map: (x: number, y: number) => number) => {
        if (!(nw > 0 && nh > 0 && nw * nh <= 64e6)) throw new Error('Invalid image size');
        ctx.record(text);
        const redo = (px: Pixels) => {
            const out = new Uint8ClampedArray(nw * nh * 4);
            for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
                const s = map(x, y);
                if (s >= 0) out.set(px.subarray(s * 4, s * 4 + 4), (y * nw + x) * 4);
            }
            return out;
        };
        for (const [node] of ctx.walk(ctx.tree())) if (node.pixels) node.pixels = redo(node.pixels);
        for (const f of frames.values()) for (const [t, px] of f) f.set(t, redo(px));
        selection = null;
        const info = ctx.doc();
        info.width = nw; info.height = nh;
        ctx.emit('documentChanged', structuredClone(info)); ctx.emit('selectionChanged', null); ctx.changed();
        return structuredClone(info);
    };
    /** Shows, on every animated node, the frame that is visible at the current time. */
    const showFrames = () => {
        for (const [id, f] of frames) {
            const times = [...f.keys()].filter(t => t <= anim.currentTime).sort((a, b) => a - b);
            const { node } = ctx.find(id), [w, h] = size();
            node.pixels = times.length ? f.get(times.at(-1)!)! : new Uint8ClampedArray(w * h * 4);
        }
    };
    const framesOf = (id: NodeId) => {
        const { node } = ctx.find(id);
        if (!node.pixels) throw new Error('Only layers with pixels can be animated');
        let f = frames.get(id);
        if (!f) { f = new Map([[0, node.pixels]]); frames.set(id, f); }   // the existing content becomes frame 0
        return f;
    };
    const time = (t: number) => { if (!Number.isInteger(t) || t < 0) throw new Error('Frame numbers are whole numbers from 0'); return t; };

    const methods: ExtraMethods = {
        async selectAll() { combine(() => true, 'replace', 'Select All'); },
        async deselect() { setSelection(null, 'Deselect'); },
        async invertSelection() { const had = selection; combine((x, y) => !(had && had[y * size()[0] + x]), 'replace', 'Invert Selection'); },
        async selectRect(r, mode) { combine((x, y) => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height, mode, 'Select Rectangle'); },
        async selectEllipse(r, mode) {
            const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
            combine((x, y) => ((x + 0.5 - cx) / (r.width / 2)) ** 2 + ((y + 0.5 - cy) / (r.height / 2)) ** 2 <= 1, mode, 'Select Ellipse');
        },
        async selectPolygon(points, mode) {
            if (points.length < 3) throw new Error('A polygon needs at least three points');
            combine((x, y) => {
                let inside = false;
                for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                    const a = points[i], b = points[j];
                    if ((a.y > y + 0.5) !== (b.y > y + 0.5) && x + 0.5 < ((b.x - a.x) * (y + 0.5 - a.y)) / (b.y - a.y) + a.x) inside = !inside;
                }
                return inside;
            }, mode, 'Select Polygon');
        },
        async selectSimilar(at, options, mode) {
            const hit = similar(source(target(), options), at, options), w = size()[0];
            combine((x, y) => hit[y * w + x] === 1, mode, 'Select Similar');
        },
        async selectionOutline() {
            // One closed square per boundary pixel edge run would be huge; trace horizontal runs of each row's edges instead.
            if (!selection) return [];
            const [w, h] = size(), on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && selection![y * w + x] === 1;
            const lines: number[][] = [];
            for (let y = 0; y <= h; y++) for (let x = 0; x < w; x++) {
                if (on(x, y) === on(x, y - 1)) continue;
                const x0 = x;
                while (x < w && on(x, y) !== on(x, y - 1)) x++;
                lines.push([x0, y, x, y]);
            }
            for (let x = 0; x <= w; x++) for (let y = 0; y < h; y++) {
                if (on(x, y) === on(x - 1, y)) continue;
                const y0 = y;
                while (y < h && on(x, y) !== on(x - 1, y)) y++;
                lines.push([x, y0, x, y]);
            }
            return lines;
        },

        async floodFill(at, which, options) {
            const px = target(), hit = similar(source(px, options), at, options), c = rgba(ctx.colors()[which]);
            ctx.record('Fill');
            for (let i = 0; i < hit.length; i++) if (hit[i] && (!selection || selection[i])) px.set(c, i * 4);
            ctx.changed(false);
        },
        async fillSelection(which) {
            const px = target(), c = rgba(ctx.colors()[which]);
            ctx.record('Fill');
            for (let i = 0; i < px.length / 4; i++) if (!selection || selection[i]) px.set(c, i * 4);
            ctx.changed(false);
        },
        async clearSelection() {
            const px = target();
            ctx.record('Clear');
            for (let i = 0; i < px.length / 4; i++) if (!selection || selection[i]) px.set([0, 0, 0, 0], i * 4);
            ctx.changed(false);
        },
        async drawGradient(from, to, options: GradientOptions) {
            const px = target(), [w, h] = size(), { foreground, background } = ctx.colors();
            const a = rgba(options.reverse ? background : foreground), b = rgba(options.reverse ? foreground : background);
            const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
            ctx.record('Gradient');
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (selection && !selection[i]) continue;
                let t = options.shape === 'radial' ? Math.hypot(x - from.x, y - from.y) / len : ((x - from.x) * dx + (y - from.y) * dy) / (len * len);
                if (options.shape === 'bilinear') t = Math.abs(t);
                if (options.repeat === 'forwards') t = ((t % 1) + 1) % 1;
                else if (options.repeat === 'alternating') { t = ((t % 2) + 2) % 2; if (t > 1) t = 2 - t; }
                t = Math.min(1, Math.max(0, t));
                px.set(a.map((v, k) => v + (b[k] - v) * t), i * 4);
            }
            ctx.changed(false);
        },

        async scaleImage({ width, height }) {
            const [w, h] = size();
            return remap('Scale Image', Math.round(width), Math.round(height), (x, y) => Math.min(h - 1, Math.floor(y * h / height)) * w + Math.min(w - 1, Math.floor(x * w / width)));
        },
        async resizeCanvas({ width, height, offsetX, offsetY }) {
            const [w, h] = size();
            return remap('Resize Canvas', Math.round(width), Math.round(height), (x, y) => {
                const sx = x - Math.round(offsetX), sy = y - Math.round(offsetY);
                return sx >= 0 && sy >= 0 && sx < w && sy < h ? sy * w + sx : -1;
            });
        },
        async cropImage(r) {
            const [w, h] = size();
            if (!(r.width >= 1 && r.height >= 1)) throw new Error('The crop area is empty');
            return remap('Crop Image', Math.round(r.width), Math.round(r.height), (x, y) => {
                const sx = x + Math.round(r.x), sy = y + Math.round(r.y);
                return sx >= 0 && sy >= 0 && sx < w && sy < h ? sy * w + sx : -1;
            });
        },
        async rotateImage(degrees) {
            const [w, h] = size(), turns = ((Math.round(degrees / 90) % 4) + 4) % 4;
            if (Math.abs(degrees / 90 - Math.round(degrees / 90)) > 1e-9) throw new Error('The mock engine only rotates in 90-degree steps');
            if (turns === 0) return structuredClone(ctx.doc());
            if (turns === 2) return remap('Rotate Image', w, h, (x, y) => (h - 1 - y) * w + (w - 1 - x));
            return turns === 1 ? remap('Rotate Image', h, w, (x, y) => (h - 1 - x) * w + y) : remap('Rotate Image', h, w, (x, y) => x * w + (w - 1 - y));
        },
        async mirrorImage(axis) {
            const [w, h] = size();
            remap('Mirror Image', w, h, (x, y) => (axis === 'horizontal' ? y * w + (w - 1 - x) : (h - 1 - y) * w + x));
        },
        async flattenImage() {
            const [w, h] = size(), out = new Uint8ClampedArray(w * h * 4);
            ctx.composite(ctx.tree(), out, w, h);
            ctx.record('Flatten Image');
            const bottom = [...ctx.walk(ctx.tree())].map(([n]) => n).filter(n => n.type === 'paint').at(-1);
            if (!bottom) throw new Error('There is no paint layer to flatten into');
            bottom.pixels = out; bottom.opacity = 1; bottom.visible = true; bottom.blendMode = 'normal'; bottom.name = 'Flattened';
            frames = new Map();
            ctx.setTree([bottom]);
            ctx.changed();
        },

        async colorSpaces() { return structuredClone(COLOR_SPACES); },
        async convertColorSpace({ model, depth, profile }) {
            const cs = COLOR_SPACES.find(c => c.model === model && c.depth === depth);
            if (!cs) throw new Error(`Unsupported colour space: ${model} ${depth}`);
            if (profile && !cs.profiles.includes(profile)) throw new Error(`Profile ${profile} does not fit ${model} ${depth}`);
            ctx.record('Convert Image Color Space');
            const info = ctx.doc();          // the mock keeps its pixels as they are; only the description changes
            info.colorModel = model; info.colorDepth = depth; info.profile = profile ?? cs.profiles[0];
            ctx.emit('documentChanged', structuredClone(info));
            return structuredClone(info);
        },

        async animation() { return { ...anim }; },
        async setAnimation(state) {
            const next = { ...anim, ...state };
            if (!(next.framesPerSecond >= 1 && next.framesPerSecond <= 240)) throw new Error('Frame rate must be between 1 and 240');
            if (!(time(next.startTime) <= time(next.endTime))) throw new Error('The range must start before it ends');
            time(next.currentTime);
            anim = next;
            showFrames();
            ctx.emit('animationChanged', { ...anim }); ctx.changed(false);
        },
        async keyframes(id) { ctx.find(id); return [...(frames.get(id)?.keys() ?? [])].sort((a, b) => a - b); },
        async addKeyframe(id, t, options) {
            const f = framesOf(id), [w, h] = size();
            if (f.has(time(t))) throw new Error(`There is already a keyframe at frame ${t}`);
            ctx.record('Add Keyframe');
            const before = [...f.keys()].filter(k => k < t).sort((a, b) => a - b).at(-1);
            f.set(t, options?.copy && before !== undefined ? f.get(before)!.slice() : new Uint8ClampedArray(w * h * 4));
            showFrames(); ctx.emit('keyframesChanged', id); ctx.changed(false);
        },
        async removeKeyframe(id, t) {
            const f = framesOf(id);
            if (!f.has(t)) throw new Error(`There is no keyframe at frame ${t}`);
            ctx.record('Remove Keyframe');
            f.delete(t);
            showFrames(); ctx.emit('keyframesChanged', id); ctx.changed(false);
        },
        async moveKeyframe(id, from, to) {
            const f = framesOf(id);
            if (!f.has(from)) throw new Error(`There is no keyframe at frame ${from}`);
            if (from === time(to)) return;
            if (f.has(to)) throw new Error(`There is already a keyframe at frame ${to}`);
            ctx.record('Move Keyframe');
            f.set(to, f.get(from)!); f.delete(from);
            showFrames(); ctx.emit('keyframesChanged', id); ctx.changed(false);
        },
        async setOnionSkin(id, enabled) { ctx.find(id); if (enabled) onion.add(id); else onion.delete(id); },
    };

    return {
        methods,
        /** 1 if the pixel may be painted (nothing selected, or inside the selection), else 0. */
        selected: (x: number, y: number) => (!selection || selection[y * ctx.doc().width + x] ? 1 : 0),
        reset() { selection = null; frames = new Map(); onion.clear(); anim = { framesPerSecond: 24, startTime: 0, endTime: 100, currentTime: 0 }; },
        // Undo snapshots. Frames share pixel buffers with the tree by reference until edited, so keep times only
        // and let the restored tree's pixels stand for the current frame (ponytail: undo across frame edits is approximate in the mock).
        save: (): unknown => ({ selection: selection?.slice() ?? null, anim: { ...anim }, frames: new Map([...frames].map(([id, f]) => [id, new Map(f)])) }),
        restore(state: unknown) {
            const s = state as { selection: Uint8Array | null; anim: AnimationState; frames: Map<NodeId, Frames> };
            selection = s.selection; anim = s.anim; frames = s.frames;
            ctx.emit('selectionChanged', bounds()); ctx.emit('animationChanged', { ...anim });
        },
    };
}

// ---- A fake of Krita's own tools, windows and actions, only with ?kritaMock=1 (the real ones need Krita's engine).
// It exists so the interface and its tests can see the traffic: tools that draw squares, an option window that
// paints a recognisable picture, an action that opens a modal dialog (with a pop-up), an overlay after each pointer event.
import type { KritaAction, KritaDocker, KritaPointer, KritaTool, KritaViewport, KritaWindow, KritaWindowInput } from './protocol';

type KritaMethods = Pick<Engine, 'kritaActions' | 'triggerKritaAction' | 'kritaTools' | 'setKritaTool' | 'kritaPointer' | 'kritaKey' | 'kritaViewport'
    | 'kritaWindows' | 'kritaDockers' | 'showKritaDocker' | 'kritaWindowInput' | 'closeKritaWindow' | 'resizeKritaWindow'>;
export interface KritaLog { pointers: KritaPointer[]; keys: unknown[]; viewports: KritaViewport[]; windowInputs: (KritaWindowInput & { id: number })[]; tools: string[]; actions: string[]; resizes: [number, number, number][]; dockers: [string, boolean][] }

const MOCK_TOOLS: Omit<KritaTool, 'active'>[] = [
    { id: 'KritaShape/KisToolBrush', name: 'Freehand Brush Tool', section: 'Freehand', shortcut: 'B' },
    { id: 'KisToolSelectRectangular', name: 'Rectangular Selection Tool', section: 'Select', shortcut: 'Ctrl+R' },
    { id: 'KisToolTransform', name: 'Transform Tool', section: 'Transform', shortcut: 'Ctrl+T' },
    { id: 'KritaShape/KisToolLine', name: 'Line Tool', section: 'Shape', shortcut: '' },
    { id: 'PanTool', name: 'Pan Tool', section: 'Navigation', shortcut: '' },
    { id: 'ZoomTool', name: 'Zoom Tool', section: 'Navigation', shortcut: '' },
];
const MOCK_ACTIONS: KritaAction[] = [
    { name: 'mock_open_dialog', text: 'Open &Mock Dialog…', shortcut: '', enabled: true, checkable: false, checked: false },
    { name: 'mock_disabled', text: 'Disabled Thing', shortcut: 'Ctrl+D', enabled: false, checkable: false, checked: false },
    { name: 'mock_message', text: 'Show Mock Message', shortcut: '', enabled: true, checkable: false, checked: false },
    { name: 'mock_fill_layer', text: 'Fill Layer Red', shortcut: '', enabled: true, checkable: false, checked: false },
];
const DIALOG = 2, POPUP = 3, OPTIONS = 1;
const MOCK_DOCKERS = [{ id: 'mockPalette', title: 'Mock Palette', win: 10, tint: '#225577' }, { id: 'mockHistogram', title: 'Mock Histogram', win: 11, tint: '#557722' }];
const TINT = ['#334455', '#553344', '#445533', '#554433', '#335544', '#443355'];

export function createMockKrita(ctx: Context): { methods: KritaMethods; log: KritaLog } {
    const log: KritaLog = { pointers: [], keys: [], viewports: [], windowInputs: [], tools: [], actions: [], resizes: [], dockers: [] };
    let active = MOCK_TOOLS[0].id, viewport: KritaViewport | null = null, checked = false, start: { x: number; y: number } | null = null;
    const windows = new Map<number, KritaWindow>();
    const later = (f: () => void) => { setTimeout(f, 0); };

    const picture = (id: number) => {
        const w = windows.get(id);
        if (!w) return;
        const px = new Uint8Array(w.width * w.height * 4);
        const hex = (s: string) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
        const fill = (x0: number, y0: number, x1: number, y1: number, c: number[]) => {
            for (let y = Math.max(0, y0); y < Math.min(w.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w.width, x1); x++) px.set([...c, 255], (y * w.width + x) * 4);
        };
        if (id === OPTIONS) {
            fill(0, 0, w.width, w.height, hex(TINT[MOCK_TOOLS.findIndex(t => t.id === active)]));   // the colour says which tool
            fill(10, 10, 30, 30, checked ? [0, 255, 0] : [255, 0, 0]);                              // a checkbox: click it
            fill(w.width - 4, 0, w.width, w.height, [255, 255, 255]);                              // a bar at the right edge: shows the size
        } else if (id === DIALOG) {
            fill(0, 0, w.width, w.height, hex('#2244aa'));
            fill(20, 60, 100, 100, [255, 255, 0]);     // opens the pop-up
            fill(120, 60, 180, 100, [0, 255, 0]);      // OK
        } else if (w.kind === 'docker') {
            fill(0, 0, w.width, w.height, hex(MOCK_DOCKERS.find(d => d.win === id)!.tint));
            fill(w.width - 4, 0, w.width, w.height, [255, 255, 255]);        // right edge: the width
            fill(0, w.height - 4, w.width, w.height, [255, 255, 255]);      // bottom edge: the height
        } else fill(0, 0, w.width, w.height, hex('#ff8800'));
        ctx.emit('kritaWindowPaint', id, w.width, w.height, px);
    };
    const open = (w: KritaWindow) => { windows.set(w.id, w); ctx.emit('kritaWindow', w); later(() => picture(w.id)); };
    const close = (id: number) => {
        if (!windows.delete(id)) return;
        ctx.emit('kritaWindowClosed', id);
        if (id === DIALOG) close(POPUP);
    };
    const options = (): KritaWindow => windows.get(OPTIONS) ?? { id: OPTIONS, title: 'Tool Options', kind: 'toolOptions', modal: false, x: 0, y: 0, width: 240, height: 200 };

    // A 9x9 magenta square at the pointer.
    const overlay = (x: number, y: number) => {
        const z = viewport?.zoom ?? 1, cx = Math.round(x * z + (viewport?.offsetX ?? 0)), cy = Math.round(y * z + (viewport?.offsetY ?? 0));   // ponytail: ignores rotation and mirror
        const px = new Uint8Array(9 * 9 * 4);
        for (let i = 0; i < 81; i++) px.set([255, 0, 255, 255], i * 4);
        ctx.emit('kritaOverlay', { x: cx - 4, y: cy - 4, width: 9, height: 9 }, px);
    };
    const target = () => { const id = ctx.activeId(); return id ? ctx.find(id).node.pixels : undefined; };
    const dab = (x: number, y: number) => {
        const px = target(), { width, height } = ctx.doc(), c = ctx.colors().foreground;
        if (!px) return;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
            const X = Math.floor(x) + i, Y = Math.floor(y) + j;
            if (X >= 0 && Y >= 0 && X < width && Y < height) px.set([c.r * 255, c.g * 255, c.b * 255, 255], (Y * width + X) * 4);
        }
    };

    const methods: KritaMethods = {
        async kritaActions() { return MOCK_ACTIONS.map(a => ({ ...a })); },
        async triggerKritaAction(name) {
            log.actions.push(name);
            if (name === 'mock_open_dialog') open({ id: DIALOG, title: 'Mock Dialog', kind: 'dialog', modal: true, x: 100, y: 100, width: 200, height: 120 });
            else if (name === 'mock_message') { ctx.emit('kritaMessage', 'Zoom: 150%'); ctx.emit('kritaMessage', 'Hello from Krita'); }
            else if (name === 'mock_fill_layer') {
                const px = target(), { width, height } = ctx.doc();
                if (px) { ctx.record('Fill Layer Red'); for (let i = 0; i < width * height; i++) px.set([255, 0, 0, 255], i * 4); ctx.changed(false); }
            } else throw new Error(`"${name}" is not enabled`);
        },
        async kritaTools() { return MOCK_TOOLS.map(t => ({ ...t, active: t.id === active })); },
        async setKritaTool(id) {
            if (!MOCK_TOOLS.some(t => t.id === id)) throw new Error(`Unknown Krita tool: ${id}`);
            log.tools.push(id); active = id; start = null;
            ctx.emit('kritaToolChanged', id); ctx.emit('kritaOverlay', { x: 0, y: 0, width: 0, height: 0 }, null);
            ctx.emit('kritaCursor', id.endsWith('Brush') ? 'crosshair' : 'cell');
            later(() => picture(OPTIONS));
        },
        kritaPointer(e) {
            log.pointers.push(e);
            const brush = active.endsWith('KisToolBrush'), line = active.endsWith('KisToolLine');
            if (e.type === 'press') { start = { x: e.x, y: e.y }; if (brush) { ctx.record('Krita Brush'); dab(e.x, e.y); ctx.changed(false); } }
            else if (e.type === 'move' && e.down && brush) { dab(e.x, e.y); ctx.changed(false); }
            else if (e.type === 'release' && line && start) {
                ctx.record('Krita Line');
                const n = Math.ceil(Math.hypot(e.x - start.x, e.y - start.y));
                for (let i = 0; i <= n; i++) dab(start.x + (e.x - start.x) * i / (n || 1), start.y + (e.y - start.y) * i / (n || 1));
                ctx.changed(false);
            }
            if (e.type === 'release') start = null;
            overlay(e.x, e.y);
        },
        kritaKey(e) { log.keys.push(e); },
        kritaViewport(v) { log.viewports.push(v); viewport = v; },
        async kritaWindows() { open(options()); return [...windows.values()]; },
        kritaWindowInput(id, e) {
            log.windowInputs.push({ id, ...e });
            if (id === OPTIONS && e.type === 'press' && (e.x ?? 99) < 40 && (e.y ?? 99) < 40) { checked = !checked; picture(OPTIONS); }
            else if (id === DIALOG && e.type === 'press') {
                if ((e.y ?? 0) >= 60 && (e.y ?? 0) < 100 && (e.x ?? 0) >= 20 && (e.x ?? 0) < 100) { const d = windows.get(DIALOG)!; open({ id: POPUP, title: '', kind: 'popup', modal: false, parent: DIALOG, x: d.x + 20, y: d.y + 100, width: 80, height: 60 }); }
                else if ((e.x ?? 0) >= 120 && (e.y ?? 0) >= 60) close(DIALOG);
            } else if (e.type === 'keydown' && e.key === 'Escape' && (id === POPUP || id === DIALOG)) close(id);
        },
        async kritaDockers(): Promise<KritaDocker[]> { return MOCK_DOCKERS.map(d => ({ id: d.id, title: d.title, visible: windows.has(d.win) })); },
        async showKritaDocker(id, visible) {
            const d = MOCK_DOCKERS.find(x => x.id === id);
            if (!d) throw new Error(`Unknown Krita docker: ${id}`);
            log.dockers.push([id, visible]);
            if (!visible) close(d.win);
            else if (!windows.has(d.win)) open({ id: d.win, title: d.title, kind: 'docker', docker: id, modal: false, x: 0, y: 0, width: 200, height: 150 });
        },
        async closeKritaWindow(id) { if (id !== OPTIONS) close(id); },
        async resizeKritaWindow(id, width, height) {
            log.resizes.push([id, width, height]);
            const w = windows.get(id); if (!w) return;
            windows.set(id, { ...w, width, height }); ctx.emit('kritaWindow', windows.get(id)!); later(() => picture(id));
        },
    };
    return { methods, log };
}
