// Run a scenario and print the stack of every exception thrown inside the engine's workers.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/user/Krita-Web-Port/web/tests/x.mjs')('playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage();
const client = await page.context().newCDPSession(page);
let nextId = 1, armed = false, shown = 0;
const sendTo = (sessionId, method, params = {}) => client.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: nextId++, method, params }) }).catch(() => {});
const sessions = new Set();
client.on('Target.attachedToTarget', e => { sessions.add(e.sessionId); sendTo(e.sessionId, 'Debugger.enable'); if (armed) sendTo(e.sessionId, 'Debugger.setPauseOnExceptions', { state: 'all' }); });
client.on('Target.receivedMessageFromTarget', e => {
    const m = JSON.parse(e.message);
    if (m.method !== 'Debugger.paused') return;
    if (m.params.reason === 'exception' && shown++ < 3) {
        console.log(`\n=== exception: ${JSON.stringify(m.params.data?.description ?? m.params.data?.value ?? m.params.data).slice(0, 300)}`);
        console.log(m.params.callFrames.map(f => f.functionName || '(anon)').slice(0, 28).join('\n'));
    }
    sendTo(e.sessionId, 'Debugger.resume');
});
await client.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
await page.goto('http://localhost:5173/?engine=wasm&engineBase=/engine-dev/');
await page.waitForFunction(() => window.__engine && __engine.documentInfo().then(Boolean), null, { timeout: 200000 });
await page.waitForTimeout(2500);
const run = code => page.evaluate(async code => { const sleep = ms => new Promise(r => setTimeout(r, ms)); return await eval(code)(sleep); }, code);
console.log('SETUP', JSON.stringify(await run(process.argv[2])).slice(0, 300));
armed = true; for (const s of sessions) await sendTo(s, 'Debugger.setPauseOnExceptions', { state: 'all' });
const done = run(process.argv[3]).then(r => console.log('RESULT', JSON.stringify(r).slice(0, 400)), e => console.log('ERR', e.message.slice(0, 200)));
await Promise.race([done, new Promise(r => setTimeout(r, 60000))]);
await browser.close(); process.exit(0);
