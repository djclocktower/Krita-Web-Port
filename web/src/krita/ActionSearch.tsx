// Search box over all of Krita's actions (Ctrl+Enter or Settings > Search Krita Actions).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Engine, KritaAction } from '../engine/protocol';
import { report } from '../shell/state';
import { store, useStore } from '../shell/store';

export const actionSearch = store({ open: false });
export const openActionSearch = () => actionSearch.set({ open: true });
const label = (a: KritaAction) => a.text.replace(/&(?!&)/g, '');   // ponytail: "&&" (a literal ampersand) stays doubled

export function ActionSearch({ engine }: { engine: Engine }) {
    const { open } = useStore(actionSearch);
    const [all, setAll] = useState<KritaAction[] | null>(null);
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!open) return;
        setQ(''); setSel(0); setAll(null);
        engine.kritaActions().then(setAll, e => { setAll([]); report(e); });
        input.current?.focus();
    }, [open, engine]);
    if (!open) return null;
    const close = () => actionSearch.set({ open: false });
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    // ponytail: only the first 200 matches are listed; type more to narrow
    const list = (all ?? []).filter(a => words.every(w => `${label(a)} ${a.name}`.toLowerCase().includes(w))).slice(0, 200);
    const run = (a?: KritaAction) => { if (!a?.enabled) return; close(); engine.triggerKritaAction(a.name).catch(report); };
    const key = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'Enter') { e.preventDefault(); run(list[sel]); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(0, Math.min(list.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)))); }
    };
    return (
        <div class="krita-backdrop krita-search-wrap" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
            <div class="krita-search" role="dialog" aria-label="Search Krita actions" onKeyDown={key}>
                <input ref={input} type="search" placeholder="Search actions…" aria-label="Search actions" value={q}
                    onInput={e => { setQ(e.currentTarget.value); setSel(0); }} />
                <ul role="listbox" aria-label="Actions">
                    {all && !all.length && <li class="hint">This engine has no Krita actions.</li>}
                    {list.map((a, i) => (
                        <li key={a.name} role="option" aria-selected={i === sel} aria-disabled={!a.enabled} data-action={a.name}
                            class={a.enabled ? '' : 'off'} onClick={() => run(a)}>
                            <span>{label(a)}</span>{a.shortcut && <kbd>{a.shortcut}</kbd>}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
