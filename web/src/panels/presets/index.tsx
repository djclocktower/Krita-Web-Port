import { useEffect, useRef, useState } from 'preact/hooks';
import type { Engine, Preset } from '../../engine/protocol';
import type { Panel } from '../../panels';
import './presets.css';

const message = (e: unknown) => String(e instanceof Error ? e.message : e);
const CHANGED = 'krita:resources-changed';

/** Imports each file; returns one error line per failure. Tells every presets panel to reload if any succeeded. */
async function importFiles(engine: Engine, files: File[]): Promise<string[]> {
    const errors: string[] = [];
    let ok = false;
    for (const f of files) {
        try { await engine.importResource(f.name, new Uint8Array(await f.arrayBuffer())); ok = true; }
        catch (e) { errors.push(`${f.name}: ${message(e)}`); }
    }
    if (ok) window.dispatchEvent(new Event(CHANGED));
    return errors;
}

const ACCEPT = '.bundle,.kpp,.abr,.gbr,.gih,.pat,.ggr,.kpl';

function pickFiles(): Promise<File[]> {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.multiple = true; input.accept = ACCEPT;
        input.onchange = () => resolve([...input.files!]);
        input.click();
    });
}

/** Loads its thumbnail only once scrolled into view. */
function Thumb({ engine, preset, current, onSelect }: { engine: Engine; preset: Preset; current: boolean; onSelect: () => void }) {
    const button = useRef<HTMLButtonElement>(null);
    const [seen, setSeen] = useState(false);
    const [url, setUrl] = useState('');
    useEffect(() => {
        const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } });
        io.observe(button.current!);
        return () => io.disconnect();
    }, []);
    useEffect(() => {
        if (!seen) return;
        let made = '', stale = false;
        engine.presetThumbnail(preset.id).then(png => {
            if (!stale) setUrl(made = URL.createObjectURL(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' })));
        }, () => {});
        return () => { stale = true; if (made) URL.revokeObjectURL(made); };
    }, [seen, preset.id, engine]);
    return (
        <button ref={button} type="button" class={'preset' + (current ? ' current' : '')} aria-label={preset.name}
                title={preset.name} aria-pressed={current} onClick={onSelect}>
            {url ? <img src={url} alt="" draggable={false} /> : null}
        </button>
    );
}

function Presets({ engine }: { engine: Engine }) {
    const [list, setList] = useState<Preset[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [tag, setTag] = useState('');
    const [current, setCurrent] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [dragging, setDragging] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => { const t = setTimeout(() => setQuery(search), 200); return () => clearTimeout(t); }, [search]);
    useEffect(() => {
        const bump = () => setReload(n => n + 1);
        window.addEventListener(CHANGED, bump);
        const off = engine.on('brushChanged', b => setCurrent(b.presetId));
        return () => { window.removeEventListener(CHANGED, bump); off(); };
    }, [engine]);
    useEffect(() => { engine.presetTags().then(setTags, e => setError(message(e))); }, [engine, reload]);
    useEffect(() => {
        let stale = false;
        engine.presets({ search: query || undefined, tag: tag || undefined })
            .then(p => { if (!stale) setList(p); }, e => { if (!stale) setError(message(e)); });
        return () => { stale = true; };
    }, [engine, query, tag, reload]);

    const doImport = async (files: File[]) => setError((await importFiles(engine, files)).join('\n'));

    return (
        <div class={'presets' + (dragging ? ' dragging' : '')}
             onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
             onDrop={e => { e.preventDefault(); setDragging(false); doImport([...(e.dataTransfer?.files ?? [])]); }}>
            <div class="presets-bar">
                <input type="search" aria-label="Search brush presets" placeholder="Search" value={search}
                       onInput={e => setSearch(e.currentTarget.value)} />
                <select aria-label="Filter by tag" value={tag} onChange={e => setTag(e.currentTarget.value)}>
                    <option value="">All tags</option>
                    {tags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="button" onClick={() => fileInput.current!.click()}>Import…</button>
                <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden aria-label="Import resource files"
                       onChange={e => { doImport([...e.currentTarget.files!]); e.currentTarget.value = ''; }} />
            </div>
            {error && <p role="alert" class="presets-error">{error}</p>}
            <div class="presets-grid" role="list">
                {list.map(p => (
                    <div role="listitem" key={p.id}>
                        <Thumb engine={engine} preset={p} current={p.id === current}
                               onSelect={() => engine.selectPreset(p.id).catch(e => setError(message(e)))} />
                    </div>
                ))}
            </div>
            {!list.length && <p class="presets-empty">No presets found. Drop resource files here to import them.</p>}
        </div>
    );
}

const panel: Panel = {
    id: 'presets', title: 'Brush Presets', area: 'right', order: 10, component: Presets,
    commands: [{
        id: 'presets.import', title: 'Import Resources…', menu: 'Settings',
        async run(engine) {
            const errors = await importFiles(engine, await pickFiles());
            if (errors.length) throw new Error(errors.join('\n'));
        },
    }],
};
export default panel;
