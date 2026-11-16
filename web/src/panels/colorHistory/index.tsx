import { useEffect, useState } from 'preact/hooks';
import type { Panel } from '../../panels';
import type { Color, Engine } from '../../engine/protocol';
import { hex } from '../color/hsv';
import './colorHistory.css';

// Session-wide, in memory. The contract has no "stroke began" event, so the recorder watches historyChanged and, when
// the undo text names a new paint stroke, records the foreground colour last reported by colorChanged / colors().
// Approximations: fills and other non-stroke edits are not recorded; a colour changed mid-stroke is recorded at the
// moment the engine reports the step (which may be after the stroke began); redoing a stroke records it again.
const MAX = 30;
let list: Color[] = [];
const subs = new Set<() => void>();
const attached = new WeakSet<Engine>();

const push = (c: Color) => {
    list = [c, ...list.filter(x => hex(x) !== hex(c))].slice(0, MAX);
    subs.forEach(f => f());
};

/** Called on first mount and kept for the session, so strokes painted while the panel is closed are still recorded. */
function attach(engine: Engine) {
    if (attached.has(engine)) return;
    attached.add(engine);
    let fg: Color = { r: 0, g: 0, b: 0, a: 1 };
    void engine.colors().then(c => { fg = c.foreground; });
    engine.on('colorChanged', f => { fg = f; });
    engine.on('historyChanged', h => { if (!h.canRedo && /stroke/i.test(h.undoText)) push(fg); });
}

function ColorHistory({ engine }: { engine: Engine }) {
    const [, bump] = useState(0);
    const [fg, setFg] = useState<Color | null>(null);
    useEffect(() => {
        attach(engine);
        const f = () => bump(n => n + 1);
        subs.add(f);
        void engine.colors().then(c => setFg(c.foreground));
        const off = engine.on('colorChanged', c => setFg(c));
        return () => { subs.delete(f); off(); };
    }, [engine]);
    return (
        <div class="chist">
            <div class="chist-grid">
                {list.map(c => (
                    <button key={hex(c)} class="chist-swatch" style={{ background: hex(c) }} title={hex(c)} aria-label={`Use ${hex(c)}`}
                        aria-pressed={!!fg && hex(fg) === hex(c)} onClick={() => void engine.setColors({ foreground: c })} />
                ))}
                {!list.length && <span class="chist-empty">Colours you paint with appear here.</span>}
            </div>
            <button class="chist-clear" disabled={!list.length} onClick={() => { list = []; subs.forEach(f => f()); }}>Clear</button>
        </div>
    );
}

export default { id: 'colorHistory', title: 'Color History', area: 'right', order: 2, component: ColorHistory } satisfies Panel;
