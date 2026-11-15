import { dragSelect, ModeOptions } from '../shared';

export default {
    ...dragSelect({
        id: 'selectEllipse', title: 'Elliptical Selection', shortcut: 'J', order: 11,
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="8" ry="6" stroke-dasharray="3 2"/></svg>',
        shape: r => Array.from({ length: 64 }, (_, i) => {
            const t = (i / 64) * 2 * Math.PI;
            return { x: r.x + r.width / 2 + Math.cos(t) * r.width / 2, y: r.y + r.height / 2 + Math.sin(t) * r.height / 2 };
        }),
        select: (e, r, mode) => e.selectEllipse(r, mode),
    }),
    options: ModeOptions,
};
