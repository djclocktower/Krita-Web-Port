import type { PropertySpec } from '../engine/protocol';

/** One override row. `choices`: a plain string is a label whose stored value is its index. */
export interface Row {
    key: string; label: string; kind?: PropertySpec['kind'];
    min?: number; max?: number; step?: number;
    choices?: (string | [value: string, label: string])[];
    group?: string; hidden?: boolean;
}
export type Table = Row[];

/** Row shorthands, to keep the tables compact. */
export const r = (key: string, label: string, o: Partial<Row> = {}): Row => ({ key, label, ...o });
export const hide = (...keys: string[]): Row[] => keys.map(key => ({ key, label: key, hidden: true }));
/** Applies one group name to a set of rows. */
export const grp = (group: string, rows: Row[]): Row[] => rows.map(x => ({ ...x, group }));

