// The page's menus: Krita's own menu structure (menus.generated.ts) merged with the page's commands.
// A page command that does what a Krita action does (PAGE_EQUIV) takes that action's place; the rest of Krita's entries come from the
// engine's action list (label, enabled, checked, shortcut); page commands with no Krita counterpart follow at the end of their menu.
// Without Krita's actions (the plain mock) there is no tree: the menus are the page's commands, as before.
import type { FilterInfo, KritaAction } from '../engine/protocol';
import type { Command } from '../panels';
import { store } from '../shell/store';
import { kritaEngine } from './state';
import { KRITA_MENUS, type MenuItem } from './menus.generated';

/** Actions that crash or hang the engine today (A1 of docs/parity/REPORT.md). Delete a line to offer one again once the engine is fixed. */
export const BLOCKED: string[] = [
    'add_new_fill_layer',
    'add_new_fast_color_overlay_mask',
    'convert_to_filter_mask',
];

/** Krita action -> id of the page command that does the same (it is shown at the action's place and the action is not repeated). */
export const PAGE_EQUIV: Record<string, string> = {
    file_new: 'file.new', file_open: 'file.open', file_open_recent: 'file.openRecent', file_save: 'file.saveKra', file_export_file: 'file.export',
    edit_undo: 'edit.undo', edit_redo: 'edit.redo', fill_selection_foreground_color: 'edit.fillFg', fill_selection_background_color: 'edit.fillBg', clear: 'edit.clear',
    select_all: 'select.all', deselect: 'select.none', invert_selection: 'select.invert',
    imagesize: 'image.scale', canvassize: 'image.resizeCanvas', resizeimagetoselection: 'image.trim', rotateImageCW90: 'image.rotateRight', rotateImageCCW90: 'image.rotateLeft',
    rotateImage180: 'image.rotate180', rotateimage: 'image.rotateCustom', mirrorImageHorizontal: 'image.mirrorH', mirrorImageVertical: 'image.mirrorV', flatten_image: 'image.flatten',
    imagecolorspaceconversion: 'image.convert',
    view_zoom_in: 'view.zoomIn', view_zoom_out: 'view.zoomOut', zoom_to_100pct: 'view.zoom100', zoom_to_fit: 'view.fit', rotate_canvas_left: 'view.rotateCcw',
    rotate_canvas_right: 'view.rotateCw', reset_canvas_rotation: 'view.rotateReset', mirror_canvas: 'view.mirror',
    decrease_brush_size: 'tools.sizeDown', increase_brush_size: 'tools.sizeUp', decrease_opacity: 'tools.opacityDown', increase_opacity: 'tools.opacityUp',
    erase_action: 'tools.eraser', toggle_fg_bg: 'tools.swapColors', reset_fg_bg: 'tools.resetColors', options_configure: 'settings.configure',
    add_new_paint_layer: 'layer.newPaint', add_new_group_layer: 'layer.newGroup', duplicatelayer: 'layer.duplicate', merge_layer: 'layer.mergeDown', remove_layer: 'layer.remove',
    layer_properties: 'layer.properties', filter_gallery: 'filter.gallery',
    view_ruler: 'view.rulers', view_grid: 'view.grid', view_show_guides: 'view.guides', view_lock_guides: 'view.lockGuides', view_snap_to_guides: 'view.snapGuides',
    view_snap_to_grid: 'view.snapGrid', view_snap_image_bounds: 'view.snapBounds', view_snap_image_center: 'view.snapCenter', view_show_canvas_only: 'view.canvasOnly',
};

export type Entry =
    | { kind: 'sep' }
    | { kind: 'cmd'; cmd: Command; checked?: boolean }
    | { kind: 'action'; name: string; label: string; shortcut: string; enabled: boolean; checkable: boolean; checked: boolean }
    | { kind: 'menu'; label: string; items: Entry[] };
export interface Menu { name: string; items: Entry[] }

export const TOP = ['File', 'Edit', 'View', 'Image', 'Layer', 'Select', 'Filter', 'Tools', 'Settings', 'Window', 'Help'];

/** What the engine last told us (refreshed when the menu bar opens). */
export const menuData = store({ actions: [] as KritaAction[], filters: [] as FilterInfo[] });
export async function refreshMenuData() {
    const e = kritaEngine();
    if (!e) return;
    const actions = await e.kritaActions().catch(() => null);
    if (actions) menuData.set({ actions });
    if (!menuData.get().filters.length) { const filters = await e.filters().catch(() => null); if (filters?.length) menuData.set({ filters }); }   // static once a document exists
}

export const clean = (t: string) => t.replace(/&&/g, '\u0001').replace(/&/g, '').replace(/\u0001/g, '&').trim();
const dockerId = (c: Command) => c.id.startsWith('krita.docker.');

function tidy(items: Entry[]): Entry[] {
    const out = items.filter((x, i) => !(x.kind === 'sep' && (!i || items[i - 1].kind === 'sep')));
    while (out.at(-1)?.kind === 'sep') out.pop();
    return out;
}

export function buildMenus(commands: Command[], actions: KritaAction[], filters: FilterInfo[], docker: (c: Command) => boolean): Menu[] {
    const byName = new Map(actions.map(a => [a.name, a]));
    const byId = new Map(commands.map(c => [c.id, c]));
    const placed = new Set<string>();
    const dockers = commands.filter(dockerId);
    const dockerMenu = (): Entry | null => {
        if (!dockers.length) return null;
        dockers.forEach(c => placed.add(c.id));
        return { kind: 'menu', label: 'Dockers', items: dockers.map(cmd => ({ kind: 'cmd', cmd, checked: docker(cmd) })) };
    };
    const convert = (items: MenuItem[], top: string): Entry[] => tidy(items.flatMap((i): Entry[] => {
        if ('sep' in i) return [{ kind: 'sep' }];
        if ('menu' in i) { const sub = convert(i.items, top); return sub.length ? [{ kind: 'menu', label: i.text, items: sub }] : []; }
        if (BLOCKED.includes(i.action)) return [];
        const cmd = byId.get(PAGE_EQUIV[i.action]);
        if (cmd) {   // the page's command wins; one that lives in another menu than Krita's entry stays in its own menu, so the entry is dropped
            if (cmd.menu !== top) return [];
            placed.add(cmd.id); return [{ kind: 'cmd', cmd }];
        }
        if (i.action === 'settings_dockers_menu') { const d = dockerMenu(); return d ? [d] : []; }
        const a = byName.get(i.action);
        if (!a) return [];
        if (top === 'Filter' && i.action.endsWith('_filters')) {   // Krita fills these submenus in code, from the filter list
            const cat = (clean(a.text) || i.text).toLowerCase();   // the engine names a filter's category by the submenu's title
            const sub = filters.filter(f => f.category.toLowerCase() === cat && byName.has(`krita_filter_${f.id}`)).map(f => byName.get(`krita_filter_${f.id}`)!)
                .map((x): Entry => ({ kind: 'action', name: x.name, label: clean(x.text), shortcut: x.shortcut, enabled: x.enabled, checkable: x.checkable, checked: x.checked }))
                .sort((x, y) => (x as { label: string }).label.localeCompare((y as { label: string }).label));
            return sub.length ? [{ kind: 'menu', label: clean(a.text) || i.text, items: sub }] : [];
        }
        return [{ kind: 'action', name: a.name, label: clean(a.text) || i.text || a.name, shortcut: a.shortcut, enabled: a.enabled, checkable: a.checkable, checked: a.checked }];
    }));
    const tree = actions.length ? KRITA_MENUS : [];   // ponytail: no Krita actions (plain mock): the page's commands only
    const menus = new Map<string, Entry[]>(TOP.map(n => [n, []]));
    for (const m of tree) menus.set(m.name, convert(m.items, m.name));
    // page commands with no Krita counterpart (and, without Krita, all of them)
    for (const name of TOP) {
        const rest = commands.filter(c => c.menu === name && !placed.has(c.id) && !dockerId(c)).map((cmd): Entry => ({ kind: 'cmd', cmd }));
        const items = menus.get(name)!;
        if (name === 'Settings' && dockers.some(c => !placed.has(c.id))) rest.push(dockerMenu()!);
        if (rest.length) menus.set(name, items.length ? [...items, { kind: 'sep' }, ...rest] : rest);
    }
    return TOP.map(name => ({ name, items: menus.get(name)! })).filter(m => m.items.length);
}

/** Every command and action, with the menu path it sits under (for the phone's search). */
export function leaves(items: Entry[], path: string[]): { entry: Exclude<Entry, { kind: 'sep' | 'menu' }>; path: string }[] {
    return items.flatMap(e => e.kind === 'sep' ? [] : e.kind === 'menu' ? leaves(e.items, [...path, e.label]) : [{ entry: e, path: path.join(' › ') }]);
}
