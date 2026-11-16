// Canvas-only mode: a class on <html>; canvasOnly.css hides everything but the canvas.
const root = document.documentElement;
export const isCanvasOnly = () => root.classList.contains('canvas-only');
export const toggleCanvasOnly = () => { root.classList.toggle('canvas-only'); };
