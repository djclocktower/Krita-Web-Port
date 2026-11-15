import { useEffect, useRef } from 'preact/hooks';
import type { DocumentInfo, Engine } from '../engine/protocol';
import { attachPointer } from '../input/pointer';
import { fit, matrix, setViewport, view } from './view';

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
    useEffect(() => {
        const el = cv.current!;
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
            const s = view.get(), dpr = devicePixelRatio, W = Math.round(s.w * dpr), H = Math.round(s.h * dpr);
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

        const offs = [
            engine.on('documentChanged', setDoc),
            engine.on('imageUpdate', (r, px) => {
                if (!tex) return;
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x, r.y, r.width, r.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
                schedule();
            }),
            view.sub(schedule),
            attachPointer(engine, el),
        ];
        const ro = new ResizeObserver(() => { const r = box.current!.getBoundingClientRect(); setViewport(r.width, r.height); });
        ro.observe(box.current!);
        void engine.documentInfo().then(setDoc);
        return () => { offs.forEach(f => f()); ro.disconnect(); cancelAnimationFrame(raf); };
    }, [engine]);
    return <div class="stage" ref={box}><canvas class="view" ref={cv} aria-label="Canvas" /></div>;
}
