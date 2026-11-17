// CPU-profile the engine's workers (needs an engine built with function names) over a scenario.
// usage: node prof.mjs <phase: startup|scenario> "<async (sleep)=>...>" [topN]
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/user/Krita-Web-Port/web/tests/x.mjs')('playwright');
const [phase, code, topN = '45'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage();
const client = await page.context().newCDPSession(page);
let nextId = 1; const pending = new Map(); const sessions = new Set();
const sendTo = (sessionId, method, params = {}) => new Promise(res => { const id = nextId++; pending.set(id, res); client.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(() => res(null)); });
client.on('Target.receivedMessageFromTarget', e => { const m = JSON.parse(e.message); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? null); pending.delete(m.id); } });
client.on('Target.attachedToTarget', async e => {
    sessions.add(e.sessionId);
    await sendTo(e.sessionId, 'Profiler.enable');
    await sendTo(e.sessionId, 'Profiler.setSamplingInterval', { interval: 1000 });
    if (phase === 'startup') await sendTo(e.sessionId, 'Profiler.start');
    await sendTo(e.sessionId, 'Runtime.runIfWaitingForDebugger');
});
await client.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: false });
await page.goto('http://localhost:5173/?engine=wasm&engineBase=/engine-dev/');
await page.waitForFunction(() => window.__engine && __engine.documentInfo().then(Boolean), null, { timeout: 240000 });
if (phase !== 'startup') {
    await page.waitForTimeout(4000);
    for (const s of sessions) await sendTo(s, 'Profiler.start');
    await page.evaluate(async code => { const sleep = ms => new Promise(r => setTimeout(r, ms)); return await eval(code)(sleep); }, code);
}
const incl = new Map(), self = new Map(); let total = 0;
for (const s of sessions) {
    const r = await Promise.race([sendTo(s, 'Profiler.stop'), new Promise(r => setTimeout(() => r(null), 20000))]);
    if (!r?.profile) continue;
    const p = r.profile, byId = new Map(p.nodes.map(n => [n.id, n])), hits = new Map();
    const dt = p.timeDeltas ?? []; p.samples?.forEach((id, i) => hits.set(id, (hits.get(id) ?? 0) + (dt[i] ?? 0)));
    const walk = (n, stack) => {
        const name = n.callFrame.functionName || '(anon)';
        let t = hits.get(n.id) ?? 0; const mine = t;
        const onStack = stack.has(name); if (!onStack) stack.add(name);
        for (const c of n.children ?? []) t += walk(byId.get(c), stack);
        if (!onStack) { stack.delete(name); incl.set(name, (incl.get(name) ?? 0) + t); }
        self.set(name, (self.get(name) ?? 0) + mine);
        return t;
    };
    const root = p.nodes[0]; const t = walk(root, new Set());
    total += t - (self.get('(idle)') ?? 0);
}
const fmt = m => [...m].filter(([n]) => !/^\((idle|program|root|garbage collector)\)$/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, Number(topN)).map(([n, t]) => `${(t / 1000).toFixed(0).padStart(7)} ms  ${n.slice(0, 150)}`).join('\n');
console.log('=== inclusive (all workers summed)\n' + fmt(incl));
console.log('=== self\n' + fmt(self));
await browser.close(); process.exit(0);
