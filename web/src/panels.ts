// Dockable panels. Each panel lives in src/panels/<name>/index.tsx and default-exports a Panel.
// The shell discovers them here; panels never import each other or the shell.
import type { ComponentType } from 'preact';
import type { Engine } from './engine/protocol';

/** A menu entry or shortcut. The shell builds its menus from every panel's commands plus its own. */
export interface Command {
    id: string;
    title: string;
    menu: 'File' | 'Edit' | 'View' | 'Image' | 'Layer' | 'Select' | 'Filter' | 'Tools' | 'Settings';
    /** Krita's default, e.g. "Ctrl+Shift+N". */
    shortcut?: string;
    run: (engine: Engine) => void | Promise<void>;
}

export interface Panel {
    id: string;
    title: string;
    /** Where the shell puts it by default. */
    area: 'left' | 'right' | 'bottom';
    /** Lower comes first within its area. */
    order?: number;
    component: ComponentType<{ engine: Engine }>;
    commands?: Command[];
}

const modules = import.meta.glob<{ default: Panel }>('./panels/*/index.tsx', { eager: true });
export const panels: Panel[] = Object.values(modules)
    .map(m => m.default)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
