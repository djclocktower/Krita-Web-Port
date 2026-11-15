// Dockable panels. Each panel lives in src/panels/<name>/index.tsx and default-exports a Panel.
// The shell discovers them here; panels never import each other or the shell.
import type { ComponentType } from 'preact';
import type { Engine } from './engine/protocol';

export interface Panel {
    id: string;
    title: string;
    /** Where the shell puts it by default. */
    area: 'left' | 'right' | 'bottom';
    /** Lower comes first within its area. */
    order?: number;
    component: ComponentType<{ engine: Engine }>;
}

const modules = import.meta.glob<{ default: Panel }>('./panels/*/index.tsx', { eager: true });
export const panels: Panel[] = Object.values(modules)
    .map(m => m.default)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
