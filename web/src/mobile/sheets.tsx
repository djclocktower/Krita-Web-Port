// The sheets of the phone and tablet interfaces: bottom sheets on a phone (drag handle, swipe down to close), side sheets on a tablet
// (can be pinned). One is open at a time; its content is only mounted while it is open, so closed panels cost nothing.
import { useEffect, useRef, useState } from 'preact/hooks';
import { fit, resetRotation, toggleMirror, zoomTo } from '../canvas/view';
import type { Engine } from '../engine/protocol';
import { usePanels } from '../krita/dockers';
import { krita } from '../krita/state';
import { allCommands, isEnabled } from '../shell/commands';
import { setSetting, useSetting, type UiModeSetting } from '../settings/store';
import { report } from '../shell/state';
import { store, useStore } from '../shell/store';
import { useToolItems, ToolGrid } from './tools';
import { urlMode, useUi } from './mode';

export type SheetId = 'menu' | 'color' | 'layers' | 'brushes' | 'options' | 'tools' | 'doc' | 'panels';
export const msheet = store({ open: null as SheetId | null, expanded: false });
/** Opens a sheet, or closes it if it is the one open. */
export const openSheet = (id: SheetId | null) => msheet.set({ open: msheet.get().open === id ? null : id, expanded: false });
export const closeSheet = () => msheet.set({ open: null, expanded: false });

const TITLES: Record<SheetId, string> = { menu: 'Menu', color: 'Colour', layers: 'Layers', brushes: 'Brushes', options: 'Tool options', tools: 'All tools', doc: 'Document and view', panels: 'Panels and dockers' };
const PANELS: Partial<Record<SheetId, string[]>> = { color: ['color', 'colorHistory', 'specificColor'], layers: ['layers'], brushes: ['presets', 'brushEditor'], options: ['toolOptions'] };

/** Tabs over some of the page's panels (and open Krita dockers), showing only the selected one. */
function PanelTabs({ engine, sheet }: { engine: Engine; sheet: SheetId }) {
    const all = usePanels();
    const ids = PANELS[sheet];
    const list = ids ? ids.map(id => all.find(p => p.id === id)).filter(<T,>(p: T | undefined): p is T => !!p) : all.filter(p => p.id !== 'toolbox');
    const [active, setActive] = useState<string>();
    const dockers = sheet === 'panels';
    const lastDocker = useRef(all.filter(p => p.close).length);
    useEffect(() => {   // a docker that was just opened is shown at once
        const open = all.filter(p => p.close);
        if (open.length > lastDocker.current) setActive(open[open.length - 1].id);
        lastDocker.current = open.length;
    }, [all.length]);
    const cur = list.find(p => p.id === active);
    const tabs = list.length > 1 || dockers;
    return (<>
        {tabs && (
            <div role="tablist" class="m-tabs" aria-label={`${TITLES[sheet]} tabs`}>
                {list.map(p => (
                    <span class="tab" key={p.id}>
                        <button role="tab" aria-selected={p.id === (cur ?? list[0])?.id} onClick={() => setActive(p.id)}>{p.title}</button>
                        {p.close && <button class="tab-close" aria-label={`Close ${p.title}`} onClick={() => p.close!(engine)}>✕</button>}
                    </span>
                ))}
                {dockers && <button role="tab" aria-selected={active === '#dockers'} onClick={() => setActive('#dockers')}>Krita dockers</button>}
            </div>
        )}
        <div class="m-sheet-body" role="tabpanel" aria-label={active === '#dockers' ? 'Krita dockers' : (cur ?? list[0])?.title ?? TITLES[sheet]}>
            {active === '#dockers' ? <DockerList engine={engine} />
                : (() => { const p = cur ?? list[0]; return p ? <p.component engine={engine} key={p.id} /> : <p class="hint">Nothing here.</p>; })()}
        </div>
    </>);
}

function DockerList({ engine }: { engine: Engine }) {
    const k = useStore(krita);
    if (!k.dockers.length) return <p class="hint">This engine has no Krita dockers.</p>;
    return (
        <ul class="m-list" aria-label="Krita dockers">
            {k.dockers.map(d => {
                const open = k.windows.some(w => w.kind === 'docker' && w.docker === d.id);
                return (
                    <li key={d.id}>
                        <button type="button" aria-pressed={open} data-docker={d.id}
                            onClick={() => { void engine.showKritaDocker(d.id, !open).catch(report); }}>{open ? '✓ ' : ''}{d.title}</button>
                    </li>
                );
            })}
        </ul>
    );
}

function ToolsSheet({ close }: { close: () => void }) {
    const items = useToolItems();
    return <div class="m-sheet-body"><ToolGrid items={items} onPick={close} /></div>;
}

/** File, view and interface settings that do not fit anywhere else. */
function DocSheet({ engine, run }: { engine: Engine; run: (id: string) => void }) {
    const mode = useSetting('uiMode'), gestures = useSetting('touchGestures');
    const cmd = (id: string, label: string) => {
        const c = allCommands.find(x => x.id === id);
        return <button type="button" disabled={!c || !isEnabled(c)} onClick={() => { closeSheet(); run(id); }}>{label}</button>;
    };
    return (
        <div class="m-sheet-body m-doc">
            <h3>File</h3>
            <div class="m-grid">{cmd('file.new', 'New')}{cmd('file.open', 'Open')}{cmd('file.saveKra', 'Save .kra')}{cmd('file.export', 'Export')}{cmd('file.openRecent', 'Recent')}</div>
            <h3>View</h3>
            <div class="m-grid">
                <button type="button" onClick={fit}>Fit</button><button type="button" onClick={() => zoomTo(1)}>100%</button>
                <button type="button" onClick={resetRotation}>Reset rotation</button><button type="button" onClick={toggleMirror}>Mirror</button>
            </div>
            <h3>Interface</h3>
            <label class="m-field">Layout
                <select value={mode} onChange={e => setSetting('uiMode', e.currentTarget.value as UiModeSetting)}>
                    <option value="auto">Automatic</option><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="phone">Phone</option>
                </select>
            </label>
            {urlMode() && <p class="hint">The address has ?ui={urlMode()}, which overrides this.</p>}
            <label class="check"><input type="checkbox" checked={gestures} onChange={e => setSetting('touchGestures', e.currentTarget.checked)} /> Two-finger tap undoes, three-finger tap redoes</label>
            <div class="m-grid">{cmd('settings.configure', 'Settings')}<button type="button" onClick={() => { closeSheet(); openSheet('panels'); }}>All panels</button></div>
        </div>
    );
}

function Content({ id, engine, run }: { id: SheetId; engine: Engine; run: (id: string) => void }) {
    if (id === 'tools') return <ToolsSheet close={closeSheet} />;
    if (id === 'doc') return <DocSheet engine={engine} run={run} />;
    return <PanelTabs engine={engine} sheet={id} key={id} />;
}

/** Phone: slides up over the lower part of the canvas. Drag the handle down to close (or collapse), up (or tap it) to expand. */
export function BottomSheet({ engine, run }: { engine: Engine; run: (id: string) => void }) {
    const { open, expanded } = useStore(msheet);
    const [dy, setDy] = useState(0);
    const from = useRef<number | null>(null);
    useUi();
    if (!open || open === 'menu') return null;
    const end = () => {
        const d = dy; from.current = null; setDy(0);
        if (d > 80) { if (expanded) msheet.set({ expanded: false }); else closeSheet(); }
        else if (d < -60) msheet.set({ expanded: true });
    };
    return (
        <section class={`m-sheet m-bottom${expanded ? ' expanded' : ''}`} role="dialog" aria-label={TITLES[open]} style={dy ? `transform: translateY(${Math.max(0, dy)}px); transition: none` : undefined}>
            <div class="m-sheet-head"
                onPointerDown={e => { if ((e.target as Element).closest('.m-close')) return; from.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
                onPointerMove={e => { if (from.current !== null) setDy(e.clientY - from.current); }}
                onPointerUp={end} onPointerCancel={() => { from.current = null; setDy(0); }}>
                <button type="button" class="m-handle" aria-label={expanded ? 'Shrink sheet' : 'Expand sheet'} aria-expanded={expanded}
                    onClick={() => { if (Math.abs(dy) < 4) msheet.set({ expanded: !expanded }); }}><i /></button>
                <h2>{TITLES[open]}</h2>
                <button type="button" class="m-close" aria-label="Close sheet" onClick={closeSheet}>✕</button>
            </div>
            <Content id={open} engine={engine} run={run} />
        </section>
    );
}

/** Tablet: a column beside the canvas. Pinned, it stays and the canvas gives way to it; otherwise it overlays the canvas. */
export function SideSheet({ engine, run, which }: { engine: Engine; run: (id: string) => void; which: 'pinned' | 'overlay' }) {
    const { open } = useStore(msheet);
    const pinned = useSetting('pinnedSheet') as SheetId | '';
    const show = (id: SheetId, isPinned: boolean) => (
        <section class={`m-sheet m-side${isPinned ? ' pinned' : ''}${id === 'tools' ? ' left' : ''}`} role="dialog" aria-label={TITLES[id]} key={`${id}${isPinned}`}>
            <div class="m-sheet-head">
                <h2>{TITLES[id]}</h2>
                <button type="button" class="m-pin" aria-pressed={isPinned} aria-label={isPinned ? `Unpin ${TITLES[id]}` : `Pin ${TITLES[id]}`}
                    onClick={() => { setSetting('pinnedSheet', isPinned ? '' : id); if (!isPinned) closeSheet(); }}>{isPinned ? '📌' : '📍'}</button>
                <button type="button" class="m-close" aria-label="Close sheet" onClick={() => { if (isPinned) setSetting('pinnedSheet', ''); else closeSheet(); }}>✕</button>
            </div>
            <Content id={id} engine={engine} run={run} />
        </section>
    );
    if (which === 'pinned') return pinned ? show(pinned, true) : null;
    return open && open !== 'menu' && open !== pinned ? show(open, false) : null;
}

