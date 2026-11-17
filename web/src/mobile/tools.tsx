// Tools for touch: a strip (phone) or rail (tablet) of the most used ones, and a list of every tool. The tools are Krita's own when the
// engine has them, the page's own otherwise; Pan and Zoom are always the page's.
import type { ComponentChildren } from 'preact';
import type { Engine } from '../engine/protocol';
import { kritaToolIcon } from '../krita/icons';
import { krita, kritaEngine } from '../krita/state';
import { app, report } from '../shell/state';
import { useStore } from '../shell/store';
import { setActiveTool, tools } from '../tools';
import { useActiveTool } from '../tools/shared';
import { openSheet } from './sheets';

export interface ToolItem { key: string; name: string; icon: ComponentChildren; active: boolean; pick(): void }

const letters = (name: string) => name.split(/[\s/&]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const glyph = (html: string) => <span class="m-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;

/** Every tool the engine offers, in the order of the desktop toolbox, then the page's Pan and Zoom. */
export function useToolItems(): ToolItem[] {
    const k = useStore(krita), page = useActiveTool();
    if (!k.tools.length) return tools.map(t => ({ key: t.id, name: t.title, icon: glyph(t.icon), active: t === page, pick: () => setActiveTool(t.id) }));
    const sections = [...new Set(k.tools.map(t => t.section))].sort();   // Krita's sections start with a rank
    const own = sections.flatMap(s => k.tools.filter(t => t.section === s)).map((t): ToolItem => {
        const icon = kritaToolIcon(t.id);
        return {
            key: t.id, name: t.name.split(':')[0], active: !k.page && k.active === t.id,
            icon: icon ? <span class="kicon" aria-hidden="true" style={`--kicon:url("${icon}")`} /> : <span class="letters" aria-hidden="true">{letters(t.name)}</span>,
            pick: () => { krita.set({ page: false, active: t.id }); kritaEngine()?.setKritaTool(t.id).catch(report); },
        };
    });
    const view = tools.filter(t => t.id === 'pan' || t.id === 'zoom').map((t): ToolItem => ({ key: t.id, name: t.title, icon: glyph(t.icon), active: k.page && t === page, pick: () => setActiveTool(t.id) }));
    return [...own, ...view];
}

/** The strip: which tool fills each slot depends on the engine (Krita's tool ids, or the page's own); a slot with no tool is left out. */
const SLOTS: { slot: string; krita?: RegExp; page?: string }[] = [
    { slot: 'brush', krita: /KisToolBrush$/, page: 'brush' },
    { slot: 'eraser' },
    { slot: 'fill', krita: /KisToolFill$/, page: 'fill' },
    { slot: 'select', krita: /KisToolSelectRectangular$/, page: 'selectRect' },
    { slot: 'transform', krita: /KisToolTransform$/ },
    { slot: 'move', krita: /KisToolMove$/ },
    { slot: 'picker', krita: /KisToolColorSampler$/ },
    { slot: 'text', krita: /SvgTextTool$/ },
    { slot: 'pan', page: 'pan' },
    { slot: 'zoom', page: 'zoom' },
];
const ERASER = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 16l9-9 6 6-6 6H8z"/><path d="M8 20h12"/></svg>';
const MORE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const OPTIONS = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>';

export function ToolButton({ item, onClick }: { item: ToolItem; onClick?: () => void }) {
    return (
        <button type="button" class="m-tool" data-tool={item.key} aria-label={item.name} title={item.name} aria-pressed={item.active}
            onClick={() => { item.pick(); onClick?.(); }}>{item.icon}</button>
    );
}

/** The most used tools, a scrolling row (or column, on a rail), with Tool options and More tools pinned at the end. */
export function ToolStrip({ engine }: { engine: Engine }) {
    const items = useToolItems(), { brush } = useStore(app);
    const quick = SLOTS.flatMap(s => {
        if (s.slot === 'eraser') return [<button type="button" class="m-tool" data-tool="eraser" aria-label="Eraser" title="Eraser (toggle)" aria-pressed={brush.eraser} key="eraser"
            onClick={() => void engine.setBrush({ eraser: !app.get().brush.eraser })}>{glyph(ERASER)}</button>];
        const it = items.find(i => (s.krita && krita.get().tools.length ? s.krita.test(i.key) : false) || i.key === s.page);
        return it ? [<ToolButton item={it} key={s.slot} />] : [];
    });
    return (
        <div class="m-strip" role="toolbar" aria-label="Tools">
            <div class="m-strip-scroll">{quick}</div>
            <div class="m-strip-end">
                <button type="button" class="m-tool" data-sheet="options" aria-label="Tool options" title="Tool options" onClick={() => openSheet('options')}>{glyph(OPTIONS)}</button>
                <button type="button" class="m-tool" data-sheet="tools" aria-label="More tools" title="More tools" onClick={() => openSheet('tools')}>{glyph(MORE)}</button>
            </div>
        </div>
    );
}

/** Every tool with its icon and name. */
export function ToolGrid({ items, onPick }: { items: ToolItem[]; onPick?: () => void }) {
    return (
        <ul class="m-toolgrid" aria-label="All tools">
            {items.map(it => (
                <li key={it.key}>
                    <button type="button" class="m-toolrow" data-tool={it.key} aria-pressed={it.active} onClick={() => { it.pick(); onPick?.(); }}>
                        {it.icon}<span>{it.name}</span>
                    </button>
                </li>
            ))}
        </ul>
    );
}
