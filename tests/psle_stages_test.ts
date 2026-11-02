import {JSDOM} from 'npm:jsdom@26.1.0';
function assert(v:unknown,m='assertion failed'){if(!v)throw Error(m)}
Deno.test('PSLE stages: four categories, P6 hub, three stages and preserved exercise IDs',async()=>{
 const root=new URL('../',import.meta.url),read=(p:string)=>Deno.readTextFile(new URL(p,root));
 const home=new JSDOM(await read('zhixu/index.html'));
 assert(home.window.document.querySelectorAll('.grid>.card').length===4);
 assert(!home.window.document.querySelector('a[href="psle/"]'));home.window.close();
 const p6=new JSDOM(await read('zhixu/primary-standard.html'));
 assert(p6.window.document.querySelectorAll('.grid>.card').length===2);
 assert(p6.window.document.querySelector('a[href="p6-standard.html"]'));
 assert(p6.window.document.querySelector('a[href="psle/"]'));p6.window.close();
 const markup=await read('backend/psle-revision-ui.html');
 const dom=new JSDOM('<main><section id="home"></section><section id="quiz"></section><section id="results"></section>'+markup+'</main>',{url:'https://zhixueducation.github.io/zhixu-learning-lab/zhixu/psle/',runScripts:'outside-only'});
 try{const w=dom.window as any,d=w.document;w.scrollTo=()=>{};w.zxBegin=()=>{};
 w.PSLE_REVISION={sets:['language','cloze','dialogue','reading'].flatMap(kind=>Array.from({length:5},(_,n)=>({id:`psle-rev-${kind}-${n+1}`,kind,title:`Test ${n+1}`,total:2,groups:[{number:1,text:'Synthetic passage',items:[{id:'q',examNumber:21,tag:'test',prompt:'Synthetic question',options:['A','B','C','D'],answer:0}]}]})))};
 w.eval(await read('backend/psle-revision-ui.js'));
 const visible=(id:string)=>!d.getElementById(id).hidden;
 assert(visible('psle-hub')&&!visible('rev-types'));
 assert(d.querySelectorAll('#psle-hub .stages>.card').length===3);
 const upcoming=d.querySelectorAll('#psle-hub .stages>.card')[1];assert(upcoming.textContent.includes('即将开放'));assert(!upcoming.querySelector('a,button'));
 d.getElementById('open-revision').click();assert(visible('rev-types'));
 for(const kind of ['language','cloze','dialogue','reading']){
  d.querySelector(`[data-kind="${kind}"]`).click();assert(visible('rev-home'));
  assert(d.querySelectorAll('#rev-sets>.card').length===5);
  d.querySelector('[data-rev-types]').click();assert(visible('rev-types'));
 }
 for(const s of w.PSLE_REVISION.sets){w.zxRevisionOpen(s.id);assert(visible('rev-quiz')&&!visible('psle-hub'))}
 w.ZX_REVISION_UI.hub();d.getElementById('open-mocks').click();assert(visible('home')&&!visible('psle-hub'));
 d.querySelector('#home>button').click();assert(visible('psle-hub'));
 }finally{dom.window.close()}
});
