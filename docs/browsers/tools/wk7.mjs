// packaged-build test via screenshots only (no __engine). usage: node wk7.mjs <label> <driverUrl> <capsJSON> [url]
import { WD, sleep } from './wd.mjs';
import { writeFileSync } from 'node:fs';
const [label, drv, caps, url='http://localhost:8081/krita/'] = process.argv.slice(2);
const out='/home/user/Krita-Web-Port/docs/browsers/';
const wd=new WD(drv); await wd.start(JSON.parse(caps)); await wd.timeouts({script:120000,pageLoad:120000}); await wd.window({width:1400,height:900}).catch(()=>{});
const t0=Date.now(); await wd.go(url);
let ok=false; for(let i=0;i<200;i++){ const t=await wd.exec('return document.body.innerText').catch(()=>''); if(/RGBA U8/.test(t)){ok=true;break} await sleep(1000);}
console.log('started',ok,Date.now()-t0,'ms'); await sleep(3000);
const save=async n=>writeFileSync(out+label+'-'+n+'.png',Buffer.from(await wd.shot(),'base64'));
await save('pkg-before');
const [x,y,w,h]=(await wd.exec(`const r=document.querySelector('canvas.view').getBoundingClientRect();return [r.x,r.y,r.width,r.height]`)).map(Math.round);
const pts=[]; for(let i=0;i<=40;i++) pts.push({type:'pointerMove',duration:15,x:Math.round(x+w*(0.3+0.4*i/40)),y:Math.round(y+h*(0.6-0.25*Math.sin(i/40*Math.PI)))});
await wd.actions([{type:'pointer',id:'m',parameters:{pointerType:'mouse'},actions:[pts[0],{type:'pointerDown',button:0},...pts.slice(1),{type:'pointerUp',button:0}]}]);
await sleep(4000); await save('pkg-painted');
// Ctrl+Alt+I = Image > Scale Image To New Size
await wd.actions([{type:'key',id:'k',actions:['','','i'].map(v=>({type:'keyDown',value:v})).concat(['i','',''].map(v=>({type:'keyUp',value:v})))}]);
await sleep(5000);
console.log('dialog', JSON.stringify(await wd.exec(`const d=document.querySelector('.krita-dialog');return d?{label:d.getAttribute('aria-label'),w:d.offsetWidth,h:d.offsetHeight,text:d.innerText.slice(0,100)}:null`)));
await save('pkg-dialog');
console.log('LOG', JSON.stringify(await wd.exec('return window.__log||null')).slice(0,800));
await wd.quit();
