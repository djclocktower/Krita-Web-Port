import type { Engine } from './protocol';

/** `?engine=wasm` loads Krita's real core; the default is the mock so the UI runs without the 60 MB binary. */
export async function createEngine(): Promise<Engine> {
    if (new URLSearchParams(location.search).get('engine') === 'wasm') {
        return (await import('./wasm')).createWasmEngine();
    }
    return (await import('./mock')).createMockEngine();
}
