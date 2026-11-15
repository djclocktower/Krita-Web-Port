import './ui/theme.css';
import { render } from 'preact';
import { createEngine } from './engine';
import { App } from './shell/App';

const engine = await createEngine();
// For tests and debugging in the dev server only.
if (import.meta.env.DEV) (window as unknown as { __engine: unknown }).__engine = engine;
render(<App engine={engine} />, document.getElementById('app')!);
