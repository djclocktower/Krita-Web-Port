import type { PropertyValue } from '../../engine/protocol';

/** A <select> hands back text; a setting whose engine default is a number must stay a number. */
export function coerce(defaults: Record<string, PropertyValue>, key: string, v: PropertyValue): PropertyValue {
    return typeof defaults[key] === 'number' && typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : v;
}
