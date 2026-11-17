// serve.mjs clone that injects a console/error recorder into index.html (window.__log) for browsers without a console API
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
const root = resolve(process.argv[2]); const port = Number(process.argv[3]);
const types = { '.css':'text/css','.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const inject = `<script>window.__log=[];for(const k of ['log','info','warn','error','debug']){const o=console[k];console[k]=function(...a){try{window.__log.push(k+': '+a.map(x=>x&&x.stack?x.stack:typeof x==='object'?JSON.stringify(x):String(x)).join(' ').slice(0,500))}catch{};o.apply(console,a)}}
addEventListener('error',e=>window.__log.push('ERROR '+e.message+' @'+e.filename+':'+e.lineno));addEventListener('unhandledrejection',e=>window.__log.push('UNHANDLED '+(e.reason&&e.reason.stack||e.reason)));</script>`;
const idbPage = `<script>const test=(name,val)=>new Promise(res=>{const tm=setTimeout(()=>res(name+': TIMEOUT'),8000);const r=indexedDB.open('t_'+name,1);r.onupgradeneeded=()=>r.result.createObjectStore('s');r.onerror=()=>res(name+': open err');r.onsuccess=()=>{const t=r.result.transaction('s','readwrite');t.objectStore('s').put(val,'k');t.oncomplete=()=>{clearTimeout(tm);res(name+': ok')};t.onabort=()=>{clearTimeout(tm);res(name+': abort '+(t.error&&t.error.name+' '+t.error.message))}}});
(async()=>{const o=[];o.push(await test('plain',{a:1}));o.push(await test('blob',new Blob([new Uint8Array(1000)])));o.push(await test('bigblob',new Blob([new Uint8Array(5e6)])));await fetch('/__t/report',{method:'POST',body:o.join('\\n')})})()</script>idb`;
createServer(async (req,res)=>{
  if(req.url==='/__t/idb') return res.writeHead(200,{'Content-Type':'text/html'}).end(idbPage);
  if(req.url==='/__t/report'){ let b='';req.on('data',d=>b+=d);req.on('end',()=>{console.log('REPORT\n'+b);res.writeHead(204).end()});return }
  let path = join(root, normalize(decodeURIComponent(new URL(req.url,'http://x').pathname)));
  if (path.endsWith('/')) path += 'index.html';
  try { let body = await readFile(path);
    if (path.endsWith('index.html')) body = Buffer.from(body.toString().replace('<head>','<head>'+inject));
    res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}).end(body);
  } catch { res.writeHead(404).end('nf'); }
}).listen(port,()=>console.log('cap on',port));
