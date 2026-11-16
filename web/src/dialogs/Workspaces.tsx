import { useEffect, useRef, useState } from 'preact/hooks';
import { useSetting } from '../settings/store';
import { app } from '../shell/state';
import { applyWorkspace, BUILT_IN, deleteWorkspace, saveWorkspace } from '../shell/workspaces';

/** Window › Workspace: save the current dock arrangement under a name, switch, delete. */
export function Workspaces() {
    const ref = useRef<HTMLDialogElement>(null);
    const saved = useSetting('workspaces'), current = useSetting('workspace');
    const [name, setName] = useState(''), [err, setErr] = useState('');
    useEffect(() => { ref.current!.showModal(); }, []);
    const save = (e: Event) => {
        e.preventDefault();
        try { saveWorkspace(name); setName(''); setErr(''); } catch (x) { setErr((x as Error).message); }
    };
    const row = (n: string, removable: boolean) => (
        <li key={n}>
            <b>{n}{n === current ? ' (current)' : ''}</b>
            <button type="button" aria-label={`Switch to ${n}`} onClick={() => applyWorkspace(n)}>Switch</button>
            {removable && <button type="button" aria-label={`Delete ${n}`} onClick={() => deleteWorkspace(n)}>Delete</button>}
        </li>
    );
    return (
        <dialog ref={ref} class="recent" aria-labelledby="ws-title" onClose={() => app.set({ dialog: null })}>
            <form noValidate onSubmit={save}>
                <h2 id="ws-title">Workspaces</h2>
                <ul class="ws-list" aria-label="Workspaces">
                    {Object.keys(BUILT_IN).map(n => row(n, false))}
                    {Object.keys(saved).map(n => row(n, true))}
                </ul>
                <label>Save the current arrangement as <input type="text" value={name} placeholder="Workspace name" onInput={e => setName(e.currentTarget.value)} /></label>
                <p class="error" role="alert">{err}</p>
                <div class="buttons">
                    <button type="submit">Save</button>
                    <button type="button" class="primary" onClick={() => ref.current!.close()}>Close</button>
                </div>
            </form>
        </dialog>
    );
}
