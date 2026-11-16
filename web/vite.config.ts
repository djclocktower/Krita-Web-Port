import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// WebAssembly threads need a cross-origin isolated page, in dev as in production.
const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

export default defineConfig({
    plugins: [preact()],
    base: './',   // relative paths, so the built app works from any folder on a site
    build: { target: 'es2022' },   // every browser with WebAssembly threads has this
    server: { headers: isolation },
    preview: { headers: isolation },
});
