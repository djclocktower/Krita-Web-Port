// Reproduce a hang, then pause every worker through the DevTools protocol and print its stack.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/user/Krita-Web-Port/web/tests/x.mjs')('playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage();
const client = await page.context().newCDPSession(page);
const workers = new Map(); let nextId = 1; const waiting = new Map();
client.on('Target.attachedToTarget', e => { workers.set(e.sessionId, e.targetInfo); });
client.on('Target.receivedMessageFromTarget', e => {
    const m = JSON.parse(e.message);
    if (m.method === 'Debugger.paused') {
        const frames = m.params.callFrames.map(f => f.functionName || '(anon)');
        console.log(`\n=== worker ${e.sessionId.slice(0, 6)}: ${frames.length} frames`);
        console.log(frames.slice(0, 45).join('\n'));
    }
});
const sendTo = (sessionId, method, params = {}) => client.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: nextId++, method, params }) }).catch(() => {});
await client.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
await page.goto('http://localhost:5173/?engine=wasm&engineBase=/engine-dev/');
await page.waitForFunction(() => window.__engine && __engine.documentInfo().then(Boolean), null, { timeout: 200000 });
await page.waitForTimeout(1500);
const done = page.evaluate(async code => { const sleep = ms => new Promise(r => setTimeout(r, ms)); return await eval(code)(sleep); }, process.argv[2]).then(r => console.log('RETURNED', JSON.stringify(r).slice(0, 500)), e => console.log('ERR', e.message.slice(0, 200)));
await Promise.race([done, new Promise(r => setTimeout(r, Number(process.argv[3] ?? 25000)))]);
console.log(`workers attached: ${workers.size}`);
for (const id of workers.keys()) { await sendTo(id, 'Debugger.enable'); await sendTo(id, 'Debugger.pause'); }
await new Promise(r => setTimeout(r, 8000));
await browser.close();
process.exit(0);
