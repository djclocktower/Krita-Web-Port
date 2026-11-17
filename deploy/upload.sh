#!/usr/bin/env bash
# Upload the built Krita web app to an R2 bucket under the key prefix `krita/`.
#   deploy/upload.sh <site-dir containing krita/> <bucket> [extra wrangler args, e.g. --local --persist-to DIR]
# Files of 1 MB or more (kritaengine.wasm, kritaengine.data, resourcecache.sqlite) are Brotli-compressed first and
# stored with Content-Encoding: br, which cloudflare-worker.js passes through. BR_QUALITY=11 (default) is slow
# on the 123 MB wasm (several minutes); use BR_QUALITY=9 for a quick try.
# Uploads index.html last, so a visitor never gets a new page pointing at engine files that are not there yet.
set -euo pipefail
site=$(cd "${1:?site dir}" && pwd); bucket=${2:?bucket}; shift 2
q=${BR_QUALITY:-11}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export WRANGLER_LOG=error
wr() { ${WRANGLER:-npx --yes wrangler@4} "$@"; }   # WRANGLER=path overrides the binary

type_of() {
  case "${1##*.}" in
    html) echo 'text/html; charset=utf-8';; js|mjs) echo 'text/javascript; charset=utf-8';; css) echo 'text/css; charset=utf-8';;
    json|map) echo application/json;; wasm) echo application/wasm;; svg) echo image/svg+xml;; png) echo image/png;;
    *) echo application/octet-stream;;
  esac
}
put() { # put <key> <file> <encoding|''>
  local args=(r2 object put "$bucket/$1" --file "$2" --content-type "$(type_of "$1")")
  [ -n "$3" ] && args+=(--content-encoding "$3")
  wr "${args[@]}" "${@:4}" >/dev/null && echo "put $1 ${3:+($3)}"
}
cd "$site"
find krita -type f ! -name index.html -print0 | sort -z | while IFS= read -r -d '' f; do
  if [ "$(stat -c %s "$f")" -ge 1048576 ]; then
    node -e 'const z=require("zlib"),fs=require("fs");const[i,o,q]=process.argv.slice(1);
      fs.writeFileSync(o,z.brotliCompressSync(fs.readFileSync(i),{params:{[z.constants.BROTLI_PARAM_QUALITY]:+q,[z.constants.BROTLI_PARAM_LGWIN]:24}}))' "$f" "$tmp/c" "$q"
    put "$f" "$tmp/c" br "$@"
  else
    put "$f" "$f" '' "$@"
  fi
done
put krita/index.html krita/index.html '' "$@"
