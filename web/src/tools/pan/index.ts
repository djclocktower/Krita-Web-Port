import { pan } from '../../canvas/view';
import type { Point } from '../../engine/protocol';
import type { Tool } from '../../tools';
import { svg } from '../shared';

// Drag the image. The image point grabbed at pointer down stays under the pointer.
let grab: Point | null = null;

export default {
    id: 'pan', title: 'Pan', cursor: 'grab', order: 40,
    icon: svg('<path d="M8 12V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 6-5 6-3 0-4-2-6-5l-1-2a1.5 1.5 0 0 1 3-1l1 2"/>'),
    onPointerDown(_ctx, p) { grab = p; },
    onPointerMove(ctx, pts) {
        if (!grab) return;
        const now = ctx.toScreen(pts[pts.length - 1]), then = ctx.toScreen(grab);
        pan(now.x - then.x, now.y - then.y);
    },
    onPointerUp() { grab = null; },
    onCancel() { grab = null; },
} satisfies Tool;
