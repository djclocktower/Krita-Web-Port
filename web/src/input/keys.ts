// Keyboard shortcuts for every command, plus Space-to-navigate.
import { zoomBy } from '../canvas/view';
import type { Command } from '../panels';
import { krita, kritaEngine, kritaOn } from '../krita/state';
import { setActiveTool, tools } from '../tools';
import { nav, updateCursor } from './pointer';

const canon = (ctrl: boolean, alt: boolean, shift: boolean, key: string) => `${ctrl ? 'c' : ''}${alt ? 'a' : ''}${shift ? 's' : ''}|${key.toUpperCase()}`;
const fromShortcut = (s: string) => {
    const parts = s.split('+'), key = parts.pop()!, m = parts.map(p => p.toLowerCase());
    return canon(m.includes('ctrl'), m.includes('alt'), m.includes('shift'), key);
};

export function attachKeys(commands: Command[], run: (c: Command) => void): () => void {
    const byKey = new Map(commands.filter(c => c.shortcut).map(c => [fromShortcut(c.shortcut!), c]));
    const toolByKey = new Map(tools.filter(t => t.shortcut).map(t => [fromShortcut(t.shortcut!), t]));
    const typing = (t: Element) => !!t.closest('textarea,select,[contenteditable],dialog,[data-kwin],input:not([type=range],[type=checkbox],[type=color],[type=button])');
    const cursor = () => updateCursor(document.querySelector<HTMLElement>('canvas.view'));

    // Keys typed with the canvas focused (nothing else focused) belong to Krita's active tool.
    const kritaKey = (e: KeyboardEvent, type: 'keydown' | 'keyup') => {
        const t = e.target as Element;
        if (!kritaOn() || !(t === document.body || t.closest('canvas.view'))) return false;
        kritaEngine()?.kritaKey({ type, key: e.key, text: e.key.length === 1 ? e.key : undefined, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
        return true;
    };
    const ownTool = (id: string) => !krita.get().tools.length || id === 'pan' || id === 'zoom';   // Krita's own tools take the other shortcuts

    const down = (e: KeyboardEvent) => {
        const t = e.target as Element;
        if (typing(t)) return;
        if (e.key === ' ') {
            if (t.closest('button,summary')) return;   // let Space activate a focused button
            nav.space = true; cursor(); e.preventDefault(); return;
        }
        if (e.key === 'Tab' && t !== document.body) return;   // Tab is Canvas Only only when no control has focus; otherwise it moves focus
        const zoom = e.key === '+' || e.key === '=' ? 1.25 : e.key === '-' || e.key === '_' ? 0.8 : 0;   // with or without Ctrl
        if (zoom && !e.altKey) { e.preventDefault(); zoomBy(zoom); return; }
        const k = canon(e.ctrlKey || e.metaKey, e.altKey, e.shiftKey, e.code === 'Quote' ? "'" : e.key), c = byKey.get(k), tool = toolByKey.get(k);
        if (c) { e.preventDefault(); run(c); }
        else if (tool && ownTool(tool.id)) { e.preventDefault(); setActiveTool(tool.id); }
        else if (kritaKey(e, 'keydown') && (e.key === 'Enter' || e.key.startsWith('Arrow'))) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => { if (e.key === ' ') { nav.space = false; cursor(); } else if (!typing(e.target as Element)) kritaKey(e, 'keyup'); };
    const blur = () => { nav.space = false; cursor(); };
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', blur);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur); };
}
