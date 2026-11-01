import {JSDOM,VirtualConsole} from 'npm:jsdom@26.1.0';
Deno.test('all 13 course assets initialize with bundled scripts and no public data dependency',async()=>{
 const assets=JSON.parse(await Deno.readTextFile(new URL('../backend/course-content.json',import.meta.url)));
 if(assets.length!==13)throw Error('missing course assets');
 for(const asset of assets){
  const errors:Error[]=[];const console=new VirtualConsole();console.on('jsdomError',(e:Error)=>errors.push(e));
  const dom=new JSDOM(asset.html,{url:'https://zhixueducation.github.io/zhixu-learning-lab/zhixu/portal.html',runScripts:'dangerously',virtualConsole:console,beforeParse(w:any){w.scrollTo=()=>{};}});
  await new Promise<void>(resolve=>dom.window.addEventListener('load',()=>resolve(),{once:true}));
  try{
   if(dom.window.document.querySelectorAll('script[src],link[rel=stylesheet]').length)throw Error(asset.asset_id+': unbundled content');
   if(errors.length)throw Error(asset.asset_id+': '+errors.map(e=>e.message).join(';'));
   if(dom.window.document.body.textContent!.length<100)throw Error('empty course');
  }finally{dom.window.close();}
 }
});
