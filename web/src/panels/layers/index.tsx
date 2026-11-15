import { useEffect, useRef, useState } from 'preact/hooks';
import type { BlendMode, DocumentInfo, Engine, LayerNode, NodeId, NodeType } from '../../engine/protocol';
import type { Command, Panel } from '../../panels';
import { reportError } from '../../shell/errors';
import { openFilterDialog } from '../filters/FilterDialog';
import { activeNode } from './active';
import { BlendSelect } from './BlendSelect';
import { PropertiesDialog } from './PropertiesDialog';
import { canDrop, count, drop, find, flatten, isMask, moveBy, type Pos } from './tree';
import './layers.css';

const TYPES: { type: NodeType; label: string; abbr: string }[] = [
    { type: 'paint', label: 'Paint Layer', abbr: 'Pt' }, { type: 'group', label: 'Group Layer', abbr: 'Gp' },
    { type: 'filter', label: 'Filter Layer', abbr: 'Fx' }, { type: 'fill', label: 'Fill Layer', abbr: 'Fl' },
    { type: 'clone', label: 'Clone Layer', abbr: 'Cl' }, { type: 'file', label: 'File Layer', abbr: 'Fe' },
    { type: 'vector', label: 'Vector Layer', abbr: 'Vc' },
    { type: 'transparencyMask', label: 'Transparency Mask', abbr: 'Tm' }, { type: 'filterMask', label: 'Filter Mask', abbr: 'Fm' },
    { type: 'colorizeMask', label: 'Colorize Mask', abbr: 'Cm' }, { type: 'transformMask', label: 'Transform Mask', abbr: 'Xm' },
    { type: 'selectionMask', label: 'Selection Mask', abbr: 'Sm' },
];
const info = (type: NodeType) => TYPES.find(t => t.type === type)!;

// Errors go to the mounted panel; if it is not mounted (a menu command ran first) fall back to the shell's banner.
let showError: (message: string) => void = reportError;
let openProperties: ((id: NodeId) => void) | null = null;
async function act(fn: () => Promise<unknown> | undefined) {
    try { await fn(); } catch (e) { showError(e instanceof Error ? e.message : String(e)); }
}

async function add(engine: Engine, type: NodeType) {
    const tree = await engine.layers(), id = await activeNode(engine), at = id ? find(tree, id) : null;
    let place: { parent?: NodeId; above?: NodeId } = {};
    if (at) {
        if (type.endsWith('Mask')) { const layer = isMask(at.node) ? at.parent : at.node; if (layer) place = { parent: layer.id }; }
        else place = { above: isMask(at.node) && at.parent ? at.parent.id : at.node.id };
    }
    let choice = {};
    if (type === 'filter' || type === 'fill' || type === 'filterMask') {
        const picked = await openFilterDialog(engine, type);
        if (!picked) return;
        choice = picked;
    }
    await engine.addNode({ type, name: `${info(type).label} ${count(tree, type) + 1}`, ...place, ...choice });
}

const remove = async (engine: Engine) => { const id = await activeNode(engine); if (id) await engine.removeNode(id); };
const duplicate = async (engine: Engine) => { const id = await activeNode(engine); if (id) await engine.duplicateNode(id); };
const mergeDown = async (engine: Engine) => { const id = await activeNode(engine); if (id) await engine.mergeDown(id); };

const commands: Command[] = [
    { id: 'layer.newPaint', title: 'New Paint Layer', menu: 'Layer', shortcut: 'Insert', run: e => act(() => add(e, 'paint')) },
    { id: 'layer.newGroup', title: 'New Group Layer', menu: 'Layer', run: e => act(() => add(e, 'group')) },
    { id: 'layer.duplicate', title: 'Duplicate Layer or Mask', menu: 'Layer', shortcut: 'Ctrl+J', run: e => act(() => duplicate(e)) },
    { id: 'layer.mergeDown', title: 'Merge with Layer Below', menu: 'Layer', shortcut: 'Ctrl+E', run: e => act(() => mergeDown(e)) },
    { id: 'layer.remove', title: 'Remove Layer', menu: 'Layer', shortcut: 'Shift+Delete', run: e => act(() => remove(e)) },
    { id: 'layer.properties', title: 'Layer Properties…', menu: 'Layer', shortcut: 'F3',
      run: e => act(async () => { const id = await activeNode(e); if (id) openProperties?.(id); }) },
];

function Eye() { return <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1 8c2-3.500 4.500-5 7-5s5 1.500 7 5c-2 3.500-4.500 5-7 5S3 11.500 1 8z" fill="none" stroke="currentColor" stroke-width="1.500" /><circle cx="8" cy="8" r="2.200" fill="currentColor" /></svg>; }
function Lock() { return <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="7" width="10" height="7" fill="currentColor" /><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.500" /></svg>; }

function Toggle({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: preact.ComponentChildren }) {
    return <button type="button" class="lyr-toggle" aria-pressed={on} aria-label={label} title={label}
                   onClick={e => { e.stopPropagation(); onClick(); }}>{children}</button>;
}

function Rename({ name, onDone }: { name: string; onDone: (value: string | null) => void }) {
    const input = useRef<HTMLInputElement>(null), done = useRef(false);
    useEffect(() => { input.current!.focus(); input.current!.select(); }, []);
    const finish = (v: string | null) => { if (!done.current) { done.current = true; onDone(v); } };
    return <input ref={input} class="lyr-rename" aria-label="Layer name" defaultValue={name}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => { if (e.key === 'Enter') finish(e.currentTarget.value); else if (e.key === 'Escape') finish(null); e.stopPropagation(); }}
                  onBlur={e => finish(e.currentTarget.value)} />;
}

function Layers({ engine }: { engine: Engine }) {
    const [doc, setDoc] = useState<DocumentInfo | null | undefined>(undefined);
    const [tree, setTree] = useState<LayerNode[]>([]);
    const [active, setActive] = useState<NodeId | null>(null);
    const [modes, setModes] = useState<BlendMode[]>([]);
    const [error, setError] = useState('');
    const [thumbs, setThumbs] = useState<Record<NodeId, string>>({});
    const [editing, setEditing] = useState<NodeId | null>(null);
    const [props, setProps] = useState<NodeId | null>(null);
    const [menu, setMenu] = useState(false);
    const [drag, setDrag] = useState<{ id: NodeId; target?: NodeId; pos?: Pos } | null>(null);
    const [opacity, setOpacity] = useState<number | null>(null);   // slider value while dragging
    const treeRef = useRef<HTMLDivElement>(null), live = useRef({ tree, thumbs, drag });
    live.current = { tree, thumbs, drag };

    const rows = flatten(tree);
    const current = active ? find(tree, active)?.node : undefined;
    const run = (fn: () => Promise<unknown> | undefined) => { setError(''); return act(fn); };

    useEffect(() => {
        showError = setError;
        openProperties = setProps;
        let token = 0, throttle = 0, gone = false;
        const adopt = () => void activeNode(engine).then(id => { if (!gone) setActive(a => a ?? id); });
        adopt();   // also starts remembering the active node for commands; a panel that mounts late has seen no event

        const loadThumbs = async () => {
            const mine = ++token, shown = flatten(live.current.tree);
            const next: Record<NodeId, string> = {};
            await Promise.all(shown.map(async ({ node }) => {
                try { next[node.id] = URL.createObjectURL(new Blob([await engine.nodeThumbnail(node.id, 32) as Uint8Array<ArrayBuffer>], { type: 'image/png' })); }
                catch { /* a node without a thumbnail just shows none */ }
            }));
            if (mine !== token || gone) { Object.values(next).forEach(URL.revokeObjectURL); return; }
            const old = live.current.thumbs;
            setThumbs(next);
            Object.values(old).forEach(URL.revokeObjectURL);
        };
        const reload = async () => {
            try {
                const t = await engine.layers();
                live.current.tree = t; setTree(t);
                void loadThumbs();
            } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        };
        const start = async () => {
            const d = await engine.documentInfo();
            setDoc(d);
            if (d) { await reload(); adopt(); } else { setTree([]); setActive(null); }
        };
        void start(); engine.blendModes().then(setModes, e => setError(String(e?.message ?? e)));
        const off = [
            engine.on('documentChanged', d => { setDoc(d); if (!d) { setTree([]); setActive(null); } }),
            engine.on('layersChanged', () => void reload()),
            engine.on('activeNodeChanged', setActive),
            // Thumbnails are expensive; refresh at most every 400 ms, after the last change.
            engine.on('imageUpdate', () => { if (!throttle) throttle = window.setTimeout(() => { throttle = 0; void loadThumbs(); }, 400); }),
        ];
        return () => {
            gone = true; clearTimeout(throttle); off.forEach(f => f());
            Object.values(live.current.thumbs).forEach(URL.revokeObjectURL);
            showError = reportError; openProperties = null;
        };
    }, [engine]);

    const select = (id: NodeId) => run(() => engine.setActiveNode(id));
    const finishRename = (node: LayerNode, value: string | null) => {
        setEditing(null); treeRef.current?.focus();
        if (value && value.trim() && value !== node.name) void run(() => engine.setNodeProperties(node.id, { name: value }));
    };

    const onTreeKey = (e: KeyboardEvent) => {
        if (e.target !== e.currentTarget || !current) return;
        const i = rows.findIndex(r => r.node.id === current.id), row = rows[i];
        let handled = true;
        if (e.ctrlKey && e.key === 'PageUp') void run(() => moveBy(engine, tree, current.id, -1));
        else if (e.ctrlKey && e.key === 'PageDown') void run(() => moveBy(engine, tree, current.id, 1));
        else if (e.ctrlKey || e.altKey || e.metaKey) handled = false;
        else if (e.key === 'ArrowUp') { if (rows[i - 1]) void select(rows[i - 1].node.id); }
        else if (e.key === 'ArrowDown') { if (rows[i + 1]) void select(rows[i + 1].node.id); }
        else if (e.key === 'ArrowLeft' && row.node.children.length && !row.node.collapsed) void run(() => engine.setNodeProperties(current.id, { collapsed: true }));
        else if (e.key === 'ArrowRight' && row.node.children.length && row.node.collapsed) void run(() => engine.setNodeProperties(current.id, { collapsed: false }));
        else if (e.key === 'F2') setEditing(current.id);
        else if (e.key === 'Enter') setProps(current.id);
        else if (e.key === 'Delete' && !e.shiftKey) void run(() => engine.removeNode(current.id));
        else handled = false;
        if (handled) e.preventDefault();
    };

    // Pointer-event drag (works for mouse, touch and pen) started from a row's grip.
    const dragMove = (e: PointerEvent) => {
        const d = live.current.drag;
        if (!d) return;
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-row]');
        const dragged = find(tree, d.id)?.node, target = el && find(tree, el.dataset.row!)?.node;
        let next: { target?: NodeId; pos?: Pos } = {};
        if (el && dragged && target) {
            const r = el.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
            const pos: Pos = y < 0.25 ? 'above' : y > 0.75 ? 'below' : canDrop(dragged, target, 'inside') ? 'inside' : y < 0.5 ? 'above' : 'below';
            if (canDrop(dragged, target, pos)) next = { target: target.id, pos };
        }
        if (next.target !== d.target || next.pos !== d.pos) setDrag({ id: d.id, ...next });
    };
    const dragEnd = (e: PointerEvent, cancelled: boolean) => {
        const d = live.current.drag;
        live.current.drag = null; setDrag(null);
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
        if (d?.target && d.pos && !cancelled) void run(() => drop(engine, tree, d.id, d.target!, d.pos!));
    };

    const needsNode = !current;
    const propsNode = props ? find(tree, props)?.node : undefined;

    if (doc === undefined) return <div class="lyr" />;
    if (!doc) return <div class="lyr"><button type="button" class="lyr-new"
        onClick={() => run(() => engine.newDocument({ width: 640, height: 480 }))}>New document</button>{error && <p class="lyr-error" role="alert">{error}</p>}</div>;

    return (
        <div class="lyr">
            <div class="lyr-head">
                <BlendSelect label="Blend mode" modes={modes} value={current?.blendMode ?? 'normal'} disabled={needsNode}
                             onChange={blendMode => run(() => engine.setNodeProperties(current!.id, { blendMode }))} />
                <label class="lyr-opacity">Opacity
                    <input type="range" min="0" max="100" disabled={needsNode} value={opacity ?? Math.round((current?.opacity ?? 1) * 100)}
                           onInput={e => setOpacity(e.currentTarget.valueAsNumber)}
                           onChange={e => { setOpacity(null); void run(() => engine.setNodeProperties(current!.id, { opacity: e.currentTarget.valueAsNumber / 100 })); }} />
                    <output>{opacity ?? Math.round((current?.opacity ?? 1) * 100)}%</output>
                </label>
            </div>

            <div ref={treeRef} class="lyr-tree" role="tree" aria-label="Layers" tabIndex={0}
                 aria-activedescendant={current ? `lyr-${current.id}` : undefined} onKeyDown={onTreeKey}>
                {rows.map(({ node, depth }) => {
                    const dropClass = drag?.target === node.id ? ` drop-${drag.pos}` : '';
                    return (
                        <div key={node.id} id={`lyr-${node.id}`} role="treeitem" data-row={node.id} data-type={node.type}
                             aria-level={depth + 1} aria-selected={node.id === active}
                             aria-expanded={node.children.length ? !node.collapsed : undefined}
                             class={`lyr-row${node.id === active ? ' active' : ''}${isMask(node) ? ' mask' : ''}${drag?.id === node.id ? ' dragging' : ''}${dropClass}`}
                             style={{ paddingLeft: 4 + depth * 14 }}
                             onClick={() => { treeRef.current?.focus(); void select(node.id); }}>
                            <span class="lyr-grip" aria-hidden="true"
                                  onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); live.current.drag = { id: node.id }; setDrag({ id: node.id }); }}
                                  onPointerMove={dragMove} onPointerUp={e => dragEnd(e, false)} onPointerCancel={e => dragEnd(e, true)}>⋮⋮</span>
                            {node.children.length > 0
                                ? <button type="button" class="lyr-expander" aria-label={node.collapsed ? 'Expand' : 'Collapse'}
                                          onClick={e => { e.stopPropagation(); void run(() => engine.setNodeProperties(node.id, { collapsed: !node.collapsed })); }}>{node.collapsed ? '▸' : '▾'}</button>
                                : <span class="lyr-expander" />}
                            {thumbs[node.id] ? <img class="lyr-thumb" src={thumbs[node.id]} alt="" width="32" height="32" /> : <span class="lyr-thumb" />}
                            <span class="lyr-type" title={info(node.type).label} aria-label={info(node.type).label} role="img">{info(node.type).abbr}</span>
                            {editing === node.id
                                ? <Rename name={node.name} onDone={v => finishRename(node, v)} />
                                : <span class="lyr-name" onDblClick={() => setEditing(node.id)}>{node.name}</span>}
                            <Toggle on={node.visible} label="Visible" onClick={() => run(() => engine.setNodeProperties(node.id, { visible: !node.visible }))}><Eye /></Toggle>
                            <Toggle on={node.locked} label="Locked" onClick={() => run(() => engine.setNodeProperties(node.id, { locked: !node.locked }))}><Lock /></Toggle>
                            {node.type === 'paint' && <Toggle on={node.alphaLocked} label="Alpha locked" onClick={() => run(() => engine.setNodeProperties(node.id, { alphaLocked: !node.alphaLocked }))}>α</Toggle>}
                        </div>
                    );
                })}
            </div>

            {error && <p class="lyr-error" role="alert"><span>{error}</span> <button type="button" onClick={() => setError('')}>Dismiss</button></p>}

            <div class="lyr-bar">
                <button type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>Add</button>
                <button type="button" disabled={needsNode} onClick={() => run(() => engine.duplicateNode(current!.id))}>Duplicate</button>
                <button type="button" disabled={needsNode} onClick={() => run(() => moveBy(engine, tree, current!.id, -1))}>Move up</button>
                <button type="button" disabled={needsNode} onClick={() => run(() => moveBy(engine, tree, current!.id, 1))}>Move down</button>
                <button type="button" disabled={needsNode} onClick={() => run(() => engine.mergeDown(current!.id))}>Merge down</button>
                <button type="button" disabled={needsNode} onClick={() => run(() => engine.removeNode(current!.id))}>Delete</button>
                <button type="button" disabled={needsNode} onClick={() => setProps(current!.id)}>Properties…</button>
            </div>
            {menu && (
                <div class="lyr-menu" role="menu" onKeyDown={e => { if (e.key === 'Escape') setMenu(false); }}>
                    {TYPES.map(t => <button type="button" role="menuitem" key={t.type}
                                            onClick={() => { setMenu(false); void run(() => add(engine, t.type)); }}>{t.label}</button>)}
                </div>
            )}
            {propsNode && <PropertiesDialog key={propsNode.id} engine={engine} node={propsNode} modes={modes} onClose={() => { setProps(null); treeRef.current?.focus(); }} />}
        </div>
    );
}

const panel: Panel = { id: 'layers', title: 'Layers', area: 'right', order: -100, component: Layers, commands };
export default panel;
