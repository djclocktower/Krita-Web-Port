// Krita's real core (engine/bridge), loaded from /engine/ and driven through protocol.ts.
// Requests are JSON; bytes travel as files in the engine's virtual filesystem (requests) or as a
// view into its memory (replies and image updates).
import type { Engine, EngineEvents } from './protocol';

interface Module {
    _kw_request(id: number, seq: number): void;
    _kw_ack(): void;
    FS: { writeFile(path: string, data: Uint8Array | string): void; readFile(path: string): Uint8Array; mkdirTree(path: string): void };
    addRunDependency(id: string): void;
    removeRunDependency(id: string): void;
}
type Message = { id?: number | string; event?: string; result?: unknown; error?: string } & Record<string, unknown>;

// `?engineBase=/engine-dev/` loads a different build (used while the engine is being rebuilt).
const BASE = new URLSearchParams(location.search).get('engineBase') ?? new URL('engine/', document.baseURI).pathname.replace(/\/{2,}/g, '/');   // a doubled slash would read as another host

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error(`Could not load ${src}. Build the engine and link it into web/public/engine (see engine/README.md).`));
        document.head.append(el);
    });
}

export async function createWasmEngine(): Promise<Engine> {
    if (!crossOriginIsolated) throw new Error('The page is not cross-origin isolated, which the engine needs for threads.');
    // WebKitGTK/WPE report crossOriginIsolated but hide SharedArrayBuffer (a JSC option that is off there); the engine then dies in a worker with no message.
    if (typeof SharedArrayBuffer === 'undefined') throw new Error('This browser does not provide SharedArrayBuffer, which the engine needs for threads. Try a recent Chrome, Edge, Firefox or Safari.');
    // The engine is built with WebAssembly SIMD and has no fallback (func returning v128: i32.const 0, i8x16.splat, i8x16.popcnt).
    if (!WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])))
        throw new Error('This browser does not support WebAssembly SIMD, which the engine needs. Update the browser.');
    const handlers: { [K in keyof EngineEvents]?: Set<(...args: never[]) => void> } = {};
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; wantsBytes: boolean }>();
    let nextId = 1;
    let ready!: () => void;
    const whenReady = new Promise<void>(r => { ready = r; });
    const emit = (event: keyof EngineEvents, ...args: unknown[]) =>
        handlers[event]?.forEach(h => (h as (...a: unknown[]) => void)(...args));

    function onMessage(json: string, bytes: Uint8Array | null) {
        const msg = JSON.parse(json) as Message;
        if (msg.event === undefined) {      // a reply; events may carry an `id` field of their own (a node id)
            const call = pending.get(msg.id as number);
            pending.delete(msg.id as number);
            if (!call) return;
            if (msg.error !== undefined) call.reject(new Error(msg.error));
            // The view points into the engine's memory and is freed after this call: copy it.
            else call.resolve(call.wantsBytes ? new Uint8Array(bytes ?? []) : msg.result ?? undefined);
            return;
        }
        switch (msg.event) {
            case 'ready': console.info('engine start-up', JSON.stringify(msg.startup), `since page load: ${Math.round(performance.now())} ms`); ready(); break;
            // The engine sends the next update only after this acknowledgement (flow control).
            case 'imageUpdate': try { if (bytes) emit('imageUpdate', msg.rect, bytes); } finally { module._kw_ack(); } break;
            case 'documentChanged': emit('documentChanged', msg.info ?? null); break;
            case 'layersChanged': emit('layersChanged'); break;
            case 'activeNodeChanged': emit('activeNodeChanged', msg.id ?? null); break;
            case 'historyChanged': emit('historyChanged', msg.state); break;
            case 'brushChanged': emit('brushChanged', msg.state); break;
            case 'colorChanged': emit('colorChanged', msg.foreground, msg.background); break;
            case 'selectionChanged': emit('selectionChanged', msg.bounds ?? null); break;
            case 'animationChanged': emit('animationChanged', msg.state); break;
            case 'keyframesChanged': emit('keyframesChanged', msg.id); break;
            case 'kritaToolChanged': emit('kritaToolChanged', msg.id); break;
            case 'kritaOverlay': emit('kritaOverlay', msg.rect, bytes ?? null); break;
            case 'kritaWindow': emit('kritaWindow', msg.window); break;
            case 'kritaWindowPaint': if (bytes) emit('kritaWindowPaint', msg.id, msg.width, msg.height, bytes); break;
            case 'kritaWindowClosed': emit('kritaWindowClosed', msg.id); break;
            case 'kritaMessage': emit('kritaMessage', msg.text); break;
            case 'kritaCursor': emit('kritaCursor', msg.cursor); break;
            case 'error': console.error(`Engine error in ${String(msg.method)}: ${String(msg.message)}`); break;
        }
    }

    const t0 = performance.now();
    await loadScript(`${BASE}kritaengine.js`);
    const entry = (window as unknown as { kritaengine_entry: (config: object) => Promise<Module> }).kritaengine_entry;
    // Krita's resource database takes ~40 s to build from the default bundle. engine/make-resource-cache.mjs
    // builds it once; here it is put in place before the engine starts. Without it the engine still
    // works, it just builds the database itself.
    const config = {} as Module & Record<string, unknown>;
    const restoreResourceCache = () => {
        config.addRunDependency('resource-cache');
        (async () => {
            const manifest = await fetch(`${BASE}resource-cache/manifest.json`).then(r => (r.ok ? r.json() : null), () => null) as
                { dir: string; files: string[]; copies: { from: string; name: string }[] } | null;
            if (manifest) {
                config.FS.mkdirTree(manifest.dir);
                for (const copy of manifest.copies) {
                    // The engine's bundled files are unpacked asynchronously and may not be there yet.
                    for (let tries = 0; ; tries++) {
                        try {
                            const to = `${manifest.dir}/${copy.name}`;
                            config.FS.mkdirTree(to.slice(0, to.lastIndexOf('/')));
                            config.FS.writeFile(to, config.FS.readFile(copy.from));
                            break;
                        }
                        catch (e) { if (tries > 1500) throw e; await new Promise(r => setTimeout(r, 20)); }
                    }
                }
                await Promise.all(manifest.files.map(async name => {
                    const data = await fetch(`${BASE}resource-cache/${name}`).then(r => r.arrayBuffer());
                    config.FS.writeFile(`${manifest.dir}/${name}`, new Uint8Array(data));
                }));
            }
        })().catch(e => console.warn('Could not restore the resource cache', e)).finally(() => config.removeRunDependency('resource-cache'));
    };
    const module: Module = await entry(Object.assign(config, {
        preRun: [restoreResourceCache],
        locateFile: (file: string) => BASE + file,
        kwOnMessage: onMessage,
        print: (text: string) => console.debug(text),
        printErr: (text: string) => console.debug(text),
    }));
    console.info(`engine module instantiated after ${Math.round(performance.now() - t0)} ms`);
    await whenReady;

    // Requests go through the engine's virtual filesystem: /tmp/kw-<seq>.json, plus /tmp/kw-<seq>.bin for bytes.
    let seq = 0;
    const send = (id: number, method: string, params: object, bytes?: Uint8Array) => {
        seq++;
        if (bytes) {
            module.FS.writeFile(`/tmp/kw-${seq}.bin`, bytes);
            params = { ...params, __file: `/tmp/kw-${seq}.bin` };
        }
        module.FS.writeFile(`/tmp/kw-${seq}.json`, JSON.stringify({ method, params }));
        module._kw_request(id, seq);
    };
    const call = <T>(method: string, params: object = {}, options: { bytes?: Uint8Array; wantsBytes?: boolean } = {}) =>
        new Promise<T>((resolve, reject) => {
            const id = nextId++;
            pending.set(id, { resolve: resolve as (v: unknown) => void, reject, wantsBytes: Boolean(options.wantsBytes) });
            send(id, method, params, options.bytes);
        });
    const bytes = (method: string, params: object) => call<Uint8Array>(method, params, { wantsBytes: true });
    // For engine spikes and debugging in the dev server: call a bridge method that is not in the contract yet.
    if (import.meta.env.DEV) (window as unknown as { __engineCall: typeof call }).__engineCall = call;
    const fire = (method: string, params: object) => send(0, method, params);

    return {
        on(event, handler) {
            (handlers[event] ??= new Set()).add(handler as never);
            return () => { handlers[event]!.delete(handler as never); };
        },
        newDocument: options => call('newDocument', options),
        openDocument: (fileName, data) => call('openDocument', { fileName }, { bytes: data }),
        exportDocument: format => bytes('exportDocument', { format }),
        documentInfo: () => call('documentInfo'),
        refresh: () => call('refresh'),

        layers: () => call('layers'),
        addNode: options => call('addNode', options),
        removeNode: id => call('removeNode', { id }),
        duplicateNode: id => call('duplicateNode', { id }),
        moveNode: (id, target) => call('moveNode', { id, ...target }),
        mergeDown: id => call('mergeDown', { id }),
        setNodeProperties: (id, props) => call('setNodeProperties', { id, props }),
        setActiveNode: id => call('setActiveNode', { id }),
        activeNode: () => call('activeNode'),
        nodeThumbnail: (id, size) => bytes('nodeThumbnail', { id, size }),
        blendModes: () => call('blendModes'),

        beginStroke: first => fire('beginStroke', { first }),
        continueStroke: points => fire('continueStroke', { points }),
        endStroke: () => fire('endStroke', {}),
        setColors: colors => call('setColors', colors),
        setBrush: state => call('setBrush', { state }),
        brushState: () => call('brushState'),
        colors: () => call('colors'),
        undo: () => call('undo'),
        redo: () => call('redo'),

        presets: filter => call('presets', filter ?? {}),
        presetTags: () => call('presetTags'),
        presetThumbnail: id => bytes('presetThumbnail', { id }),
        selectPreset: id => call('selectPreset', { id }),
        presetSettings: () => call('presetSettings'),
        setPresetSetting: (key, value) => call('setPresetSetting', { key, value }),
        importResource: (fileName, data) => call('importResource', { fileName }, { bytes: data }),

        filters: () => call('filters'),
        filterConfig: id => call('filterConfig', { id }),
        applyFilter: (nodeId, filterId, config) => call('applyFilter', { nodeId, filterId, config }),
        previewFilter: (nodeId, filterId, config) => call('previewFilter', { nodeId, filterId, config: config ?? {} }),
        generators: () => call('generators'),
        generatorConfig: id => call('generatorConfig', { id }),
        nodeConfig: id => call('nodeConfig', { id }),
        setNodeConfig: (id, config) => call('setNodeConfig', { id, config }),

        selectAll: () => call('selectAll'),
        deselect: () => call('deselect'),
        invertSelection: () => call('invertSelection'),
        selectRect: (rect, mode) => call('selectRect', { rect, mode }),
        selectEllipse: (rect, mode) => call('selectEllipse', { rect, mode }),
        selectPolygon: (points, mode) => call('selectPolygon', { points, mode }),
        selectSimilar: (at, options, mode) => call('selectSimilar', { at, options, mode }),
        selectionOutline: () => call('selectionOutline'),

        floodFill: (at, source, options) => call('floodFill', { at, source, options }),
        fillSelection: source => call('fillSelection', { source }),
        clearSelection: () => call('clearSelection'),
        drawGradient: (from, to, options) => call('drawGradient', { from, to, options }),

        scaleImage: options => call('scaleImage', options),
        resizeCanvas: options => call('resizeCanvas', options),
        cropImage: rect => call('cropImage', { rect }),
        rotateImage: degrees => call('rotateImage', { degrees }),
        mirrorImage: axis => call('mirrorImage', { axis }),
        flattenImage: () => call('flattenImage'),

        colorSpaces: () => call('colorSpaces'),
        convertColorSpace: options => call('convertColorSpace', options),

        animation: () => call('animation'),
        setAnimation: state => call('setAnimation', { state }),
        keyframes: id => call('keyframes', { id }),
        addKeyframe: (id, time, options) => call('addKeyframe', { id, time, ...options }),
        removeKeyframe: (id, time) => call('removeKeyframe', { id, time }),
        moveKeyframe: (id, from, to) => call('moveKeyframe', { id, from, to }),
        setOnionSkin: (id, enabled) => call('setOnionSkin', { id, enabled }),

        kritaActions: () => call('krita.actions'),
        triggerKritaAction: name => call('krita.trigger', { name }),
        kritaTools: () => call('krita.tools'),
        setKritaTool: id => call('krita.tool', { id }),
        kritaPointer: event => fire('krita.pointer', event),
        kritaKey: event => fire('krita.key', event),
        kritaViewport: viewport => fire('krita.viewport', viewport),
        kritaWindows: () => call('krita.windows'),
        kritaDockers: () => call('krita.dockers'),
        showKritaDocker: (id, visible) => call('krita.showDocker', { id, visible }),
        kritaWindowInput: (id, event) => fire('krita.windowInput', { id, ...event }),
        closeKritaWindow: id => call('krita.closeWindow', { id }),
        resizeKritaWindow: (id, width, height) => call('krita.resizeWindow', { id, width, height }),
    };
}
