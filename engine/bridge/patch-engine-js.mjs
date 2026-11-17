// Run on kritaengine.js after linking: node engine/bridge/patch-engine-js.mjs <path/to/kritaengine.js>
// Every C++ call inside a try block goes through a JS "invoke_" trampoline that looks the function up in the
// wasm table. Emscripten caches those lookups, except in threaded builds, where it calls wasmTable.get every
// time: measured 35-55% of a whole-canvas fill. This engine never adds to or changes its table (no addFunction,
// no dynamic linking), so each thread can keep its own cache. Fails loudly if Emscripten changes the code.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const before = 'var getWasmTableEntry=funcPtr=>wasmTable.get(funcPtr);';
const after = 'var wasmTableMirror;var getWasmTableEntry=funcPtr=>{var m=wasmTableMirror||(wasmTableMirror=new Array(wasmTable.length).fill(null));return m[funcPtr]||(m[funcPtr]=wasmTable.get(funcPtr))};';
let s = readFileSync(file, 'utf8');
if (s.includes(after)) process.exit(0);   // already patched
if (s.split(before).length !== 2) throw new Error(`${file}: Emscripten's getWasmTableEntry changed; update this patch`);
if (/wasmTable\.(set|grow)\b|addFunction/.test(s)) throw new Error(`${file}: the engine now changes its wasm table; the cache would go stale`);
writeFileSync(file, s.replace(before, after));
