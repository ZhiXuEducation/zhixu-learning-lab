import {JSDOM} from 'npm:jsdom@26.1.0';
function assert(v:unknown,m='assertion failed'){if(!v)throw Error(m);}
Deno.test('management UI: scoped course selection, safe rendering, one-time PIN and update',async()=>{
 const html=await Deno.readTextFile(new URL('../zhixu/portal.html',import.meta.url));
 const dom=new JSDOM(html,{url:'https://zhixueducation.github.io/zhixu-learning-lab/zhixu/portal.html',runScripts:'outside-only'});
 try{
 const win=dom.window, doc=win.document;
 let save:any,created=false;
 win.sessionStorage.setItem('zx_session',JSON.stringify({type:'admin',access_token:'demo',expires_at:9999999999}));
 win.fetch=async(_url:any,options:any)=>{
  const body=JSON.parse(options.body);
  const result=body.op==='me'?{role:'admin'}:body.op==='courses'?[{id:'p6-standard',title:'小学普华'},{id:'s1-higher',title:'中一高华'},{id:'essay-training',title:'审题'}]:body.op==='list'?[{id:'student',student_code:'ZX0123456789AB',display_name:'<img src=x onerror=alert(1)>',grade:'P6',courses:['p6-standard'],active:true}]:body.op==='create'?(created=true,{id:'created',code:'ZX123456789ABC',pin:'0007'}):{};
  if(['create','update'].includes(body.op))save=body;
  return {ok:true,json:async()=>result};
 };
 win.eval(await Deno.readTextFile(new URL('../zhixu/portal.js',import.meta.url)));
 async function settle(){for(let i=0;i<20;i++)await Promise.resolve();}
 await settle();
 assert(!(doc.getElementById('admin') as any).hidden);
 assert(doc.querySelectorAll('#students img').length===0,'unsafe student name rendering');
 const editor=doc.getElementById('student-editor') as any;
 assert(doc.querySelectorAll('#course-options input').length===1);
 editor.elements.grade.value='S1';editor.elements.grade.dispatchEvent(new win.Event('change'));
 assert(doc.querySelectorAll('#course-options input').length===2);
 editor.elements.name.value='示例';(doc.querySelector('#course-options input') as any).checked=true;
 editor.dispatchEvent(new win.Event('submit',{cancelable:true}));await settle();
 assert(created && save.grade==='S1' && save.courses[0]==='s1-higher');
 assert(doc.getElementById('new-pin')!.textContent!.includes('0007'));
 assert(!win.sessionStorage.getItem('zx_session')!.includes('0007'),'PIN persisted');
 (doc.getElementById('hide-credentials') as any).click();
 assert(doc.getElementById('new-pin')!.textContent==='');
 assert((doc.getElementById('credentials') as any).hidden);
 }finally{dom.window.close();}
});
