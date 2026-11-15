import type { BlendMode } from '../../engine/protocol';

export function BlendSelect({ modes, value, onChange, disabled, label }:
    { modes: BlendMode[]; value: string; onChange: (id: string) => void; disabled?: boolean; label?: string }) {
    const categories = [...new Set(modes.map(m => m.category))];
    return (
        <select aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.currentTarget.value)}>
            {categories.map(c => (
                <optgroup key={c} label={c}>
                    {modes.filter(m => m.category === c).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
            ))}
        </select>
    );
}
