import { fit, resetRotation, rotateBy, toggleMirror, zoomBy, zoomTo } from '../canvas/view';
import type { Engine } from '../engine/protocol';
import { panels, type Command } from '../panels';
import { download } from '../dialogs/download';
import { openActionSearch } from '../krita/ActionSearch';
import { krita } from '../krita/state';
import { getSetting } from '../settings/store';
import { app, report, type DialogId } from './state';
import { applyWorkspace, BUILT_IN } from './workspaces';

const DEG = Math.PI / 180;

function openFile(engine: Engine) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kra,.ora,.png,.jpg,.jpeg,.webp,.gif,.bmp';
    input.onchange = () => {
        const f = input.files?.[0];
        if (f) void f.arrayBuffer().then(b => engine.openDocument(f.name, new Uint8Array(b))).catch(report);
    };
    input.click();
}

const baseName = () => (app.get().doc?.name ?? 'image').replace(/\.[^.]*$/, '');
const open = (dialog: DialogId) => () => app.set({ dialog });

const brush = () => app.get().brush;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sizeStep = (dir: number) => (e: Engine) => {
    const s = brush().size;
    return e.setBrush({ size: clamp(Math.round(s + dir * Math.max(1, s * 0.1)), 1, 1000) });
};
const opacityStep = (dir: number) => (e: Engine) => e.setBrush({ opacity: clamp(Math.round((brush().opacity + dir * 0.1) * 100) / 100, 0, 1) });

export const shellCommands: Command[] = [
    { id: 'file.new', title: 'New…', menu: 'File', shortcut: 'Ctrl+N', run: () => app.set({ newOpen: true }) },
    { id: 'file.open', title: 'Open…', menu: 'File', shortcut: 'Ctrl+O', run: openFile },
    { id: 'file.openRecent', title: 'Open Recent…', menu: 'File', run: open('recent') },
    { id: 'file.saveKra', title: 'Save as .kra', menu: 'File', shortcut: 'Ctrl+S', run: async e => download(`${baseName()}.kra`, await e.exportDocument('kra')) },
    { id: 'file.export', title: 'Export…', menu: 'File', shortcut: 'Ctrl+Shift+E', run: open('export') },
    { id: 'edit.undo', title: 'Undo', menu: 'Edit', shortcut: 'Ctrl+Z', run: e => e.undo() },
    { id: 'edit.redo', title: 'Redo', menu: 'Edit', shortcut: 'Ctrl+Shift+Z', run: e => e.redo() },
    { id: 'edit.fillFg', title: 'Fill with Foreground Color', menu: 'Edit', shortcut: 'Shift+Backspace', run: e => e.fillSelection('foreground') },
    { id: 'edit.fillBg', title: 'Fill with Background Color', menu: 'Edit', shortcut: 'Backspace', run: e => e.fillSelection('background') },
    { id: 'edit.clear', title: 'Clear', menu: 'Edit', shortcut: 'Delete', run: e => e.clearSelection() },
    { id: 'select.all', title: 'Select All', menu: 'Select', shortcut: 'Ctrl+A', run: e => e.selectAll() },
    { id: 'select.none', title: 'Deselect', menu: 'Select', shortcut: 'Ctrl+Shift+A', run: e => e.deselect() },
    { id: 'select.invert', title: 'Invert Selection', menu: 'Select', shortcut: 'Ctrl+Shift+I', run: e => e.invertSelection() },
    { id: 'image.scale', title: 'Scale Image To New Size…', menu: 'Image', shortcut: 'Ctrl+Alt+I', run: open('scale') },
    { id: 'image.resizeCanvas', title: 'Resize Canvas…', menu: 'Image', shortcut: 'Ctrl+Alt+C', run: open('resize') },
    { id: 'image.trim', title: 'Trim to Current Selection', menu: 'Image', run: e => { const r = app.get().sel; return r ? e.cropImage(r).then(() => undefined) : undefined; } },
    { id: 'image.rotateRight', title: 'Rotate Image › 90° Right', menu: 'Image', run: e => e.rotateImage(90).then(() => undefined) },
    { id: 'image.rotateLeft', title: 'Rotate Image › 90° Left', menu: 'Image', run: e => e.rotateImage(-90).then(() => undefined) },
    { id: 'image.rotate180', title: 'Rotate Image › 180°', menu: 'Image', run: e => e.rotateImage(180).then(() => undefined) },
    { id: 'image.rotateCustom', title: 'Rotate Image › Custom…', menu: 'Image', run: open('rotate') },
    { id: 'image.mirrorH', title: 'Mirror Image Horizontally', menu: 'Image', run: e => e.mirrorImage('horizontal') },
    { id: 'image.mirrorV', title: 'Mirror Image Vertically', menu: 'Image', run: e => e.mirrorImage('vertical') },
    { id: 'image.flatten', title: 'Flatten Image', menu: 'Image', run: e => e.flattenImage() },
    { id: 'image.convert', title: 'Convert Image Color Space…', menu: 'Image', run: open('convert') },
    { id: 'view.zoomIn', title: 'Zoom In', menu: 'View', run: () => zoomBy(1.25) },
    { id: 'view.zoomOut', title: 'Zoom Out', menu: 'View', run: () => zoomBy(0.8) },
    { id: 'view.zoom100', title: 'Zoom to 100%', menu: 'View', shortcut: '1', run: () => zoomTo(1) },
    { id: 'view.fit', title: 'Fit Page', menu: 'View', shortcut: '2', run: fit },
    { id: 'view.rotateCcw', title: 'Rotate Counterclockwise', menu: 'View', shortcut: '4', run: () => rotateBy(-15 * DEG) },
    { id: 'view.rotateCw', title: 'Rotate Clockwise', menu: 'View', shortcut: '6', run: () => rotateBy(15 * DEG) },
    { id: 'view.rotateReset', title: 'Reset Rotation', menu: 'View', shortcut: '5', run: resetRotation },
    { id: 'view.mirror', title: 'Mirror View', menu: 'View', shortcut: 'M', run: toggleMirror },
    { id: 'tools.sizeDown', title: 'Decrease Brush Size', menu: 'Tools', shortcut: '[', run: sizeStep(-1) },
    { id: 'tools.sizeUp', title: 'Increase Brush Size', menu: 'Tools', shortcut: ']', run: sizeStep(1) },
    { id: 'tools.opacityDown', title: 'Decrease Opacity', menu: 'Tools', shortcut: 'I', run: opacityStep(-1) },
    { id: 'tools.opacityUp', title: 'Increase Opacity', menu: 'Tools', shortcut: 'O', run: opacityStep(1) },
    { id: 'tools.eraser', title: 'Toggle Eraser', menu: 'Tools', shortcut: 'E', run: e => e.setBrush({ eraser: !brush().eraser }) },
    { id: 'tools.swapColors', title: 'Swap Foreground and Background', menu: 'Tools', shortcut: 'X',
      run: e => e.setColors({ foreground: app.get().bg, background: app.get().fg }) },
    { id: 'tools.resetColors', title: 'Reset Colors', menu: 'Tools', shortcut: 'D',
      run: e => e.setColors({ foreground: { r: 0, g: 0, b: 0, a: 1 }, background: { r: 1, g: 1, b: 1, a: 1 } }) },
    { id: 'settings.configure', title: 'Configure Krita…', menu: 'Settings', run: open('settings') },
    // Window › Workspace: the menu union has no Window, so these live under Settings.
    ...Object.keys(BUILT_IN).map(n => ({ id: `workspace.${n.toLowerCase()}`, title: `Workspace: ${n}`, menu: 'Settings' as const, run: () => applyWorkspace(n) })),
    { id: 'workspace.manage', title: 'Workspace: Save and Manage…', menu: 'Settings', run: open('workspaces') },
    { id: 'help.actions', title: 'Search Krita Actions…', menu: 'Settings', shortcut: 'Ctrl+Enter', run: openActionSearch },   // Help is not in the menu union either
    { id: 'help.about', title: 'About Krita Web…', menu: 'Settings', run: open('about') },   // Help is not in the menu union either
];

export const allCommands: Command[] = [...shellCommands, ...panels.flatMap(p => p.commands ?? [])];

/** Whether a command can run now: it needs a document (except New and Open), and Undo, Redo and Trim need something to act on. */
export function isEnabled(c: Command): boolean {
    const { doc, history, sel } = app.get();
    const needsDoc = ['Edit', 'Image', 'Layer', 'Select', 'Filter'].includes(c.menu) || (c.menu === 'File' && !['file.new', 'file.open', 'file.openRecent'].includes(c.id));
    if (needsDoc && !doc) return false;
    if (c.id === 'help.actions') return krita.get().tools.length > 0;   // only Krita's engine has actions
    return c.id === 'edit.undo' ? history.canUndo : c.id === 'edit.redo' ? history.canRedo : c.id === 'image.trim' ? !!sel : true;
}

/** What the menus list: every command, plus a "Workspace: name" entry for each saved workspace (after the built-in ones). */
export function menuCommands(): Command[] {
    const saved = Object.keys(getSetting('workspaces')).map((n): Command => ({ id: `workspace.user.${n}`, title: `Workspace: ${n}`, menu: 'Settings', run: () => applyWorkspace(n) }));
    return allCommands.flatMap(c => c.id === 'workspace.animation' ? [c, ...saved] : [c]);
}
