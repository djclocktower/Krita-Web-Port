import { useEffect, useRef } from 'preact/hooks';
import type { DocumentInfo, Engine, Rect } from '../engine/protocol';
import { attachPointer, nav, updateCursor } from '../input/pointer';
import { krita, kritaOn } from '../krita/state';
import { activeTool, isBrush, onActiveToolChange, type ToolContext } from '../tools';
import { aids, drawGrid, drawGuides, drawOutline, drawRulers, live, setDocName } from './aids';
import { toggleCanvasOnly } from './canvasOnly';
import { canvasDpr, fit, matrix, setViewport, toScreen, view } from './view';
import './canvasOnly.css';

// The image is one quad: vertex ids give the corners, a 2x2 matrix + offset (CSS px) places it.
const VS = `#version 300 es
uniform vec4 uA; uniform vec2 uT, uDoc, uSize;
out vec2 vUv;
void main() {
    vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
    vec2 d = (c - 0.5) * uDoc;
    vec2 s = vec2(uA.x * d.x + uA.z * d.y, uA.y * d.x + uA.w * d.y) + uT;
    vUv = c;
    gl_Position = vec4(s.x / uSize.x * 2.0 - 1.0, 1.0 - s.y / uSize.y * 2.0, 0.0, 1.0);
}`;
const FS = `#version 300 es
precision mediump float;
uniform sampler2D uTex; uniform float uCell;
in vec2 vUv; out vec4 o;
void main() {
    vec4 t = texture(uTex, vUv);
    vec2 g = floor(gl_FragCoord.xy / uCell);
    vec3 bg = vec3(mix(0.8, 0.6, mod(g.x + g.y, 2.0)));
    o = vec4(t.rgb * t.a + bg * (1.0 - t.a), 1.0);   // texture is straight alpha
}`;

export function Canvas({ engine }: { engine: Engine }) {
    const box = useRef<HTMLDivElement>(null);
    const cv = useRef<HTMLCanvasElement>(null);
    const ov = useRef<HTMLCanvasElement>(null);
    const kov = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const el = cv.current!, overlay = ov.current!, g = overlay.getContext('2d')!, kg = kov.current!.getContext('2d')!;
        // preserveDrawingBuffer so the tests (and screenshots) can read the canvas back
        const gl = el.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
        if (!gl) { box.current!.textContent = 'WebGL2 is not available in this browser.'; return; }
        const program = gl.createProgram()!;
        for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
            const sh = gl.createShader(type)!;
            gl.shaderSource(sh, src); gl.compileShader(sh); gl.attachShader(program, sh);
        }
        gl.linkProgram(program); gl.useProgram(program);
        const u = (n: string) => gl.getUniformLocation(program, n);
        const [uA, uT, uDoc, uSize, uCell] = ['uA', 'uT', 'uDoc', 'uSize', 'uCell'].map(u);

        let tex: WebGLTexture | null = null, raf = 0, nearest: boolean | null = null;
        const draw = () => {
            raf = 0;
            const s = view.get(), dpr = canvasDpr(), W = Math.round(s.w * dpr), H = Math.round(s.h * dpr);
            if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }
            gl.viewport(0, 0, W, H);
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
            if (!tex) return;
            const m = matrix(), crisp = s.scale >= 1;
            if (crisp !== nearest) {
                nearest = crisp;
                const f = crisp ? gl.NEAREST : gl.LINEAR;
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
            }
            gl.uniform4f(uA, m.a, m.b, m.c, m.d);
            gl.uniform2f(uT, s.w / 2 + s.panX, s.h / 2 + s.panY);
            gl.uniform2f(uDoc, s.docW, s.docH);
            gl.uniform2f(uSize, s.w, s.h);
            gl.uniform1f(uCell, 8 * dpr);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        const schedule = () => { raf ||= requestAnimationFrame(draw); };

        const setDoc = (info: DocumentInfo | null) => {
            const s = view.get();
            if (info) setDocName(info.name);
            if (!info) { if (tex) gl.deleteTexture(tex); tex = null; view.set({ docW: 0, docH: 0 }); }
            else if (!tex || info.width !== s.docW || info.height !== s.docH) {
                // ponytail: one texture for the whole document, so it is capped at MAX_TEXTURE_SIZE per side; very large documents need tiled textures
                if (Math.max(info.width, info.height) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) throw new Error('Document is larger than this GPU can display');
                if (tex) gl.deleteTexture(tex);
                tex = gl.createTexture(); nearest = null;
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, info.width, info.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                view.set({ docW: info.width, docH: info.height });
                fit();
                void engine.refresh();
            }
            schedule();
        };

        // Overlay: marching ants for the selection, then whatever the active tool draws.
        let viewKey = '', outline: number[][] = [], ants: Path2D | null = null, oraf = 0, outlineToken = 0;
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const ctx: ToolContext = {
            engine, requestOverlay: () => { oraf ||= requestAnimationFrame(redraw); },
            toScreen: p => toScreen(p.x, p.y), modifiers: { shift: false, ctrl: false, alt: false },
        };
        function redraw() {
            oraf = 0;
            const s = view.get(), dpr = canvasDpr(), W = Math.round(s.w * dpr), H = Math.round(s.h * dpr);
            if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.clearRect(0, 0, s.w, s.h);
            drawGrid(g); drawGuides(g);
            if (outline.length) {
                if (!ants) {
                    ants = new Path2D();
                    for (const l of outline) {
                        for (let i = 0; i + 1 < l.length; i += 2) { const p = toScreen(l[i], l[i + 1]); i ? ants.lineTo(p.x, p.y) : ants.moveTo(p.x, p.y); }
                        if (l.length >= 6) ants.closePath();
                    }
                }
                g.lineWidth = 1; g.strokeStyle = '#fff'; g.setLineDash([]); g.stroke(ants);
                g.strokeStyle = '#000'; g.setLineDash([4, 4]); g.lineDashOffset = -(performance.now() / 80) % 8; g.stroke(ants);
                g.setLineDash([]);
                if (!still) ctx.requestOverlay();   // animate only while something is selected
            }
            if (!kritaOn()) { g.save(); activeTool().drawOverlay?.(ctx, g); g.restore(); }
            drawOutline(g, isBrush() && !nav.space); drawRulers(g);
        }
        const setOutline = (next: number[][]) => { outline = next; ants = null; ctx.requestOverlay(); };
        const loadOutline = () => {
            const mine = ++outlineToken;
            engine.selectionOutline().then(o => { if (mine === outlineToken) setOutline(o); }, () => { if (mine === outlineToken) setOutline([]); });
        };
        let tool = activeTool();
        const toolChanged = () => { tool.onCancel?.(ctx); tool = activeTool(); updateCursor(el); ctx.requestOverlay(); };
        updateCursor(el);

        // Krita's tool overlay: a picture the size of the canvas element, drawn under the page's own aids.
        const kritaOverlay = (r: Rect, px: Uint8Array | null) => {
            const k = kov.current!, { w, h } = view.get();
            if (k.width !== w || k.height !== h) { k.width = w; k.height = h; } else kg.clearRect(0, 0, w, h);   // each event replaces the whole overlay
            if (!px) return;
            // ponytail: the picture is in CSS pixels and is stretched over the element, so it is soft on high-density screens
            kg.putImageData(new ImageData(new Uint8ClampedArray(px), r.width, r.height), r.x, r.y);
        };
        // One kritaViewport per animation frame, and only when something in it changed.
        let vraf = 0, sent = '';
        const sendViewport = () => {
            vraf = 0;
            const s = view.get();
            if (!kritaOn() || !s.w || !s.h) return;
            const key = [s.w, s.h, s.scale, s.panX, s.panY, s.rot, s.mirror, s.docW, s.docH].join();
            if (key === sent) return;
            sent = key;
            const o = toScreen(0, 0);   // where image pixel (0,0) lands, after rotation and mirroring
            engine.kritaViewport({ width: s.w, height: s.h, zoom: s.scale, offsetX: o.x, offsetY: o.y, rotation: s.rot * 180 / Math.PI, mirror: s.mirror });
        };
        const viewportSoon = () => { vraf ||= requestAnimationFrame(sendViewport); };
        const kritaChanged = () => {
            if (!kritaOn()) { kritaOverlay({ x: 0, y: 0, width: 0, height: 0 }, null); sent = ''; } else viewportSoon();
            updateCursor(el); ctx.requestOverlay();
        };

        const offs = [
            krita.sub(kritaChanged),
            view.sub(viewportSoon),
            engine.on('kritaOverlay', (r, px) => { if (kritaOn() || !px) kritaOverlay(r, px); }),
            engine.on('selectionChanged', b => { if (b) loadOutline(); else { outlineToken++; setOutline([]); } }),
            view.sub(() => {   // the pointer moves often; only a change of the transform invalidates the ants path
                const s = view.get(), k = [s.scale, s.rot, s.mirror, s.panX, s.panY, s.w, s.h, s.docW, s.docH].join();
                if (k !== viewKey) { viewKey = k; ants = null; ctx.requestOverlay(); }
            }),
            aids.sub(ctx.requestOverlay),
            engine.on('brushChanged', b => { if (!live.resizing) live.size = b.size; ctx.requestOverlay(); }),
            onActiveToolChange(toolChanged),
            attachPointer(ctx, el),
            engine.on('documentChanged', setDoc),
            engine.on('imageUpdate', (r, px) => {
                if (!tex) return;
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x, r.y, r.width, r.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
                schedule();
            }),
            view.sub(schedule),
        ];
        const ro = new ResizeObserver(() => { const r = box.current!.getBoundingClientRect(); setViewport(r.width, r.height); });
        ro.observe(box.current!);
        viewportSoon();
        void engine.documentInfo().then(setDoc);
        void engine.brushState().then(b => { if (!live.resizing) live.size = b.size; ctx.requestOverlay(); }, () => {});
        loadOutline();
        return () => { offs.forEach(f => f()); ro.disconnect(); cancelAnimationFrame(raf); cancelAnimationFrame(oraf); cancelAnimationFrame(vraf); };
    }, [engine]);
    return <div class="stage" ref={box}><canvas class="view" ref={cv} aria-label="Canvas" />
        <canvas class="krita-overlay" ref={kov} aria-hidden="true" style="pointer-events: none" />
        <canvas class="overlay" ref={ov} aria-hidden="true" style="pointer-events: none" />
        <button type="button" class="canvas-only-exit" onClick={toggleCanvasOnly}>Exit canvas only</button></div>;
}
