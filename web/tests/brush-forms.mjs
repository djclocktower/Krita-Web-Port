// Brush editor checks. Static part: descriptions against tests/data/brush-configs.json (what the real engine reported).
// Engine part: real engine (needs the dev server: URL=http://localhost:5182 node tests/brush-forms.mjs).
// FULL=1 sweeps every choice of long lists (blending modes); by default lists over 16 entries are sampled (8 values).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { buildSync } = require('esbuild');
const URL = process.env.URL ?? 'http://localhost:5182';
const dump = JSON.parse(readFileSync(new URL_('./data/brush-configs.json'), 'utf8')).engines;
function URL_(p) { return new globalThis.URL(p, import.meta.url); }
const problems = [];
const fail = m => { problems.push(m); console.log('FAIL', m); };
const ok = m => console.log('ok  ', m);

// ---- static checks
const bundle = (entry, name) => { const out = `${tmpdir()}/${name}-${process.pid}.mjs`; buildSync({ entryPoints: [new globalThis.URL(entry, import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'error' }); return import(out); };
const desc = await bundle('../src/descriptions/index.ts', 'desc');
const tipMod = await bundle('../src/panels/brushEditor/tip.ts', 'tip');
const sensorMod = await bundle('../src/panels/brushEditor/sensors.ts', 'sensors');
const { BRUSHES, describe } = desc;
const anyEngine = new Set(Object.values(dump).flatMap(e => Object.keys(e.keys)));
console.log('engine'.padEnd(16), 'described hidden passed-through  (rows whose key this engine\'s presets lack)');
for (const [eng, table] of Object.entries(BRUSHES)) {
    const keys = dump[eng]?.keys;
    if (!keys) { fail(`${eng}: no such engine in the dump`); continue; }
    let described = 0, hidden = 0, absent = 0;
    const rowKeys = new Set(table.map(r => r.key));
    for (const row of table) {
        // Typo guard: the key must exist for this engine, or at least for another engine (shared option rows).
        if (!anyEngine.has(row.key)) { fail(`${eng}: key ${row.key} exists in no preset of the dump`); continue; }
        if (!row.label.trim()) fail(`${eng}: empty label for ${row.key}`);
        if (!(row.key in keys)) { absent++; continue; }
        if (row.hidden) { hidden++; continue; }
        described++;
        for (const v of keys[row.key].values) {
            if (row.choices) {
                const vals = row.choices.map((c, i) => typeof c === 'string' ? String(i) : c[0]);
                if (!vals.includes(String(v))) fail(`${eng}: ${row.key} = ${v} is not among the choices`);
            } else if (row.min !== undefined || row.max !== undefined) {
                const n = Number(v);
                if (!(n >= (row.min ?? -Infinity) && n <= (row.max ?? Infinity))) fail(`${eng}: ${row.key} = ${v} outside ${row.min}..${row.max}`);
            }
            if (row.kind === 'boolean' && v !== 'true' && v !== 'false') fail(`${eng}: ${row.key} = ${v} is not a boolean`);
        }
    }
    const passed = Object.keys(keys).filter(k => !rowKeys.has(k)).length;
    console.log(eng.padEnd(16), String(described).padStart(5), String(hidden).padStart(6), String(passed).padStart(9), `        (${absent})`);
    // describe() on a fake engine description made of the dump keys: nothing may be lost, passed-through keys land in "Other".
    const specs = Object.keys(keys).map(key => ({ key, label: key, kind: 'string' }));
    const out = describe('brush', eng, { specs, defaults: {} }).specs;
    if (out.length > specs.length) fail(`${eng}: describe() invented specs`);
    if (out.some(s => !s.label)) fail(`${eng}: describe() produced an empty label`);
    if (describe('brush', eng, { specs, defaults: {} }).specs.filter(s => s.group === 'Other').length !== passed) fail(`${eng}: passed-through count mismatch`);
}
// Tip XML: every attribute value in the dump lies within the described range.
for (const [eng, e] of Object.entries(dump)) for (const key of ['brush_definition', 'MaskingBrush/Preset/brush_definition']) for (const xml of e.keys[key]?.values ?? []) {
    for (const f of tipMod.fieldsFor(xml)) {
        const v = tipMod.readField(xml, f);
        if (f.kind === 'choice' && !f.choices.some(c => c[0] === v)) fail(`${eng}: tip ${f.attr} = ${v} not among choices`);
        if (f.kind === 'number' || f.kind === 'integer') {
            if (typeof v !== 'number') fail(`${eng}: tip ${f.attr} is not a number`);
            else if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) fail(`${eng}: tip ${f.attr} = ${v} outside ${f.min}..${f.max}`);
        }
        const back = tipMod.writeField(xml, f, v);
        if (back === null || tipMod.readField(back, f) !== v) fail(`${eng}: tip ${f.attr} does not round-trip`);
    }
}
// Sensor XML round trip on every sensor value of the dump.
for (const [eng, e] of Object.entries(dump)) for (const [k, v] of Object.entries(e.keys)) if (/Sensor$/.test(k)) for (const xml of v.values) {
    const info = sensorMod.parseSensor(xml);
    if (info.curve !== null) {
        const again = sensorMod.parseSensor(sensorMod.withCurve(xml, '0,0;0.5,0.7;1,1;'));
        if (again.curve !== '0,0;0.5,0.7;1,1;' || again.names.join() !== info.names.join()) fail(`${eng}: ${k} curve rewrite not stable: ${xml}`);
    } else if (sensorMod.withCurve(xml, '0,0;1,1;') !== null && info.names.length > 1) fail(`${eng}: ${k} sensor list must not be rewritten`);
}
ok('static checks done');

// ---- real engine
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const bootLog = [];
async function boot() {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', e => bootLog.push('PAGEERROR ' + e.message));
    await page.goto(`${URL}/?engine=wasm`);
    await page.waitForFunction(() => window.__engine, null, { timeout: 150000 });
    await page.waitForFunction(() => window.__engine.documentInfo(), null, { timeout: 150000 });
    await page.evaluate(() => __engine.newDocument({ width: 600, height: 300, background: { r: 1, g: 1, b: 1, a: 1 } }));
    return page;
}
const inPage = (page, src, arg) => page.evaluate(`(async()=>{const f=${src};return await Promise.race([f(${JSON.stringify(arg ?? null)}),new Promise(r=>setTimeout(()=>r({timeout:true}),30000))]);})()`);
const HELPERS = `const hash=async()=>{const b=await __engine.exportDocument('png');let h=0;for(const x of b)h=(h*31+x)|0;return h};
const stroke=async()=>{__engine.beginStroke({x:50,y:100,pressure:0.3,timeMs:0});__engine.continueStroke([{x:200,y:150,pressure:0.6,timeMs:30},{x:350,y:120,pressure:1,timeMs:60},{x:550,y:200,pressure:0.5,timeMs:90}]);__engine.endStroke();const h=await hash();await __engine.undo();return h};`;
const run = (page, body, arg) => inPage(page, `async(arg)=>{${HELPERS}${body}}`, arg);
let page = await boot();
const select = (name) => run(page, `const p=(await __engine.presets()).find(x=>x.name===arg);await __engine.selectPreset(p.id);return (await __engine.presetSettings()).values;`, name);
const set = (key, value) => run(page, `await __engine.setPresetSetting(arg[0],arg[1]);return await stroke();`, [key, value]);

// Effects: paint the same stroke before and after one edit.
const effects = [];
const effect = async (name, edits, expectChange = true) => {
    await select('b) Basic-5 Size');
    const before = await run(page, 'return await stroke();');
    let after;
    for (const [k, v] of edits) after = await set(k, v);
    const changed = before !== after;
    effects.push([name, changed]);
    if (typeof after === 'object') fail(`effect ${name}: ${JSON.stringify(after)}`);
    else if (expectChange && !changed) fail(`effect ${name}: setting stored but the stroke did not change`);
    else console.log(changed ? 'ok   ' : 'NOTE ', `effect ${name}: stroke ${changed ? 'changed' : 'unchanged'}`);
};
const tipXml = (await select('b) Basic-5 Size')).brush_definition;
const tipEdit = (attr, v, xml = tipXml) => { const f = tipMod.TIP_FIELDS.find(x => x.attr === attr); return tipMod.writeField(xml, f, v); };
await effect('brush tip diameter 40 -> 12 (brush_definition)', [['brush_definition', tipEdit('diameter', 12)]]);
await effect('brush tip spacing 0.1 -> 1.5 (auto spacing off)', [['brush_definition', tipEdit('spacing', 1.5, tipEdit('useAutoSpacing', false))]]);
await effect('flow strength 1 -> 0.3 (FlowValue)', [['FlowValue', 0.3]]);
await effect('opacity strength 1 -> 0.3 (OpacityValue)', [['OpacityValue', 0.3]], false);
await effect('spacing option on, strength 0.3 (PressureSpacing + SpacingValue)', [['PressureSpacing', true], ['SpacingValue', 0.3]]);
await effect('sensor enable flag (PressureSize off)', [['PressureSize', false]]);
await effect('pressure curve rewritten inside SizeSensor XML', [['SizeSensor', sensorMod.withCurve(tipXml.includes('x') ? (await select('b) Basic-5 Size')).SizeSensor : '', '0,1;1,0;')]]);
// Does selecting the preset again pick up the opacity edit (toolbar opacity)?
const opacityState = await run(page, `await __engine.setPresetSetting('OpacityValue',0.3);const p=(await __engine.presets()).find(x=>x.name==='b) Basic-5 Size');await __engine.selectPreset(p.id);return {value:(await __engine.presetSettings()).values.OpacityValue,toolbar:(await __engine.brushState()).opacity};`);
console.log('NOTE  OpacityValue after re-selecting the preset:', JSON.stringify(opacityState));

// UI on the real engine: option list, search, enable checkbox reaches the engine.
await run(page, `const p=(await __engine.presets()).find(x=>x.name==='b) Basic-5 Size');await __engine.selectPreset(p.id);return 1;`);
await page.getByRole('tab', { name: 'Brush Editor' }).click();
await page.waitForSelector('.brush-editor .be-group', { timeout: 30000 });
const groups = await page.locator('.be-group').allInnerTexts();
assert.ok(groups.slice(0, 6).join() === 'Brush Tip,Blending Mode,Opacity,Flow,Size,Ratio', groups.join());
ok('editor lists the paintbrush options in Krita order');
await page.locator('.be-group-row', { hasText: /^Size$/ }).locator('.be-enable').uncheck();
await page.waitForTimeout(400);
const flag = await run(page, `return (await __engine.presetSettings()).values.PressureSize;`);
if (flag !== 'false') fail(`enable checkbox did not reach the engine: ${flag}`); else ok('Size enable checkbox writes PressureSize');
await page.getByLabel('Search settings').fill('share curve');
assert.ok((await page.locator('.brush-editor .pf-row').count()) > 3);
ok('search filters settings by label');
await page.getByLabel('Search settings').fill('');

// Sweep: every described ranged setting at min and max, every choice, on the first preset of each engine; paint after each.
const sweepFailures = [];
const FULL = process.env.FULL === '1';
const t0 = Date.now(), budget = Number(process.env.BUDGET_MS ?? 25 * 60000);
let sweeps = 0;
for (const [eng, table] of Object.entries(BRUSHES)) {
    const presetName = dump[eng].presets[0];
    const rows = table.filter(r => !r.hidden && r.key in dump[eng].keys && (r.choices || r.min !== undefined || r.max !== undefined));
    const tryRow = async (row, value) => {
        if (Date.now() - t0 > budget) return;
        sweeps++;
        let res;
        try { res = await run(page, `await __engine.selectPreset((await __engine.presets()).find(x=>x.name===arg[0]).id);await __engine.setPresetSetting(arg[1],arg[2]);const h=await stroke();return {h};`, [presetName, row.key, value]); }
        catch (e) { res = { error: String(e.message).split('\n')[0] }; }
        if (!res || res.error || res.timeout) {
            sweepFailures.push(`${eng} ${row.key}=${value}: ${res?.error ?? (res?.timeout ? 'did not return in 30 s' : 'no result')}`);
            await page.close().catch(() => {}); page = await boot();
        }
    };
    for (const row of rows) {
        let values;
        if (row.choices) {
            const all = row.choices.map((c, i) => typeof c === 'string' ? String(i) : c[0]);
            values = FULL || all.length <= 16 ? all : all.filter((_, i) => i % Math.ceil(all.length / 8) === 0 || i === all.length - 1);
        } else values = [row.min, row.max].filter(v => v !== undefined);
        for (const v of values) await tryRow(row, v);
    }
    console.log(`swept ${eng}: ${rows.length} settings`);
}
for (const f of sweepFailures) fail('sweep ' + f);
console.log(`sweep: ${sweeps} edits painted, ${sweepFailures.length} failures`);
await browser.close();
console.log('\neffects:', effects.map(e => `${e[0]}: ${e[1] ? 'changes stroke' : 'NO EFFECT'}`).join('\n         '));
if (bootLog.length) console.log('page errors:', bootLog.slice(0, 5));
if (problems.length) { console.error(`\n${problems.length} problem(s)`); process.exit(1); }
console.log('\nall brush-forms checks passed');
