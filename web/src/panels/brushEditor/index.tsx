// Brush editor: the options of the current preset's engine, laid out like Krita's own brush editor (option list on
// the left, the chosen option's controls on the right; a collapsible accordion when the panel is narrow). The
// labels, ranges and choices come from descriptions/brushes.ts; sensor curves and the brush tip are stored as XML
// inside single settings and are edited by SensorBlock and TipEditor below.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ConfigDescription, Engine, Preset, PropertySpec, PropertyValue } from '../../engine/protocol';
import { describe, GROUP_ENABLE, READ_ONLY, SENSOR_GROUPS, TIP_GROUPS } from '../../descriptions';
import type { Panel } from '../../panels';
import { CurveEditor } from '../../ui/CurveEditor';
import { PropertyForm } from '../../ui/PropertyForm';
import { parseSensor, validCurve, withCurve } from './sensors';
import { fieldsFor, getAttr, readField, tipType, writeField } from './tip';
import './brushEditor.css';

type Values = Record<string, PropertyValue>;
const isOn = (v: PropertyValue | undefined) => v === true || v === 'true';
/** Engine writes are coalesced per key: a slider drag sends its last value, not every step. */
const WRITE_DELAY_MS = 80;

interface Group { name: string; specs: PropertySpec[]; enable?: string }

/** The keys SensorBlock shows itself, per curve-option group. */
function sensorKeys(name: string) {
    const g = SENSOR_GROUPS[name];
    if (!g) return null;
    const k = (s: string) => g.prefix + s;
    return {
        enable: g.checkable ? k(`Pressure${g.id}`) : undefined,
        form: [`${g.id}UseCurve`, `${g.id}Value`, `${g.id}UseSameCurve`, `${g.id}curveMode`].map(k),
        sensor: k(`${g.id}Sensor`),
    };
}

function groupsOf(description: ConfigDescription): Group[] {
    const map = new Map<string, PropertySpec[]>();
    for (const s of description.specs) map.set(s.group ?? '', [...(map.get(s.group ?? '') ?? []), s]);
    return [...map].map(([name, specs]) => ({ name, specs, enable: sensorKeys(name)?.enable ?? GROUP_ENABLE[name] }));
}

function ReadOnlyRows({ specs, values }: { specs: PropertySpec[]; values: Values }) {
    return <>{specs.map(s => (
        <div class="pf-row" key={s.key}>
            <span class="pf-label">{s.label}</span>
            <code class="be-ro" title={String(values[s.key] ?? '')}>{String(values[s.key] ?? '') || '(none)'}</code>
        </div>
    ))}</>;
}

/** Specs rendered as a plain form, read-only ones as text. */
function Rows({ specs, values, defaults, onChange }: { specs: PropertySpec[]; values: Values; defaults: Values; onChange: (k: string, v: PropertyValue) => void }) {
    const editable = specs.filter(s => !READ_ONLY.has(s.key));
    const ro = specs.filter(s => READ_ONLY.has(s.key));
    return <>
        {editable.length > 0 && <PropertyForm description={{ specs: editable.map(s => ({ ...s, group: undefined })), defaults }} values={values} onChange={onChange} />}
        <ReadOnlyRows specs={ro} values={values} />
    </>;
}

/** Enable flag, strength, curve mode and the pen-pressure curve of one curve option. */
function SensorBlock({ group, specs, values, defaults, onChange }: { group: string; specs: PropertySpec[]; values: Values; defaults: Values; onChange: (k: string, v: PropertyValue) => void }) {
    const keys = sensorKeys(group)!;
    const xml = String(values[keys.sensor] ?? '');
    const info = parseSensor(xml);
    const editable = info.curve !== null && validCurve(info.curve);
    const form = specs.filter(s => keys.form.includes(s.key));
    return (
        <div class="be-sensor">
            <Rows specs={form} values={values} defaults={defaults} onChange={onChange} />
            {values[keys.sensor] !== undefined && (
                <div class="be-curve">
                    <p class="be-note">Sensor: {info.names.length ? info.names.join(' + ') : 'none'}</p>
                    {editable
                        ? <CurveEditor value={info.curve!} label={`${group} curve`}
                                       onChange={c => { const next = withCurve(xml, c); if (next) onChange(keys.sensor, next); }} />
                        : <p class="be-note">{info.names.length > 1 ? 'This option combines several sensors; their curves can not be edited here.' : 'This sensor curve can not be edited here.'}</p>}
                </div>
            )}
        </div>
    );
}

/** The brush tip: attributes of the brush_definition XML, only the ones Krita's tip dialog has. */
function TipEditor({ keyName, values, onChange }: { keyName: string; values: Values; onChange: (k: string, v: PropertyValue) => void }) {
    const xml = String(values[keyName] ?? '');
    const fields = fieldsFor(xml);
    const specs: PropertySpec[] = fields.map(f => ({
        key: f.attr, label: f.label, kind: f.kind, min: f.min, max: f.max, step: f.step,
        choices: f.choices?.map(([value, label]) => ({ value, label })),
    }));
    const shown: Values = {};
    for (const f of fields) { const v = readField(xml, f); if (v !== null) shown[f.attr] = v; }
    const file = getAttr(xml, 'Brush', 'filename');
    return (
        <div class="be-tip">
            <p class="be-note">Tip type: {tipType(xml) || 'unknown'}{file ? `, file ${file}` : ''}</p>
            <PropertyForm description={{ specs, defaults: {} }} values={shown}
                          onChange={(attr, v) => { const f = fields.find(x => x.attr === attr); const next = f && writeField(xml, f, v as number | boolean | string); if (next) onChange(keyName, next); }} />
        </div>
    );
}

function GroupPane({ group, values, defaults, onChange }: { group: Group; values: Values; defaults: Values; onChange: (k: string, v: PropertyValue) => void }) {
    const sk = sensorKeys(group.name);
    const sensor = sk && group.specs.some(s => s.key === sk.sensor || sk.form.includes(s.key)) ? sk : null;
    const tipKey = values[TIP_GROUPS[group.name]] !== undefined ? TIP_GROUPS[group.name] : undefined;
    const used = new Set<string>([...(sensor ? [...sensor.form, sensor.sensor, ...(sensor.enable ? [sensor.enable] : [])] : []), ...(tipKey ? [tipKey] : [])]);
    let rest = group.specs.filter(s => !used.has(s.key) && s.key !== group.enable);
    if (rest.length === 0 && !sensor && !tipKey && group.enable) rest = group.specs.filter(s => s.key === group.enable);
    return <div class="be-pane">
        {tipKey && <TipEditor keyName={tipKey} values={values} onChange={onChange} />}
        {sensor && <SensorBlock group={group.name} specs={group.specs} values={values} defaults={defaults} onChange={onChange} />}
        <Rows specs={rest} values={values} defaults={defaults} onChange={onChange} />
    </div>;
}

function BrushEditor({ engine }: { engine: Engine }) {
    const [preset, setPreset] = useState<Preset | null>(null);
    const [settings, setSettings] = useState<{ description: ConfigDescription; values: Values } | null>(null);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState('');
    const [narrow, setNarrow] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const valuesRef = useRef<Values>({});
    const timers = useRef(new Map<string, number>());

    useEffect(() => {
        let current: string | null | undefined;
        let request = 0;
        const load = async (id: string | null) => {
            const mine = ++request;
            try {
                const [s, all, state] = await Promise.all([engine.presetSettings(), engine.presets(), id === null ? engine.brushState() : null]);
                if (mine !== request) return;
                if (state) id = state.presetId;
                valuesRef.current = s.values;
                setSettings(s); setPreset(all.find(p => p.id === id) ?? null); setError('');
            } catch (e) { if (mine === request) setError(String(e instanceof Error ? e.message : e)); }
        };
        load(null);
        const off = engine.on('brushChanged', b => { if (b.presetId !== current) { current = b.presetId; load(b.presetId); } });
        return () => { off(); timers.current.forEach(t => clearTimeout(t)); };
    }, [engine]);

    useEffect(() => {
        const el = root.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 480));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const engineId = preset?.engine ?? String(settings?.values.paintop ?? '');
    const description = useMemo(() => settings && describe('brush', engineId, settings.description), [settings?.description, engineId]);
    const groups = useMemo(() => description ? groupsOf(description) : [], [description]);
    const active = groups.find(g => g.name === selected) ?? groups[0];

    const send = (key: string, value: PropertyValue) => {
        clearTimeout(timers.current.get(key));
        timers.current.set(key, window.setTimeout(() => {
            timers.current.delete(key);
            engine.setPresetSetting(key, value).then(() => setError(''), e => setError(String(e instanceof Error ? e.message : e)));
        }, WRITE_DELAY_MS));
    };
    const change = (key: string, value: PropertyValue) => {
        valuesRef.current = { ...valuesRef.current, [key]: value };
        setSettings(s => s && { ...s, values: valuesRef.current });
        send(key, value);
    };

    const q = query.trim().toLowerCase();
    const found = useMemo(() => q ? groups.flatMap(g => g.specs
        .filter(s => (s.label.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)))
        .map(s => ({ ...s, group: undefined, label: g.name ? `${g.name}: ${s.label}` : s.label }))) : [], [groups, q]);

    const defaults = description?.defaults ?? {};
    const values = settings?.values ?? {};
    const label = (g: Group) => g.name || 'Settings';
    const toggleBox = (g: Group): ComponentChildren => g.enable && (
        <input type="checkbox" class="be-enable" aria-label={`Enable ${label(g)}`} checked={isOn(values[g.enable])}
               onClick={e => e.stopPropagation()} onChange={e => change(g.enable!, e.currentTarget.checked)} />
    );

    return (
        <div class={'brush-editor' + (narrow ? ' narrow' : '')} ref={root}>
            <h3>{preset?.name ?? 'Current brush'}</h3>
            {preset && <p class="be-engine">Engine: {preset.engine}</p>}
            {error && <p role="alert" class="be-error">{error}</p>}
            {settings && <>
                <input type="search" class="be-search" placeholder="Search settings" aria-label="Search settings" value={query}
                       onInput={e => setQuery(e.currentTarget.value)} />
                {q ? (
                    found.length
                        ? <PropertyForm description={{ specs: found.filter(s => !READ_ONLY.has(s.key)), defaults }} values={values} onChange={change} />
                        : <p class="be-note">No setting matches "{query}".</p>
                ) : (
                    <div class="be-body">
                        <ul class="be-groups" role="list">
                            {groups.map(g => {
                                const open = g === active;
                                return (
                                    <li key={g.name} class={open ? 'open' : ''}>
                                        <div class="be-group-row">
                                            {toggleBox(g)}
                                            <button type="button" class="be-group" aria-expanded={open} aria-current={open ? 'true' : undefined}
                                                    onClick={() => setSelected(g.name)}>{label(g)}</button>
                                        </div>
                                        {narrow && open && <GroupPane group={g} values={values} defaults={defaults} onChange={change} />}
                                    </li>
                                );
                            })}
                        </ul>
                        {!narrow && active && <GroupPane key={active.name} group={active} values={values} defaults={defaults} onChange={change} />}
                    </div>
                )}
            </>}
        </div>
    );
}

const panel: Panel = { id: 'brushEditor', title: 'Brush Editor', area: 'right', order: 20, component: BrushEditor };
export default panel;
