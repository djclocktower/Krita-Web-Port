import './ui/theme.css';
import { render } from 'preact';
import { createEngine } from './engine';
import { App } from './shell/App';

try {
    const engine = await createEngine();
    // For tests and debugging in the dev server only.
    if (import.meta.env.DEV) (window as unknown as { __engine: unknown }).__engine = engine;
    render(<App engine={engine} />, document.getElementById('app')!);
} catch (e) {
    // Without this a browser that cannot run the engine shows an empty page.
    console.error(e);
    document.getElementById('app')!.innerHTML = '<p style="color:#dedede;font:16px sans-serif;margin:2em;max-width:40em"></p>';
    document.querySelector('#app p')!.textContent = `Krita Web could not start: ${e instanceof Error ? e.message : e}`;
}
