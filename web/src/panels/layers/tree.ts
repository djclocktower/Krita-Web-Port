import type { Engine, LayerNode, NodeId } from '../../engine/protocol';

export type Pos = 'above' | 'below' | 'inside';
export interface Found { node: LayerNode; parent: LayerNode | null; siblings: LayerNode[]; index: number }
export interface Row extends Found { depth: number }

export const isMask = (n: LayerNode) => n.type.endsWith('Mask');

/** Searches the whole tree (collapsed or not), including `nodes` themselves. */
export function find(nodes: LayerNode[], id: NodeId, parent: LayerNode | null = null): Found | null {
    for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        if (node.id === id) return { node, parent, siblings: nodes, index };
        const inner = find(node.children, id, node);
        if (inner) return inner;
    }
    return null;
}

export function count(nodes: LayerNode[], type: string): number {
    return nodes.reduce((n, x) => n + (x.type === type ? 1 : 0) + count(x.children, type), 0);
}

/** The rows the panel shows, top to bottom; children of collapsed nodes are skipped. */
export function flatten(nodes: LayerNode[], depth = 0, parent: LayerNode | null = null, out: Row[] = []): Row[] {
    nodes.forEach((node, index) => {
        out.push({ node, parent, siblings: nodes, index, depth });
        if (node.children.length && !node.collapsed) flatten(node.children, depth + 1, node, out);
    });
    return out;
}

/** Never into itself or its own subtree; masks stay with masks and inside layers, layers go inside groups only. */
export function canDrop(drag: LayerNode, target: LayerNode, pos: Pos): boolean {
    if (find([drag], target.id)) return false;
    if (pos === 'inside') return isMask(drag) ? !isMask(target) : target.type === 'group';
    return isMask(drag) === isMask(target);
}

/** The protocol can only place a node above another, so "below" is above the next sibling. */
export async function moveBelow(engine: Engine, id: NodeId, target: Found) {
    const next = target.siblings[target.index + 1];
    if (next?.id === id) return;
    if (next) return engine.moveNode(id, { above: next.id });
    // ponytail: no "bottom of parent" in the protocol; two moves (two undo steps) until it has one.
    await engine.moveNode(id, { above: target.node.id });
    await engine.moveNode(target.node.id, { above: id });
}

export async function drop(engine: Engine, tree: LayerNode[], id: NodeId, targetId: NodeId, pos: Pos) {
    const target = find(tree, targetId);
    if (!target) return;
    if (pos === 'inside') return engine.moveNode(id, { parent: targetId });
    if (pos === 'above') return target.siblings[target.index - 1]?.id === id ? undefined : engine.moveNode(id, { above: targetId });
    return moveBelow(engine, id, target);
}

export async function moveBy(engine: Engine, tree: LayerNode[], id: NodeId, dir: -1 | 1) {
    const at = find(tree, id), other = at?.siblings[at.index + dir];
    if (!at || !other) return;
    if (dir < 0) return engine.moveNode(id, { above: other.id });
    return moveBelow(engine, id, find(tree, other.id)!);
}
