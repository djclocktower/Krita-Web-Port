// The phone and tablet interfaces. The canvas fills the screen; a top bar, a tool strip (phone) or rails (tablet) and sheets sit around it.
// Everything the desktop has stays reachable: menus through the searchable command list, panels and Krita dockers through sheets.
import type { ComponentChildren } from 'preact';
import { Canvas } from '../canvas/Canvas';
import type { Engine } from '../engine/protocol';
import { hex } from '../panels/color/hsv';
import type { Command } from '../panels';
import { allCommands, isEnabled } from '../shell/commands';
import { app, report } from '../shell/state';
import { useStore } from '../shell/store';
import { CommandList } from './CommandList';
import { EdgeSliders, FloatControls, Loupe } from './controls';
import { useUi } from './mode';
import { BottomSheet, msheet, openSheet, SideSheet, type SheetId } from './sheets';
import { ToolStrip } from './tools';
import './mobile.css';

const ICONS = {
    menu: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/></svg>',
    layers: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    brushes: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4c-6 1-9 5-10 9l2 2c4-1 8-4 8-11z"/><path d="M9 14c-3 0-4 2-4 4-1 1-2 1-2 2 3 1 8 1 8-4"/></svg>',
    more: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    panels: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg>',
};
const icon = (k: keyof typeof ICONS) => <span class="m-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[k] }} />;

/** Undo, Redo and the document title: shared by the phone's and the tablet's top bar. */
function SheetButton({ id, label, children }: { id: SheetId; label: string; children: ComponentChildren }) {
    const open = useStore(msheet).open === id;
    return <button type="button" class={`m-btn m-open-${id}`} aria-label={label} title={label} aria-expanded={open} aria-pressed={open} onClick={() => openSheet(id)}>{children}</button>;
}

function TopBar({ engine, mode }: { engine: Engine; mode: 'phone' | 'tablet' }) {
    const { doc, history, fg } = useStore(app);
    return (
        <header class="m-top">
            <SheetButton id="menu" label="Menu">{icon('menu')}</SheetButton>
            <button type="button" class="m-btn m-undo" aria-label="Undo" title="Undo" disabled={!history.canUndo} onClick={() => void engine.undo().catch(report)}>{icon('undo')}</button>
            <button type="button" class="m-btn m-redo" aria-label="Redo" title="Redo" disabled={!history.canRedo} onClick={() => void engine.redo().catch(report)}>{icon('redo')}</button>
            <span class="doc-title">{doc ? `${doc.name}${doc.modified ? '*' : ''}` : ''}</span>
            {mode === 'phone' && <>
                <SheetButton id="brushes" label="Brushes">{icon('brushes')}</SheetButton>
                <SheetButton id="layers" label="Layers">{icon('layers')}</SheetButton>
                <SheetButton id="color" label="Colour"><span class="m-swatch" style={`background:${hex(fg)}`} /></SheetButton>
            </>}
            <SheetButton id="doc" label="Document and view menu">{icon('more')}</SheetButton>
        </header>
    );
}

/** Tablet: Colour, Layers, Brushes, Tool options and all other panels open as side sheets from this rail. */
function RightRail() {
    const { fg } = useStore(app);
    return (
        <nav class="m-rail m-rail-right" aria-label="Panels">
            <SheetButton id="color" label="Colour"><span class="m-swatch" style={`background:${hex(fg)}`} /></SheetButton>
            <SheetButton id="layers" label="Layers">{icon('layers')}</SheetButton>
            <SheetButton id="brushes" label="Brushes">{icon('brushes')}</SheetButton>
            <SheetButton id="options" label="Tool options">{icon('panels')}</SheetButton>
            <SheetButton id="panels" label="Panels and dockers">{icon('more')}</SheetButton>
        </nav>
    );
}

export function MobileShell({ engine, run, mode }: { engine: Engine; run: (c: Command) => void; mode: 'phone' | 'tablet' }) {
    const { landscape } = useUi();
    const { open } = useStore(msheet);
    const runId = (id: string) => { const c = allCommands.find(x => x.id === id); if (c && isEnabled(c)) run(c); };
    return (
        <div class={`m-root m-${mode} ${landscape ? 'm-landscape' : 'm-portrait'}`}>
            <TopBar engine={engine} mode={mode} />
            <div class="m-body">
                <div class="m-stage">
                    <Canvas engine={engine} />
                    <EdgeSliders engine={engine} />
                    <FloatControls engine={engine} />
                    {mode === 'phone' ? <BottomSheet engine={engine} run={runId} /> : <SideSheet engine={engine} run={runId} which="overlay" />}
                </div>
                <ToolStrip engine={engine} />
                {mode === 'tablet' && <SideSheet engine={engine} run={runId} which="pinned" />}
                {mode === 'tablet' && <RightRail />}
            </div>
            {open === 'menu' && <CommandList engine={engine} run={run} />}
            <Loupe />
        </div>
    );
}
