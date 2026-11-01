import {JSDOM,VirtualConsole} from 'npm:jsdom@26.1.0';
function assert(v:unknown,m='assertion failed'){if(!v)throw Error(m)}
Deno.test('13 instrumented assets initialize, emit nothing on load; full practice has start/finish hooks',async()=>{
 const assets=JSON.parse(await Deno.readTextFile(new URL('../backend/report-content.json',import.meta.url)));
 const catalogs=JSON.parse(await Deno.readTextFile(new URL('../backend/report-catalog.json',import.meta.url)));
 assert(assets.length===13 && catalogs.length===145);
 for(const asset of assets){
  const events:any[]=[],errors:Error[]=[];const vc=new VirtualConsole();vc.on('jsdomError',(e:Error)=>errors.push(e));
  const dom=new JSDOM(asset.html,{url:'https://zhixueducation.github.io',runScripts:'dangerously',virtualConsole:vc,beforeParse(w:any){w.scrollTo=()=>{};w.crypto.randomUUID=()=>crypto.randomUUID();w.postMessage=(x:any)=>events.push(x);}});
  await new Promise<void>(r=>dom.window.addEventListener('load',()=>r(),{once:true}));await Promise.resolve();
  try{
   assert(!errors.length,asset.asset_id+': '+errors.map(e=>e.message));assert(events.length===0,'invented completion on load');
   if(asset.asset_id==='s1-express'){
    dom.window.eval('start(COURSE.sets[0]);');assert(events[0].op==='start');
    dom.window.eval("responses=active.groups.flatMap(g=>g.items.map(q=>({q,value:q.answer,ok:true,kind:g.kind,title:g.title})));finish();");assert(events[1].op==='finish' && events[1].items.length===30);
   }
   if(asset.asset_id==='essay-training'){
    (dom.window.document.querySelector('[data-start="1"]') as any).click();assert(events[0].op==='start');
   }
  }finally{dom.window.close()}
 }
});
