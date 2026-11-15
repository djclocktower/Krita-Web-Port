// The engine has no "which node is active" query, so remember the last activeNodeChanged per engine.
// Panels mount only while their dock or sheet is open, so events that arrived earlier are known only if some panel
// called this before them; otherwise the answer is a guess (the top-most layer). An Engine.activeNode() would remove the guess.
import type { Engine, NodeId } from '../../engine/protocol';

const seen = new WeakMap<Engine, { id: NodeId | null; known: boolean }>();

/** The active node; falls back to the top-most layer if no event has been seen yet. */
export async function activeNode(engine: Engine): Promise<NodeId | null> {
    let s = seen.get(engine);
    if (!s) {
        const state = s = { id: null as NodeId | null, known: false as boolean };
        seen.set(engine, state);
        engine.on('activeNodeChanged', id => { state.id = id; state.known = true; });
        engine.on('documentChanged', d => { if (!d) { state.id = null; state.known = false; } });
    }
    // Ask the engine; an engine build older than activeNode() falls back to the top-most layer.
    return s.known ? s.id : engine.activeNode().catch(async () => (await engine.layers())[0]?.id ?? null);
}
