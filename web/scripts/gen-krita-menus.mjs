// Generates web/src/krita/menus.generated.ts from Krita's own menu definitions, so the page's menus follow Krita's.
//   node web/scripts/gen-krita-menus.mjs
// Reads krita/krita/krita5.xmlgui (the menu bar), merges the plugin *.xmlgui files into it (their actions are added to the
// menu of the same name unless the menu already has them), and takes default texts from the *.action files.
// The output is committed: the build must not need the krita/ submodule.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'web/src/krita/menus.generated.ts');

// Actions left out of the generated tree, grouped by why. Delete a line to bring one back (and regenerate).
// Page equivalents (File > New/Open/Open Recent/Save/Export, Undo, Redo, zoom, ...) are NOT listed: they stay in the tree so the
// page's own command shows at Krita's position (see PAGE_EQUIV in menus.ts).
// The five actions that crash or hang the engine (A1 of docs/parity/REPORT.md) are in BLOCKED in menus.ts instead; they stay in the tree.
const EXCLUDE = {
    'open or save through Qt file dialogs / the local disk (the page has its own Open, Save as .kra and Export; a tab has no disk)': [
        'file_save_as', 'file_import_file', 'file_export_advanced', 'file_import_animation', 'file_import_video_animation',
        'add_new_file_layer', 'convert_to_file_layer', 'import_layer_as_filter_mask', 'import_layer_as_paint_layer', 'import_layer_as_selection_mask',
        'import_layer_as_transparency_mask', 'import_layer_from_file', 'save_groups_as_images', 'save_node_as_image', 'save_vector_node_to_svg',   // Layer > Import/Export
        'render_animation', 'save_incremental_version', 'save_incremental_backup', 'file_sessions', 'file_reload_file', 'file_export_pdf', 'file_print',
    ],
    'closes, quits or opens windows (a tab is one window)': [
        'file_close', 'file_close_all', 'file_quit', 'view_newwindow', 'view_detached_canvas', 'window', 'windows_cascade', 'windows_tile', 'windows_next', 'windows_previous', 'workspaces',
    ],
    'conflicts with the page itself (own full screen, canvas-only, docks, toolbars, status bar, themes, languages) or opens a browser/OS page': [
        'fullscreen', 'view_toggledockers', 'showStatusBar', 'lock_toolbars', 'options_configure_toolbars', 'theme_menu', 'style_menu',
        'switch_application_language', 'settings_active_author', 'reset_configurations', 'help_contents', 'help_about_kde', 'help_whats_this', 'help_show_tip', 'help_report_bug',
        'buginfo', 'sysinfo', 'color_management_report', 'logcatdump', 'crashlog', 'change_interface_scale', 'manage_supporter_bundles', 'manage_donations', 'manage_subscriptions',
    ],
};
const excluded = new Set(Object.values(EXCLUDE).flat());
// Actions with no definition anywhere in Krita's sources are dangling in Krita itself and dropped, except the page's own equivalents.
const KEEP_UNDEFINED = ['filter_gallery'];

const strip = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&&/g, '\u0001').replace(/&/g, '').replace(/\u0001/g, '&');

// ---- the .action files: default texts
const texts = {};
const walk = (d, ext, f) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, ext, f); else if (e.name.endsWith(ext)) f(p); } };
walk(path.join(ROOT, 'krita'), '.action', p => {
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/<Action\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/Action>/g)) {
        const t = /<text[^>]*>([\s\S]*?)<\/text>/.exec(m[2])?.[1];
        if (t && !texts[m[1]]) texts[m[1]] = strip(t).trim();
    }
});

// ---- the .xmlgui files: menu trees
function parse(xml) {
    xml = xml.replace(/<!--[\s\S]*?-->/g, '');
    const top = [], stack = [];   // stack of menus; each { name, text, items }
    let toolbar = 0, m;
    const re = /<(\/?)(Menu|Action|Separator|ToolBar|text|Text)\b([^>]*?)(\/?)>/g;
    while ((m = re.exec(xml))) {
        const [, close, tag, attrs, self] = m, cur = stack[stack.length - 1];
        if (tag === 'ToolBar') toolbar += close ? -1 : 1;
        else if (toolbar) continue;
        else if (tag === 'text' || tag === 'Text') { if (!close && cur && !cur.text) cur.text = strip(xml.slice(re.lastIndex, xml.indexOf('</', re.lastIndex))).trim(); }
        else if (tag === 'Menu') {
            if (close) stack.pop();
            else { const menu = { name: /name="([^"]+)"/.exec(attrs)?.[1] ?? '', text: '', items: [] }; (cur ? cur.items : top).push(menu); if (!self) stack.push(menu); }
        } else if (tag === 'Separator' && cur) cur.items.push({ sep: true });
        else if (tag === 'Action' && !close && cur) { const name = /name="([^"]+)"/.exec(attrs)?.[1]; if (name) cur.items.push({ action: name }); }
    }
    return top;
}
const files = [];
walk(path.join(ROOT, 'krita'), '.xmlgui', p => { if (!p.includes('ui_standards')) files.push(p); });
const mainFile = files.find(p => p.endsWith('krita/krita5.xmlgui'));
const menus = parse(fs.readFileSync(mainFile, 'utf8'));
const find = (list, n) => list.find(x => x.name.toLowerCase() === n.toLowerCase());
const actionsIn = items => items.flatMap(i => i.action ? [i.action] : i.items ? actionsIn(i.items) : []);
for (const f of files.filter(p => p !== mainFile).sort()) {
    for (const pm of parse(fs.readFileSync(f, 'utf8'))) {
        const target = find(menus, pm.name);
        if (!target) continue;   // ponytail: a plugin menu the main file lacks is not added; only top-level menus merge
        const have = new Set(actionsIn(menus.flatMap(m => m.items)));   // an action sits in one place
        const extra = actionsIn(pm.items).filter(a => !have.has(a));
        if (extra.length) target.items.push({ sep: true }, ...extra.map(action => ({ action })));
    }
}

// ---- clean: drop excluded and repeated actions (the first occurrence in a top-level menu wins), empty menus, doubled separators
function clean(items, seen) {
    const out = [];
    for (const i of items) {
        if (i.sep) out.push(i);
        else if (i.action) { if (excluded.has(i.action) || seen.has(i.action) || (!texts[i.action] && !KEEP_UNDEFINED.includes(i.action))) continue; seen.add(i.action); out.push({ action: i.action, text: texts[i.action] ?? '' }); }
        else { const sub = clean(i.items, seen); if (sub.some(x => !x.sep)) out.push({ menu: i.name, text: i.text || i.name, items: sub }); }
    }
    while (out[0]?.sep) out.shift();
    while (out.at(-1)?.sep) out.pop();
    return out.filter((x, k) => !(x.sep && out[k - 1]?.sep));
}
const tree = menus.map(m => ({ name: m.text || m.name, items: clean(m.items, new Set()) })).filter(m => m.items.length);

// ---- write
const q = s => JSON.stringify(s);
const line = (i, d) => {
    const pad = '    '.repeat(d);
    if (i.sep) return `${pad}{ sep: true },`;
    if (i.action) return `${pad}{ action: ${q(i.action)}, text: ${q(i.text)} },`;
    return `${pad}{ menu: ${q(i.menu)}, text: ${q(i.text)}, items: [\n${i.items.map(x => line(x, d + 1)).join('\n')}\n${pad}] },`;
};
const src = `// GENERATED by web/scripts/gen-krita-menus.mjs from krita/krita/krita5.xmlgui (plus the plugin .xmlgui files) and the .action files. Do not edit; rerun the script.
// Krita's own menu structure: menu -> actions (name and default text), separators and submenus, in Krita's order.
export type MenuItem =
    | { sep: true }
    | { action: string; text: string }
    | { menu: string; text: string; items: MenuItem[] };
export interface MenuDef { name: string; items: MenuItem[] }

export const KRITA_MENUS: MenuDef[] = [
${tree.map(m => `    { name: ${q(m.name)}, items: [\n${m.items.map(x => line(x, 2)).join('\n')}\n    ] },`).join('\n')}
];
`;
fs.writeFileSync(OUT, src);
const count = items => items.reduce((n, i) => n + (i.action ? 1 : i.items ? count(i.items) : 0), 0);
console.log(`wrote ${path.relative(ROOT, OUT)}: ${tree.map(m => `${m.name} ${count(m.items)}`).join(', ')}`);
