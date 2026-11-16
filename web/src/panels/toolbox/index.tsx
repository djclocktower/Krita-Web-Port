import { aids, rulersOn } from '../../canvas/aids';
import { isCanvasOnly, toggleCanvasOnly } from '../../canvas/canvasOnly';
import type { Command, Panel } from '../../panels';
import { setActiveTool, tools } from '../../tools';
import { useActiveTool } from '../../tools/shared';
import './toolbox.css';

function Toolbox() {
    const active = useActiveTool();
    return (
        <div class="toolbox" role="toolbar" aria-label="Tools">
            {tools.map(t => (
                <button key={t.id} type="button" aria-label={t.title} aria-pressed={t === active} aria-keyshortcuts={t.shortcut}
                    title={t.shortcut ? `${t.title} (${t.shortcut})` : t.title}
                    onClick={() => setActiveTool(t.id)} dangerouslySetInnerHTML={{ __html: t.icon }} />
            ))}
        </div>
    );
}

// View commands. The Command type has no checked state, so the title carries it ("✓ Show Grid").
type Flag = 'rulers' | 'grid' | 'guides' | 'lock' | 'snapGuides' | 'snapGrid' | 'snapBounds' | 'snapCenter';
const mark = (on: boolean, t: string) => (on ? '✓ ' : '') + t;
const toggle = (id: string, flag: Flag, title: string, shortcut?: string): Command => ({
    id, menu: 'View', shortcut, get title() { return mark(aids.get()[flag], title); }, run: () => aids.set({ [flag]: !aids.get()[flag] }),
});
const commands: Command[] = [
    { ...toggle('view.rulers', 'rulers', 'Show Rulers'), get title() { return mark(aids.get().rulers, 'Show Rulers') + (aids.get().rulers && !rulersOn() ? ' (hidden while rotated)' : ''); } },
    toggle('view.grid', 'grid', 'Show Grid', "Ctrl+Shift+'"),
    toggle('view.guides', 'guides', 'Show Guides'),
    toggle('view.lockGuides', 'lock', 'Lock Guides'),
    toggle('view.snapGuides', 'snapGuides', 'Snap To Guides'),
    toggle('view.snapGrid', 'snapGrid', 'Snap To Grid'),
    toggle('view.snapBounds', 'snapBounds', 'Snap To Image Bounds'),
    toggle('view.snapCenter', 'snapCenter', 'Snap To Image Center'),
    { id: 'view.canvasOnly', menu: 'View', shortcut: 'Tab', get title() { return mark(isCanvasOnly(), 'Canvas Only'); }, run: toggleCanvasOnly },
];

export default { id: 'toolbox', title: 'Toolbox', area: 'left', order: -1, component: Toolbox, commands } satisfies Panel;
