'use strict';
const $=id=>document.getElementById(id),API='https://cogvtrcoifppwkzzhect.supabase.co';
let options=null,records=[],isAdmin=false,working=false,publishId=null,publishKey=null;

// Shared calendar arithmetic uses Singapore dates, independent of the device timezone.
function homeworkDay(v,n){const d=new Date(v+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function homeworkLocal(v){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(v));const f=t=>p.find(x=>x.type===t).value;return `${f('year')}-${f('month')}-${f('day')}T${f('hour')}:${f('minute')}`}
let publishManualDue=false;
function defaultPublishDue(){if(!publishManualDue&&$('open-date').value){$('due').value=homeworkDay($('open-date').value,6);$('due-time').value='23:59'}}
function resetPublishDates(){const now=homeworkLocal(new Date());publishManualDue=false;$('open-date').value=now.slice(0,10);$('open-time').value=now.slice(11);defaultPublishDue()}
$('open-date').onchange=defaultPublishDue;
for(const id of ['due','due-time'])for(const event of ['input','change'])$(id).addEventListener(event,()=>{publishManualDue=true});

const labels={pending:'待完成',overdue:'已逾期',completed:'已完成',late:'迟交',upcoming:'即将开放',ended:'已结束'};
function session(){try{return JSON.parse(sessionStorage.getItem('zx_session')||'null')}catch{return null}}
async function call(op,body={}){
 let s=session();if(!s)throw Error('请先返回课程页面登录。');
 if(s.type==='admin'&&s.expires_at<Date.now()/1000+60){
  const r=await fetch(API+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:'sb_publishable_WrDX6Nm1mBMmRseM9XskBA_wzZyfbS7','Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
  if(!r.ok)throw Error('登录已过期，请返回后台重新登录。');s={...await r.json(),type:'admin'};sessionStorage.setItem('zx_session',JSON.stringify(s));
 }
 const headers={'Content-Type':'application/json'};
 if(s.type==='student')headers['x-student-token']=s.token;else headers.Authorization='Bearer '+s.access_token;
 const r=await fetch(API+'/functions/v1/zhixu-reports',{method:'POST',headers,body:JSON.stringify({op,...body})});
 const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'操作未完成，请稍后重试。'),{status:r.status});return data;
}
async function busy(fn){if(working)return;working=true;document.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);try{await fn()}catch(e){$('status').textContent=e.message}finally{working=false;document.querySelectorAll('button,input,select').forEach(e=>e.disabled=false)}}
function addOption(select,value,text){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o)}
function check(container,value,text){const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.value=value;l.append(i,document.createTextNode(text));container.append(l)}
function renderOptions(){
 const course=$('course').value;$('student-options').replaceChildren();$('exercise-options').replaceChildren();
 options.students.filter(s=>course==='essay-training'||s.courses.includes(course)).forEach(s=>check($('student-options'),s.id,`${s.number}号 ${s.name}`));
 const ex=options.exercises.filter(e=>e.courses.includes(course)).sort((a,b)=>a.title.localeCompare(b.title,'zh-Hans',{numeric:true}));
 ex.forEach(e=>check($('exercise-options'),JSON.stringify({asset_id:e.asset_id,exercise_id:e.exercise_id}),e.title));
}
const monthOf=v=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit'}).formatToParts(new Date(v));return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value};
const dateTime=v=>new Intl.DateTimeFormat('zh-SG',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(v));
const date=v=>new Intl.DateTimeFormat('zh-SG',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
function render(){
 const sid=$('filter-student').value,filter=$('filter-status').value,view=$('filter-view').value,month=$('filter-month').value;
 const list=records.filter(r=>(!sid||r.student_id===sid)&&(!month||monthOf(r.due_at)===month)&&(view==='all'||(view==='active'?!r.submitted_at&&!r.closed_at&&!['upcoming','ended'].includes(r.status):view==='upcoming'?r.status==='upcoming'&&!r.closed_at:!!r.submitted_at||!!r.closed_at||r.status==='ended'))&&(!filter||(filter==='incomplete'?!r.submitted_at:filter==='completed'?!!r.submitted_at:r.status===filter)));
 const completed=list.filter(r=>r.submitted_at).length,overdue=list.filter(r=>r.status==='overdue').length,late=list.filter(r=>r.status==='late').length;
 $('summary').textContent=`当前显示 ${list.length} 项：已完成 ${completed}，未完成 ${list.length-completed}（逾期 ${overdue}），迟交 ${late}。`;
 list.sort((a,b)=>Date.parse(a.status==='upcoming'?a.opens_at:a.due_at)-Date.parse(b.status==='upcoming'?b.opens_at:b.due_at));
 $('rows').replaceChildren();for(const r of list){const tr=document.createElement('tr');
 for(const t of [...(isAdmin?[r.student_name]:[]),r.title+'／'+r.exercise_title,(r.opens_at?'开放 '+dateTime(r.opens_at)+'／截止 ':'')+dateTime(r.due_at),(r.closed_at?'已结束 · '+(r.submitted_at?labels[r.status]:'未交'):labels[r.status])+(r.submitted_at?' · '+dateTime(r.submitted_at)+(r.total?' · '+r.correct+'/'+r.total+'题正确':''):'')]){const td=document.createElement('td');td.textContent=t;tr.append(td)}
 const action=document.createElement('td');
 if(isAdmin){if(options?.schedule_enabled!==false&&r.opens_at&&!r.closed_at&&Date.parse(r.server_at)<=Date.parse(r.due_at)){const edit=document.createElement('button');edit.type='button';edit.textContent='修改日期';edit.onclick=()=>window.zxEditSchedule?.(r);action.append(edit)}if(!r.closed_at){const end=document.createElement('button');end.type='button';end.textContent='结束整份功课';end.onclick=()=>{if(confirm('结束“'+r.title+'”？所有获分配学生将不再需要补交，已交和未交记录均保留。'))busy(async()=>{await call('homework-close',{batch_id:r.batch_id});await reload();$('status').textContent='功课已结束，记录已保留在历史功课中。'})};action.append(end);const one=document.createElement('button');one.type='button';one.textContent='结束该学生功课';one.onclick=()=>{if(confirm('结束'+r.student_name+'的这份功课？仅这名学生不再补交，已交及未交记录均保留。'))busy(async()=>{await call('homework-close-student',{batch_id:r.batch_id,student_id:r.student_id});await reload();$('status').textContent='已结束该学生功课；记录保留，其他学生不受影响。'})};action.prepend(one)}const b=document.createElement('button');b.textContent='撤销整份功课';b.type='button';b.onclick=()=>{if(confirm('撤销“'+r.title+'”？这份功课将从所有获分配学生的列表及新统计中移除，答题记录保留。'))busy(async()=>{await call('homework-cancel',{batch_id:r.batch_id});await reload();$('status').textContent='功课已撤销。'})};action.append(b)}
 else if(r.submitted_at){const a=document.createElement('a');a.textContent='自主练习';a.href='portal.html?'+new URLSearchParams({course:r.asset_id,exercise:r.exercise_id});action.append(a)}
 else if(!r.closed_at&&!['upcoming','ended'].includes(r.status)){const a=document.createElement('a');a.textContent='开始练习';a.href='portal.html?'+new URLSearchParams({course:r.asset_id,exercise:r.exercise_id,homework:r.batch_id});action.append(a)}
 if(r.wrong_items?.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='错题记录';details.append(summary);r.wrong_items.forEach(q=>{const p=document.createElement('p');p.textContent=(q.prompt||q.id)+' · 考点：'+q.skill+' · 作答：'+JSON.stringify(q.answer)+' · 答案：'+JSON.stringify(q.expected);details.append(p)});action.append(details)}
 tr.append(action);$('rows').append(tr)}
 if(!list.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=isAdmin?5:4;td.textContent='暂无符合条件的功课。';tr.append(td);$('rows').append(tr)}
}
async function reload(){records=await call('homework-list');render()}
$('filter-view').onchange=()=>{if($('filter-view').value==='active')$('filter-month').value='';render()};$('filter-month').onchange=render;$('all-months').onclick=()=>{$('filter-month').value='';render()};
$('course').onchange=renderOptions;$('filter-student').onchange=render;$('filter-status').onchange=render;
$('select-all').onclick=()=>{const inputs=[...$('student-options').querySelectorAll('input')],checked=!inputs.every(i=>i.checked);inputs.forEach(i=>i.checked=checked)};
$('reload').onclick=()=>busy(async()=>{await reload();$('status').textContent='已更新完成情况。'});
$('publish-form').onsubmit=e=>{e.preventDefault();busy(async()=>{
 const student_ids=[...$('student-options').querySelectorAll('input:checked')].map(i=>i.value),exercises=[...$('exercise-options').querySelectorAll('input:checked')].map(i=>JSON.parse(i.value));
 if(!student_ids.length||!exercises.length)throw Error('请至少选择一名学生和一套练习。');
 // Retain the request ID on a failed network response so retries cannot duplicate publication.
 const assignment={title:$('title').value.trim(),exercises,opens_local:$('open-date').value+'T'+$('open-time').value,due_local:$('due').value+'T'+$('due-time').value};
 if(!assignment.title||!$('open-date').value||!$('open-time').value||!$('due').value||!$('due-time').value)throw Error('请填写功课名称及开放、截止时间。');
 if(assignment.due_local<assignment.opens_local)throw Error('截止时间不能早于开放时间。');
 const key=JSON.stringify({student_ids,assignment});
 if(key!==publishKey){publishId=crypto.randomUUID();publishKey=key;}
 await call('homework-schedule',{schedule_id:publishId,student_ids,assignments:[{batch_id:publishId,...assignment}]});publishId=null;publishKey=null;
 $('publish-form').reset();resetPublishDates();renderOptions();
 $('status').textContent=`已为 ${student_ids.length} 名学生发布 ${exercises.length} 套练习。`;
 try{await reload()}catch{$('status').textContent+=' 功课已保存，列表暂未更新，请刷新查看。';}
})};
busy(async()=>{
 const s=session();if(!s)throw Error('请先返回课程页面登录。');isAdmin=s.type==='admin';$('heading').textContent=isAdmin?'功课管理':'我的功课';$('publish-form').hidden=!isAdmin;$('filter-student').parentElement.hidden=!isAdmin;$('student-th').hidden=!isAdmin;
 $('filter-view').value=isAdmin?'all':'active';$('filter-month').value=isAdmin?monthOf(new Date()):'';
 if(isAdmin){options=await call('homework-options');options.courses.forEach(c=>addOption($('course'),c.id,c.title));options.students.forEach(s=>addOption($('filter-student'),s.id,`${s.number}号 ${s.name}`));renderOptions();window.dispatchEvent(new Event('zx-homework-options'));
  resetPublishDates();
 }await reload();$('status').textContent=isAdmin?'日期已按新加坡时间填写，可调整后发布。':'点击开始练习，完整提交后会自动更新功课状态。';
});

// Refresh server-derived states on return to the page and while it remains open.
function refreshHomework(){if(!working&&session())reload().catch(()=>{$('status').textContent='状态暂未更新，请检查网络后刷新。'})}
window.addEventListener('pageshow',e=>{if(e.persisted)refreshHomework()});document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshHomework()});setInterval(()=>{if(!document.hidden)refreshHomework()},60000);
