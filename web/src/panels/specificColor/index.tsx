import { useEffect, useRef, useState } from 'preact/hooks';
import type { Panel } from '../../panels';
import type { Color, Engine } from '../../engine/protocol';
import { hex, parseHex } from '../color/hsv';
import { fromChannels, MODELS, toChannels, type ModelId, type Rgb } from './colorMath';
import './specificColor.css';

const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
const key8 = (c: { r: number; g: number; b: number }) => [c.r, c.g, c.b].map(x => Math.round(x * 255)).join(',');

function Specific({ engine }: { engine: Engine }) {
    const [model, setModel] = useState<ModelId>('hsv');
    const [pct, setPct] = useState(false);                       // RGB shown as 0..100 %
    const [col, setCol] = useState<Color>({ r: 0, g: 0, b: 0, a: 1 });
    const [vals, setVals] = useState<number[]>([0, 0, 0]);
    const [clamped, setClamped] = useState(false);
    const sent = useRef<string[]>([]);                           // colours we sent; their echoes are ignored
    const state = useRef({ model, vals }); state.current = { model, vals };

    const load = (c: Color, m = state.current.model) => {
        setCol(c); setVals(toChannels(m, [c.r, c.g, c.b], state.current.vals)); setClamped(false);
    };
    useEffect(() => {
        let alive = true;
        void engine.colors().then(c => { if (alive) load(c.foreground); });
        const off = engine.on('colorChanged', fg => { if (!sent.current.includes(key8(fg))) load(fg); else setCol(fg); });
        return () => { alive = false; off(); };
    }, [engine]);

    const push = (next: number[], m = model) => {
        const { rgb, clamped: c } = fromChannels(m, next);
        setVals(next); setClamped(c);
        const color = { r: rgb[0], g: rgb[1], b: rgb[2], a: col.a };
        sent.current = [...sent.current.slice(-15), key8(color)];
        setCol(color);
        void engine.setColors({ foreground: color });
    };
    const pushRgb = (c: Color) => push(toChannels(model, [c.r, c.g, c.b], vals));
    const m = MODELS.find(x => x.id === model)!;
    const unit = model === 'rgb' && pct ? 100 / 255 : 1;
    const text = hex(col);

    const track = (i: number) => {
        const c = m.channels[i], stops = Array.from({ length: 9 }, (_, k) => {
            const v = vals.slice(); v[i] = c.min + (c.max - c.min) * k / 8;
            return css(fromChannels(model, v).rgb);
        });
        return `linear-gradient(to right, ${stops.join(', ')})`;
    };

    return (
        <div class="spc">
            <div class="spc-head">
                <div class="spc-tabs" role="tablist" aria-label="Colour model">
                    {MODELS.map(x => <button key={x.id} role="tab" aria-selected={x.id === model}
                        onClick={() => { setModel(x.id); setVals(toChannels(x.id, [col.r, col.g, col.b], vals)); setClamped(false); }}>{x.name}</button>)}
                </div>
                <i class="spc-chip" style={{ background: text }} />
            </div>
            {m.channels.map((c, i) => {
                const lo = c.min * unit, hi = c.max * unit, v = Math.round(vals[i] * unit);
                const shown = Math.min(hi, Math.max(lo, v));
                return (
                    <div class="spc-row" key={model + i}>
                        <label for={`spc-n${i}`}>{c.label}</label>
                        <input class="spc-slider" type="range" min={lo} max={hi} step={1} value={shown} aria-label={`${m.name} ${c.label}`}
                            style={{ background: track(i) }}
                            onInput={e => { const n = vals.slice(); n[i] = Number(e.currentTarget.value) / unit; push(n); }} />
                        <input id={`spc-n${i}`} class={`spc-num${clamped && model === 'lab' ? ' clamped' : ''}`} type="number" min={lo} max={hi} step={1}
                            key={v} defaultValue={v} aria-label={`${m.name} ${c.label} value`}
                            title={clamped && model === 'lab' ? 'Out of the sRGB gamut: the colour was clamped' : undefined}
                            onChange={e => {
                                const x = Number(e.currentTarget.value);
                                if (e.currentTarget.value === '' || !Number.isFinite(x)) { e.currentTarget.value = String(v); return; }
                                const n = vals.slice(); n[i] = Math.min(hi, Math.max(lo, x)) / unit; push(n);
                            }} />
                        <span class="spc-unit">{model === 'rgb' && pct ? '%' : c.unit}</span>
                    </div>
                );
            })}
            {clamped && <div class="spc-warn" role="status">Out of gamut: clamped to the nearest sRGB colour</div>}
            <div class="spc-foot">
                {model === 'rgb' && <button aria-pressed={pct} onClick={() => setPct(!pct)}>{pct ? '0–100 %' : '0–255'}</button>}
                <label>Hex
                    <input type="text" key={text} defaultValue={text} maxLength={7} spellcheck={false} aria-label="Hex colour"
                        onChange={e => { const c = parseHex(e.currentTarget.value); if (c) pushRgb(c); else e.currentTarget.value = text; }} />
                </label>
            </div>
        </div>
    );
}

export default { id: 'specificColor', title: 'Specific Color', area: 'right', order: 3, component: Specific } satisfies Panel;
