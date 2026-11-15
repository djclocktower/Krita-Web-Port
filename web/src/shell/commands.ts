import { fit, resetRotation, rotateBy, toggleMirror, zoomBy, zoomTo } from '../canvas/view';
import type { Engine } from '../engine/protocol';
import { panels, type Command } from '../panels';
import { app, report } from './state';

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

async function exportPng(engine: Engine) {
    const bytes = await engine.exportDocument('png');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
    a.download = `${(app.get().doc?.name ?? 'image').replace(/\.[^.]*$/, '')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

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
    { id: 'file.exportPng', title: 'Export as PNG', menu: 'File', shortcut: 'Ctrl+Shift+E', run: exportPng },
    { id: 'edit.undo', title: 'Undo', menu: 'Edit', shortcut: 'Ctrl+Z', run: e => e.undo() },
    { id: 'edit.redo', title: 'Redo', menu: 'Edit', shortcut: 'Ctrl+Shift+Z', run: e => e.redo() },
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
];

export const allCommands: Command[] = [...shellCommands, ...panels.flatMap(p => p.commands ?? [])];
