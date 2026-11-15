import { useEffect, useState } from 'preact/hooks';
import type { BlendMode, BrushState, Engine } from '../../engine/protocol';

const DEFAULT: BrushState = { presetId: null, size: 12, opacity: 1, flow: 1, blendMode: 'normal', eraser: false };

export default function BrushOptions({ engine }: { engine: Engine }) {
    const [b, setB] = useState(DEFAULT);
    const [modes, setModes] = useState<BlendMode[]>([]);
    useEffect(() => engine.on('brushChanged', setB), [engine]);
    useEffect(() => { void engine.brushState().then(setB, () => {}); void engine.blendModes().then(setModes); }, [engine]);
    const set = (p: Partial<BrushState>) => void engine.setBrush(p);
    const slider = (label: string, value: number, max: number, onInput: (n: number) => void) => (
        <label class="row">{label}
            <input type="range" min={1} max={max} value={Math.round(value)} onInput={e => onInput(Number(e.currentTarget.value))} />
            <output>{Math.round(value)}</output>
        </label>
    );
    return (<>
        {slider('Size', b.size, 500, n => set({ size: n }))}
        {slider('Opacity %', b.opacity * 100, 100, n => set({ opacity: n / 100 }))}
        {slider('Flow %', b.flow * 100, 100, n => set({ flow: n / 100 }))}
        <label class="row">Blending mode
            <select value={b.blendMode} onChange={e => set({ blendMode: e.currentTarget.value })}>
                {modes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
        </label>
    </>);
}
