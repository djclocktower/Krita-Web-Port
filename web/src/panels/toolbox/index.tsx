import { aids, rulersOn } from '../../canvas/aids';
import { isCanvasOnly, toggleCanvasOnly } from '../../canvas/canvasOnly';
import type { Command, Panel } from '../../panels';
import { kritaToolIcon } from '../../krita/icons';
import { krita, kritaEngine } from '../../krita/state';
import { report } from '../../shell/state';
import { useStore } from '../../shell/store';
import { setActiveTool, tools } from '../../tools';
import { useActiveTool } from '../../tools/shared';
import './toolbox.css';

const letters = (name: string) => name.split(/[\s/&]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

function KritaToolbox() {
    const k = useStore(krita), page = useActiveTool();
    const sections = [...new Set(k.tools.map(t => t.section))].sort();   // Krita's sections start with a rank ("0 Krita/Shape")
    const pick = (id: string) => {
        krita.set({ page: false, active: id });
        kritaEngine()?.setKritaTool(id).catch(report);
    };
    return (
        <div class="toolbox" role="toolbar" aria-label="Tools">
            {sections.map(s => (
                <div class="section" role="group" aria-label={s || 'Tools'} key={s}>
                    {k.tools.filter(t => t.section === s).map(t => {
                        const icon = kritaToolIcon(t.id);
                        return (
                            <button key={t.id} type="button" data-krita-tool={t.id} aria-label={t.name} aria-pressed={!k.page && k.active === t.id}
                                aria-keyshortcuts={t.shortcut || undefined} title={t.shortcut ? `${t.name} (${t.shortcut})` : t.name} onClick={() => pick(t.id)}
                                {...(icon ? { children: <span class="kicon" aria-hidden="true" style={`--kicon:url("${icon}")`} /> } : { children: <span class="letters" aria-hidden="true">{letters(t.name)}</span> })} />
                        );
                    })}
                </div>
            ))}
            <div class="section" role="group" aria-label="View">
                {tools.filter(t => t.id === 'pan' || t.id === 'zoom').map(t => (
                    <button key={t.id} type="button" aria-label={t.title} aria-pressed={k.page && t === page} aria-keyshortcuts={t.shortcut}
                        title={t.shortcut ? `${t.title} (${t.shortcut})` : t.title} onClick={() => setActiveTool(t.id)} dangerouslySetInnerHTML={{ __html: t.icon }} />
                ))}
            </div>
        </div>
    );
}

function Toolbox() {
    const active = useActiveTool(), k = useStore(krita);
    if (k.tools.length) return <KritaToolbox />;
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
