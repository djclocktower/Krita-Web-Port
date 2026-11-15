import { useEffect, useState } from 'preact/hooks';
import type { Engine } from '../../engine/protocol';
import type { Panel } from '../../panels';
import { reportError } from '../../shell/errors';
import { openFilterDialog } from './FilterDialog';
import './filters.css';

function Filters({ engine }: { engine: Engine }) {
    const [categories, setCategories] = useState<string[]>([]);
    const [error, setError] = useState('');
    useEffect(() => {
        engine.filters().then(f => setCategories([...new Set(f.map(x => x.category))]), e => setError(String(e?.message ?? e)));
    }, [engine]);
    const open = (category?: string) => openFilterDialog(engine, 'apply', category).catch(e => setError(String(e?.message ?? e)));
    return (
        <div class="filters-panel">
            <button type="button" onClick={() => open()}>Filters…</button>
            {categories.map(c => <button type="button" key={c} onClick={() => open(c)}>{c}</button>)}
            {error && <p class="fd-error" role="alert">{error}</p>}
        </div>
    );
}

const panel: Panel = {
    id: 'filters', title: 'Filters', area: 'right', order: 10, component: Filters,
    commands: [{
        id: 'filter.gallery', title: 'Filters…', menu: 'Filter',
        run: engine => { void openFilterDialog(engine, 'apply').catch(e => reportError(String(e?.message ?? e))); },
    }],
};
export default panel;
