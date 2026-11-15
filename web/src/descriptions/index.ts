// Applies Krita-accurate labels, ranges, choices and grouping to the engine's generated filter forms.
import type { ConfigDescription, PropertySpec } from '../engine/protocol';
import { FILTERS } from './filters';
import { GENERATORS } from './generators';
export type { Row, Table } from './types';

export function describe(kind: 'filter' | 'generator', id: string, fromEngine: ConfigDescription): ConfigDescription {
    const table = (kind === 'filter' ? FILTERS : GENERATORS)[id];
    if (!table) return fromEngine;
    const byKey = new Map(fromEngine.specs.map(s => [s.key, s]));
    const out: PropertySpec[] = [];
    for (const row of table) {
        const spec = byKey.get(row.key);
        byKey.delete(row.key);
        if (!spec || row.hidden) continue;
        const { hidden: _h, choices, ...rest } = row;
        const next: PropertySpec = { ...spec, ...rest };
        if (choices) next.kind = 'choice';
        if (choices) next.choices = choices.map((c, i) => typeof c === 'string' ? { value: String(i), label: c } : { value: c[0], label: c[1] });
        out.push(next);
    }
    // Keys the engine reports that no row mentions pass through untouched.
    for (const spec of fromEngine.specs) if (byKey.has(spec.key)) out.push(spec);
    return { specs: out, defaults: fromEngine.defaults };
}
