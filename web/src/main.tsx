import './ui/theme.css';
import { render } from 'preact';
import { createEngine } from './engine';
import { App } from './shell/App';

const engine = await createEngine();
render(<App engine={engine} />, document.getElementById('app')!);
