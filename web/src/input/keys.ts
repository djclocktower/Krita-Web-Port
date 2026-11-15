// Keyboard shortcuts for every command, plus Space-to-navigate.
import type { Command } from '../panels';
import { nav } from './pointer';

const canon = (ctrl: boolean, alt: boolean, shift: boolean, key: string) => `${ctrl ? 'c' : ''}${alt ? 'a' : ''}${shift ? 's' : ''}|${key.toUpperCase()}`;
const fromShortcut = (s: string) => {
    const parts = s.split('+'), key = parts.pop()!, m = parts.map(p => p.toLowerCase());
    return canon(m.includes('ctrl'), m.includes('alt'), m.includes('shift'), key);
};

export function attachKeys(commands: Command[], run: (c: Command) => void): () => void {
    const byKey = new Map(commands.filter(c => c.shortcut).map(c => [fromShortcut(c.shortcut!), c]));
    const typing = (t: Element) => !!t.closest('textarea,select,[contenteditable],dialog,input:not([type=range],[type=checkbox],[type=color],[type=button])');
    const cursor = () => { const cv = document.querySelector<HTMLElement>('canvas.view'); if (cv) cv.style.cursor = nav.space ? 'grab' : ''; };

    const down = (e: KeyboardEvent) => {
        const t = e.target as Element;
        if (typing(t)) return;
        if (e.key === ' ') {
            if (t.closest('button,summary')) return;   // let Space activate a focused button
            nav.space = true; cursor(); e.preventDefault(); return;
        }
        const c = byKey.get(canon(e.ctrlKey || e.metaKey, e.altKey, e.shiftKey, e.key));
        if (c) { e.preventDefault(); run(c); }
    };
    const up = (e: KeyboardEvent) => { if (e.key === ' ') { nav.space = false; cursor(); } };
    const blur = () => { nav.space = false; cursor(); };
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', blur);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur); };
}
