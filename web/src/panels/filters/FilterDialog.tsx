// One dialog for: applying a filter to the active node ('apply', with live preview), and choosing a
// filter or generator plus settings for a new filter layer / fill layer / filter mask (no preview).
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ConfigDescription, Engine, FilterInfo, NodeId, PropertyValue } from '../../engine/protocol';
import { describe } from '../../descriptions';
import { PropertyForm } from '../../ui/PropertyForm';
import { activeNode } from '../layers/active';
import { coerce } from './coerce';
import './filters.css';

export type FilterMode = 'apply' | 'filter' | 'fill' | 'filterMask';
export interface Choice { configId: string; config: Record<string, PropertyValue> }

const TITLES: Record<FilterMode, string> = {
    apply: 'Filter', filter: 'New Filter Layer', fill: 'New Fill Layer', filterMask: 'New Filter Mask',
};
const message = (e: unknown) => e instanceof Error ? e.message : String(e);

/** Resolves with the choice (add modes) or after applying (apply mode); null when cancelled. */
export async function openFilterDialog(engine: Engine, mode: FilterMode, category?: string): Promise<Choice | null> {
    const nodeId = mode === 'apply' ? await activeNode(engine) : null;
    return new Promise(resolve => {
        const host = document.createElement('div');
        document.body.append(host);
        const done = (c: Choice | null) => { render(null, host); host.remove(); resolve(c); };
        render(<FilterDialog engine={engine} mode={mode} nodeId={nodeId} category={category} onDone={done} />, host);
    });
}

interface Props { engine: Engine; mode: FilterMode; nodeId: NodeId | null; category?: string; onDone: (c: Choice | null) => void }

function FilterDialog({ engine, mode, nodeId, category, onDone }: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [list, setList] = useState<FilterInfo[]>([]);
    const [search, setSearch] = useState('');
    const [sel, setSel] = useState<string | null>(null);
    const [desc, setDesc] = useState<ConfigDescription | null>(null);
    const [values, setValues] = useState<Record<string, PropertyValue>>({});
    const [preview, setPreview] = useState(true);
    const [error, setError] = useState('');
    const timer = useRef(0), previewing = useRef(false), finished = useRef(false), token = useRef(0);
    const generators = mode === 'fill', canPreview = mode === 'apply' && nodeId !== null;

    const clearPreview = async () => {
        clearTimeout(timer.current);
        if (!previewing.current || !nodeId) return;
        previewing.current = false;
        try { await engine.previewFilter(nodeId, null); } catch (e) { setError(message(e)); }
    };
    const finish = async (choice: Choice | null) => {
        if (finished.current) return;
        finished.current = true;
        await clearPreview();
        onDone(choice);
    };
    const select = async (id: string) => {
        const mine = ++token.current;
        try {
            const d = describe(generators ? 'generator' : 'filter', id, await (generators ? engine.generatorConfig(id) : engine.filterConfig(id)));
            if (mine !== token.current) return;
            setSel(id); setDesc(d); setValues({ ...d.defaults }); setError('');
        } catch (e) { setError(message(e)); }
    };

    useEffect(() => {
        dialog.current!.showModal();
        (async () => {
            try {
                const all = await (generators ? engine.generators() : engine.filters());
                const usable = mode === 'apply' || generators ? all : all.filter(f => f.supportsAdjustmentLayers);
                setList(usable);
                const first = usable.find(f => f.category === category) ?? usable[0];
                if (first) await select(first.id);
            } catch (e) { setError(message(e)); }
        })();
        return () => clearTimeout(timer.current);
    }, []);

    // Debounced live preview. Every path that closes the dialog goes through finish(), which clears it.
    useEffect(() => {
        if (!canPreview || !sel || !desc) return;
        clearTimeout(timer.current);
        if (!preview) { void clearPreview(); return; }
        timer.current = window.setTimeout(() => {
            previewing.current = true;
            engine.previewFilter(nodeId!, sel, values).catch(e => setError(message(e)));
        }, 150);
    }, [sel, desc, values, preview]);

    const ok = async () => {
        if (!sel) return;
        if (mode === 'apply') {
            if (!nodeId) return;
            try { await engine.applyFilter(nodeId, sel, values); } catch (e) { setError(message(e)); return; }
        }
        await finish({ configId: sel, config: values });
        dialog.current?.close();
    };

    const q = search.trim().toLowerCase();
    const shown = list.filter(f => !q || f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
    const categories = [...new Set(shown.map(f => f.category))];

    return (
        <dialog ref={dialog} class="fd" aria-labelledby="fd-title" onClose={() => void finish(null)}>
            <h2 id="fd-title">{TITLES[mode]}</h2>
            <div class="fd-body">
                <div class="fd-list">
                    <input type="search" aria-label={generators ? 'Search generators' : 'Search filters'} placeholder="Search"
                           value={search} onInput={e => setSearch(e.currentTarget.value)} />
                    <div class="fd-scroll">
                        {categories.map(c => (
                            <section key={c}>
                                <h3>{c}</h3>
                                <ul>
                                    {shown.filter(f => f.category === c).map(f => (
                                        <li key={f.id}>
                                            <button type="button" aria-pressed={f.id === sel} onClick={() => void select(f.id)}>{f.name}</button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                        {!categories.length && <p class="fd-dim">Nothing matches.</p>}
                    </div>
                </div>
                <div class="fd-settings">
                    {desc && (desc.specs.length
                        ? <PropertyForm description={desc} values={values}
                                        onChange={(k, v) => {
                                            if (typeof v === 'number' && isNaN(v)) return;
                                            const value = coerce(desc.defaults, k, v);
                                            setValues(p => ({ ...p, [k]: value }));
                                        }} />
                        : <p class="fd-dim">This has no settings.</p>)}
                </div>
            </div>
            {mode === 'apply' && !nodeId && <p class="fd-error" role="alert">There is no layer to apply a filter to.</p>}
            {error && <p class="fd-error" role="alert">{error}</p>}
            <footer>
                {canPreview && <label class="fd-preview"><input type="checkbox" checked={preview}
                                      onChange={e => setPreview(e.currentTarget.checked)} /> Preview</label>}
                <button type="button" onClick={() => dialog.current?.close()}>Cancel</button>
                <button type="button" class="primary" disabled={!sel || (mode === 'apply' && !nodeId)} onClick={() => void ok()}>OK</button>
            </footer>
        </dialog>
    );
}
