import type { Panel } from '../../panels';
import type { Engine } from '../../engine/protocol';
import { useActiveTool } from '../../tools/shared';
import './toolOptions.css';

function ToolOptions({ engine }: { engine: Engine }) {
    const tool = useActiveTool(), Options = tool.options;
    return (
        <div class="tool-options" aria-label={`${tool.title} options`} role="group">
            {Options ? <Options engine={engine} /> : <p class="hint">{tool.title} has no options.</p>}
        </div>
    );
}

export default { id: 'toolOptions', title: 'Tool Options', area: 'left', order: 0, component: ToolOptions } satisfies Panel;
