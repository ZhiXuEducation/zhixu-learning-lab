import {JSDOM,VirtualConsole} from 'npm:jsdom@26.1.0';
function assert(v:unknown,m='assertion failed'){if(!v)throw Error(m)}
const root=new URL('../',import.meta.url);
Deno.test('homework UI: admin selects two sets, student gets exact practice link, text safely rendered',async()=>{
 for(const admin of [true,false]){
 const dom=new JSDOM(await Deno.readTextFile(new URL('zhixu/homework.html',root)),{url:'https://zhixueducation.github.io/zhixu-learning-lab/zhixu/homework.html',runScripts:'outside-only'});
 try{const w=dom.window,d=w.document;w.sessionStorage.setItem('zx_session',JSON.stringify(admin?{type:'admin',access_token:'test'}:{type:'student',token:'test'}));w.crypto.randomUUID=()=>crypto.randomUUID();let published:any=null;
 w.fetch=async(_url:any,init:any)=>{const b=JSON.parse(init.body);if(b.op==='homework-publish')published=b;return {ok:true,json:async()=>b.op==='homework-options'?{students:[{id:'s',name:'<img src=x>',number:1,courses:['s1-higher']}],courses:[{id:'s1-higher',title:'中一高华'}],exercises:[{asset_id:'s1-higher',exercise_id:'u1A',title:'单元一A套',courses:['s1-higher']},{asset_id:'s1-higher',exercise_id:'u1B',title:'单元一B套',courses:['s1-higher']}]}:b.op==='homework-list'?[{batch_id:'b',student_id:'s',student_name:'<img src=x>',title:'单元一',exercise_title:'A套',asset_id:'s1-higher',exercise_id:'u1A',due_at:'2026-11-08T15:59:59Z',status:'pending',submitted_at:null}]:{ok:true}};};
 w.eval(await Deno.readTextFile(new URL('zhixu/homework.js',root)));const settle=async()=>{for(let i=0;i<35;i++)await Promise.resolve()};await settle();
 if(admin){(d.getElementById('filter-month') as any).value='';d.getElementById('filter-month')!.dispatchEvent(new w.Event('change'));}
 assert(!d.querySelector('img'),'unsafe student name');assert(d.querySelectorAll('#rows tr').length===1);
 if(admin){d.querySelectorAll('fieldset input').forEach((x:any)=>x.checked=true);(d.getElementById('title') as any).value='单元一';(d.getElementById('due') as any).value='2026-11-08';d.getElementById('publish-form')!.dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert(published.exercises.length===2&&published.student_ids.length===1,'two-set publication');assert(d.getElementById('status')!.textContent!.includes('已为 1 名学生发布 2 套'));}
 else{assert((d.getElementById('publish-form') as any).hidden);assert(d.querySelector('#rows a')!.getAttribute('href')==='portal.html?course=s1-higher&exercise=u1A&homework=b');}
 }finally{dom.window.close()}}
});
Deno.test('homework links launch the requested full set across all 13 existing course assets',async()=>{
 const base=new URL('../backend/',import.meta.url);
 const assets=JSON.parse(await Deno.readTextFile(new URL('report-content.json',base))),catalog=JSON.parse(await Deno.readTextFile(new URL('report-catalog.json',base)));
 const portal=new JSDOM(await Deno.readTextFile(new URL('zhixu/portal.html',root)),{url:'https://zhixueducation.github.io/portal.html',runScripts:'outside-only'});
 try{portal.window.eval(await Deno.readTextFile(new URL('zhixu/portal.js',root))+';window.zxOpenCourse=openCourse;');
 for(const a of assets){const choices=catalog.filter((c:any)=>c.asset_id===a.asset_id);for(const c of [choices[0],choices.at(-1)]){
 portal.window.fetch=async()=>({ok:true,json:async()=>({html:a.html})});await portal.window.eval(`zxOpenCourse(${JSON.stringify(a.asset_id)},${JSON.stringify(c.exercise_id)})`);
 const html=(portal.window.document.getElementById('lesson-frame') as any).srcdoc,events:any[]=[],errors:any[]=[],vc=new VirtualConsole();vc.on('jsdomError',(e:any)=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://zhixueducation.github.io',runScripts:'dangerously',virtualConsole:vc,beforeParse(w:any){w.scrollTo=()=>{};w.crypto.randomUUID=()=>crypto.randomUUID();w.CSS={escape:(s:string)=>s};w.postMessage=(x:any)=>events.push(x)}});
 try{await new Promise<void>(r=>dom.window.addEventListener('load',()=>r(),{once:true}));assert(!errors.length,a.asset_id+': '+errors);assert(events.some(e=>e.op==='start'&&e.exercise_id===c.exercise_id),'did not launch '+a.asset_id+'/'+c.exercise_id)}finally{dom.window.close()}
 }}
 }finally{portal.window.close()}
});
Deno.test('history: student defaults to unfinished, teacher to current month; closed and completed work stays searchable',async()=>{
 for(const admin of [true,false]){
 const dom=new JSDOM(await Deno.readTextFile(new URL('zhixu/homework.html',root)),{url:'https://zhixueducation.github.io/homework.html',runScripts:'outside-only'});
 try{const w=dom.window,d=w.document;w.sessionStorage.setItem('zx_session',JSON.stringify(admin?{type:'admin',access_token:'test'}:{type:'student',token:'test'}));
 const current=new Date().toISOString(),old='2020-01-08T15:59:59Z';const base={student_id:'s',student_name:'测试',title:'功课',exercise_title:'A套',asset_id:'s1',exercise_id:'a'};
 const rows=[{...base,batch_id:'active',due_at:current,status:'pending'}, {...base,batch_id:'done',due_at:old,status:'completed',submitted_at:old}, {...base,batch_id:'closed',due_at:old,status:'overdue',closed_at:old}];
 w.fetch=async(_u:any,init:any)=>({ok:true,json:async()=>JSON.parse(init.body).op==='homework-options'?{students:[],courses:[],exercises:[]}:rows});
 w.eval(await Deno.readTextFile(new URL('zhixu/homework.js',root)));for(let i=0;i<40;i++)await Promise.resolve();
 assert(d.querySelectorAll('#rows tr').length===1,'default list cluttered');assert((d.getElementById('filter-view') as any).value===(admin?'all':'active'));
 const view=d.getElementById('filter-view') as any,month=d.getElementById('filter-month') as any;view.value='history';month.value='';view.dispatchEvent(new w.Event('change'));
 assert(d.querySelectorAll('#rows tr').length===2,'history records missing');assert(d.getElementById('rows')!.textContent!.includes('已结束 · 未交'));
 if(!admin)assert(d.querySelectorAll('#rows a').length===1,'closed work still offers submission');
 month.value='2020-01';month.dispatchEvent(new w.Event('change'));assert(d.querySelectorAll('#rows tr').length===2,'month filter lost old history');
 month.value='2020-02';month.dispatchEvent(new w.Event('change'));assert(d.getElementById('rows')!.textContent!.includes('暂无符合条件'));
 }finally{dom.window.close()}}
});
Deno.test('closed homework submit shows closure and offers free practice without homework context',async()=>{
 const dom=new JSDOM('<main><iframe id="lesson-frame"></iframe></main>',{url:'https://zhixueducation.github.io/portal.html',runScripts:'outside-only'});
 try{const w=dom.window,d=w.document;w.sessionStorage.setItem('zx_session',JSON.stringify({type:'student',token:'token'}));(w as any).zxHomeworkBatchId='batch';let body:any;
 w.fetch=async(_url:any,init:any)=>{body=JSON.parse(init.body);return {ok:false,status:409}};
 w.eval(await Deno.readTextFile(new URL('zhixu/learning-records.js',root)));
 w.dispatchEvent(new w.MessageEvent('message',{source:(d.getElementById('lesson-frame') as any).contentWindow,origin:w.location.origin,data:{type:'zx-learning',op:'finish',asset_id:'s1-higher',exercise_id:'u1A',run_id:'run',items:[]}}));
 for(let i=0;i<30;i++)await Promise.resolve();assert(body.homework_batch_id==='batch');assert((d.getElementById('lesson-frame') as any).hidden);assert(d.getElementById('sync-status')!.textContent!.includes('不能补交'));assert(d.querySelector('#sync-status a')!.getAttribute('href')==='portal.html?course=s1-higher&exercise=u1A');
 }finally{dom.window.close()}
});
