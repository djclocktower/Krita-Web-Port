import { useEffect, useState } from 'preact/hooks';
import type { Panel } from '../../panels';
import type { Color, Engine } from '../../engine/protocol';
import { fromHsv, hex, near, parseHex, toHsv, type Hsv } from './hsv';
import './color.css';

const clamp = (x: number) => Math.min(1, Math.max(0, x));

function ColorPanel({ engine }: { engine: Engine }) {
    const [fg, setFg] = useState<Color>({ r: 0, g: 0, b: 0, a: 1 });
    const [bg, setBg] = useState<Color>({ r: 1, g: 1, b: 1, a: 1 });
    const [target, setTarget] = useState<'foreground' | 'background'>('foreground');
    const [last, setLast] = useState<Hsv>([0, 0, 0]);
    useEffect(() => engine.on('colorChanged', (f, b) => { setFg(f); setBg(b); }), [engine]);

    const color = target === 'foreground' ? fg : bg;
    // Keep our own HSV while it still describes the engine's colour, so hue and saturation survive grey and black.
    const hsv: Hsv = near(fromHsv(last), color) ? last : toHsv(color, last[0]);
    const [h, s, v] = hsv;
    const applyHsv = (n: Hsv) => { setLast(n); void engine.setColors({ [target]: fromHsv(n) }); };
    const applyRgb = (c: Color) => { setLast(toHsv(c, h)); void engine.setColors({ [target]: c }); };
    const rgb = [color.r, color.g, color.b].map(x => Math.round(x * 255));

    const pick = (e: PointerEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        applyHsv([h, clamp((e.clientX - r.left) / r.width), 1 - clamp((e.clientY - r.top) / r.height)]);
    };
    const key = (e: KeyboardEvent) => {
        const step = e.shiftKey ? 0.1 : 0.01;
        const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (!d[e.key]) return;
        e.preventDefault();
        applyHsv([h, clamp(s + d[e.key][0]), clamp(v + d[e.key][1])]);
    };

    return (
        <div class="color">
            <div class="sv" tabIndex={0} role="slider" aria-label="Saturation and value"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s * 100)}
                aria-valuetext={`Saturation ${Math.round(s * 100)}%, value ${Math.round(v * 100)}%`}
                style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h} 100% 50%))` }}
                onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); }}
                onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e); }}
                onKeyDown={key}>
                <i style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} />
            </div>
            <input class="hue" type="range" min={0} max={360} step={1} value={Math.round(h)} aria-label="Hue"
                onInput={e => applyHsv([Number(e.currentTarget.value), s, v])} />
            <div class="swatches">
                {(['foreground', 'background'] as const).map(t => (
                    <button key={t} class="swatch" aria-pressed={target === t} aria-label={`Edit ${t} colour`}
                        title={`${t} colour`} style={{ background: hex(t === 'foreground' ? fg : bg) }} onClick={() => setTarget(t)}>
                        <span>{t === 'foreground' ? 'FG' : 'BG'}</span>
                    </button>
                ))}
            </div>
            <div class="fields">
                {['R', 'G', 'B'].map((name, i) => (
                    <label key={name}>{name}
                        <input type="number" min={0} max={255} step={1} key={rgb[i]} defaultValue={rgb[i]} aria-label={`${name} (0 to 255)`}
                            onChange={e => {
                                const n = Math.round(Number(e.currentTarget.value));
                                if (!Number.isFinite(n) || e.currentTarget.value === '') { e.currentTarget.value = String(rgb[i]); return; }
                                const next = [...rgb]; next[i] = Math.min(255, Math.max(0, n));
                                applyRgb({ r: next[0] / 255, g: next[1] / 255, b: next[2] / 255, a: 1 });
                            }} />
                    </label>
                ))}
                <label class="hexfield">Hex
                    <input type="text" key={hex(color)} defaultValue={hex(color)} aria-label="Hex colour" maxLength={7} spellcheck={false}
                        onChange={e => {
                            const c = parseHex(e.currentTarget.value);
                            if (c) applyRgb(c); else e.currentTarget.value = hex(color);
                        }} />
                </label>
            </div>
        </div>
    );
}

export default { id: 'color', title: 'Color', area: 'right', order: 0, component: ColorPanel } satisfies Panel;
