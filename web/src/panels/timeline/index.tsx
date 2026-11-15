import { useEffect, useRef, useState } from 'preact/hooks';
import type { AnimationState, Engine, LayerNode, NodeId } from '../../engine/protocol';
import type { Command, Panel } from '../../panels';
import { reportError } from '../../shell/errors';
import { activeNode } from '../layers/active';
import './timeline.css';

const NAMEW = 170, HEAD = 24;
// Rows hold 40 px buttons plus a 1 px border on touch layouts; the grid is drawn with the same height.
const coarse = matchMedia('(pointer: coarse), (max-width: 1099px)');
let RH = coarse.matches ? 41 : 28;
const EXTRA = 10;   // empty frames shown after the last one that matters
type Row = { id: NodeId; name: string; depth: number };
type Patch = Partial<AnimationState>;
type Drag = { id: NodeId; from: number; to: number };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const rowsOf = (nodes: LayerNode[], depth = 0): Row[] =>
    nodes.flatMap(n => [...(n.type === 'paint' ? [{ id: n.id, name: n.name, depth }] : []), ...rowsOf(n.children, depth + 1)]);

// What the mounted panel offers to commands; null when the panel is not mounted.
let live: { anim: () => AnimationState; active: () => NodeId | null; send: (p: Patch) => void; toggle: () => void } | null = null;
let showError: (m: string) => void = reportError;
async function act(fn: () => Promise<unknown>) { try { await fn(); } catch (e) { showError(msg(e)); } }

const current = async (engine: Engine) => live?.anim() ?? await engine.animation();
const addFrame = (engine: Engine, copy: boolean) => act(async () => {
    const id = live?.active() ?? await activeNode(engine);
    if (!id) throw new Error('There is no layer to add a frame to');
    await engine.addKeyframe(id, (await current(engine)).currentTime, { copy });
});
const removeFrame = (engine: Engine) => act(async () => {
    const id = live?.active() ?? await activeNode(engine);
    if (!id) throw new Error('There is no layer to remove a frame from');
    await engine.removeKeyframe(id, (await current(engine)).currentTime);
});
const step = (engine: Engine, d: number) => act(async () => {
    const t = Math.max(0, (await current(engine)).currentTime + d);
    if (live) live.send({ currentTime: t }); else await engine.setAnimation({ currentTime: t });
});

const commands: Command[] = [
    { id: 'animation.play', title: 'Animation: Play / Pause', menu: 'Tools',
      run: () => { if (live) live.toggle(); else showError('Open the Timeline panel to play the animation'); } },
    { id: 'animation.addBlank', title: 'Animation: Add Blank Frame', menu: 'Tools', run: e => addFrame(e, false) },
    { id: 'animation.addDuplicate', title: 'Animation: Add Duplicate Frame', menu: 'Tools', run: e => addFrame(e, true) },
    { id: 'animation.remove', title: 'Animation: Remove Frame', menu: 'Tools', run: removeFrame },
    { id: 'animation.next', title: 'Animation: Next Frame', menu: 'Tools', run: e => step(e, 1) },
    { id: 'animation.prev', title: 'Animation: Previous Frame', menu: 'Tools', run: e => step(e, -1) },
];

/** A text field that commits on Enter or blur and shows the engine's value otherwise. */
function Field({ label, value, onCommit }: { label: string; value: number; onCommit: (text: string) => void }) {
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <label class="tl-field">{label}
            <input type="text" inputMode="numeric" value={draft ?? String(value)}
                   onInput={e => setDraft(e.currentTarget.value)}
                   onChange={e => { const t = e.currentTarget.value; setDraft(null); onCommit(t); }}
                   onBlur={() => setDraft(null)} />
        </label>
    );
}

function whole(text: string, name: string, min: number, max = Infinity) {
    if (!/^\d+$/.test(text.trim())) throw new Error(`${name} must be a whole number`);
    const n = Number(text);
    if (n < min || n > max) throw new Error(`${name} must be ${max === Infinity ? `at least ${min}` : `between ${min} and ${max}`}`);
    return n;
}

function Timeline({ engine }: { engine: Engine }) {
    const [anim, setAnim] = useState<AnimationState>({ framesPerSecond: 24, startTime: 0, endTime: 100, currentTime: 0 });
    const [rows, setRows] = useState<Row[]>([]);
    const [keys, setKeys] = useState<Record<NodeId, number[]>>({});
    const [active, setActive] = useState<NodeId | null>(null);
    const [onion, setOnion] = useState<Record<NodeId, boolean>>({});
    const [playing, setPlaying] = useState(false);
    const [loop, setLoop] = useState(false);
    const [cw, setCw] = useState(14);
    const [drag, setDrag] = useState<Drag | null>(null);
    const [error, setError] = useState('');
    const [, redraw] = useState(0);
    const scroller = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
    const S = useRef({
        anim, engineAnim: anim, busy: false, queued: null as Patch | null, loop, playing,
        rows, keys, active: null as NodeId | null, cw, drag: null as Drag | null,
        scrub: false, pan: null as null | { x: number; y: number; sl: number; st: number; moved: boolean }, press: null as null | { id: NodeId; frame: number },
        cols: 0,
    }).current;

    const effective = active && rows.some(r => r.id === active) ? active : rows[0]?.id ?? null;
    Object.assign(S, { rows, keys, active: effective, cw, drag, loop, playing });
    const activeKeys = (effective && keys[effective]) || [];
    const cols = Math.max(anim.endTime, anim.currentTime, ...Object.values(keys).flat()) + 1 + EXTRA;
    S.cols = cols;

    const run = (fn: () => Promise<unknown>) => { setError(''); return act(fn); };
    const setA = (a: AnimationState) => { S.anim = a; setAnim(a); };

    // One setAnimation in flight at a time; while it runs, newer changes merge into one queued call.
    const send = (patch: Patch) => {
        setA({ ...S.anim, ...patch });
        S.queued = { ...S.queued, ...patch };
        if (S.busy) return;
        const pump = () => {
            const p = S.queued;
            if (!p) return;
            S.queued = null; S.busy = true;
            // Only a failed call goes back to the engine's state; after a success S.anim already holds what was sent,
            // and the engine's own (older) state would make playback restart from a stale frame.
            engine.setAnimation(p).catch(e => { setError(msg(e)); if (!S.queued) setA(S.engineAnim); }).finally(() => { S.busy = false; pump(); });
        };
        pump();
    };
    live = { anim: () => S.anim, active: () => S.active, send, toggle: () => setPlaying(p => !p) };

    useEffect(() => {
        showError = setError;
        let gone = false;
        const rowHeight = () => { RH = coarse.matches ? 41 : 28; redraw(n => n + 1); };
        coarse.addEventListener('change', rowHeight); rowHeight();
        const loadKeys = (id: NodeId) => engine.keyframes(id).then(k => { if (!gone) setKeys(o => ({ ...o, [id]: k })); }, e => setError(msg(e)));
        const loadLayers = async () => {
            try {
                const r = rowsOf(await engine.layers());
                if (gone) return;
                setRows(r); setKeys(o => Object.fromEntries(r.map(x => [x.id, o[x.id] ?? []])));
                r.forEach(x => void loadKeys(x.id));
            } catch (e) { setError(msg(e)); }
        };
        void loadLayers();
        // Animation state exists only once a document is open; it is loaded again when one appears.
        const loadAnim = () => engine.documentInfo().then(d => d && engine.animation().then(a => { S.engineAnim = a; if (!S.busy) setA(a); })).catch(e => setError(msg(e)));
        void loadAnim();
        void activeNode(engine).then(id => { if (!gone) setActive(a => a ?? id); });
        const off = [
            engine.on('layersChanged', () => void loadLayers()),
            engine.on('documentChanged', () => { void loadLayers(); void loadAnim(); }),
            engine.on('keyframesChanged', id => void loadKeys(id)),
            engine.on('activeNodeChanged', setActive),
            engine.on('animationChanged', a => { S.engineAnim = a; if (!S.busy && !S.queued) setA(a); }),
        ];
        return () => { gone = true; coarse.removeEventListener('change', rowHeight); off.forEach(f => f()); live = null; showError = reportError; };
    }, [engine]);

    // Playback: the frame comes from elapsed wall-clock time, so a slow engine drops frames instead of slowing down.
    useEffect(() => {
        if (!playing) return;
        const a = S.anim;
        let f0 = a.currentTime >= a.startTime && a.currentTime <= a.endTime && !(a.currentTime === a.endTime && !S.loop) ? a.currentTime : a.startTime;
        let t0 = performance.now(), fps = a.framesPerSecond, expected = a.currentTime, id = 0;
        const tick = () => {
            const now = performance.now(), cur = S.anim;   // not rAF's timestamp: that is the frame start and can precede t0
            if (cur.currentTime !== expected) { f0 = cur.currentTime; t0 = now; expected = f0; }   // the user moved the playhead
            if (cur.framesPerSecond !== fps) { f0 = cur.currentTime; t0 = now; fps = cur.framesPerSecond; }
            let f = f0 + Math.max(0, Math.floor((now - t0) / 1000 * fps));
            if (f > cur.endTime) {
                if (S.loop) f = cur.startTime + (f - cur.startTime) % (cur.endTime - cur.startTime + 1);
                else { f = cur.endTime; if (f !== cur.currentTime) send({ currentTime: f }); setPlaying(false); return; }
            }
            if (f !== cur.currentTime) { send({ currentTime: f }); expected = f; }
            id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(id);
    }, [playing]);

    useEffect(() => {   // keep the playhead in view
        const sc = scroller.current!, x = anim.currentTime * cw, view = sc.clientWidth - NAMEW;
        if (x < sc.scrollLeft) sc.scrollLeft = x; else if (x + cw > sc.scrollLeft + view) sc.scrollLeft = x + cw - view;
    }, [anim.currentTime, cw]);

    const draw = () => {
        const c = canvas.current, sc = scroller.current;
        if (!c || !sc) return;
        const dpr = window.devicePixelRatio || 1, w = sc.clientWidth, h = sc.clientHeight;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        c.style.width = `${w}px`; c.style.height = `${h}px`; c.style.marginBottom = `${-h}px`;
        const css = getComputedStyle(c), col = (n: string) => css.getPropertyValue(n).trim();
        const g = c.getContext('2d')!;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.font = `11px ${css.fontFamily}`; g.textBaseline = 'middle';
        const sl = sc.scrollLeft, st = sc.scrollTop, a = S.anim, cw = S.cw;
        const fx = (f: number) => NAMEW + f * cw - sl;
        const f0 = Math.max(0, Math.floor(sl / cw)), f1 = Math.min(S.cols - 1, Math.ceil((sl + w - NAMEW) / cw));
        g.fillStyle = col('--panel'); g.fillRect(0, 0, w, h);
        g.save(); g.beginPath(); g.rect(NAMEW, 0, w - NAMEW, h); g.clip();
        g.fillStyle = col('--bg'); g.fillRect(fx(a.startTime), HEAD, (a.endTime - a.startTime + 1) * cw, h);   // playback range
        rowsLoop: for (let r = 0; r < S.rows.length; r++) {
            const y = HEAD + r * RH - st;
            if (y > h) break rowsLoop;
            if (y + RH < HEAD) continue;
            const row = S.rows[r], ks = S.keys[row.id] ?? [];
            if (row.id === S.active) { g.fillStyle = col('--panel-raised'); g.globalAlpha = .5; g.fillRect(NAMEW, y, w, RH); g.globalAlpha = 1; }
            ks.forEach((k, i) => {
                const next = ks[i + 1] ?? S.cols;
                if (next - 1 >= f0 && k <= f1) {
                    if (next - k > 1) { g.globalAlpha = .3; g.fillStyle = col('--text-dim'); g.fillRect(fx(k + 1), y + 4, (next - k - 1) * cw, RH - 8); g.globalAlpha = 1; }
                }
                if (k >= f0 && k <= f1) { g.fillStyle = col('--text'); g.fillRect(fx(k) + 1, y + 3, Math.max(2, cw - 2), RH - 6); }
            });
            g.fillStyle = col('--border'); g.fillRect(NAMEW, y + RH - 1, w, 1);
        }
        g.fillStyle = col('--border'); g.globalAlpha = .5;
        if (cw >= 6) for (let f = f0; f <= f1 + 1; f++) g.fillRect(fx(f), HEAD, 1, h);
        g.globalAlpha = 1;
        const ay = S.rows.findIndex(r => r.id === S.active);
        g.lineWidth = 2; g.strokeStyle = col('--accent');
        if (ay >= 0) g.strokeRect(fx(a.currentTime) + 1, HEAD + ay * RH - st + 1, cw - 2, RH - 3);
        if (S.drag) {
            const dy = S.rows.findIndex(r => r.id === S.drag!.id);
            g.setLineDash([3, 2]); g.strokeRect(fx(S.drag.to) + 1, HEAD + dy * RH - st + 1, cw - 2, RH - 3); g.setLineDash([]);
        }
        // header
        g.fillStyle = col('--panel'); g.fillRect(NAMEW, 0, w, HEAD);
        g.fillStyle = col('--bg'); g.fillRect(fx(a.startTime), HEAD - 8, (a.endTime - a.startTime + 1) * cw, 8);
        const every = cw >= 14 ? 5 : 10;
        g.fillStyle = col('--text-dim'); g.textAlign = 'left';
        for (let f = f0; f <= f1; f++) {
            if (f % every === 0) { g.fillRect(fx(f), HEAD - 10, 1, 10); g.fillText(String(f), fx(f) + 3, 9); }
            else if (cw >= 6) g.fillRect(fx(f), HEAD - 4, 1, 4);
        }
        g.fillStyle = col('--border'); g.fillRect(NAMEW, HEAD - 1, w, 1);
        const px = fx(a.currentTime) + cw / 2;
        g.fillStyle = col('--danger'); g.fillRect(px - 1, 0, 2, h);
        g.restore();
    };
    useEffect(draw);
    useEffect(() => {
        const sc = scroller.current!, ro = new ResizeObserver(draw);
        ro.observe(sc);
        return () => ro.disconnect();
    }, []);

    // --- pointer handling on the canvas (mouse, touch and pen)
    const local = (e: PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
    const frameAt = (x: number) => Math.min(S.cols - 1, Math.max(0, Math.floor((x - NAMEW + scroller.current!.scrollLeft) / S.cw)));
    const rowAt = (y: number) => S.rows[Math.floor((y - HEAD + scroller.current!.scrollTop) / RH)];
    const onDown = (e: PointerEvent) => {
        const [x, y] = local(e), f = frameAt(x);
        canvas.current!.setPointerCapture(e.pointerId);
        if (y < HEAD) { S.scrub = true; send({ currentTime: f }); return; }
        const row = rowAt(y), sc = scroller.current!;
        S.press = row ? { id: row.id, frame: f } : null;
        if (row && row.id === S.active && f === S.anim.currentTime && (S.keys[row.id] ?? []).includes(f)) setDrag({ id: row.id, from: f, to: f });
        else if (e.pointerType === 'touch') S.pan = { x: e.clientX, y: e.clientY, sl: sc.scrollLeft, st: sc.scrollTop, moved: false };   // touch-action is none, so pan by hand
    };
    const onMove = (e: PointerEvent) => {
        const [x] = local(e), sc = scroller.current!;
        if (S.scrub) { const f = frameAt(x); if (f !== S.anim.currentTime) send({ currentTime: f }); }   // moves within one frame cost nothing
        else if (S.drag) { const to = frameAt(x); if (to !== S.drag.to) setDrag({ ...S.drag, to }); }
        else if (S.pan) {
            const dx = e.clientX - S.pan.x, dy = e.clientY - S.pan.y;
            if (Math.abs(dx) + Math.abs(dy) > 6) S.pan.moved = true;
            sc.scrollLeft = S.pan.sl - dx; sc.scrollTop = S.pan.st - dy;
        }
    };
    const onUp = (e: PointerEvent, cancelled: boolean) => {
        const d = S.drag, press = S.press, moved = S.pan?.moved;
        S.scrub = false; S.pan = null; S.press = null; setDrag(null);
        if (cancelled) return;
        if (d) {
            if (d.to === d.from) return;
            if ((S.keys[d.id] ?? []).includes(d.to)) { setError(`Frame ${d.to} already has a keyframe`); return; }
            void run(async () => { await engine.moveKeyframe(d.id, d.from, d.to); send({ currentTime: d.to }); });
        } else if (press && !moved && (e.target as Element) === canvas.current && local(e)[1] >= HEAD) {
            if (press.id !== S.active) void run(() => engine.setActiveNode(press.id));
            send({ currentTime: press.frame });
        }
    };

    const onKey = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key === 'ArrowRight') send({ currentTime: S.anim.currentTime + 1 });
        else if (e.key === 'ArrowLeft') send({ currentTime: Math.max(0, S.anim.currentTime - 1) });
        else return;
        e.preventDefault();
    };

    const goto = (t: number) => send({ currentTime: t });
    const cur = anim.currentTime;
    const prevKey = activeKeys.filter(k => k < cur).at(-1), nextKey = activeKeys.find(k => k > cur);
    const commit = (fn: (t: string) => Patch) => (text: string) => { setError(''); try { send(fn(text)); } catch (e) { setError(msg(e)); } };
    const activeRow = rows.find(r => r.id === effective);
    const announce = playing ? '' : `Frame ${cur}${activeRow ? `, ${activeKeys.includes(cur) ? 'keyframe' : 'no keyframe'} on ${activeRow.name}` : ''}`;

    return (
        <div class="tl" tabIndex={0} role="group" aria-label="Animation timeline" onKeyDown={onKey}>
            <div class="tl-bar">
                <button type="button" aria-label="First frame" title="First frame" onClick={() => goto(anim.startTime)}>⏮</button>
                <button type="button" aria-label="Previous keyframe" title="Previous keyframe" disabled={prevKey === undefined} onClick={() => goto(prevKey!)}>◂◆</button>
                <button type="button" aria-label="Previous frame" title="Previous frame" disabled={cur <= 0} onClick={() => goto(cur - 1)}>◂</button>
                <button type="button" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? '⏸' : '▶'}</button>
                <button type="button" aria-label="Next frame" title="Next frame" onClick={() => goto(cur + 1)}>▸</button>
                <button type="button" aria-label="Next keyframe" title="Next keyframe" disabled={nextKey === undefined} onClick={() => goto(nextKey!)}>◆▸</button>
                <button type="button" aria-label="Last frame" title="Last frame" onClick={() => goto(anim.endTime)}>⏭</button>
                <button type="button" aria-pressed={loop} onClick={() => setLoop(!loop)}>Loop</button>
                <span class="sep" />
                <Field label="Frame" value={cur} onCommit={commit(t => ({ currentTime: whole(t, 'Frame', 0) }))} />
                <Field label="FPS" value={anim.framesPerSecond} onCommit={commit(t => ({ framesPerSecond: whole(t, 'Frame rate', 1, 240) }))} />
                <Field label="Start" value={anim.startTime} onCommit={commit(t => {
                    const n = whole(t, 'Start', 0);
                    if (n > anim.endTime) throw new Error('Start must not be after end');
                    return { startTime: n };
                })} />
                <Field label="End" value={anim.endTime} onCommit={commit(t => {
                    const n = whole(t, 'End', 0);
                    if (n < anim.startTime) throw new Error('End must not be before start');
                    return { endTime: n };
                })} />
                <span class="sep" />
                <button type="button" disabled={!effective} onClick={() => run(() => addFrame(engine, false))}>Add blank frame</button>
                <button type="button" disabled={!effective} onClick={() => run(() => addFrame(engine, true))}>Add duplicate frame</button>
                <button type="button" disabled={!effective} onClick={() => run(() => removeFrame(engine))}>Remove frame</button>
                <label class="tl-field tl-zoom">Zoom
                    <input type="range" min="4" max="40" value={cw} onInput={e => setCw(e.currentTarget.valueAsNumber)} />
                </label>
            </div>
            <div class="tl-scroll" ref={scroller} onScroll={() => requestAnimationFrame(draw)}>
                <div class="tl-body" style={{ width: NAMEW + cols * cw, height: HEAD + rows.length * RH, minHeight: scroller.current?.clientHeight }}>
                    <canvas class="tl-grid" ref={canvas} aria-hidden="true"
                            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={e => onUp(e, false)} onPointerCancel={e => onUp(e, true)} />
                    <div class="tl-corner" style={{ width: NAMEW, height: HEAD, marginBottom: -HEAD }}>Layers</div>
                    <div class="tl-names" role="list" aria-label="Animated layers" style={{ width: NAMEW, height: rows.length * RH, marginTop: HEAD }}>
                        {rows.map(r => (
                            <div key={r.id} role="listitem" data-row={r.id} class={`tl-name${r.id === effective ? ' active' : ''}`} style={{ height: RH }}>
                                <button type="button" class="nm" style={{ paddingLeft: 6 + r.depth * 10 }} aria-current={r.id === effective}
                                        onClick={() => void run(() => engine.setActiveNode(r.id))}>{r.name}</button>
                                <button type="button" class="onion" aria-pressed={!!onion[r.id]} aria-label={`Onion skin on ${r.name}`} title="Onion skin"
                                        onClick={() => void run(async () => { const on = !onion[r.id]; await engine.setOnionSkin(r.id, on); setOnion(o => ({ ...o, [r.id]: on })); })}>◐</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {error && <p class="tl-error" role="alert"><span>{error}</span> <button type="button" onClick={() => setError('')}>Dismiss</button></p>}
            <div class="tl-sr" aria-live="polite" aria-atomic="true">{announce}</div>
        </div>
    );
}

const panel: Panel = { id: 'timeline', title: 'Timeline', area: 'bottom', component: Timeline, commands };
export default panel;
