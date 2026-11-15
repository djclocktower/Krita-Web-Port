import { useEffect, useState } from 'preact/hooks';
import type { ConfigDescription, Engine, Preset, PropertyValue } from '../../engine/protocol';
import type { Panel } from '../../panels';
import { PropertyForm } from '../../ui/PropertyForm';
import './brushEditor.css';

function BrushEditor({ engine }: { engine: Engine }) {
    const [preset, setPreset] = useState<Preset | null>(null);
    const [settings, setSettings] = useState<{ description: ConfigDescription; values: Record<string, PropertyValue> } | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let current: string | null | undefined;
        let request = 0;
        const load = async (id: string | null) => {
            const mine = ++request;
            try {
                const [s, all] = await Promise.all([engine.presetSettings(), engine.presets()]);
                if (mine !== request) return;
                setSettings(s); setPreset(all.find(p => p.id === id) ?? null); setError('');
            } catch (e) { if (mine === request) setError(String(e instanceof Error ? e.message : e)); }
        };
        load(null);
        return engine.on('brushChanged', b => { if (b.presetId !== current) { current = b.presetId; load(b.presetId); } });
    }, [engine]);

    const change = (key: string, value: PropertyValue) => {
        setSettings(s => s && { ...s, values: { ...s.values, [key]: value } });
        engine.setPresetSetting(key, value).then(() => setError(''), e => setError(String(e instanceof Error ? e.message : e)));
    };

    return (
        <div class="brush-editor">
            <h3>{preset?.name ?? 'Current brush'}</h3>
            {preset && <p class="be-engine">Engine: {preset.engine}</p>}
            {error && <p role="alert" class="be-error">{error}</p>}
            {settings && <PropertyForm description={settings.description} values={settings.values} onChange={change} />}
        </div>
    );
}

const panel: Panel = { id: 'brushEditor', title: 'Brush Editor', area: 'right', order: 20, component: BrushEditor };
export default panel;
