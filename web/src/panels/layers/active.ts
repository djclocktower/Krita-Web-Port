// The engine has no "which node is active" query, so remember the last activeNodeChanged per engine.
import type { Engine, NodeId } from '../../engine/protocol';

const seen = new WeakMap<Engine, { id: NodeId | null }>();

/** The active node; falls back to the top-most layer if no event has been seen yet. */
export async function activeNode(engine: Engine): Promise<NodeId | null> {
    let s = seen.get(engine);
    if (!s) {
        const state = s = { id: null as NodeId | null };
        seen.set(engine, state);
        engine.on('activeNodeChanged', id => { state.id = id; });
    }
    return s.id ?? (await engine.layers())[0]?.id ?? null;
}
