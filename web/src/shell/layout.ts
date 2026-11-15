import { useEffect, useState } from 'preact/hooks';
import { store, useStore } from './store';

/** wide: docks beside the canvas; medium (tablet): docks are overlay sheets; narrow (phone): one bottom sheet. */
export type Layout = 'wide' | 'medium' | 'narrow';

const compute = (): Layout => matchMedia('(max-width: 699px)').matches ? 'narrow' : matchMedia('(max-width: 1099px)').matches ? 'medium' : 'wide';

export function useLayout(): Layout {
    const [layout, set] = useState(compute);
    useEffect(() => {
        const qs = [matchMedia('(max-width: 699px)'), matchMedia('(max-width: 1099px)')], f = () => set(compute());
        qs.forEach(q => q.addEventListener('change', f));
        return () => qs.forEach(q => q.removeEventListener('change', f));
    }, []);
    return layout;
}

/** Which overlay sheet is open: a dock's area (medium), 'all' for the phone's panel sheet, or none. One at a time. */
export const sheet = store({ open: null as string | null });
export const useSheet = () => useStore(sheet);
