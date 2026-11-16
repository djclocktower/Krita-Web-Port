// Cloudflare Worker that serves the Krita web app from an R2 bucket under /krita/.
// Upload the contents of the `krita` folder to the bucket (keeping the folder structure, e.g.
// krita/index.html, krita/assets/..., krita/engine/...), bind the bucket as KRITA_BUCKET, and
// route  yoursite.example/krita/*  to this Worker. If one Worker already serves your whole site,
// copy the body of `serveKrita` into it and call it for paths that start with /krita/.
//
// The two Cross-Origin headers are required: Krita's engine uses threads, which browsers only
// allow on a "cross-origin isolated" page. They are set for /krita/ only, so the rest of the
// site (embeds, ads, login pop-ups) is unaffected.

const TYPES = {
    html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', wasm: 'application/wasm',
    json: 'application/json', svg: 'image/svg+xml', png: 'image/png',
};

async function serveKrita(request, env) {
    const url = new URL(request.url);
    let key = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (key === 'krita') return Response.redirect(url.origin + '/krita/', 301);
    if (key.endsWith('/')) key += 'index.html';
    if (!key.startsWith('krita/') || key.includes('..')) return new Response('Not found', { status: 404 });

    const object = await env.KRITA_BUCKET.get(key);
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    headers.set('Content-Type', TYPES[key.split('.').pop()] ?? 'application/octet-stream');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('ETag', object.httpEtag);
    // Hashed asset files never change; the page and the engine files are replaced on each release.
    headers.set('Cache-Control', key.startsWith('krita/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
    return new Response(object.body, { headers });
}

export default {
    fetch(request, env) {
        return serveKrita(request, env);
    },
};
