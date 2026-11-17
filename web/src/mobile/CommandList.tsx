// Menus for touch: one searchable list of Krita's menu tree (the page's commands and Krita's actions, with nested submenus; with Krita's
// engine also every other Krita action in a search). On a phone it fills the screen; on a tablet it is a large card.
// Without a search the entries are grouped by menu and submenu.
import { useRef, useState } from 'preact/hooks';
import type { Engine, KritaAction } from '../engine/protocol';
import type { Command } from '../panels';
import { leaves, menuData, clean, type Entry } from '../krita/menus';
import { effective } from '../settings/shortcuts';
import { useSetting } from '../settings/store';
import { isEnabled } from '../shell/commands';
import { menuTitle, pick, Tree, useMenus } from '../shell/menus';
import { report } from '../shell/state';
import { useStore } from '../shell/store';
import { closeSheet } from './sheets';

const MAX = 200;   // ponytail: a search lists at most this many matches; type more to narrow

export function CommandList({ engine, run }: { engine: Engine; run: (c: Command) => void }) {
    const menus = useMenus();
    const { actions } = useStore(menuData);
    const shortcuts = useSetting('shortcuts');
    const [q, setQ] = useState('');
    const [group, setGroup] = useState('');
    const input = useRef<HTMLInputElement>(null);
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (s: string) => words.every(w => s.toLowerCase().includes(w));
    const all = menus.flatMap(m => leaves(m.items, [m.name]));
    const text = (e: Entry & { kind: 'cmd' | 'action' }) => e.kind === 'cmd' ? menuTitle(e.cmd) : e.label;
    const found = words.length ? all.filter(l => match(`${l.path} ${text(l.entry)}`)).slice(0, MAX) : [];
    const inTree = new Set(all.flatMap(l => l.entry.kind === 'action' ? [l.entry.name] : []));
    const foundActions = words.length ? actions.filter(a => !inTree.has(a.name) && match(`${clean(a.text)} ${a.name}`)).slice(0, MAX) : [];
    const choose = (e: Entry & { kind: 'cmd' | 'action' }) => { closeSheet(); pick(e, run); };
    const top = group.split('>')[0];
    return (
        <div class="m-menu-wrap" onPointerDown={e => { if (e.target === e.currentTarget) closeSheet(); }}>
            <nav class="m-menu" aria-label="Main menu" role="dialog">
                <div class="m-menu-head">
                    <input ref={input} type="search" aria-label="Search commands" placeholder="Search commands and Krita actions…" value={q} onInput={e => setQ(e.currentTarget.value)} />
                    <button type="button" class="m-close" aria-label="Close menu" onClick={closeSheet}>✕</button>
                </div>
                <div class="m-menu-list" role="menu">
                    {words.length === 0 && menus.map(m => (
                        <div key={m.name}>
                            <button class="group" aria-expanded={top === m.name} onClick={() => setGroup(top === m.name ? '' : m.name)}>{m.name}<span aria-hidden="true">{top === m.name ? '▾' : '▸'}</span></button>
                            {top === m.name && <Tree items={m.items} k={m.name} open={group} setOpen={setGroup} choose={choose} shortcuts={shortcuts} />}
                        </div>
                    ))}
                    {words.length > 0 && <>
                        {found.map(({ entry: e, path }) => {
                            const keys = e.kind === 'cmd' ? effective(e.cmd, shortcuts) : e.shortcut, off = e.kind === 'cmd' ? !isEnabled(e.cmd) : !e.enabled;
                            return (
                                <button class="item" key={`${path}/${e.kind === 'cmd' ? e.cmd.id : e.name}`} role="menuitem" disabled={off} data-action={e.kind === 'action' ? e.name : undefined} onClick={() => choose(e)}>
                                    <span>{text(e)}<small> · {path}</small></span>{keys && <kbd>{keys}</kbd>}
                                </button>
                            );
                        })}
                        {foundActions.length > 0 && <div class="hint-row">Krita actions</div>}
                        {foundActions.map((a: KritaAction) => (
                            <button class="item" role="menuitem" key={a.name} data-action={a.name} disabled={!a.enabled}
                                onClick={() => { closeSheet(); engine.triggerKritaAction(a.name).catch(report); }}>
                                <span>{clean(a.text)}</span>{a.shortcut && <kbd>{a.shortcut}</kbd>}
                            </button>
                        ))}
                        {!found.length && !foundActions.length && <p class="hint">Nothing matches “{q}”.</p>}
                    </>}
                </div>
            </nav>
        </div>
    );
}
