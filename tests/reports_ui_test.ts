import {JSDOM} from 'npm:jsdom@26.1.0';
function assert(v:unknown,m='assertion failed'){if(!v)throw Error(m)}
Deno.test('report UI: no invented values, comments, history, and failed-load isolation',async()=>{
 const dom=new JSDOM(await Deno.readTextFile(new URL('../zhixu/reports.html',import.meta.url)),{url:'https://zhixueducation.github.io/reports.html',runScripts:'outside-only'});
 try{
 const w=dom.window,d=w.document;let comment='',bad=false;const empty={started:0,completed:0,questions:0,correct:0,self_assessed:0,wrong_count:0,wrong:[],skills:[]};
 w.sessionStorage.setItem('zx_session',JSON.stringify({type:'admin',access_token:'test'}));w.confirm=()=>true;
 w.fetch=async(_url:any,init:any)=>{const b=JSON.parse(init.body);if(b.op==='save')comment=b.comment;return {ok:!bad,json:async()=>bad?{error:'网络失败'}:b.op==='students'?[{id:'demo',name:'<img src=x>',username:'Demo',number:1}]:b.op==='history'?[{month:'2026-10-01'}]:{snapshot:empty,comment,saved:b.op==='save'}};};
 w.eval(await Deno.readTextFile(new URL('../zhixu/progress-guidance.js',import.meta.url)));
 w.eval(await Deno.readTextFile(new URL('../zhixu/reports.js',import.meta.url)));
 const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};await settle();
 (d.getElementById('filters') as any).dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();
 assert(d.getElementById('completion')!.textContent==='暂无数据 / No data');assert(d.getElementById('accuracy')!.textContent==='暂无数据 / No data');assert(d.querySelectorAll('#report img').length===0,'unsafe text rendering');
 const textarea=d.getElementById('comment') as any;textarea.value='老师评语';textarea.dispatchEvent(new w.Event('input'));(d.getElementById('save') as any).click();await settle();assert(comment==='老师评语');
 textarea.value='尚未保存的新评语';textarea.dispatchEvent(new w.Event('input'));(d.getElementById('refresh') as any).click();await settle();assert(textarea.value==='尚未保存的新评语');assert(d.getElementById('saved-label')!.textContent!.includes('未保存'));
 bad=true;(d.getElementById('filters') as any).dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert((d.getElementById('report') as any).hidden,'old student report remained after load failure');
 }finally{dom.window.close()}
});
