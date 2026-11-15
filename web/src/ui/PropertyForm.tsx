// Generates a form from a ConfigDescription (brush settings, filter settings, generator settings).
// The interface below is fixed; the Phase 2 track owns the implementation and richer editors.
import type { ConfigDescription, PropertyValue } from '../engine/protocol';

export interface PropertyFormProps {
    description: ConfigDescription;
    values: Record<string, PropertyValue>;
    onChange: (key: string, value: PropertyValue) => void;
}

export function PropertyForm({ description, values, onChange }: PropertyFormProps) {
    return (
        <div class="property-form">
            {description.specs.map(spec => {
                const value = values[spec.key] ?? description.defaults[spec.key];
                const id = `prop-${spec.key}`;
                return (
                    <label key={spec.key} for={id}>
                        <span>{spec.label}</span>
                        {spec.kind === 'boolean'
                            ? <input id={id} type="checkbox" checked={Boolean(value)}
                                     onChange={e => onChange(spec.key, e.currentTarget.checked)} />
                            : spec.kind === 'choice'
                            ? <select id={id} value={String(value)} onChange={e => onChange(spec.key, e.currentTarget.value)}>
                                  {spec.choices?.map(c => <option value={c.value}>{c.label}</option>)}
                              </select>
                            : spec.kind === 'color'
                            ? <input id={id} type="color" value={String(value)} onInput={e => onChange(spec.key, e.currentTarget.value)} />
                            : spec.kind === 'string' || spec.kind === 'curve'
                            ? <input id={id} type="text" value={String(value)} onChange={e => onChange(spec.key, e.currentTarget.value)} />
                            : <input id={id} type="number" value={Number(value)} min={spec.min} max={spec.max}
                                     step={spec.step ?? (spec.kind === 'integer' ? 1 : 'any')}
                                     onChange={e => onChange(spec.key, e.currentTarget.valueAsNumber)} />}
                    </label>
                );
            })}
        </div>
    );
}
