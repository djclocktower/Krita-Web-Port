// The menu bar (desktop) and the tree list (touch). Both show the same Menu[] from krita/menus.ts: page commands and Krita actions,
// with nested submenus. A submenu opens on click or tap, on ArrowRight, and on mouse hover (never hover-only).
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Command } from '../panels';
import { isDockerOpen } from '../krita/dockers';
import { buildMenus, menuData, refreshMenuData, type Entry, type Menu } from '../krita/menus';
import { kritaEngine, krita } from '../krita/state';
import { effective } from '../settings/shortcuts';
import { useSetting } from '../settings/store';
import { isEnabled, menuCommands } from './commands';
import { app, report } from './state';
import { useStore } from './store';

export function menuTitle(c: Command) {
    const { history } = app.get();
    return c.id === 'edit.undo' && history.undoText ? `Undo ${history.undoText}` : c.id === 'edit.redo' && history.redoText ? `Redo ${history.redoText}` : c.title;
}

/** The menus as they are now; re-renders when what is enabled, the dockers, the saved workspaces or Krita's action list change. */
export function useMenus(): Menu[] {
    useStore(app); useSetting('workspaces');
    const kritaOn = useStore(krita).tools.length > 0, { actions, filters } = useStore(menuData);
    useEffect(() => { if (kritaOn) void refreshMenuData(); }, [kritaOn]);   // once Krita's engine is there
    return buildMenus(menuCommands(), actions, filters, isDockerOpen);
}

/** Runs an entry: a page command through `run`, a Krita action through the engine. */
export const pick = (e: Entry & { kind: 'cmd' | 'action' }, run: (c: Command) => void) => {
    if (e.kind === 'cmd') run(e.cmd);
    else kritaEngine()?.triggerKritaAction(e.name).catch(report);
};
const disabled = (e: Entry) => e.kind === 'cmd' ? !isEnabled(e.cmd) : e.kind === 'action' ? !e.enabled : false;
const parentKey = (k: string) => k.slice(0, Math.max(0, k.lastIndexOf('>')));
const isOpen = (subs: string, k: string) => subs === k || subs.startsWith(`${k}>`);

// ---------------------------------------------------------------- desktop

interface Ctx { subs: string; setSubs: (k: string, byKey?: boolean) => void; choose: (e: Entry & { kind: 'cmd' | 'action' }) => void; shortcuts: Record<string, string> }

function Sub({ children, label, k }: { children: ComponentChildren; label: string; k: string }) {
    const el = useRef<HTMLDivElement>(null);
    // The list scrolls, so a submenu cannot be absolutely positioned inside it: it is fixed beside its parent item, flipped if it would leave the window.
    useLayoutEffect(() => {
        const me = el.current, parent = me?.parentElement?.querySelector('button')?.getBoundingClientRect();
        if (!me || !parent) return;
        const w = me.offsetWidth, h = me.offsetHeight;
        me.style.left = `${parent.right + w > innerWidth ? Math.max(0, parent.left - w) : parent.right}px`;
        me.style.top = `${Math.max(0, Math.min(parent.top, innerHeight - h))}px`;
    });
    return <div ref={el} class="menu-list sub" role="menu" aria-label={label} data-key={k}>{children}</div>;
}

function List({ items, k, ctx }: { items: Entry[]; k: string; ctx: Ctx }) {
    const mouseLeave = (e: PointerEvent) => { if (e.pointerType === 'mouse' && ctx.subs !== k) ctx.setSubs(k); };
    return <>{items.map((e, i) => {
        if (e.kind === 'sep') return <div key={`s${i}`} class="menu-sep" role="separator" />;
        if (e.kind === 'menu') {
            const sk = `${k}>${e.label}`, open = isOpen(ctx.subs, sk);
            return (
                <div class="menu-sub" key={sk}>
                    <button role="menuitem" aria-haspopup="menu" aria-expanded={open} data-sub={sk}
                        onClick={() => ctx.setSubs(sk)} onPointerEnter={ev => { if (ev.pointerType === 'mouse') ctx.setSubs(sk); }}>
                        <span>{e.label}</span><span aria-hidden="true">▸</span>
                    </button>
                    {open && <Sub label={e.label} k={sk}><List items={e.items} k={sk} ctx={ctx} /></Sub>}
                </div>
            );
        }
        const off = disabled(e), keys = e.kind === 'cmd' ? effective(e.cmd, ctx.shortcuts) : e.shortcut;
        const checkable = e.kind === 'cmd' ? e.checked !== undefined : e.checkable, checked = e.kind === 'cmd' ? !!e.checked : e.checked;
        return (
            <button key={e.kind === 'cmd' ? e.cmd.id : e.name} role={checkable ? 'menuitemcheckbox' : 'menuitem'} aria-checked={checkable ? checked : undefined}
                data-action={e.kind === 'action' ? e.name : undefined} disabled={off}
                onPointerEnter={ev => mouseLeave(ev)} onClick={() => ctx.choose(e)}>
                <span>{checkable && <span class="menu-check" aria-hidden="true">{checked ? '✓' : ''}</span>}{e.kind === 'cmd' ? menuTitle(e.cmd) : e.label}</span>{keys && <kbd>{keys}</kbd>}
            </button>
        );
    })}</>;
}

export function MenuBar({ run }: { run: (c: Command) => void }) {
    const menus = useMenus();
    const shortcuts = useSetting('shortcuts');
    const [open, setOpen] = useState<string | null>(null);
    const [subs, setSubsState] = useState('');
    const viaKey = useRef(false);
    const bar = useRef<HTMLElement>(null);
    const setSubs = (k: string, byKey = false) => { viaKey.current = byKey; setSubsState(k); };
    const lists = () => [...bar.current?.querySelectorAll<HTMLElement>('.menu-list') ?? []];
    const itemsOf = (list: Element) => [...list.querySelectorAll<HTMLElement>(':scope > [role^=menuitem]:not(:disabled), :scope > .menu-sub > [role=menuitem]')];

    useEffect(() => {   // one action list per open of the bar, not per item
        if (!open) return;
        void refreshMenuData();
        const close = (e: PointerEvent) => { if (!bar.current?.contains(e.target as Node)) setOpen(null); };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [open === null]);
    useEffect(() => {   // keyboard: focus the first item of the list that just opened
        if (!open || !viaKey.current) return;
        const list = lists().find(l => l.dataset.key === (subs || open));
        if (list) itemsOf(list)[0]?.focus();
    }, [open, subs]);

    const topIndex = (t: HTMLElement) => menus.findIndex(m => m.name === (open ?? t.dataset.menu));
    const keydown = (e: KeyboardEvent) => {
        const t = e.target as HTMLElement, list = t.closest<HTMLElement>('.menu-list'), inSub = !!list?.classList.contains('sub'), i = topIndex(t);
        const goTop = (to: number) => { viaKey.current = true; setSubsState(''); setOpen(menus[(to + menus.length) % menus.length].name); };
        const closeSub = () => {   // back to the item that opened this submenu
            const k = list!.dataset.key!;
            setSubs(parentKey(k));
            [...bar.current!.querySelectorAll<HTMLElement>('[data-sub]')].find(b => b.dataset.sub === k)?.focus();
        };
        if (e.key === 'Escape' && open) {
            e.preventDefault();
            if (inSub) closeSub();
            else { setOpen(null); setSubsState(''); bar.current?.querySelector<HTMLElement>(`[data-menu="${open}"]`)?.focus(); }
        } else if (e.key === 'ArrowRight' && t.dataset.sub) { e.preventDefault(); setSubs(t.dataset.sub, true); }
        else if (e.key === 'ArrowRight' && i >= 0) { e.preventDefault(); goTop(i + 1); }
        else if (e.key === 'ArrowLeft' && inSub) { e.preventDefault(); closeSub(); }
        else if (e.key === 'ArrowLeft' && i >= 0) { e.preventDefault(); goTop(i - 1); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!list) { viaKey.current = true; setSubsState(''); setOpen(t.dataset.menu!); return; }
            const items = itemsOf(list);
            items[(items.indexOf(t) + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        }
    };
    const ctx: Ctx = { subs, setSubs, shortcuts, choose: e => { setOpen(null); setSubsState(''); pick(e, run); } };
    return (
        <nav class="menubar" role="menubar" aria-label="Main menu" ref={bar} onKeyDown={keydown}
            onFocusOut={e => { if (!bar.current?.contains(e.relatedTarget as Node)) setOpen(null); }}>
            {menus.map(m => (
                <div class="menu" key={m.name}>
                    <button role="menuitem" data-menu={m.name} aria-haspopup="menu" aria-expanded={open === m.name}
                        onClick={e => { viaKey.current = e.detail === 0; setSubsState(''); setOpen(open === m.name ? null : m.name); }}
                        onPointerEnter={e => { if (open && e.pointerType === 'mouse') { viaKey.current = false; setSubsState(''); setOpen(m.name); } }}>{m.name}</button>
                    {open === m.name && <div class="menu-list" role="menu" aria-label={m.name} data-key={m.name}><List items={m.items} k={m.name} ctx={ctx} /></div>}
                </div>
            ))}
        </nav>
    );
}

// ---------------------------------------------------------------- touch

/** Nested accordion of entries (phone and tablet). `open` is the key of the deepest open group; a tap on a group opens it, a second tap closes it. */
export function Tree({ items, k, open, setOpen, choose, shortcuts, depth = 0 }:
    { items: Entry[]; k: string; open: string; setOpen: (k: string) => void; choose: (e: Entry & { kind: 'cmd' | 'action' }) => void; shortcuts: Record<string, string>; depth?: number }) {
    const pad = { paddingLeft: `${20 + depth * 16}px` };
    return <>{items.map((e, i) => {
        if (e.kind === 'sep') return null;
        if (e.kind === 'menu') {
            const sk = `${k}>${e.label}`, on = isOpen(open, sk);
            return (
                <div key={sk}>
                    <button class="group sub-group" style={pad} aria-expanded={on} data-sub={sk} onClick={() => setOpen(on ? parentKey(sk) : sk)}>{e.label}<span aria-hidden="true">{on ? '▾' : '▸'}</span></button>
                    {on && <Tree items={e.items} k={sk} open={open} setOpen={setOpen} choose={choose} shortcuts={shortcuts} depth={depth + 1} />}
                </div>
            );
        }
        const checkable = e.kind === 'cmd' ? e.checked !== undefined : e.checkable, checked = e.kind === 'cmd' ? !!e.checked : e.checked, keys = e.kind === 'cmd' ? effective(e.cmd, shortcuts) : e.shortcut;
        return (
            <button class="item" style={pad} key={e.kind === 'cmd' ? e.cmd.id : `${e.name}${i}`} role={checkable ? 'menuitemcheckbox' : 'menuitem'} aria-checked={checkable ? checked : undefined}
                data-action={e.kind === 'action' ? e.name : undefined} disabled={disabled(e)} onClick={() => choose(e)}>
                <span>{checkable && <span class="menu-check" aria-hidden="true">{checked ? '✓' : ''}</span>}{e.kind === 'cmd' ? menuTitle(e.cmd) : e.label}</span>{keys && <kbd>{keys}</kbd>}
            </button>
        );
    })}</>;
}
