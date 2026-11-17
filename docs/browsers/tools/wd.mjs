// minimal W3C WebDriver client (no deps)
export class WD {
  constructor(base){ this.base=base; }
  async req(method, path, body){
    const r = await fetch(this.base+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(j).slice(0,400)}`);
    return j.value;
  }
  async start(caps){ const v=await this.req('POST','/session',{capabilities:{alwaysMatch:caps}}); this.sid=v.sessionId; this.caps=v.capabilities; return v; }
  go(url){ return this.req('POST',`/session/${this.sid}/url`,{url}); }
  exec(script,args=[]){ return this.req('POST',`/session/${this.sid}/execute/sync`,{script,args}); }
  execAsync(script,args=[]){ return this.req('POST',`/session/${this.sid}/execute/async`,{script,args}); }
  shot(){ return this.req('GET',`/session/${this.sid}/screenshot`); }
  timeouts(t){ return this.req('POST',`/session/${this.sid}/timeouts`,t); }
  window(rect){ return this.req('POST',`/session/${this.sid}/window/rect`,rect); }
  actions(a){ return this.req('POST',`/session/${this.sid}/actions`,{actions:a}); }
  quit(){ return this.req('DELETE',`/session/${this.sid}`); }
}
export const sleep = ms=>new Promise(r=>setTimeout(r,ms));
