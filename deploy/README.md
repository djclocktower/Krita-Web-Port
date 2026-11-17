# Deploying the Krita web app on Cloudflare (R2 + Worker)

`cloudflare-worker.js` serves `/krita/*` from an R2 bucket with the headers the engine needs.
`upload.sh` puts a built `krita` folder into the bucket. Everything below marked **[local]** was run here against
wrangler 4.163.0's local R2 (see `docs/browsers/REPORT.md`); everything marked **[real account]** was not and is in the checklist at the end.

## What the Worker does

- `/krita` redirects (301) to `/krita/` (needed: the page uses relative URLs); `/krita/` serves `krita/index.html`.
- Every response under `/krita/` (200, 206, 304, 404, 400, 405, redirect, worker scripts) has
  `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin`.
  Paths outside `/krita/` get none of them.
- Content types by extension (`.wasm` is `application/wasm`; `.data` and `.sqlite` are `application/octet-stream`).
- Caching: `krita/assets/*` (hashed by Vite) is `public, max-age=31536000, immutable`. `index.html` and `engine/*`
  (names carry no hash) are `public, no-cache`: the browser keeps them but asks every time, and R2's ETag answers `304` (about 300 bytes) unless the file changed.
- `If-None-Match` / `If-Modified-Since` and `Range` are evaluated by R2 itself; `HEAD` is answered from object metadata.
- Compressed objects: R2 returns the stored `Content-Encoding` (`br`); the Worker passes it on with `encodeBody: 'manual'`
  (without that the runtime compresses the bytes a second time; found while testing).
- Anything else under `/krita/` that is not in the bucket: 404 with the isolation headers.

## Bindings

| Binding | Type | Notes |
|---|---|---|
| `KRITA_BUCKET` | R2 bucket | objects keyed `krita/index.html`, `krita/assets/...`, `krita/engine/...` |
| `ASSETS` (optional) | static assets | only used for paths outside `/krita/` |

`wrangler.toml` for a stand-alone Worker:

```toml
name = "krita-site"
main = "cloudflare-worker.js"
compatibility_date = "2025-01-01"
[[r2_buckets]]
binding = "KRITA_BUCKET"
bucket_name = "krita-site"          # your bucket
# route:  yoursite.example/krita/*   (dashboard: Workers > krita-site > Settings > Domains & Routes)
```

### Mounting inside the Worker that already serves the site

The existing Worker keeps its own `fetch`; add the bucket binding `KRITA_BUCKET` to it and call `serveKrita` first:

```js
import { serveKrita } from './cloudflare-worker.js';       // copy the file next to your Worker (it has no other imports)

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/krita' || pathname.startsWith('/krita/')) return serveKrita(request, env);
    return yourExistingHandler(request, env, ctx);          // untouched: no isolation headers outside /krita/
  },
};
```

If your Worker is a single file with no imports, paste the `TYPES`, `ISOLATION`, `reply`, `cacheControl` and `serveKrita`
definitions into it (drop the `export` keywords). If a Cloudflare *Transform Rule* or another middleware in your Worker already sets
`Cross-Origin-*` headers site-wide, restrict it to `/krita/*`: COEP `require-corp` on the whole site breaks third-party embeds and ads that do not send CORP headers.

The stand-alone `export default` falls back to `env.ASSETS.fetch(request)` if you bind static assets, else `404`. It does not call
`fetch(request)` any more: on a Worker without an origin that calls the Worker itself (observed locally: it exhausted the runtime's file descriptors).

## Upload

```sh
npx wrangler login                                   # once
npx wrangler r2 bucket create krita-site             # once
deploy/upload.sh /opt/kw/site krita-site --remote    # site dir must contain krita/ ; ~5-10 minutes with BR_QUALITY=11
npx wrangler deploy                                  # the Worker
```

`upload.sh` walks the folder, uploads each file with its content type, Brotli-compresses every file of 1 MB or more
(`kritaengine.wasm`, `kritaengine.data`, `resource-cache/resourcecache.sqlite`) and stores them with `Content-Encoding: br`, and uploads `index.html` last.
`BR_QUALITY=9` is faster and about 1 percent larger. **Always pass `--remote`** (or `--local`): wrangler 4 has both flags and
the default has changed between versions. `wrangler r2 object put` is limited to 300 MiB per object; the compressed files are far below it.
Test locally first: `deploy/upload.sh /opt/kw/site krita-test --local` then `npx wrangler dev --local` **[local]**.

rclone (not tested, needs an R2 remote) can do the same: `rclone copy` the small files, then `rclone copyto` each Brotli-compressed large file with
`--header-upload "Content-Encoding: br" --header-upload "Content-Type: application/wasm"`. `upload.sh` is the tested path.

## Releases and versioning

The engine files have fixed names, so releases rely on revalidation: a visitor with an old copy sends `If-None-Match`, gets `304` if unchanged
and the full new file otherwise. Do not make them `immutable`. To avoid a visitor seeing a new `index.html` with old engine files
(or the reverse) while an upload is running, `upload.sh` uploads `index.html` last; the engine files themselves are upgraded
as a set within a few seconds, and a page load that straddles the upload fails and works on reload.
If you want a clean cut-over or rollbacks: upload each release to its own prefix (`krita-2026-11-17/...`), then change one line in the Worker
(`const PREFIX = 'krita-2026-11-17/'` mapping `/krita/x` to `PREFIX + 'x'`) and deploy. The engine's own files could then also be `immutable`,
but that needs a page-side change (hash in the engine folder name in `web/src/engine/wasm.ts` and the Vite build), which has not been done.

## Compression, sizes and limits

Measured here (`kritaengine.wasm`, `.data`, `resourcecache.sqlite`; brotli window 16 MB, quality 9; gzip level 9):

| File | Raw | gzip -9 | brotli -9 |
|---|---|---|---|
| kritaengine.wasm | 122,986,082 | 35,290,225 | 27,021,478 |
| kritaengine.data | 22,173,456 | 20,430,440 | 19,693,263 |
| resourcecache.sqlite | 12,779,520 | n/a | 12,088,165 |
| total first load | 157.9 MB | about 68 MB | 58.8 MB |

(Quality 11 was not run on the 123 MB file; expect roughly 3 to 8 percent smaller than quality 9 and many minutes. The `.data` and `.sqlite` files are already compressed inside, so they gain little.)

What will happen on Cloudflare, from Cloudflare's documentation (read 2026-11-17; **not verified on a real account**):

- Edge compression covers `application/wasm` and text types (HTML, CSS, JS, JSON, SVG) but **not** `application/octet-stream`, so `.data` and `.sqlite` would be sent raw (42 MB with no help from the edge).
  A response that already carries `Content-Encoding: br` is kept as it is for visitors who accept it, and decoded for those who do not.
  Documents describe no size cut-off for edge compression, but also say nothing about Workers; whether a 123 MB `.wasm` served raw would be compressed on the fly, and how fast, is unknown. Precompressing makes the result independent of that.
- Free plan visitors are offered Zstandard by default, Pro/Business Brotli: stored `br` objects are passed unchanged to any visitor that accepts `br`.
- Workers: no response body size limit (the body streams from R2); no limit on streaming an R2 object; CPU time is not spent while streaming. Free plan: 10 ms CPU per request, 100,000 requests/day, 50 subrequests;
  a page load costs about 28 requests (assets, engine files, and the thread workers re-fetching `kritaengine.js` and `kritaengine.worker.js`), so the free plan allows roughly 3,500 loads a day (304 revalidations count as requests too). Paid plan has no daily limit.
- The CDN/Cache API refuses files over 512 MB (Free/Pro/Business); the raw wasm (123 MB) would fit. The Worker does not use the Cache API: every request reads R2 (fast, same network). Add `caches.default` only if R2 read latency matters.
- R2: egress is free; storage $0.015/GB-month (about 0.06 GB stored here, inside the 10 GB free tier); Class B reads $0.36 per million (28 per page load), the free tier is 10 million a month.
- Without precompression the browser would download up to about 123 MB of wasm if the edge did not compress it; with it, about 27 MB.

Range requests on a `br` object address the compressed bytes. Browsers do not range-request these files; `curl -r` shows compressed offsets.
An out-of-range `Range` (start beyond the end) returns the whole object with `206` locally instead of `416`.

## Checklist for the real account (not run here)

1. Run the upload against the real bucket (`--remote`), then list it: `npx wrangler r2 object get krita-site/krita/index.html --remote --file -` must print the page. Confirm all 18 files arrived (a `.wasm` of 27 MB, not 123 MB, is expected in the bucket).
2. `curl -sI https://yoursite.example/krita/` and `/krita`: `200` with `cross-origin-opener-policy: same-origin`, `cross-origin-embedder-policy: require-corp`; `/krita` answers `301` to `/krita/`.
3. For each of `index.html`, `assets/*.js`, `engine/kritaengine.{js,worker.js,wasm,data}`: right `content-type` (`application/wasm` for the wasm), and the headers above also on a made-up path `/krita/nope` (404).
4. `curl -s -o /dev/null -w '%{size_download}\n' -H 'Accept-Encoding: br' .../kritaengine.wasm` is about 27 MB (not 123 MB and not a double-encoded body); with `Accept-Encoding: gzip` and with none it still decodes to the 122,986,082-byte original (`curl --compressed ... | wc -c`).
   `.data`: about 19.7 MB with `br`. If a Cloudflare Compression Rule, Polish, Rocket Loader, Email Obfuscation or Auto Minify is active for the zone, exclude `/krita/*` (they force decode and recompress; Auto Minify/Rocket Loader would also alter the JS).
5. `curl -I -H 'If-None-Match: <etag from a previous response>'` returns `304`; `curl -r 0-99 .../kritaengine.wasm -H 'Accept-Encoding: br'` returns `206` with `content-range`.
6. Cache headers: `assets/` immutable, others `no-cache`; reload twice in Chrome DevTools Network (disable cache off): second load shows `304` for the engine files, no 27 MB transfer.
7. Open the site in Chrome, Firefox and Safari: the status bar shows the document size and `RGBA U8`; `crossOriginIsolated` is `true` in the console.
8. Check an embed/ads/login pop-up elsewhere on the site still works (they must not receive COEP). Check `/` response has no `cross-origin-embedder-policy`.
9. Check the Workers dashboard (Metrics) for errors and CPU time after a few loads; make sure the zone's Free-plan request count is not exhausted.
10. Decide whether the bucket should be reachable directly (do not enable the public `r2.dev` URL: it has no isolation headers).
