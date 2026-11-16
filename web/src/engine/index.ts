import type { Engine } from './protocol';

/**
 * Which engine runs. `?engine=wasm` is Krita's real core, `?engine=mock` the in-browser stand-in.
 * With no parameter, a production build uses Krita's core and the dev server uses the mock
 * (so interface work and tests do not need the 80 MB binary).
 */
export async function createEngine(): Promise<Engine> {
    const choice = new URLSearchParams(location.search).get('engine') ?? (import.meta.env.PROD ? 'wasm' : 'mock');
    if (choice === 'wasm') return (await import('./wasm')).createWasmEngine();
    return (await import('./mock')).createMockEngine();
}
