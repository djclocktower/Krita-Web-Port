// Cloudflare Worker that serves the Krita web app from an R2 bucket under /krita/.
// See deploy/README.md for upload commands, bindings and the checklist.
//
// Bucket layout: the contents of the built `krita` folder under the key prefix `krita/`
//   krita/index.html, krita/assets/<hashed files>, krita/engine/kritaengine.{js,wasm,data,worker.js}, ...
// Binding: the bucket as KRITA_BUCKET.
//
// Every response under /krita/ (200, 206, 304, 404, redirects, the worker script) carries
// Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy, which the engine's threads need
// ("cross-origin isolation"). Paths outside /krita/ are NOT touched, so embeds, ads and login
// pop-ups elsewhere on the site keep working.
//
// Large engine files (kritaengine.wasm 123 MB, .data 22 MB) should be uploaded already Brotli-compressed
// with Content-Encoding: br (deploy/upload.sh does this). R2 returns that metadata and this Worker
// passes it on; Cloudflare's edge does not recompress a response that already has Content-Encoding.

const TYPES = {
    html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8', json: 'application/json', wasm: 'application/wasm',
    svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon',
    woff2: 'font/woff2', txt: 'text/plain; charset=utf-8', map: 'application/json',
    data: 'application/octet-stream', sqlite: 'application/octet-stream',
};

// Cross-origin isolation headers; CORP lets the isolated page's own workers and subresources load.
const ISOLATION = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
};

function reply(body, init, extra) {
    const headers = new Headers(init.headers);
    for (const [k, v] of Object.entries({ ...ISOLATION, ...extra })) headers.set(k, v);
    return new Response(body, { status: init.status, headers });
}

// Hashed build output never changes. Everything else (index.html and the engine, whose file names carry
// no hash) is revalidated with its ETag on every load: a 304 costs one tiny request, not 123 MB.
const cacheControl = key => (key.startsWith('krita/assets/') ? 'public, max-age=31536000, immutable' : 'public, no-cache');

export async function serveKrita(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return reply('Method not allowed', { status: 405 }, { Allow: 'GET, HEAD' });
    const url = new URL(request.url);
    let key;
    try { key = decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch { return reply('Bad request', { status: 400 }); }
    // /krita -> /krita/ so the page's relative URLs (./assets, ./engine) resolve inside /krita/.
    if (key === 'krita') return reply(null, { status: 301 }, { Location: url.origin + '/krita/' + url.search });
    if (key.endsWith('/')) key += 'index.html';
    if (!key.startsWith('krita/') || key.split('/').includes('..')) return reply('Not found', { status: 404 });

    // R2 evaluates If-None-Match / If-Modified-Since and Range itself when given the request headers.
    const object = request.method === 'HEAD'
        ? await env.KRITA_BUCKET.head(key)
        : await env.KRITA_BUCKET.get(key, { onlyIf: request.headers, range: request.headers });
    if (!object) return reply('Not found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);           // Content-Encoding (br), Content-Language, ... as stored
    headers.set('Content-Type', TYPES[key.split('.').pop().toLowerCase()] ?? 'application/octet-stream');
    headers.set('Cache-Control', cacheControl(key));
    headers.set('ETag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Vary', 'Accept-Encoding');

    // Compressed objects are stored as brotli (Content-Encoding: br above). No Accept-Encoding check here: Cloudflare's edge
    // normalises that header for Workers and itself decodes br for the rare visitor that does not accept it.

    if (request.method === 'HEAD') {
        headers.set('Content-Length', String(object.size));
        return reply(null, { status: 200, headers });
    }
    if (!('body' in object)) return reply(null, { status: 304, headers });   // precondition said "not modified"
    let status = 200;
    // (workerd fills in object.range even when the request had no Range header, so check the header too.)
    if (request.headers.has('Range') && object.range) {
        const { suffix, offset = Math.max(0, object.size - (suffix ?? 0)), length = object.size - offset } = object.range;
        headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
        status = 206;
    }
    return reply(object.body, { status, headers });
}

// Standalone use. To mount inside an existing Worker, `import { serveKrita } from './cloudflare-worker.js'`
// (or paste the function) and call it first for /krita and /krita/*; see deploy/README.md.
export default {
    fetch(request, env) {
        const { pathname } = new URL(request.url);
        if (pathname === '/krita' || pathname.startsWith('/krita/')) return serveKrita(request, env);
        // The rest of the site: static-assets binding if there is one, otherwise the zone's origin server.
        return env.ASSETS ? env.ASSETS.fetch(request) : fetch(request);
    },
};
