# Other browsers and the Cloudflare Worker

Written up from the browsers agent's report. Everything here was run in this container unless a
section says "not tested here". The machine was heavily loaded (load average 15–20), so timings are
pessimistic.

## Summary

- **Firefox: not run.** Ubuntu 24.04 has no `firefox-esr`, `firefox` is a snap stub (no snap in
  containers), and downloading Mozilla's builds was not permitted here. Nothing about Firefox is measured.
- **WebKitGTK 2.52.6 (a stand-in for Safari, not Safari):** does not start as shipped, because it
  hides `SharedArrayBuffer` even on a cross-origin-isolated page. With the JavaScriptCore launch
  option `JSC_useSharedArrayBuffer=true` the whole app works. A visitor cannot set that option.
- **Cloudflare Worker:** after the fixes below it serves the app locally (wrangler 4.163.0, local
  R2) and the app starts in Chromium through it. Not tested on a real account.

## Page-side changes made

- `web/src/engine/wasm.ts`: throws a readable error if `SharedArrayBuffer` is missing or WebAssembly
  SIMD does not validate.
- `web/src/main.tsx`: catches start-up failures and shows "Krita Web could not start: <reason>".
  Before, an unsupported browser showed a blank page.

## WebKitGTK

Installed from Ubuntu packages (`webkit2gtk-driver`, `libwebkit2gtk-4.1-0`, `xvfb`), driven through
`WebKitWebDriver` with the small client in `docs/browsers/tools/`.

| Check | Default | With `JSC_useSharedArrayBuffer=true` |
|---|---|---|
| `crossOriginIsolated` | true | true |
| `SharedArrayBuffer` | undefined | present |
| WebAssembly SIMD | valid | valid |
| Engine starts | no (now shows the readable message) | yes |
| Time to first document | n/a | packaged build 29–43 s; Chromium on the same machine 15–17 s |
| Paint | n/a | yes (export hash changed) |
| Toolbox icons | n/a | yes |
| Krita dialog (Scale Image) | n/a | yes |
| Export PNG, reopen, export | n/a | yes |
| Memory | n/a | about 2.4 GB resident for an empty document |

Open points:

- Two of five dev-server runs stopped at "Waiting for image operation to complete" for over two
  minutes; the packaged build started five times out of five. Cause not found; needs an idle machine.
- An autosave error seen under WebDriver is the driver's ephemeral profile refusing blobs in
  IndexedDB, not an app bug. Safari Private Browsing may behave the same way.

Screenshots: `webkitgtk-started.png`, `webkitgtk-painted.png`, `webkitgtk-dialog.png`,
`webkitgtk-default-message.png`.

## Not tested here (from documentation)

- **Safari on macOS:** cross-origin isolation and `SharedArrayBuffer` since 15.2, WebAssembly SIMD
  since 16.4. Older versions get the new "not supported" message.
- **iOS (every browser is WebKit):** memory is the main risk. A 123 MB engine, 22 MB of data and a
  heap that never shrinks, against a per-tab limit of roughly 1.5–3 GB on phones, make tab reloads
  likely on iPhones. Large iPads may work. Apple Pencil reports pressure and tilt as a pen.
- **Chrome on Android:** isolation, shared memory and SIMD are supported; low-memory phones may
  refuse the 4 GB address-space reservation. S Pen reports pressure and tilt.
- **Firefox on Android:** isolation, shared memory and SIMD are supported; pen tilt is uncertain.
- **Battery:** where the browser forbids blocking waits on the page's thread (Chrome, Firefox), the
  engine's waits there spin. Not measured.

## Cloudflare Worker (local test)

Wrangler 4.163.0, `wrangler dev --local`, a local R2 bucket, the 18 packaged files uploaded with
`deploy/upload.sh` (brotli level 9).

Verified locally:

- `/krita/` serves the page; `/krita` redirects to `/krita/` (relative asset URLs need the slash).
- Content types are right, including `application/wasm`.
- COOP, COEP and CORP are on every response (200, 206, 301, 304, 400, 404, 405) under `/krita/`,
  and on nothing outside it.
- Hashed assets are immutable for a year; `index.html` and the engine files revalidate with an ETag.
- `If-None-Match` gives 304; Range gives 206; HEAD works.
- A client that accepts brotli receives the stored compressed bytes unchanged; decoded checksums match.
- The app starts in Chromium through the Worker and paints.

Fixes made to `deploy/cloudflare-worker.js`: isolation headers on every response; conditional and
range handling; `encodeBody: 'manual'` (the runtime was compressing the already-compressed body a
second time); the fall-through no longer fetches itself in a loop; `no-cache` plus ETag for
unhashed files; missing content types, HEAD, and input checks.

| File | Raw | gzip | brotli (level 9) |
|---|---|---|---|
| `kritaengine.wasm` | 123.0 MB | 35.3 MB | 27.0 MB |
| `kritaengine.data` | 22.2 MB | 20.4 MB | 19.7 MB |
| `resourcecache.sqlite` | 12.8 MB | not measured | 12.1 MB |
| First load, total | 157.9 MB | about 68 MB | 58.8 MB |

Unknown without the real account: whether the edge passes the stored brotli body through unchanged
for every client, the effect of zone settings (minify, Rocket Loader, compression rules) on
`/krita/*`, and real R2 latency. The checklist to run against the account is at the end of
`deploy/README.md`. Engine file names are not versioned, so releases rely on ETag revalidation.
