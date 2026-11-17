// usage: node wk6.mjs <label> <driverUrl> <capsJSON>
import { WD, sleep } from './wd.mjs';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const [label, drv, caps] = process.argv.slice(2);
const out = '/home/user/Krita-Web-Port/docs/browsers/';
const wd = new WD(drv); await wd.start(JSON.parse(caps));
await wd.timeouts({script:120000,pageLoad:120000});
await wd.window({width:1400,height:900}).catch(()=>{});
const t0=Date.now();
await wd.go('http://localhost:5194/?engine=wasm');
let ok=false; for(let i=0;i<300;i++){ const t=await wd.exec('return document.body.innerText').catch(()=>''); if(/RGBA U8/.test(t)){ok=true;break} await sleep(1000); }
console.log('started',ok,Date.now()-t0,'ms'); if(!ok){ console.log('LOG', await wd.exec('return window.__log')); }
await sleep(2000);
const hash = `const done=arguments[arguments.length-1];(async()=>{const b=await window.__engine.exportDocument('png');const h=await crypto.subtle.digest('SHA-256',b);done([...new Uint8Array(h)].slice(0,8).map(x=>x.toString(16).padStart(2,'0')).join('')+' '+b.length)})().catch(e=>done('err '+e))`;
const h0 = await wd.execAsync(hash); console.log('export before', h0);
const r = await wd.exec(`const r=document.querySelector('canvas.view').getBoundingClientRect();return [r.x,r.y,r.width,r.height]`);
console.log('canvas rect', r);
const [x,y,w,h]=r.map(Math.round);
writeFileSync(out+label+'-before.png', Buffer.from(await wd.shot(),'base64'));
const pts=[]; for(let i=0;i<=40;i++) pts.push({type:'pointerMove',duration:15,x:Math.round(x+w*(0.3+0.4*i/40)),y:Math.round(y+h*(0.6-0.25*Math.sin(i/40*Math.PI)))});
await wd.actions([{type:'pointer',id:'m',parameters:{pointerType:'mouse'},actions:[pts[0],{type:'pointerDown',button:0},...pts.slice(1),{type:'pointerUp',button:0}]}]);
let h1; for(let i=0;i<20;i++){ await sleep(1500); h1=await wd.execAsync(hash); if(h1!==h0) break; } console.log('export after', h1, h0!==h1?'PAINT CHANGED':'NO CHANGE');
writeFileSync(out+label+'-painted.png', Buffer.from(await wd.shot(),'base64'));
// dialog
await wd.exec(`window.__engine.triggerKritaAction('imagesize')`);
let dlg=null; for(let i=0;i<20;i++){ dlg=await wd.exec(`const d=document.querySelector('.krita-dialog');return d?{label:d.getAttribute('aria-label'),w:d.offsetWidth,h:d.offsetHeight,text:d.innerText.slice(0,120)}:null`); if(dlg)break; await sleep(500); }
console.log('dialog', JSON.stringify(dlg)); await sleep(5000);
console.log('dialog text after 5s', JSON.stringify(await wd.exec(`const d=document.querySelector('.krita-dialog');return d?d.innerText.slice(0,200):null`)));
writeFileSync(out+label+'-dialog.png', Buffer.from(await wd.shot(),'base64'));
await wd.exec(`window.__engine.kritaKey&&0`);
console.log('close dialog', JSON.stringify(await wd.exec(`const b=document.querySelector('.krita-dialog button, .krita-dialog [aria-label=Close]');return !!b`)));
console.log('open+export png', JSON.stringify(await wd.execAsync(`const done=arguments[arguments.length-1];(async()=>{const e=window.__engine;const a=await e.exportDocument('png');await e.openDocument('roundtrip.png',a);const b=await e.exportDocument('png');const info=await e.documentInfo();done({exported:a.length,reopened:b.length,sig:[...a.slice(0,4)],info:info&&{w:info.width,h:info.height}})})().catch(e=>done('err '+e))`)));
// icons: any element with computed mask image
console.log('masks', JSON.stringify(await wd.exec(`const els=[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);const m=s.maskImage||s.webkitMaskImage;return m&&m!=='none'});return {count:els.length,sample:els[0]&&(getComputedStyle(els[0]).maskImage||getComputedStyle(els[0]).webkitMaskImage).slice(0,50),w:els[0]&&els[0].offsetWidth,bg:els[0]&&getComputedStyle(els[0]).backgroundColor}`)));
console.log('features', JSON.stringify(await wd.exec(`return {coi:crossOriginIsolated,sab:typeof SharedArrayBuffer,ua:navigator.userAgent,mem:performance.memory&&performance.memory.usedJSHeapSize}`)));
if (process.env.PIDS) {}
const pids = execSync(`pgrep -f 'WebKitWebProcess|WebKitNetworkProcess|MiniBrowser|firefox' || true`).toString().trim().split('\n').filter(Boolean);
let rss=0; for(const p of pids){ try{ const s=execSync(`grep VmRSS /proc/${p}/status`).toString(); rss+=+s.match(/(\d+)/)[1]; console.log('pid',p,execSync(`cat /proc/${p}/comm`).toString().trim(),s.trim()) }catch{} }
console.log('total RSS MB', Math.round(rss/1024));
console.log('LOG', JSON.stringify(await wd.exec('return window.__log||null')));
await wd.quit();
