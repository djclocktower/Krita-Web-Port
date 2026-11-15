import type { Panel } from '../../panels';
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

export default { id: 'toolbox', title: 'Toolbox', area: 'left', order: -1, component: Toolbox } satisfies Panel;
