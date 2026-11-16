// Krita's dialogs and pop-ups, floating over the page. The tool option window is embedded in the Tool Options panel instead.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Engine, KritaWindow } from '../engine/protocol';
import { report } from '../shell/state';
import { useStore } from '../shell/store';
import { ActionSearch } from './ActionSearch';
import { krita, startKrita } from './state';
import { KritaWindowView } from './WindowView';
import './krita.css';

type Pos = { x: number; y: number };

function Dialog({ engine, w, pos, setPos }: { engine: Engine; w: KritaWindow; pos?: Pos; setPos: (p: Pos) => void }) {
    const box = useRef<HTMLDivElement>(null);
    const drag = useRef<{ dx: number; dy: number } | null>(null);
    const style = pos ? `left:${pos.x}px;top:${pos.y}px` : 'left:50%;top:50%;transform:translate(-50%,-50%)';   // centred until moved
    return (
        <div ref={box} class="krita-dialog" role="dialog" aria-modal={w.modal} aria-label={w.title} style={style}>
            <div class="krita-title"
                onPointerDown={e => {
                    if ((e.target as Element).closest('button')) return;
                    const r = box.current!.getBoundingClientRect();
                    e.currentTarget.setPointerCapture(e.pointerId); drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
                }}
                onPointerMove={e => {
                    const d = drag.current;
                    if (d) setPos({ x: Math.max(0, Math.min(innerWidth - 60, e.clientX - d.dx)), y: Math.max(0, Math.min(innerHeight - 30, e.clientY - d.dy)) });
                }}
                onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
                <span>{w.title}</span>
                <button type="button" aria-label="Close" onClick={() => engine.closeKritaWindow(w.id).catch(report)}>✕</button>
            </div>
            <KritaWindowView engine={engine} id={w.id} width={w.width} height={w.height} focus />
        </div>
    );
}

/** At its x/y relative to the parent window's picture (or to the canvas without a parent). */
function Popup({ engine, w, parent }: { engine: Engine; w: KritaWindow; parent?: KritaWindow }) {
    const box = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {   // every render: the parent may have moved
        const base = document.querySelector(w.parent != null ? `[data-kwin="${w.parent}"]` : 'canvas.view')?.getBoundingClientRect();
        const el = box.current!;
        const x = (base?.left ?? 0) + w.x - (parent?.x ?? 0), y = (base?.top ?? 0) + w.y - (parent?.y ?? 0);
        el.style.left = `${Math.max(0, Math.min(x, innerWidth - w.width))}px`; el.style.top = `${Math.max(0, Math.min(y, innerHeight - w.height))}px`;
    });
    return <div ref={box} class="krita-popup"><KritaWindowView engine={engine} id={w.id} width={w.width} height={w.height} /></div>;
}

export function KritaUI({ engine }: { engine: Engine }) {
    useEffect(() => startKrita(engine), [engine]);
    const { windows } = useStore(krita);
    const [pos, setPos] = useState<Record<number, Pos>>({});
    const dialogs = windows.filter(w => w.kind === 'dialog'), popups = windows.filter(w => w.kind === 'popup');
    const top = useRef<KritaWindow | undefined>();
    top.current = popups[popups.length - 1];
    useEffect(() => {
        if (!popups.length) return;
        // A click anywhere outside the pop-ups dismisses the newest one, as Qt does: with Escape.
        const h = (e: PointerEvent) => {
            const t = top.current;
            if (!t || (e.target as Element).closest('.krita-popup')) return;
            engine.kritaWindowInput(t.id, { type: 'keydown', key: 'Escape' }); engine.kritaWindowInput(t.id, { type: 'keyup', key: 'Escape' });
        };
        document.addEventListener('pointerdown', h, true);
        return () => document.removeEventListener('pointerdown', h, true);
    }, [engine, popups.length > 0]);
    return (<>
        {dialogs.some(d => d.modal) && <div class="krita-backdrop" onPointerDown={() => document.querySelector<HTMLElement>('.krita-dialog canvas')?.focus()} />}
        {dialogs.map(d => <Dialog key={d.id} engine={engine} w={d} pos={pos[d.id]} setPos={p => setPos(o => ({ ...o, [d.id]: p }))} />)}
        {popups.map(p => <Popup key={p.id} engine={engine} w={p} parent={windows.find(x => x.id === p.parent)} />)}
        <ActionSearch engine={engine} />
    </>);
}
