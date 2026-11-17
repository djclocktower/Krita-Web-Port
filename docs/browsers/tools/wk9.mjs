import { WD, sleep } from './wd.mjs'; import { writeFileSync } from 'node:fs';
const wd=new WD('http://127.0.0.1:4444'); await wd.start({browserName:'MiniBrowser','webkitgtk:browserOptions':{binary:'/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser',args:['--automation']}});
await wd.window({width:1000,height:500}).catch(()=>{});
await wd.go('http://localhost:5194/?engine=wasm'); await sleep(8000);
console.log(JSON.stringify(await wd.exec('return [typeof SharedArrayBuffer, document.body.innerText.slice(0,200)]')));
writeFileSync('/home/user/Krita-Web-Port/docs/browsers/webkitgtk-default-message.png',Buffer.from(await wd.shot(),'base64')); await wd.quit();
