import {JSDOM} from 'npm:jsdom@26.1.0';
function assert(v:unknown,m='assertion failed'){if(!v)throw Error(m)}
Deno.test('combined practice: twelve independent sets, one submission, dynamic part totals and legacy dispatch',async()=>{
 const ids=['home','quiz','results','psle-hub','rev-types','rev-home','rev-quiz','rev-result'];
 const dom=new JSDOM('<main>'+ids.map(id=>`<section id="${id}"></section>`).join('')+'<button id="open-combo"></button><p id="combo-stage-summary"></p></main>',{url:'https://zhixueducation.github.io',runScripts:'outside-only'});
 try{const w=dom.window as any,d=w.document,events:any[]=[];let legacy='';w.scrollTo=()=>{};w.zxBegin=(id:string)=>events.push({op:'start',id});w.zxFinish=(items:any[])=>events.push({op:'finish',items});w.zxRevisionOpen=(id:string)=>legacy=id;w.ZX_REVISION_UI={hub:()=>{d.getElementById('psle-hub').hidden=false}};
 w.PSLE_COMBO=Array.from({length:12},(_,i)=>({id:`psle-rev-combo-${i+1}`,title:`Synthetic ${i+1}`,minutes:10,groups:['A','B'].map((part,j)=>({part,kind:j?'cloze':'language',text:j?'Synthetic {1}.':'',title:'Synthetic',items:[{id:`s${i}-${part}`,examNumber:j?16:1,points:j?3:2,prompt:'Synthetic question',tag:'test',options:['correct','wrong','other','last'],answer:0,explanation:'Synthetic explanation.'}]}))}));
 w.eval(await Deno.readTextFile(new URL('../backend/psle-combo-ui.js',import.meta.url)));
 d.getElementById('open-combo').click();assert(d.querySelectorAll('#combo-sets>.card').length===12);
 for(const s of w.PSLE_COMBO){w.ZX_COMBO_UI.open(s.id);const before=events.filter(e=>e.op==='finish').length;
  for(let i=0;i<2;i++){const input=d.querySelector('input[value="0"]');input.checked=true;input.dispatchEvent(new w.Event('change'));d.getElementById('combo-form').dispatchEvent(new w.Event('submit',{cancelable:true}));assert(events.filter(e=>e.op==='finish').length===before+(i===1?1:0),'Part A submitted independently')}
  assert(d.getElementById('combo-score').textContent.startsWith('5 / 5'));assert(d.getElementById('combo-part-scores').textContent.includes('2/2'));assert(d.getElementById('combo-part-scores').textContent.includes('3/3'));assert(events.filter(e=>e.op==='finish').at(-1).items.every((q:any)=>q.answer==='correct'));
 }
 w.zxRevisionOpen('psle-rev-reading-1');assert(legacy==='psle-rev-reading-1');assert(d.getElementById('combo-result').hidden);
 }finally{dom.window.close()}
});
