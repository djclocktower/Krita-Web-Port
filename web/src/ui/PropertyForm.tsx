// Generates a form from a ConfigDescription (brush settings, filter settings, generator settings).
// Settings with a `group` go under collapsible headings; numbers get a slider plus a validated input.
import { useId } from 'preact/hooks';
import type { ConfigDescription, PropertySpec, PropertyValue } from '../engine/protocol';
import { CurveEditor } from './CurveEditor';
import { DEFAULT_CURVE } from './curve';
import './PropertyForm.css';

export interface PropertyFormProps {
    description: ConfigDescription;
    values: Record<string, PropertyValue>;
    onChange: (key: string, value: PropertyValue) => void;
}

const HEX = /^#[0-9a-f]{6}$/i;

function Field({ spec, value, id, onChange }: { spec: PropertySpec; value: PropertyValue; id: string; onChange: (v: PropertyValue) => void }) {
    switch (spec.kind) {
        case 'boolean':
            return <input id={id} type="checkbox" checked={value === true || value === 'true'}
                          onChange={e => onChange(e.currentTarget.checked)} />;
        case 'choice':
            return <select id={id} value={String(value)} onChange={e => onChange(e.currentTarget.value)}>
                       {spec.choices?.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                   </select>;
        case 'color': {
            const hex = HEX.test(String(value)) ? String(value) : '#000000';
            return <span class="pf-color"><input id={id} type="color" value={hex} onInput={e => onChange(e.currentTarget.value)} />
                       <code>{hex}</code></span>;
        }
        case 'curve':
            return <CurveEditor value={String(value || DEFAULT_CURVE)} label={spec.label} onChange={onChange} />;
        case 'string':
            return <input id={id} type="text" value={String(value)} onChange={e => onChange(e.currentTarget.value)} />;
        default: {
            const { min, max } = spec, int = spec.kind === 'integer';
            const fix = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, int ? Math.round(n) : n));
            const num = Number(value);
            const step = spec.step ?? (int ? 1 : 'any');
            return <span class="pf-number">
                {min !== undefined && max !== undefined &&
                    <input type="range" aria-label={spec.label} min={min} max={max} step={step} value={Number.isFinite(num) ? num : min}
                           onInput={e => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) onChange(fix(n)); }} />}
                <input id={id} type="number" min={min} max={max} step={step} value={Number.isFinite(num) ? num : ''}
                       onChange={e => {
                           const n = e.currentTarget.valueAsNumber;
                           if (!Number.isFinite(n)) { e.currentTarget.value = String(value); return; }
                           e.currentTarget.value = String(fix(n)); onChange(fix(n));
                       }} />
            </span>;
        }
    }
}

export function PropertyForm({ description, values, onChange }: PropertyFormProps) {
    const prefix = useId();
    const groups = new Map<string, PropertySpec[]>();
    for (const s of description.specs) groups.set(s.group ?? '', [...(groups.get(s.group ?? '') ?? []), s]);
    const rows = (specs: PropertySpec[]) => specs.map(spec => {
        const id = `${prefix}-${spec.key}`;
        const value = values[spec.key] ?? description.defaults[spec.key] ?? (spec.kind === 'boolean' ? false : '');
        return (
            <div class="pf-row" key={spec.key}>
                {spec.kind === 'curve' ? <span class="pf-label">{spec.label}</span> : <label for={id}>{spec.label}</label>}
                <Field spec={spec} value={value} id={id} onChange={v => onChange(spec.key, v)} />
            </div>
        );
    });
    return (
        <div class="property-form">
            {rows(groups.get('') ?? [])}
            {[...groups].filter(([g]) => g).map(([g, specs]) => (
                <details key={g} open><summary>{g}</summary>{rows(specs)}</details>
            ))}
        </div>
    );
}
