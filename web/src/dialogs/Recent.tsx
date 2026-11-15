import { useEffect, useRef, useState } from 'preact/hooks';
import { app } from '../shell/state';
import type { DocRecord } from '../storage/db';
import { currentId, forget, forgetAll, openRecent, recent } from '../storage/session';

const message = (e: unknown) => e instanceof Error ? e.message : String(e);

function Thumb({ blob }: { blob: Blob | null }) {
    const [url, setUrl] = useState('');
    useEffect(() => { if (!blob) return; const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
    return url ? <img class="thumb" src={url} alt="" /> : <span class="thumb" />;
}

/** Recent documents kept in this browser: open, delete one, or clear the list. */
export function Recent() {
    const ref = useRef<HTMLDialogElement>(null);
    const [list, setList] = useState<DocRecord[] | null>(null);
    const [err, setErr] = useState('');
    const [sure, setSure] = useState(false);
    const load = () => recent().then(setList, e => { setErr(message(e)); setList([]); });
    useEffect(() => { ref.current!.showModal(); void load(); }, []);
    const act = (fn: () => Promise<unknown>, close = false) => async () => {
        setErr('');
        try { await fn(); if (close) ref.current!.close(); else await load(); } catch (e) { setErr(message(e)); }
    };
    return (
        <dialog ref={ref} class="recent" aria-labelledby="recent-title" onClose={() => app.set({ dialog: null })}>
            <form method="dialog">
                <h2 id="recent-title">Open Recent</h2>
                {list && !list.length && <p class="empty">No recent documents are stored in this browser.</p>}
                <ul>
                    {list?.map(r => (
                        <li key={r.id}>
                            <Thumb blob={r.thumb} />
                            <span class="meta">
                                <b>{r.name}{r.id === currentId() ? ' (open)' : ''}</b>
                                <small>{r.width} × {r.height} px · {new Date(r.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small>
                            </span>
                            <button type="button" aria-label={`Open ${r.name}`} onClick={act(() => openRecent(r.id), true)}>Open</button>
                            <button type="button" aria-label={`Delete ${r.name}`} onClick={act(() => forget(r.id))}>Delete</button>
                        </li>
                    ))}
                </ul>
                <p class="error" role="alert">{err}</p>
                <div class="buttons">
                    {!!list?.length && <button type="button" onClick={sure ? act(async () => { await forgetAll(); setSure(false); }) : () => setSure(true)}>{sure ? 'Confirm clear' : 'Clear list'}</button>}
                    <button type="submit" class="primary">Close</button>
                </div>
            </form>
        </dialog>
    );
}
