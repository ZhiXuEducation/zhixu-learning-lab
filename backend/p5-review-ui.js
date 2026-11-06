(()=>{'use strict';
const sets=window.P5_REVIEW,$=id=>document.getElementById(id),n=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
let history=[],preview=false,ready=false,active=null,pool=[],mode='full',runId=null,base=null,answers={},busy=false,pendingOpen=null,assignedMode=false;
const awaiting=new Map();
window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin||e.data?.type!=='zx-p5-response')return;const p=awaiting.get(e.data.id);if(p){clearTimeout(p.timer);awaiting.delete(e.data.id);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.data)}});
function request(op,body={}){return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{awaiting.delete(id);reject(Error('保存结果尚未确认，请保持本页并重试；不会重复保存。'))},25000);awaiting.set(id,{resolve,reject,timer});parent.postMessage({type:'zx-p5-request',id,op,...body},location.origin)})}
const score=r=>r?.results?`${r.results.filter(q=>q.correct).length}/${r.results.length}（${Math.round(r.results.filter(q=>q.correct).length/r.results.length*100)}%）`:'尚未完成';
const time=v=>new Intl.DateTimeFormat('zh-SG',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
function button(text,fn){const b=n('button',text);b.type='button';b.onclick=fn;return b}
function show(id){$('reload').hidden=id==='quiz';for(const p of ['home','quiz','result'])$(p).hidden=p!==id;window.scrollTo(0,0)}
async function task(fn){if(busy)return;busy=true;document.querySelectorAll('button,input').forEach(e=>e.disabled=true);$('status').textContent='正在处理…';try{await fn();$('status').textContent=preview?'教师预览：不保存为学生成绩。':''}catch(e){$('status').textContent=e.message}finally{busy=false;document.querySelectorAll('button,input').forEach(e=>e.disabled=false)}}
async function refresh(){const r=await request('p5-history');history=r.sets;preview=r.preview===true;ready=true}
function home(){show('home');$('sets').replaceChildren();for(let stage=1;stage<=3;stage++){
 const section=n('section'),heading=n('h2',['第一阶段｜词语运用专项','第二阶段｜语法句式专项','第三阶段｜综合复习'][stage-1]),grid=n('div');grid.className='grid';section.append(heading,grid);
 for(const s of sets.filter(x=>x.stage===stage)){const card=n('article');card.className='card';const h=history.find(x=>x.exercise_id===s.id);card.append(n('h3',s.title),n('p','15题 · 四选一 · 提交后查看解析'),n('p','首次：'+score(h?.first)),n('p','最新完整练习：'+score(h?.latest)));if(h?.retry)card.append(n('p','最近错题重做：'+score(h.retry)));const b=button('开始练习',()=>task(()=>start(s)));b.dataset.start=s.id;card.append(b);if(h?.first?.results.some(q=>!q.correct))card.append(button('重做首次错题',()=>task(()=>start(s,h.first))));grid.append(card)}$('sets').append(section)}}
async function start(s,original=null,assigned=false){assignedMode=assigned&&!original;active=s;mode=original?'retry':'full';base=original;runId=crypto.randomUUID();answers={};pool=original?s.items.filter(q=>original.results.some(x=>x.id===q.id&&!x.correct)):s.items;if(!pool.length)return;
 $('sync-warning').textContent='';
 if(!preview&&mode==='full')await request('p5-start',{run_id:runId,exercise_id:s.id,assigned:assignedMode});
 show('quiz');$('quiz-title').textContent=s.title+(mode==='retry'?' · 首次错题重做':'');$('quiz-note').textContent=mode==='retry'?'自主巩固单独保存，不改变首次成绩或已结束功课状态。':'请完成全部15题后统一提交，作答期间不显示正确答案。';$('questions').replaceChildren();
 for(const [i,q]of pool.entries()){const f=n('fieldset');f.append(n('legend',`第${i+1}题`),n('p',q.prompt));q.options.forEach((o,j)=>{const l=n('label'),input=n('input');input.type='radio';input.name=q.id;input.value=j;input.onchange=()=>answers[q.id]=j;l.append(input,n('span',`${'ABCD'[j]}. ${o}`));f.append(l)});$('questions').append(f)}$('quiz-title').focus()}
function explain(results){$('explanations').replaceChildren();for(const [i,r]of results.entries()){const q=active.items.find(q=>q.id===r.id),box=n('article');box.className='card';box.append(n('h3',`第${active.items.indexOf(q)+1}题 · ${r.correct?'正确':'需巩固'}`),n('p',q.prompt));const opts=n('ol');opts.type='A';q.options.forEach(o=>opts.append(n('li',o)));box.append(opts,n('p',`你的答案：${'ABCD'[r.answer]}；正确答案：${'ABCD'[q.answer]}`),n('p',q.explanation),n('p',`考点：${q.skill}｜难度：${q.difficulty}`));if(q.source.length)box.append(n('p','词语来源：'+q.source.map(x=>`${x.lesson}·${x.section}·${x.entry}`).join('；')));$('explanations').append(box)}}
$('quiz-form').onsubmit=e=>{e.preventDefault();if(pool.some(q=>!Number.isInteger(answers[q.id]))){$('status').textContent='请完成全部题目后再提交。';return}task(async()=>{
 const items=pool.map(q=>({id:q.id,answer:answers[q.id]}));let saved;
 if(preview)saved={results:pool.map(q=>({id:q.id,answer:answers[q.id],correct:answers[q.id]===q.answer}))};
 else{const r=await request(mode==='retry'?'p5-retry':'p5-finish',{run_id:runId,retry_id:runId,exercise_id:active.id,base_run_id:base?.id,assigned:assignedMode,items});saved=mode==='retry'?r.retry:r.run;try{await refresh()}catch{$('sync-warning').textContent='成绩已保存，首次记录暂未重新读取，请返回专区刷新。'}}
 show('result');$('result-title').textContent=active.title+(mode==='retry'?' · 错题重做':'');$('score').textContent=(preview?'预览成绩：':mode==='retry'?'本次错题重做：':'本次完整练习：')+score(saved);const first=history.find(x=>x.exercise_id===active.id)?.first;$('first-score').textContent=preview?'教师预览不保存成绩。':'首次正式成绩：'+score(first)+(first?' · '+time(first.submitted_at):'');explain(saved.results);$('redo').hidden=preview||!first?.results.some(x=>!x.correct);$('redo').onclick=()=>task(()=>start(active,first));$('result-title').focus();
 })};
$('back').onclick=()=>{if(confirm('返回会放弃本次未提交答案，确定返回？'))home()};$('return').onclick=home;
window.zxP5Open=id=>{if(!ready){pendingOpen=id;return}const s=sets.find(x=>x.id===id);if(s)task(()=>start(s,null,true));else $('status').textContent='找不到这份练习，请联系老师。'};
$('reload').onclick=()=>task(async()=>{await refresh();home()});
task(async()=>{await refresh();home()}).then(()=>{if(pendingOpen){const id=pendingOpen;pendingOpen=null;window.zxP5Open(id)}});
})();
