import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { app } from '../shell/state';

export const MAX_SIDE = 16384;

/** A whole number of pixels from 1 to MAX_SIDE, or an Error whose text the dialog shows. */
export function pixels(value: string, label: string): number {
    const n = Number(value);
    if (value.trim() === '' || !Number.isInteger(n) || n < 1 || n > MAX_SIDE) throw new Error(`${label} must be a whole number of pixels from 1 to ${MAX_SIDE}.`);
    return n;
}
export function area(w: number, h: number) {
    if (w * h > 64e6) throw new Error('That is more than 64 megapixels.');
}

/**
 * A native modal dialog. `submit` throws to reject: the message is shown in the dialog and the dialog stays open.
 * It closes only when `submit` resolves, or when the user cancels.
 */
export function Modal({ title, submitLabel, submit, children }: {
    title: string; submitLabel: string; submit: () => void | Promise<unknown>; children: ComponentChildren;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { ref.current!.showModal(); }, []);
    const close = () => app.set({ dialog: null });
    const onSubmit = async (e: Event) => {
        e.preventDefault();
        setBusy(true); setErr('');
        try { await submit(); close(); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); setBusy(false); }
    };
    return (
        <dialog ref={ref} aria-labelledby="modal-title" onClose={close}>
            <form noValidate onSubmit={onSubmit}>
                <h2 id="modal-title">{title}</h2>
                {children}
                <p class="error" role="alert">{err}</p>
                <div class="buttons">
                    <button type="button" onClick={() => ref.current!.close()}>Cancel</button>
                    <button type="submit" class="primary" disabled={busy}>{submitLabel}</button>
                </div>
            </form>
        </dialog>
    );
}
