// Menus for touch: one searchable list of every command (and, with Krita's engine, every Krita action). On a phone it fills the
// screen; on a tablet it is a large card. Without a search the commands are grouped by menu.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Engine, KritaAction } from '../engine/protocol';
import type { Command } from '../panels';
import { krita } from '../krita/state';
import { effective } from '../settings/shortcuts';
import { useSetting } from '../settings/store';
import { isEnabled, menuCommands } from '../shell/commands';
import { app, report } from '../shell/state';
import { useStore } from '../shell/store';
import { closeSheet } from './sheets';

const MENUS = ['File', 'Edit', 'View', 'Image', 'Layer', 'Select', 'Filter', 'Tools', 'Settings'] as const;
const label = (a: KritaAction) => a.text.replace(/&(?!&)/g, '');   // ponytail: "&&" (a literal ampersand) stays doubled
const MAX = 200;   // ponytail: a search lists at most this many matches; type more to narrow

function title(c: Command) {
    const { history } = app.get();
    return c.id === 'edit.undo' && history.undoText ? `Undo ${history.undoText}` : c.id === 'edit.redo' && history.redoText ? `Redo ${history.redoText}` : c.title;
}

export function CommandList({ engine, run }: { engine: Engine; run: (c: Command) => void }) {
    useStore(app); useStore(krita);   // what is enabled, and the Krita dockers, change
    const shortcuts = useSetting('shortcuts'); useSetting('workspaces');
    const [q, setQ] = useState('');
    const [group, setGroup] = useState<string | null>(null);
    const [actions, setActions] = useState<KritaAction[]>([]);
    const input = useRef<HTMLInputElement>(null);
    const kritaOn = krita.get().tools.length > 0;
    useEffect(() => { if (kritaOn) engine.kritaActions().then(setActions, () => {}); }, [engine, kritaOn]);
    const commands = menuCommands();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (s: string) => words.every(w => s.toLowerCase().includes(w));
    const found = words.length ? commands.filter(c => match(`${c.menu} ${c.title}`)) : [];
    const foundActions = words.length ? actions.filter(a => match(`${label(a)} ${a.name}`)).slice(0, MAX) : [];
    const go = (c: Command) => { closeSheet(); run(c); };
    const item = (c: Command, showMenu: boolean) => (
        <button class="item" key={c.id} role="menuitem" disabled={!isEnabled(c)} onClick={() => go(c)}>
            <span>{title(c)}{showMenu && <small> · {c.menu}</small>}</span>{effective(c, shortcuts) && <kbd>{effective(c, shortcuts)}</kbd>}
        </button>
    );
    return (
        <div class="m-menu-wrap" onPointerDown={e => { if (e.target === e.currentTarget) closeSheet(); }}>
            <nav class="m-menu" aria-label="Main menu" role="dialog">
                <div class="m-menu-head">
                    <input ref={input} type="search" aria-label="Search commands" placeholder="Search commands and Krita actions…" value={q} onInput={e => setQ(e.currentTarget.value)} />
                    <button type="button" class="m-close" aria-label="Close menu" onClick={closeSheet}>✕</button>
                </div>
                <div class="m-menu-list" role="menu">
                    {words.length === 0 && MENUS.filter(m => commands.some(c => c.menu === m)).map(m => (
                        <div key={m}>
                            <button class="group" aria-expanded={group === m} onClick={() => setGroup(group === m ? null : m)}>{m}<span aria-hidden="true">{group === m ? '▾' : '▸'}</span></button>
                            {group === m && commands.filter(c => c.menu === m).map(c => item(c, false))}
                        </div>
                    ))}
                    {words.length > 0 && <>
                        {found.map(c => item(c, true))}
                        {foundActions.length > 0 && <div class="hint-row">Krita actions</div>}
                        {foundActions.map(a => (
                            <button class="item" role="menuitem" key={a.name} data-action={a.name} disabled={!a.enabled}
                                onClick={() => { closeSheet(); engine.triggerKritaAction(a.name).catch(report); }}>
                                <span>{label(a)}</span>{a.shortcut && <kbd>{a.shortcut}</kbd>}
                            </button>
                        ))}
                        {!found.length && !foundActions.length && <p class="hint">Nothing matches “{q}”.</p>}
                    </>}
                </div>
            </nav>
        </div>
    );
}
