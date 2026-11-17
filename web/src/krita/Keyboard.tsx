// The on-screen keyboard for touch devices: a button that focuses a hidden text input; what is typed there is forwarded as key
// events to a Krita window (or to Krita's canvas). The page cannot know where Krita's text fields are, so every Krita window gets one.
import { useRef } from 'preact/hooks';
import type { KritaWindowInput } from '../engine/protocol';

const SENTINEL = '​';   // keeps one character in the field, so Backspace on a soft keyboard always has something to delete

type Send = (ev: KritaWindowInput) => void;

export function KeyboardButton({ send, label = 'Keyboard' }: { send: Send; label?: string }) {
    const input = useRef<HTMLInputElement>(null);
    const tap = (key: string, text?: string) => { send({ type: 'keydown', key, text }); send({ type: 'keyup', key, text }); };
    const reset = () => { const el = input.current; if (el) { el.value = SENTINEL; el.setSelectionRange(1, 1); } };
    return (<>
        <button type="button" class="kb-btn" aria-label={label} title={label}
            onClick={() => { const el = input.current!; if (!el.value) el.value = SENTINEL; el.focus(); }}>⌨</button>
        <input ref={input} class="kb-input" type="text" tabIndex={-1} aria-label={`${label} input`} autocomplete="off" autocapitalize="off" spellcheck={false}
            enterKeyHint="enter" inputMode="text" value={SENTINEL}
            onKeyDown={e => {
                // Soft keyboards often report 'Unidentified' / 229: the text arrives in `input` instead.
                if (e.isComposing || e.key === 'Unidentified' || e.keyCode === 229) return;
                e.preventDefault(); e.stopPropagation();
                send({ type: 'keydown', key: e.key, text: e.key.length === 1 ? e.key : undefined, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
            }}
            onKeyUp={e => {
                if (e.isComposing || e.key === 'Unidentified' || e.keyCode === 229) return;
                e.preventDefault(); e.stopPropagation();
                send({ type: 'keyup', key: e.key, text: e.key.length === 1 ? e.key : undefined, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
            }}
            onBeforeInput={e => {
                const ie = e as InputEvent;
                if (ie.isComposing && ie.inputType === 'insertCompositionText') return;   // sent when the composition ends
                if (ie.inputType === 'deleteContentBackward') tap('Backspace');
                else if (ie.inputType === 'deleteContentForward') tap('Delete');
                else if (ie.inputType === 'insertLineBreak' || ie.inputType === 'insertParagraph') tap('Enter');
                else if (ie.data) for (const ch of ie.data) tap(ch, ch);
                e.preventDefault(); reset();
            }}
            onCompositionEnd={e => { for (const ch of e.data) tap(ch, ch); reset(); }}
            onBlur={reset} />
    </>);
}
