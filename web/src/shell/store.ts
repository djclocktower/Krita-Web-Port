import { useEffect, useState } from 'preact/hooks';

/** A tiny observable value: `set` merges, `sub` listens, `useStore` re-renders a component on change. */
export interface Store<T> { get(): T; set(patch: Partial<T>): void; sub(fn: () => void): () => void }

export function store<T extends object>(init: T): Store<T> {
    let state = init;
    const subs = new Set<() => void>();
    return {
        get: () => state,
        set(patch) { state = { ...state, ...patch }; subs.forEach(f => f()); },
        sub(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    };
}

export function useStore<T>(s: Store<T>): T {
    const [, bump] = useState(0);
    useEffect(() => s.sub(() => bump(n => n + 1)), [s]);
    return s.get();
}
