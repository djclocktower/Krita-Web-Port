import { dragSelect, ModeOptions } from '../shared';

export default {
    ...dragSelect({
        id: 'selectRect', title: 'Rectangular Selection', shortcut: 'Ctrl+R', order: 10,
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2"/></svg>',
        shape: r => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }],
        select: (e, r, mode) => e.selectRect(r, mode),
    }),
    options: ModeOptions,
};
