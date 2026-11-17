// Configure Krita…: preference pages as tabs (arrow keys move between them). Changes apply at once; there is no OK/Cancel.
import { useEffect, useRef, useState } from 'preact/hooks';
import { resetSettings, setSetting, THEMES, useSetting, type Settings as S, type ThemeId } from '../settings/store';
import { app } from '../shell/state';
import { Shortcuts } from './Shortcuts';

const PAGES = ['General', 'Display', 'Keyboard Shortcuts'] as const;
type Page = (typeof PAGES)[number];

export function Settings() {
    const ref = useRef<HTMLDialogElement>(null);
    const [page, setPage] = useState<Page>('General');
    useEffect(() => { ref.current!.showModal(); }, []);
    const tabKey = (e: KeyboardEvent) => {
        const i = PAGES.indexOf(page), step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key as 'ArrowLeft'];
        const to = e.key === 'Home' ? 0 : e.key === 'End' ? PAGES.length - 1 : step ? (i + step + PAGES.length) % PAGES.length : -1;
        if (to < 0) return;
        e.preventDefault(); setPage(PAGES[to]);
        document.getElementById(`cfg-tab-${to}`)?.focus();
    };
    return (
        <dialog ref={ref} class="cfg" aria-labelledby="cfg-title" onClose={() => app.set({ dialog: null })}>
            <h2 id="cfg-title">Configure Krita</h2>
            <div role="tablist" class="cfg-tabs" aria-label="Preference pages" onKeyDown={tabKey}>
                {PAGES.map((p, i) => (
                    <button type="button" role="tab" id={`cfg-tab-${i}`} key={p} aria-selected={p === page} aria-controls="cfg-page" tabIndex={p === page ? 0 : -1} onClick={() => setPage(p)}>{p}</button>
                ))}
            </div>
            <div id="cfg-page" role="tabpanel" class="cfg-body" aria-labelledby={`cfg-tab-${PAGES.indexOf(page)}`}>
                {page === 'General' ? <General /> : page === 'Display' ? <Display /> : <Shortcuts />}
            </div>
            <div class="buttons"><button type="button" class="primary" onClick={() => ref.current!.close()}>Close</button></div>
        </dialog>
    );
}

function Check({ k, label }: { k: 'autosave' | 'confirmClose' | 'touchGestures'; label: string }) {
    const v = useSetting(k);
    return <label class="check"><input type="checkbox" checked={v} onChange={e => setSetting(k, e.currentTarget.checked)} /> {label}</label>;
}

function Reset({ keys }: { keys: (keyof S)[] }) {
    return <div><button type="button" onClick={() => resetSettings(keys)}>Restore defaults on this page</button></div>;
}

function General() {
    const on = useSetting('autosave'), secs = useSetting('autosaveSeconds');
    const [text, setText] = useState(String(secs)), [err, setErr] = useState('');
    useEffect(() => { setText(String(secs)); setErr(''); }, [secs]);   // follows a reset
    const input = (v: string) => {
        setText(v);
        const n = Number(v);
        if (v.trim() === '' || !Number.isInteger(n) || n < 1 || n > 3600) return setErr('Enter a whole number of seconds from 1 to 3600.');
        setErr(''); setSetting('autosaveSeconds', n);
    };
    return (
        <div class="cfg-page">
            <Check k="autosave" label="Autosave to this browser" />
            <label>Save this many seconds after the last change
                <input type="number" min={1} max={3600} step={1} disabled={!on} value={text} aria-invalid={!!err} aria-describedby="cfg-err" onInput={e => input(e.currentTarget.value)} />
            </label>
            <p id="cfg-err" class="error" role="alert">{err}</p>
            <Check k="confirmClose" label="Ask before closing with unsaved changes" />
            <Reset keys={['autosave', 'autosaveSeconds', 'confirmClose']} />
        </div>
    );
}

function Display() {
    const theme = useSetting('theme');
    const color = (k: 'canvasBorder' | 'checkerA' | 'checkerB', label: string) => (
        <label class="color-row"><span>{label}</span>
            <input type="color" value={useSetting(k)} aria-label={label} onInput={e => setSetting(k, e.currentTarget.value)} />
        </label>
    );
    return (
        <div class="cfg-page">
            <label>Theme
                <select value={theme} onChange={e => setSetting('theme', e.currentTarget.value as ThemeId)}>
                    {THEMES.map(([id, name]) => <option value={id} key={id}>{name}</option>)}
                </select>
            </label>
            {color('canvasBorder', 'Canvas border colour')}
            {color('checkerA', 'Checkerboard colour 1')}
            {color('checkerB', 'Checkerboard colour 2')}
            <label>Interface layout
                <select value={useSetting('uiMode')} onChange={e => setSetting('uiMode', e.currentTarget.value as S['uiMode'])}>
                    <option value="auto">Automatic (from this device)</option><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="phone">Phone</option>
                </select>
            </label>
            <Check k="touchGestures" label="Two-finger tap undoes, three-finger tap redoes" />
            <Reset keys={['theme', 'canvasBorder', 'checkerA', 'checkerB', 'uiMode', 'touchGestures']} />
        </div>
    );
}
