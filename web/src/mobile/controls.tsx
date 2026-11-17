// On-screen controls over the canvas: brush size and opacity sliders at the screen edges, Shift/Ctrl/Alt toggles, Apply/Cancel for tools
// that wait for Enter or Escape, a keyboard button for Krita's text tool, and the colour-picker loupe.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Engine } from '../engine/protocol';
import { touchMods, loupe } from '../input/touch';
import { KeyboardButton } from '../krita/Keyboard';
import { krita, kritaOn } from '../krita/state';
import { app } from '../shell/state';
import { useStore } from '../shell/store';
import { useActiveTool } from '../tools/shared';

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** A vertical slider for a thumb: drag anywhere on its 44 px wide track. value is 0 to 1 from the bottom. */
function VSlider({ label, value, onChange, text, side }: { label: string; value: number; onChange: (v: number) => void; text: string; side: 'left' | 'right' }) {
    const track = useRef<HTMLDivElement>(null);
    const [drag, setDrag] = useState(false);
    const at = (e: PointerEvent) => { const r = track.current!.getBoundingClientRect(); onChange(clamp(1 - (e.clientY - r.top) / r.height)); };
    return (
        <div class={`m-slider ${side}${drag ? ' drag' : ''}`}>
            <div ref={track} class="m-track" role="slider" tabIndex={0} aria-label={label} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={Math.round(value * 100)} aria-valuetext={text}
                onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); at(e); }}
                onPointerMove={e => { if (drag) at(e); }}
                onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)}
                onKeyDown={e => { const d = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02, PageUp: 0.1, PageDown: -0.1 }[e.key as 'ArrowUp']; if (d) { e.preventDefault(); onChange(clamp(value + d)); } }}>
                <i class="m-fill" style={`height:${value * 100}%`} />
                <b class="m-thumb" style={`bottom:calc(${value * 100}% - 22px)`}>{text}</b>
            </div>
            <span class="m-cap" aria-hidden="true">{label.replace('Brush ', '')}</span>
        </div>
    );
}

// Brush size is logarithmic (1 to 500 px): the small sizes get as much of the track as the large ones.
const MAX_SIZE = 500;
export function EdgeSliders({ engine }: { engine: Engine }) {
    const { brush } = useStore(app);
    return (<>
        <VSlider side="left" label="Brush size" text={`${Math.round(brush.size)}`} value={clamp(Math.log(Math.max(1, brush.size)) / Math.log(MAX_SIZE))}
            onChange={v => void engine.setBrush({ size: Math.max(1, Math.round(Math.pow(MAX_SIZE, v))) })} />
        <VSlider side="right" label="Brush opacity" text={`${Math.round(brush.opacity * 100)}%`} value={brush.opacity}
            onChange={v => void engine.setBrush({ opacity: Math.round(v * 100) / 100 })} />
    </>);
}

/** Krita tools that finish with Enter and cancel with Escape (transform, crop, polygons, paths, text, ...). */
const WAITS = /(Transform|Crop|Polygon|Polyline|KisToolPath|PathTool|SvgText|Magnetic|SelectPath|SelectOutline|Enclose|Bezier|Pencil|Assistant)/;

export function pressKey(engine: Engine, key: string) {
    if (kritaOn()) { engine.kritaKey({ type: 'keydown', key }); engine.kritaKey({ type: 'keyup', key }); }
    else document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));   // the page's own crop tool listens on the window
}

export function FloatControls({ engine }: { engine: Engine }) {
    const k = useStore(krita), mods = useStore(touchMods), page = useActiveTool();
    const [open, setOpen] = useState(false);
    const waiting = k.tools.length && !k.page ? WAITS.test(k.active) : page.id === 'crop';
    const text = k.tools.length > 0 && !k.page && /SvgText/.test(k.active);
    const any = mods.shift || mods.ctrl || mods.alt;
    return (
        <div class="m-float" role="group" aria-label="Canvas controls">
            {waiting && <>
                <button type="button" class="m-apply" aria-label="Apply" title="Apply (Enter)" onClick={() => pressKey(engine, 'Enter')}>✓</button>
                <button type="button" class="m-cancel" aria-label="Cancel" title="Cancel (Escape)" onClick={() => pressKey(engine, 'Escape')}>✕</button>
            </>}
            {text && <KeyboardButton label="Keyboard for text" send={ev => engine.kritaKey({ type: ev.type as 'keydown' | 'keyup', key: ev.key ?? '', text: ev.text, shift: ev.shift, ctrl: ev.ctrl, alt: ev.alt })} />}
            <button type="button" class="m-modbtn" aria-label="Modifier keys" aria-expanded={open} aria-pressed={any} onClick={() => setOpen(!open)}>⇧</button>
            {open && (['shift', 'ctrl', 'alt'] as const).map(m => (
                <button type="button" key={m} class="m-mod" data-mod={m} aria-pressed={mods[m]} onClick={() => touchMods.set({ [m]: !touchMods.get()[m] })}>{m[0].toUpperCase() + m.slice(1)}</button>
            ))}
        </div>
    );
}

/** The magnifier shown above a finger held on the canvas: the pixels under it, enlarged, and the colour that will be picked. */
export function Loupe() {
    const l = useStore(loupe);
    const cv = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const el = cv.current, src = document.querySelector<HTMLCanvasElement>('canvas.view');
        if (!l.on || !el || !src) return;
        const g = el.getContext('2d')!, r = src.getBoundingClientRect(), k = src.width / r.width, n = 11;   // 11 x 11 screen pixels, enlarged
        g.imageSmoothingEnabled = false;
        g.clearRect(0, 0, el.width, el.height);
        g.drawImage(src, ((l.x - r.left) - n / 2) * k, ((l.y - r.top) - n / 2) * k, n * k, n * k, 0, 0, el.width, el.height);
        g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(el.width / 2 - 6, el.height / 2 - 6, 12, 12);
        g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(el.width / 2 - 6, el.height / 2 - 6, 12, 12);
    }, [l.on, l.x, l.y]);
    if (!l.on) return null;
    const c = l.color, css = c ? `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})` : 'transparent';
    const top = l.y > 120 ? l.y - 110 : l.y + 50;   // above the finger, or below it near the top edge
    return (
        <div class="m-loupe" role="img" aria-label="Colour picker" style={`left:${Math.max(48, Math.min(innerWidth - 48, l.x))}px;top:${top}px`}>
            <canvas ref={cv} width={88} height={88} />
            <span class="m-loupe-color" style={`background:${css}`} />
        </div>
    );
}
