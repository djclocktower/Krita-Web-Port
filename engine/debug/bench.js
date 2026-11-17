async (sleep) => { await sleep(4000); const e=__engine; const t = async (f) => { const t0=performance.now(); await f(); return Math.round(performance.now()-t0); }; const o={};
 o.new1=await t(()=>e.newDocument({width:1600,height:1200})); o.new2=await t(()=>e.newDocument({width:1600,height:1200}));
 o.addNode=await t(()=>e.addNode({type:'paint',name:'x'}));
 o.strokes10=await t(async()=>{ for (let i=0;i<10;i++) { e.beginStroke({x:100,y:100+i*90,pressure:1,timeMs:0}); for (let k=1;k<=20;k++) e.continueStroke([{x:100+k*70,y:100+i*90+Math.sin(k)*40,pressure:1,timeMs:k*8}]); e.endStroke(); } await e.documentInfo(); });
 const K=p=>__engineCall('krita.pointer',p); await e.setKritaTool('KritaShape/KisToolBrush');
 o.kritaStrokes5=await t(async()=>{ for (let i=0;i<5;i++) { const y=200+i*150; await K({type:'move',x:100,y}); await K({type:'press',x:100,y}); for (let k=1;k<=25;k++) await K({type:'move',down:true,x:100+k*50,y:y+Math.sin(k)*40}); await K({type:'release',x:1350,y}); } });
 const b=await e.exportDocument('png'); o.exportPng=await t(()=>e.exportDocument('png')); o.exportKra=await t(()=>e.exportDocument('kra'));
 o.open=await t(()=>e.openDocument('a.png',b)); o.undo=await t(()=>e.undo());
 const id=await e.activeNode(); o.filter=await t(()=>e.applyFilter(id,'blur',{}));
 return o; }
