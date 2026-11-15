import type { Engine } from './protocol';

// Filled in by the engine track (engine/bridge). Kept separate so the UI never depends on how the core is loaded.
export async function createWasmEngine(): Promise<Engine> {
    throw new Error('The WebAssembly engine bridge is not built yet; run without ?engine=wasm to use the mock.');
}
