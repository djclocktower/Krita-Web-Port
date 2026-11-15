// Static file server that sends the cross-origin isolation headers WebAssembly threads need.
// Usage: node engine/serve.mjs <directory> [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 8080);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
                '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

createServer(async (req, res) => {
    const path = join(root, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
        const body = await readFile(path.endsWith('/') ? path + 'index.html' : path);
        res.writeHead(200, {
            'Content-Type': types[extname(path)] ?? 'application/octet-stream',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        }).end(body);
    } catch {
        res.writeHead(404).end('not found');
    }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
