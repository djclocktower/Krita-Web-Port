// Checks src/descriptions against the real engine's filter/generator settings (tests/data/filter-configs.json),
// then applies described minimum/maximum/choice values through the real WebAssembly engine.
// Needs a dev server: npx vite --port 5184 --strictPort        Run: node tests/filter-forms.mjs
// Refresh the data file with: node tests/filter-forms.mjs --dump
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.env.URL ?? 'http://localhost:5184/?engine=wasm';
const DATA = join(root, 'tests/data/filter-configs.json');

let failures = 0;
const fail = msg => { failures++; console.log('FAIL  ' + msg); };
const check = (ok, msg) => { if (!ok) fail(msg); };

async function boot(browser) {
    const page = await browser.newPage();
    // Errors thrown by app code (not by an engine call) are reported but do not fail the run: the app reloads whenever
    // anyone edits a source file under the dev server.
    page.on('pageerror', e => console.log('note  page error: ' + e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.__engine, null, { timeout: 120000 });
    await page.evaluate(async () => {
        const e = window.__engine;
        await e.newDocument({ width: 160, height: 120 });
        for (const [a, b] of [[10, 10, 150, 100], [150, 20, 20, 90], [80, 5, 85, 115]].map(p => [{ x: p[0], y: p[1] }, { x: p[2], y: p[3] }])) {
            e.beginStroke({ ...a, pressure: 0.9, timeMs: 0 });
            e.continueStroke([{ ...b, pressure: 1, timeMs: 30 }]);
            e.endStroke();
        }
    });
    return page;
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });

if (process.argv.includes('--dump')) {
    const page = await boot(browser);
    const out = await page.evaluate(async () => {
        const e = window.__engine, r = { filters: [], generators: [] };
        for (const f of await e.filters()) r.filters.push({ ...f, config: await e.filterConfig(f.id) });
        for (const f of await e.generators()) r.generators.push({ ...f, config: await e.generatorConfig(f.id) });
        return r;
    });
    writeFileSync(DATA, JSON.stringify(out, null, 1));
    console.log(`wrote ${DATA}: ${out.filters.length} filters, ${out.generators.length} generators`);
    await browser.close();
    process.exit(0);
}

// --- static checks: bundle the TypeScript with esbuild (a vite dependency) and import it
const esbuild = require('esbuild');
const dir = mkdtempSync(join(tmpdir(), 'desc-'));
const outFile = join(dir, 'descriptions.mjs');
esbuild.buildSync({ entryPoints: [join(root, 'src/descriptions/index.ts')], bundle: true, format: 'esm', outfile: outFile });
const { describe } = await import(pathToFileURL(outFile).href);
const { FILTERS, GENERATORS } = await import((esbuild.buildSync({ stdin: { contents: "export * from './src/descriptions/filters'; export * from './src/descriptions/generators';", resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', outfile: join(dir, 'tables.mjs') }), pathToFileURL(join(dir, 'tables.mjs')).href));

const data = JSON.parse(readFileSync(DATA, 'utf8'));
const rows = []; // coverage table
for (const [kind, list, tables] of [['filter', data.filters, FILTERS], ['generator', data.generators, GENERATORS]]) {
    const ids = new Set(list.map(f => f.id));
    for (const id of Object.keys(tables)) check(ids.has(id), `${kind} table "${id}" is not an engine ${kind} id`);
    for (const f of list) {
        const keys = new Set(f.config.specs.map(s => s.key));
        const table = tables[f.id] ?? [];
        for (const row of table) {
            check(keys.has(row.key), `${kind} ${f.id}: override key "${row.key}" is not reported by the engine`);
            check(typeof row.label === 'string' && row.label.trim() !== '', `${kind} ${f.id}.${row.key}: empty label`);
            check(!row.label.includes('&') && !/:\s*$/.test(row.label), `${kind} ${f.id}.${row.key}: label "${row.label}" has & or trailing colon`);
            check(!row.hidden || (row.min === undefined && !row.choices), `${kind} ${f.id}.${row.key}: hidden row carries a range`);
        }
        const dup = table.map(r => r.key).filter((k, i, a) => a.indexOf(k) !== i);
        check(!dup.length, `${kind} ${f.id}: duplicate rows ${dup}`);
        const d = describe(kind, f.id, f.config);
        const out = new Map(d.specs.map(s => [s.key, s]));
        const hidden = new Set(table.filter(r => r.hidden).map(r => r.key));
        const described = new Set(table.filter(r => !r.hidden).map(r => r.key));
        const pass = [...keys].filter(k => !described.has(k) && !hidden.has(k));
        for (const k of keys) check(out.has(k) === !hidden.has(k), `${kind} ${f.id}.${k}: ${hidden.has(k) ? 'hidden key still shown' : 'key lost'}`);
        check(d.specs.length === keys.size - hidden.size, `${kind} ${f.id}: spec count ${d.specs.length} != ${keys.size - hidden.size}`);
        check(JSON.stringify(d.defaults) === JSON.stringify(f.config.defaults), `${kind} ${f.id}: defaults changed`);
        for (const s of d.specs) {
            const v = d.defaults[s.key];
            if (s.min !== undefined && typeof v === 'number') check(v >= s.min, `${kind} ${f.id}.${s.key}: default ${v} < min ${s.min}`);
            if (s.max !== undefined && typeof v === 'number') check(v <= s.max, `${kind} ${f.id}.${s.key}: default ${v} > max ${s.max}`);
            if (s.min !== undefined || s.max !== undefined) check(s.kind === 'number' || s.kind === 'integer' || s.kind === 'angle', `${kind} ${f.id}.${s.key}: range on a ${s.kind}`);
            if (s.kind === 'choice') {
                check(!!s.choices?.length, `${kind} ${f.id}.${s.key}: choice without choices`);
                check(s.choices?.some(c => c.value === String(v)), `${kind} ${f.id}.${s.key}: default ${JSON.stringify(v)} is not a choice value`);
            }
            for (const c of s.choices ?? []) check(c.label.trim() !== '' && !c.label.includes('&'), `${kind} ${f.id}.${s.key}: bad choice label "${c.label}"`);
        }
        // order: described rows first, in table order, then pass-through
        const order = d.specs.map(s => s.key), want = [...table.filter(r => !r.hidden && keys.has(r.key)).map(r => r.key), ...pass];
        check(JSON.stringify(order) === JSON.stringify(want), `${kind} ${f.id}: order differs from table`);
        rows.push({ kind, id: f.id, keys: keys.size, described: described.size, hidden: hidden.size, pass: pass.length, ranges: d.specs.filter(s => s.min !== undefined).length, choices: d.specs.filter(s => s.kind === 'choice').length, applied: 0 });
    }
}
const unknown = { specs: [{ key: 'x', label: 'x', kind: 'integer' }], defaults: { x: 1 } };
check(describe('filter', 'no such filter', unknown) === unknown, 'unknown filter id is not passed through unchanged');
check(describe('generator', 'no such generator', unknown) === unknown, 'unknown generator id is not passed through unchanged');
const extra = describe('filter', 'posterize', { specs: [{ key: 'new', label: 'new', kind: 'integer' }, ...data.filters.find(f => f.id === 'posterize').config.specs], defaults: { new: 1, steps: 16 } });
check(extra.specs.map(s => s.key).join() === 'steps,new', 'a key with no override must pass through after the described ones');
console.log(`static checks done, ${failures} failure(s)`);

// --- real engine: apply every described minimum, maximum and choice value
let page = await boot(browser);
const hang = Symbol('hang');
async function applyOnce(id, cfg) {
    return page.evaluate(([id, cfg]) => Promise.race([
        (async () => {
            const e = window.__engine, node = (await e.layers())[0].id;
            try { await e.applyFilter(node, id, cfg); } catch (err) { return 'error: ' + (err?.message ?? err); }
            await e.undo();
            return 'ok';
        })(),
        new Promise(res => setTimeout(() => res('HANG'), 90000))]), [id, cfg]).catch(e => 'page failed: ' + String(e.message).split('\n')[0]);
}
for (const f of data.filters) {
    const d = describe('filter', f.id, f.config);
    const cases = [];
    for (const s of d.specs) {
        if (s.kind === 'choice') for (const c of s.choices) cases.push([s.key, typeof d.defaults[s.key] === 'number' ? Number(c.value) : c.value, 'choice ' + c.value]);
        else if (s.min !== undefined && s.max !== undefined) for (const [v, w] of [[s.min, 'min'], [s.max, 'max']]) cases.push([s.key, s.kind === 'integer' ? Math.round(v) : v, w]);
    }
    const row = rows.find(r => r.kind === 'filter' && r.id === f.id);
    for (const [key, value, what] of cases) {
        let res = await applyOnce(f.id, { ...d.defaults, [key]: value });
        if (res.startsWith('page failed')) { await page.close().catch(() => {}); page = await boot(browser); res = await applyOnce(f.id, { ...d.defaults, [key]: value }); }
        row.applied++;
        if (res !== 'ok') {
            fail(`${f.id}.${key}=${JSON.stringify(value)} (${what}): ${res}`);
            if (res === 'HANG' || res.startsWith('page failed')) { await page.close().catch(() => {}); page = await boot(browser); }
        }
    }
}

console.log('\nkind       id                         keys  descr hidden  pass ranges choices applied');
for (const r of rows) console.log(`${r.kind.padEnd(10)} ${r.id.padEnd(26)} ${String(r.keys).padStart(4)} ${String(r.described).padStart(6)} ${String(r.hidden).padStart(6)} ${String(r.pass).padStart(5)} ${String(r.ranges).padStart(6)} ${String(r.choices).padStart(7)} ${String(r.applied).padStart(7)}`);
const sum = pred => rows.filter(pred).length;
console.log(`\nno settings: ${sum(r => r.keys === 0)}, fully described: ${sum(r => r.keys && r.described + r.hidden && !r.pass)}, partial: ${sum(r => r.keys && r.described + r.hidden && r.pass)}, pass-through only: ${sum(r => r.keys && !(r.described + r.hidden))}`);
console.log(`filters exercised in engine: ${rows.filter(r => r.kind === 'filter' && r.applied).length}, apply calls: ${rows.reduce((a, r) => a + r.applied, 0)}`);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 3000))]);
process.exit(failures ? 1 : 0);
