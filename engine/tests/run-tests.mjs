// Runs Krita unit-test executables (built with KritaWebTests.cmake) in headless Chromium, one page each.
// Usage: node engine/tests/run-tests.mjs <build dir> <out dir> [--timeout S] [--jobs N] [--args "-o -,txt"] Test1 Test2 ...
// Test names are target names; the executable is <build dir>/bin/<name>.js (falls back to a search of the build dir).
// Writes <out>/logs/<name>.log (trimmed to head+tail beyond 200 lines), <out>/results.json, and prints a summary.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = { timeout: 300, jobs: 1, args: '' };
const pos = [];
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--timeout') opt.timeout = Number(argv[++i]);
    else if (argv[i] === '--jobs') opt.jobs = Number(argv[++i]);
    else if (argv[i] === '--args') opt.args = argv[++i];
    else pos.push(argv[i]);
}
const [build, out, ...names] = pos;
mkdirSync(join(out, 'logs'), { recursive: true });

const find = (dir, file) => {                 // locate <file> anywhere under dir (bin/ first)
    if (existsSync(join(dir, 'bin', file))) return join(dir, 'bin', file);
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'CMakeFiles') continue;
        const p = join(dir, e.name);
        if (e.isFile() && e.name === file) return p;
        if (e.isDirectory()) { const r = find(p, file); if (r) return r; }
    }
};

// one static server for the whole build tree, with the cross-origin isolation headers threads need
const PORT = 8800 + Math.floor(Math.random() * 100);
const server = spawn('node', [fileURLToPath(new URL('../serve.mjs', import.meta.url)), build, String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const browser = await chromium.launch({ args: ['--enable-features=SharedArrayBuffer', '--disable-dev-shm-usage'] });

const HTML = (script, args) => `<!doctype html><meta charset=utf-8><body><script>
window.__exit = null;
var Module = { arguments: ${JSON.stringify(args)},
  print: t => console.log(t), printErr: t => console.log(t),
  onExit: c => { window.__exit = c; }, onAbort: w => { window.__abort = String(w); } };
</script><script src="${script}"></script>`;

const results = [];
async function runOne(name) {
    const r = { name, built: false, ran: false, exit: null, passed: 0, failed: 0, skipped: 0, xfail: 0, xpass: 0, functions: [], failures: [], status: '', wallMs: 0 };
    const file = find(build, name + '.js');
    const log = [];
    if (!file) { r.status = 'not built'; results.push(r); return; }
    r.built = true;
    const rel = file.slice(build.length).replace(/^\/+/, '');
    const base = `http://localhost:${PORT}/${dirname(rel)}/__run_${name}.html`;   // same folder as the .js: it fetches .data and .wasm relative to the page
    const page = await browser.newPage();
    page.on('console', m => log.push(m.text()));
    page.on('pageerror', e => log.push('PAGEERROR ' + e.message));
    await page.route(base, route => route.fulfill({
        status: 200, contentType: 'text/html', body: HTML('/' + rel, opt.args.split(' ').filter(Boolean)),
        headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } }));
    const t0 = Date.now();
    try {
        await page.goto(base);
        // done = the runtime exited, aborted, or QTest printed its closing line (some tests leave timers running and never exit)
        let finishedAt = 0;
        for (;;) {
            if (Date.now() - t0 > opt.timeout * 1000) throw new Error('Timeout');
            const st = await page.evaluate(() => ({ exit: window.__exit, abort: window.__abort || null }));
            if (st.exit !== null || st.abort) { r.exit = st.exit; r.abort = st.abort; break; }
            if (log.some(l => /^\*{9} Finished testing/.test(l))) { finishedAt ||= Date.now(); if (Date.now() - finishedAt > 5000) break; }
            await new Promise(res => setTimeout(res, 250));
        }
        r.ran = true;
        r.status = r.abort ? 'crashed (abort: ' + String(r.abort).slice(0, 120) + ')' : (r.exit === null ? 'completed (runtime did not exit)' : 'completed');
        await new Promise(res => setTimeout(res, 300));   // let late console messages arrive
    } catch (e) {
        r.status = /Timeout/.test(e.message) ? `timeout (${opt.timeout}s)` : 'error: ' + e.message.slice(0, 120);
        r.ran = log.some(l => /^(Start testing|\*{9}|PASS|FAIL)/.test(l));
    }
    r.wallMs = Date.now() - t0;
    await Promise.race([page.close(), new Promise(res => setTimeout(res, 5000))]);
    // parse QTest text output
    let cur = null;
    for (const l of log) {
        let m = l.match(/^(PASS|FAIL!|XFAIL|XPASS|SKIP|BPASS|BFAIL|BXPASS|BXFAIL)\s*:\s*([\w:<>~]+)\(([^)]*)\)\s*(.*)$/);
        if (m) {
            const [, kind, fn, tag, rest] = m;
            const id = fn + (tag ? `(${tag})` : '');
            cur = { kind, fn: id, msg: rest };
            r.functions.push(cur);
            if (kind === 'PASS') r.passed++;
            else if (kind === 'FAIL!') { r.failed++; r.failures.push(cur); }
            else if (kind === 'SKIP') { r.skipped++; r.failures.push(cur); }
            else if (kind === 'XFAIL') r.xfail++;
            else if (kind === 'XPASS') { r.xpass++; r.failures.push(cur); }
            continue;
        }
        if (cur && /^\s+\S/.test(l) && cur.kind !== 'PASS') cur.msg += '\n' + l.trim();
        else if (!/^\s/.test(l)) cur = null;
        const t = l.match(/^Totals: (\d+) passed, (\d+) failed, (\d+) skipped, (\d+) blacklisted/);
        if (t) r.totals = { passed: +t[1], failed: +t[2], skipped: +t[3] };
    }
    // QTest runs each function once without data tags: count unique function names for per-function figures
    const byFn = new Map();       // a function is FAIL if any of its data rows failed, else SKIP if any skipped, else PASS
    for (const f of r.functions) {
        const k = f.fn.replace(/\(.*$/, ''); const cur = byFn.get(k) ?? 'PASS';
        const rank = { 'PASS': 0, 'XFAIL': 0, 'SKIP': 1, 'XPASS': 1, 'FAIL!': 2 };
        byFn.set(k, (rank[f.kind] ?? 0) > (rank[cur] ?? 0) ? f.kind : cur);
    }
    r.fnPass = [...byFn.values()].filter(k => k === 'PASS' || k === 'XFAIL').length;
    r.fnFail = [...byFn.values()].filter(k => k === 'FAIL!').length;
    r.fnSkip = [...byFn.values()].filter(k => k === 'SKIP' || k === 'XPASS').length;
    if (r.ran && !r.totals && r.status.startsWith('completed')) r.status = 'exited without QTest totals';
    let text = log;
    if (text.length > 200) text = [...log.slice(0, 100), `... [${log.length - 200} lines trimmed] ...`, ...log.slice(-100)];
    writeFileSync(join(out, 'logs', name + '.log'), text.join('\n') + `\n--- exit=${r.exit} status=${r.status} wall=${r.wallMs}ms\n`);
    results.push(r);
    console.log(`${name.padEnd(34)} ${r.status.padEnd(14)} exit=${r.exit} rows pass/fail/skip=${r.passed}/${r.failed}/${r.skipped} functions=${r.fnPass}/${r.fnFail}/${r.fnSkip} ${(r.wallMs / 1000).toFixed(1)}s`);
}

const queue = [...names];
const t0 = Date.now();
await Promise.all(Array.from({ length: opt.jobs }, async () => { while (queue.length) await runOne(queue.shift()); }));
results.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(out, 'results.json'), JSON.stringify({ totalWallS: (Date.now() - t0) / 1000, results }, null, 1));
const sum = k => results.reduce((a, r) => a + (r[k] ?? 0), 0);
console.log(`TOTAL ${results.length} executables, built ${results.filter(r => r.built).length}, ran ${results.filter(r => r.ran).length}; QTest rows pass/fail/skip=${sum('passed')}/${sum('failed')}/${sum('skipped')}, functions=${sum('fnPass')}/${sum('fnFail')}/${sum('fnSkip')}; ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
server.kill();
process.exit(0);
