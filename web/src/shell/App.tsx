import { useEffect, useRef, useState } from 'preact/hooks';
import { Canvas } from '../canvas/Canvas';
import { view } from '../canvas/view';
import type { Engine } from '../engine/protocol';
import { attachKeys } from '../input/keys';
import { panels, type Command } from '../panels';
import { hex, parseHex } from '../panels/color/hsv';
import { allCommands } from './commands';
import { app, report, trackEngine } from './state';
import { useStore } from './store';
import './shell.css';

const MENUS = ['File', 'Edit', 'View', 'Image', 'Layer', 'Select', 'Filter', 'Tools', 'Settings'] as const;

export function App({ engine }: { engine: Engine }) {
    const run = async (c: Command) => { try { await c.run(engine); } catch (e) { report(e); } };
    useEffect(() => {
        const offs = [trackEngine(engine), attachKeys(allCommands, c => void run(c))];
        (async () => {
            if (!(await engine.documentInfo())) await engine.newDocument({ width: 1600, height: 1200, name: 'Untitled' });
            app.set({ doc: await engine.documentInfo() });
            // The engine has no getters for brush and colours; setting them to themselves makes it announce them.
            await engine.setColors({}); await engine.setBrush({});
        })().catch(report);
        return () => offs.forEach(f => f());
    }, [engine]);
    return (
        <div class="app">
            <MenuBar run={run} />
            <Toolbar engine={engine} />
            <div class="main">
                <Dock area="left" engine={engine} />
                <Canvas engine={engine} />
                <Dock area="right" engine={engine} />
            </div>
            <Dock area="bottom" engine={engine} />
            <StatusBar />
            <NewDialog engine={engine} />
        </div>
    );
}

function MenuBar({ run }: { run: (c: Command) => void }) {
    const { history } = useStore(app);
    const [open, setOpen] = useState<string | null>(null);
    const viaKey = useRef(false);
    const bar = useRef<HTMLElement>(null);
    const menus = MENUS.filter(m => allCommands.some(c => c.menu === m));

    useEffect(() => {
        if (!open) return;
        if (viaKey.current) bar.current?.querySelector<HTMLElement>('.menu-list [role=menuitem]:not(:disabled)')?.focus();
        const close = (e: PointerEvent) => { if (!bar.current?.contains(e.target as Node)) setOpen(null); };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [open]);

    const disabled = (c: Command) => (c.id === 'edit.undo' && !history.canUndo) || (c.id === 'edit.redo' && !history.canRedo);
    const title = (c: Command) => c.id === 'edit.undo' && history.undoText ? `Undo ${history.undoText}` :
        c.id === 'edit.redo' && history.redoText ? `Redo ${history.redoText}` : c.title;

    const keydown = (e: KeyboardEvent) => {
        const t = e.target as HTMLElement, inList = !!t.closest('.menu-list'), i = menus.findIndex(m => m === (open ?? t.dataset.menu));
        const move = (to: number) => { viaKey.current = true; setOpen(menus[(to + menus.length) % menus.length]); };
        if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(null); bar.current?.querySelector<HTMLElement>(`[data-menu="${open}"]`)?.focus(); }
        else if (e.key === 'ArrowRight' && i >= 0) { e.preventDefault(); move(i + 1); }
        else if (e.key === 'ArrowLeft' && i >= 0) { e.preventDefault(); move(i - 1); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!inList) { viaKey.current = true; setOpen(t.dataset.menu!); return; }
            const items = [...bar.current!.querySelectorAll<HTMLElement>('.menu-list [role=menuitem]:not(:disabled)')];
            items[(items.indexOf(t) + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        }
    };
    return (
        <nav class="menubar" role="menubar" aria-label="Main menu" ref={bar} onKeyDown={keydown}
            onFocusOut={e => { if (!bar.current?.contains(e.relatedTarget as Node)) setOpen(null); }}>
            {menus.map(m => (
                <div class="menu" key={m}>
                    <button role="menuitem" data-menu={m} aria-haspopup="menu" aria-expanded={open === m}
                        onClick={e => { viaKey.current = e.detail === 0; setOpen(open === m ? null : m); }}
                        onMouseEnter={() => { if (open) { viaKey.current = false; setOpen(m); } }}>{m}</button>
                    {open === m && (
                        <div class="menu-list" role="menu" aria-label={m}>
                            {allCommands.filter(c => c.menu === m).map(c => (
                                <button role="menuitem" key={c.id} disabled={disabled(c)} onClick={() => { setOpen(null); run(c); }}>
                                    <span>{title(c)}</span>{c.shortcut && <kbd>{c.shortcut}</kbd>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </nav>
    );
}

function Toolbar({ engine }: { engine: Engine }) {
    const { brush, fg, bg } = useStore(app);
    const color = (label: string, c: typeof fg, key: 'foreground' | 'background') => (
        <input type="color" class="swatch" aria-label={label} title={label} value={hex(c)}
            onInput={e => { const n = parseHex(e.currentTarget.value); if (n) void engine.setColors({ [key]: n }); }} />
    );
    return (
        <div class="toolbar" role="toolbar" aria-label="Brush">
            <label>Size
                <input type="range" min={1} max={500} value={Math.min(500, Math.round(brush.size))} aria-label="Brush size"
                    onInput={e => void engine.setBrush({ size: Number(e.currentTarget.value) })} />
                <output>{Math.round(brush.size)} px</output>
            </label>
            <label>Opacity
                <input type="range" min={0} max={100} value={Math.round(brush.opacity * 100)} aria-label="Brush opacity"
                    onInput={e => void engine.setBrush({ opacity: Number(e.currentTarget.value) / 100 })} />
                <output>{Math.round(brush.opacity * 100)}%</output>
            </label>
            <button aria-pressed={brush.eraser} onClick={() => void engine.setBrush({ eraser: !brush.eraser })}>Eraser</button>
            <span class="colors">
                {color('Foreground colour', fg, 'foreground')}
                {color('Background colour', bg, 'background')}
                <button aria-label="Swap colours" title="Swap colours (X)" onClick={() => void engine.setColors({ foreground: bg, background: fg })}>⇄</button>
            </span>
        </div>
    );
}

function Dock({ area, engine }: { area: 'left' | 'right' | 'bottom'; engine: Engine }) {
    const list = panels.filter(p => p.area === area);
    const [active, setActive] = useState(list[0]?.id);
    const [open, setOpen] = useState(true);
    if (!list.length) return null;
    const cur = list.find(p => p.id === active) ?? list[0];
    return (
        <section class={`dock dock-${area}${open ? '' : ' collapsed'}`} aria-label={`${area} panels`}>
            <div class="dock-head">
                <div role="tablist" class="tabs">
                    {(open ? list : [cur]).map(p => (
                        <button key={p.id} role="tab" aria-selected={p.id === cur.id} onClick={() => { setActive(p.id); setOpen(true); }}>{p.title}</button>
                    ))}
                </div>
                <button class="collapse" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${cur.title}`}
                    onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</button>
            </div>
            {open && <div class="dock-body" role="tabpanel" aria-label={cur.title}><cur.component engine={engine} /></div>}
        </section>
    );
}

function StatusBar() {
    const { doc, message } = useStore(app);
    const v = useStore(view);
    const deg = Math.round((((v.rot * 180) / Math.PI) % 360 + 360) % 360);
    return (
        <footer class="statusbar">
            <span class="status-doc">{doc ? `${doc.name}${doc.modified ? '*' : ''} · ${doc.width} × ${doc.height} px` : 'No document'}</span>
            <span class="status-zoom">{Math.round(v.scale * 100)}%</span>
            <span class="status-rot">{deg}°{v.mirror ? ' mirrored' : ''}</span>
            <span class="status-pos">{v.pointer ? `${Math.floor(v.pointer.x)}, ${Math.floor(v.pointer.y)}` : '—'}</span>
            <span class="status-msg" role="status">{message}</span>
        </footer>
    );
}

function NewDialog({ engine }: { engine: Engine }) {
    const { newOpen } = useStore(app);
    const ref = useRef<HTMLDialogElement>(null);
    const [err, setErr] = useState('');
    useEffect(() => {
        const d = ref.current!;
        if (newOpen && !d.open) { setErr(''); d.showModal(); }
        if (!newOpen && d.open) d.close();
    }, [newOpen]);
    const submit = async (e: Event) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget as HTMLFormElement);
        const width = Number(f.get('w')), height = Number(f.get('h')), name = String(f.get('name')).trim() || 'Untitled';
        const bad = (n: number) => !Number.isInteger(n) || n < 1 || n > 16384;
        if (bad(width) || bad(height)) return setErr('Width and height must be whole numbers from 1 to 16384.');
        if (width * height > 64e6) return setErr('That is more than 64 megapixels.');
        try { await engine.newDocument({ width, height, name }); app.set({ newOpen: false }); } catch (x) { setErr(String((x as Error).message)); }
    };
    return (
        <dialog ref={ref} aria-labelledby="new-title" onClose={() => app.set({ newOpen: false })}>
            <form noValidate onSubmit={submit}>
                <h2 id="new-title">New Document</h2>
                <label>Name <input name="name" type="text" defaultValue="Untitled" /></label>
                <label>Width (px) <input name="w" type="number" defaultValue={1600} aria-invalid={!!err} aria-describedby="new-err" /></label>
                <label>Height (px) <input name="h" type="number" defaultValue={1200} aria-invalid={!!err} aria-describedby="new-err" /></label>
                <p id="new-err" class="error" role="alert">{err}</p>
                <div class="buttons">
                    <button type="button" onClick={() => app.set({ newOpen: false })}>Cancel</button>
                    <button type="submit" class="primary">Create</button>
                </div>
            </form>
        </dialog>
    );
}
