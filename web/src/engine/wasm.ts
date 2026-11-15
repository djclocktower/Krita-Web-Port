// Krita's real core (engine/bridge), loaded from /engine/ and driven through protocol.ts.
// Requests are JSON; bytes travel as files in the engine's virtual filesystem (requests) or as a
// view into its memory (replies and image updates).
import type { Engine, EngineEvents } from './protocol';

interface Module {
    _kw_request(id: number, seq: number): void;
    _kw_ack(): void;
    FS: { writeFile(path: string, data: Uint8Array | string): void };
}
type Message = { id?: number; event?: string; result?: unknown; error?: string } & Record<string, unknown>;

const BASE = '/engine/';

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
    const handlers: { [K in keyof EngineEvents]?: Set<(...args: never[]) => void> } = {};
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; wantsBytes: boolean }>();
    let nextId = 1;
    let ready!: () => void;
    const whenReady = new Promise<void>(r => { ready = r; });
    const emit = (event: keyof EngineEvents, ...args: unknown[]) =>
        handlers[event]?.forEach(h => (h as (...a: unknown[]) => void)(...args));

    function onMessage(json: string, bytes: Uint8Array | null) {
        const msg = JSON.parse(json) as Message;
        if (msg.id !== undefined) {
            const call = pending.get(msg.id);
            pending.delete(msg.id);
            if (!call) return;
            if (msg.error !== undefined) call.reject(new Error(msg.error));
            // The view points into the engine's memory and is freed after this call: copy it.
            else call.resolve(call.wantsBytes ? new Uint8Array(bytes ?? []) : msg.result ?? undefined);
            return;
        }
        switch (msg.event) {
            case 'ready': ready(); break;
            // The engine sends the next update only after this acknowledgement (flow control).
            case 'imageUpdate': try { if (bytes) emit('imageUpdate', msg.rect, bytes); } finally { module._kw_ack(); } break;
            case 'documentChanged': emit('documentChanged', msg.info ?? null); break;
            case 'layersChanged': emit('layersChanged'); break;
            case 'activeNodeChanged': emit('activeNodeChanged', msg.id ?? null); break;
            case 'historyChanged': emit('historyChanged', msg.state); break;
            case 'brushChanged': emit('brushChanged', msg.state); break;
            case 'colorChanged': emit('colorChanged', msg.foreground, msg.background); break;
            case 'error': console.error(`Engine error in ${String(msg.method)}: ${String(msg.message)}`); break;
        }
    }

    await loadScript(`${BASE}kritaengine.js`);
    const entry = (window as unknown as { kritaengine_entry: (config: object) => Promise<Module> }).kritaengine_entry;
    const module: Module = await entry({
        locateFile: (file: string) => BASE + file,
        kwOnMessage: onMessage,
        print: (text: string) => console.debug(text),
        printErr: (text: string) => console.debug(text),
    });
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
    };
}
