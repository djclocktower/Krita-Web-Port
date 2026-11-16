// Shortcut strings ("Ctrl+Shift+N"), the overrides stored in settings, and the read-only canvas shortcuts.
// Strings are parsed the same way src/input/keys.ts parses them, so what is recorded here is what matches there.
import type { Command } from '../panels';
import { tools } from '../tools';
import { getSetting } from './store';

const MODIFIER_KEYS = ['Control', 'Alt', 'Shift', 'Meta'];

/** Order-independent form, equal for shortcuts that match the same key press. */
export function norm(s: string): string {
    const parts = s.split('+'), key = parts.pop()!, m = parts.map(p => p.toLowerCase());
    return `${m.includes('ctrl') ? 'c' : ''}${m.includes('alt') ? 'a' : ''}${m.includes('shift') ? 's' : ''}|${key.toUpperCase()}`;
}

/** "Ctrl+Alt+Shift" for the modifiers held, or '' */
export const heldModifiers = (e: KeyboardEvent) => [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''].filter(Boolean).join('+');

/** The shortcut for a key press, or null while only modifiers (or an unusable key) are down. */
export function fromEvent(e: KeyboardEvent): string | null {
    if (MODIFIER_KEYS.includes(e.key) || ['Dead', 'Process', 'Unidentified'].includes(e.key)) return null;
    const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    return [heldModifiers(e), key].filter(Boolean).join('+');
}

/** The override if there is one (an empty string clears the shortcut), else Krita's default. */
export function effective(c: Command, map = getSetting('shortcuts')): string {
    return c.id in map ? map[c.id] : c.shortcut ?? '';
}
/** Copies of the commands carrying their effective shortcut, for `attachKeys`. */
export const withShortcuts = (cmds: Command[], map = getSetting('shortcuts')): Command[] => cmds.map(c => ({ ...c, shortcut: effective(c, map) || undefined }));

export interface CanvasShortcut { title: string; shortcut: string }
/** Keys handled at canvas level (src/input, the tools); listed for conflicts, not remappable in this pass. */
export const canvasShortcuts = (): CanvasShortcut[] => [
    ...tools.filter(t => t.shortcut).map(t => ({ title: `${t.title} tool`, shortcut: t.shortcut! })),
    { title: 'Pan canvas (hold)', shortcut: 'Space' },
    { title: 'Cancel the current stroke or gesture', shortcut: 'Escape' },
    { title: 'Apply crop', shortcut: 'Enter' },
];

/** Why a key cannot be recorded for a command, or '' */
export function unusable(combo: string): string {
    const key = combo.split('+').pop()!;
    if (key === 'Tab') return 'Tab is kept for keyboard navigation.';
    if (combo.endsWith('++') || key === '') return 'The + key cannot be used on its own in a shortcut.';
    return '';
}
