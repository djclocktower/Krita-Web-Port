// Test harness for tests/phase2.mjs: both Phase 2 panels plus a PropertyForm with a curve, on one shared mock engine.
import '../src/ui/theme.css';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { createMockEngine } from '../src/engine/mock';
import { PropertyForm } from '../src/ui/PropertyForm';
import presets from '../src/panels/presets/index';
import editor from '../src/panels/brushEditor/index';
import * as curve from '../src/ui/curve';

const engine = createMockEngine();
window.engine = engine; window.curve = curve; window.emitted = [];
const description = { defaults: { sensor: '0,0;1,1;', amount: 5 }, specs: [
    { key: 'sensor', label: 'Pressure curve', kind: 'curve', group: 'Sensors' },
    { key: 'amount', label: 'Amount', kind: 'integer', min: 0, max: 10 },
    { key: 'tint', label: 'Tint', kind: 'color' }] };
function Form() {
    const [values, setValues] = useState({ sensor: '0,0;1,1;', amount: 5, tint: '#336699' });
    return <PropertyForm description={description} values={values}
        onChange={(k, v) => { window.emitted.push([k, v]); setValues(s => ({ ...s, [k]: v })); }} />;
}
render(<main style="max-width:360px">
    <section><h2>{presets.title}</h2><presets.component engine={engine} /></section>
    <section><h2>{editor.title}</h2><editor.component engine={engine} /></section>
    <section><h2>Form</h2><Form /></section>
</main>, document.getElementById('app'));
window.ready = true;
