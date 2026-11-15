import type { Engine } from '../engine/protocol';
import { panels } from '../panels';

// Placeholder shell: lists the registered panels. The Phase 1 track replaces this file.
export function App({ engine }: { engine: Engine }) {
    return (
        <main>
            {panels.map(p => <section key={p.id}><h2>{p.title}</h2><p.component engine={engine} /></section>)}
        </main>
    );
}
