import type { Panel } from '../../panels';
import type { Engine } from '../../engine/protocol';
import { aids } from '../../canvas/aids';
import { useStore } from '../../shell/store';
import { krita } from '../../krita/state';
import { KritaToolOptions } from '../../krita/ToolOptionsView';
import { useActiveTool } from '../../tools/shared';
import './toolOptions.css';

/** Grid settings: spacing, subdivision, colour and the pixel grid. */
function GridOptions() {
    const a = useStore(aids);
    const num = (label: string, key: 'gx' | 'gy' | 'sub', min = 1) => (
        <label class="row">{label}
            <input type="number" min={min} step={1} value={a[key]} onInput={e => { const n = Math.floor(Number(e.currentTarget.value)); if (n >= min) aids.set({ [key]: n }); }} />
        </label>
    );
    return (
        <details class="grid-opts">
            <summary>Grid</summary>
            {num('Spacing X', 'gx')}{num('Spacing Y', 'gy')}{num('Subdivision', 'sub')}
            <label class="row">Colour <input type="color" value={a.color} onInput={e => aids.set({ color: e.currentTarget.value })} /></label>
            <label class="check"><input type="checkbox" checked={a.pixelGrid} onChange={e => aids.set({ pixelGrid: e.currentTarget.checked })} /> Pixel grid</label>
            <label class="row">Pixel grid from %
                <input type="number" min={100} step={100} value={Math.round(a.pixelAt * 100)} onInput={e => { const n = Number(e.currentTarget.value); if (n >= 100) aids.set({ pixelAt: n / 100 }); }} />
            </label>
        </details>
    );
}

function ToolOptions({ engine }: { engine: Engine }) {
    const tool = useActiveTool(), Options = tool.options, k = useStore(krita);
    if (k.tools.length && !k.page) {   // Krita's tool is active: show its own option panel
        const w = k.windows.find(x => x.kind === 'toolOptions');
        return (
            <div class="tool-options" aria-label="Krita tool options" role="group">
                {w ? <KritaToolOptions engine={engine} w={w} /> : <p class="hint">No tool options yet.</p>}
                <GridOptions />
            </div>
        );
    }
    return (
        <div class="tool-options" aria-label={`${tool.title} options`} role="group">
            {Options ? <Options engine={engine} /> : <p class="hint">{tool.title} has no options.</p>}
            <GridOptions />
        </div>
    );
}

export default { id: 'toolOptions', title: 'Tool Options', area: 'left', order: 0, component: ToolOptions } satisfies Panel;
