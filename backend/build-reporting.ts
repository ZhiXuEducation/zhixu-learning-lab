import {JSDOM} from 'npm:jsdom@26.1.0';
const assets=JSON.parse(await Deno.readTextFile(new URL('./course-content.json',import.meta.url)));
const catalogs:any[]=[],updated:any[]=[];
const labels:Record<string,string>={language:'语文应用',cloze:'短文填空',replace:'词语替换',sentence:'造句自评',pinyin:'拼音字词',dialogue:'完成对话'};
for(const a of assets){
 const dom=new JSDOM(a.html,{url:'https://zhixueducation.github.io',runScripts:'dangerously',beforeParse(w:any){w.scrollTo=()=>{};}});
 await new Promise<void>(r=>dom.window.addEventListener('load',()=>r(),{once:true}));await Promise.resolve();
 const w=dom.window, ev=(s:string)=>{try{return w.eval(s)}catch{return null}};
 const add=(id:any,title:string,qs:any[])=>catalogs.push({asset_id:a.asset_id,exercise_id:String(id),title,questions:qs});
 const item=(q:any,kind:string,title:string)=>({id:String(q.id),skill:labels[kind]||kind,prompt:String(q.prompt||q.sentence||q.q||q.target||title).slice(0,180),answer:q.answer,accepted:q.accepted||[],self:kind==='sentence'});
 let html=a.html;
 const course=ev('COURSE'), bank=ev('bank');
 if(course || Array.isArray(bank)){
  for(const s of (course?.sets||bank))add(s.id,s.name,(s.groups||s.passages).flatMap((g:any)=>g.items.map((q:any)=>item(q,g.kind,g.title))));
  html=html.replace('active=set;','active=set;window.zxBegin(wrong?null:String(active.id));').replace('active=s;','active=s;window.zxBegin(wrong?null:String(active.id));');
  html=html.replace('function finish(){','function finish(){window.zxFinish(responses.map(r=>({id:String(r.q.id),answer:r.kind===\'sentence\'?!!r.ok:r.value})));');
 }else if(a.asset_id==='essay-training'){
  const sets=[w.ESSAY_QUESTIONS,w.ESSAY_EXTRA_SETS[2],w.ESSAY_EXTRA_SETS[3]];
  sets.forEach((qs:any[],i:number)=>add(i+1,'作文审题第'+(i+1)+'套',qs.map(q=>({id:String(q.id),skill:q.skill,prompt:q.q,answer:q.answer,accepted:[],self:false}))));
  html=html.replace('function quiz(){','function quiz(){window.zxBegin(ids.length===Q.length?String(selected):null);');
  html=html.replace('submitted=true;save();wrongOnly=false;','submitted=true;window.zxFinish(ids.map(id=>({id:String(id),answer:answer(id)})));save();wrongOnly=false;');
 }else if(a.asset_id==='psle-review'){
  for(const s of w.PSLE_REVIEW.sets)add(s.id,s.title,[...s.language.map((q:any)=>item(q,'language',s.title)),...s.cloze.items.map((q:any)=>item(q,'cloze',s.title)),...s.dialogue.items.map((q:any)=>item(q,'dialogue',s.title))]);
  html=html.replace('active={id,title};','active={id,title};window.zxBegin(BANK.sets.some(s=>s.id===id)?String(id):null);');
  html=html.replace('lastWrong=items.filter','window.zxFinish(items.map(q=>({id:String(q.id),answer:answers[q.id]})));lastWrong=items.filter');
 }else{
  const qs=ev('questions');add('all','原20题复习',qs.map((q:any)=>({id:String(q.id),skill:q.type,prompt:q.q,answer:q.correct,accepted:[],self:false})));
  html=html.replace("pos=0;answers=[];show('quiz');","pos=0;answers=[];window.zxBegin(pool.length===questions.length?'all':null);show('quiz');");
  html=html.replace('function finish(){','function finish(){window.zxFinish(answers.map(r=>({id:String(r.x.id),answer:r.selected})));');
 }
 const helper=`<script>(()=>{let run=null,done=false;window.zxBegin=id=>{if(!id){run=null;return;}if(run&&run.exercise_id===id&&!done)return;run={run_id:crypto.randomUUID(),exercise_id:id};done=false;parent.postMessage({type:'zx-learning',op:'start',asset_id:${JSON.stringify(a.asset_id)},...run},'https://zhixueducation.github.io');};window.zxFinish=items=>{if(!run||done)return;done=true;parent.postMessage({type:'zx-learning',op:'finish',asset_id:${JSON.stringify(a.asset_id)},...run,items},'https://zhixueducation.github.io');};})();</script>`;
 html=html.replace('<head>','<head>'+helper);
 if(!html.includes('window.zxFinish(')||!html.includes('window.zxBegin('))throw Error('missing hooks '+a.asset_id);
 updated.push({...a,html});dom.window.close();
}
await Deno.writeTextFile(new URL('./report-catalog.json',import.meta.url),JSON.stringify(catalogs));
await Deno.writeTextFile(new URL('./report-content.json',import.meta.url),JSON.stringify(updated));
console.log(`Prepared ${catalogs.length} exercise sets across ${updated.length} assets.`);
