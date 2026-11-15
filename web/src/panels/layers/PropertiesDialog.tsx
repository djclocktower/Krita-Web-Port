import { useEffect, useRef, useState } from 'preact/hooks';
import type { BlendMode, ConfigDescription, Engine, LayerNode, PropertyValue } from '../../engine/protocol';
import { PropertyForm } from '../../ui/PropertyForm';
import { BlendSelect } from './BlendSelect';

const message = (e: unknown) => e instanceof Error ? e.message : String(e);

/** Edits apply immediately (and are undoable); Close just closes. `node` is the live tree node. */
export function PropertiesDialog({ engine, node, modes, onClose }:
    { engine: Engine; node: LayerNode; modes: BlendMode[]; onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [error, setError] = useState('');
    const [config, setConfig] = useState<{ desc: ConfigDescription; values: Record<string, PropertyValue> } | null>(null);
    const set = (props: Parameters<Engine['setNodeProperties']>[1]) =>
        engine.setNodeProperties(node.id, props).then(() => setError(''), e => setError(message(e)));

    useEffect(() => {
        dialog.current!.showModal();
        if (!node.configId) return;
        (async () => {
            try {
                const { values } = await engine.nodeConfig(node.id);
                const desc = await (node.type === 'fill' ? engine.generatorConfig(node.configId!) : engine.filterConfig(node.configId!));
                setConfig({ desc, values: { ...desc.defaults, ...values } });
            } catch (e) { setError(message(e)); }
        })();
    }, []);

    const change = (key: string, value: PropertyValue) => {
        if (!config || (typeof value === 'number' && isNaN(value))) return;
        const values = { ...config.values, [key]: value };
        setConfig({ ...config, values });
        engine.setNodeConfig(node.id, values).then(() => setError(''), e => setError(message(e)));
    };
    const toggles = [['visible', 'Visible'], ['locked', 'Locked']] as const;

    return (
        <dialog ref={dialog} class="lyr-dialog" aria-labelledby="lp-title" onClose={onClose}>
            <h2 id="lp-title">Layer Properties</h2>
            <div class="lyr-form">
                <label>Name
                    <input key={node.name} defaultValue={node.name} onChange={e => void set({ name: e.currentTarget.value })} />
                </label>
                <label>Opacity
                    <span><input type="range" min="0" max="100" value={Math.round(node.opacity * 100)}
                                 onChange={e => void set({ opacity: e.currentTarget.valueAsNumber / 100 })} />
                        {Math.round(node.opacity * 100)}%</span>
                </label>
                <label>Blend mode
                    <BlendSelect modes={modes} value={node.blendMode} onChange={blendMode => void set({ blendMode })} />
                </label>
                {toggles.map(([key, label]) => (
                    <label class="lyr-check" key={key}>
                        <input type="checkbox" checked={node[key]} onChange={e => void set({ [key]: e.currentTarget.checked })} /> {label}
                    </label>
                ))}
                {node.type === 'paint' && (
                    <label class="lyr-check">
                        <input type="checkbox" checked={node.alphaLocked} onChange={e => void set({ alphaLocked: e.currentTarget.checked })} /> Alpha locked
                    </label>
                )}
                {config && <PropertyForm description={config.desc} values={config.values} onChange={change} />}
            </div>
            {error && <p class="lyr-error" role="alert">{error}</p>}
            <footer><button type="button" onClick={() => dialog.current?.close()}>Close</button></footer>
        </dialog>
    );
}
