// Extends the existing homework page; all writes still pass through its authenticated API.
(()=>{
 let ready=false,rows=[],preview=null,pending=null;
 const key='zx_schedule_pending_v1',day=(v,n)=>{const d=new Date(v+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const local=v=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(v));const f=t=>p.find(x=>x.type===t).value;return `${f('year')}-${f('month')}-${f('day')}T${f('hour')}:${f('minute')}`};
 const owner=()=>session()?.user?.id||null;
 function remember(){sessionStorage.setItem(key,JSON.stringify({owner:owner(),body:pending}))}
 function invalidate(){preview=null;$('schedule-preview').hidden=true}
 function selectedStudents(){return [...$('schedule-students').querySelectorAll('input:checked')].map(x=>x.value)}
 function defaultDue(r){if(!r.manualDue&&r.openDate.value){r.dueDate.value=day(r.openDate.value,6);r.dueTime.value='23:59'}}
 function fillExercises(r){r.exercise.replaceChildren();const course=$('schedule-course').value;
  options.exercises.filter(e=>e.courses.includes(course)).sort((a,b)=>a.title.localeCompare(b.title,'zh-Hans',{numeric:true})).forEach(e=>addOption(r.exercise,JSON.stringify({asset_id:e.asset_id,exercise_id:e.exercise_id}),e.title));r.exercise.selectedIndex=-1;
 }
 function input(type,value,label,parent){const l=document.createElement('label'),e=document.createElement('input');e.type=type;e.value=value;e.required=true;l.append(document.createTextNode(label),e);parent.append(l);return e}
 function addRow(){if(pending)return;if(!$('schedule-first').value){$('status').textContent='请选择第一份开放日期。';return}if(rows.length>=30){$('status').textContent='每次最多安排30份功课。';return}
  const box=document.createElement('fieldset'),legend=document.createElement('legend');box.append(legend);
  const r={id:crypto.randomUUID(),box,legend,manualDue:false};
  r.title=input('text','考前复习功课 '+(rows.length+1),'功课名称',box);r.title.maxLength=100;
  const label=document.createElement('label');label.textContent='练习套数（可多选）';r.exercise=document.createElement('select');r.exercise.multiple=true;r.exercise.size=4;r.exercise.required=true;label.append(r.exercise);box.append(label);fillExercises(r);
  const dates=document.createElement('div');dates.className='grid';box.append(dates);
  r.openDate=input('date',day($('schedule-first').value,rows.length*7),'开放日期',dates);r.openTime=input('time','00:00','开放时间',dates);
  r.dueDate=input('date',day(r.openDate.value,6),'截止日期',dates);r.dueTime=input('time','23:59','截止时间',dates);
  r.openDate.onchange=()=>{defaultDue(r);invalidate()};r.dueDate.oninput=r.dueTime.oninput=()=>{r.manualDue=true;invalidate()};
  const reset=document.createElement('button');reset.type='button';reset.textContent='恢复默认7天';reset.onclick=()=>{if(pending)return;r.manualDue=false;defaultDue(r);invalidate()};
  const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='移除这份';remove.onclick=()=>{if(pending)return;rows=rows.filter(x=>x!==r);box.remove();renumber();invalidate()};box.append(reset,document.createTextNode(' '),remove);
  rows.push(r);$('schedule-entries').append(box);renumber();invalidate();
 }
 function renumber(){rows.forEach((r,i)=>r.legend.textContent='第'+(i+1)+'份功课')}
 function arrange(){if(pending||!$('schedule-first').value)return;rows.forEach((r,i)=>{r.openDate.value=day($('schedule-first').value,i*7);r.openTime.value='00:00';defaultDue(r)});invalidate()}
 function courseChanged(){if(pending)return;$('schedule-students').replaceChildren();options.students.filter(s=>$('schedule-course').value==='essay-training'||s.courses.includes($('schedule-course').value)).forEach(s=>check($('schedule-students'),s.id,`${s.number}号 ${s.name}`));rows.forEach(fillExercises);invalidate()}
 function body(){if(!rows.length)throw Error('请添加至少一份功课。');const student_ids=selectedStudents();if(!student_ids.length)throw Error('请选择学生。');
  const assignments=rows.map(r=>{const title=r.title.value.trim(),exercises=[...r.exercise.selectedOptions].map(x=>JSON.parse(x.value)),opens_local=r.openDate.value+'T'+r.openTime.value,due_local=r.dueDate.value+'T'+r.dueTime.value;
   if(!title||!exercises.length||!r.openDate.value||!r.dueDate.value||!r.openTime.value||!r.dueTime.value)throw Error('请填写每份功课名称、练习及日期时间。');if(due_local<opens_local)throw Error('截止时间不能早于开放时间。');return {batch_id:r.id,title,exercises,opens_local,due_local};});
  return {schedule_id:crypto.randomUUID(),student_ids,assignments};
 }
 function renderPreview(p){$('schedule-preview-rows').replaceChildren();p.assignments.forEach(a=>{const tr=document.createElement('tr');const titles=a.exercises.map(e=>options.exercises.find(x=>x.asset_id===e.asset_id&&x.exercise_id===e.exercise_id)?.title||e.exercise_id).join('、');for(const v of [a.title+'／'+titles,p.student_ids.length+'人',a.opens_local.replace('T',' '),a.due_local.replace('T',' ')]){const td=document.createElement('td');td.textContent=v;tr.append(td)}$('schedule-preview-rows').append(tr)});$('schedule-preview').hidden=false}
 function controls(){document.querySelectorAll('#schedule-form input,#schedule-form select,#schedule-add,#schedule-arrange,#schedule-preview-button').forEach(e=>e.disabled=!!pending);$('schedule-check').hidden=!pending;$('schedule-confirm').textContent=pending?'安全重试原安排':'确认批量安排';$('schedule-discard').hidden=!pending}
 async function saved(result){pending=null;sessionStorage.removeItem(key);invalidate();rows.forEach(r=>r.box.remove());rows=[];
  $('schedule-result').textContent='已全部保存 '+result.assignments.length+' 份功课。\n'+result.assignments.map(a=>`${a.title}：${local(a.opens_at).replace('T',' ')} 至 ${local(a.due_at).replace('T',' ')}`).join('\n');$('filter-month').value='';$('filter-view').value='all';try{await reload();$('status').textContent='安排已保存；教师退出或关闭电脑后仍会按新加坡时间自动开放、截止。'}catch{$('status').textContent='安排已全部保存，列表暂未刷新，请稍后刷新。'}controls();
 }
 async function send(){if(!pending){if(!preview)throw Error('请先预览安排。');pending=preview;remember()}controls();
  try{await saved(await call('homework-schedule',pending))}catch(e){$('status').textContent='保存结果待确认：'+e.message+' 请检查保存结果或安全重试原安排，不要重新建立一批。';controls()}
 }
 async function checkResult(discard=false){if(!pending)return;const r=await call('homework-schedule-status',{schedule_id:pending.schedule_id});if(r.saved){await saved(r);return}
  if(discard){pending=null;sessionStorage.removeItem(key);invalidate();$('status').textContent='服务器确认原安排尚未保存。已解除锁定，可修改后重新预览。'}else $('status').textContent='服务器确认暂未保存；可安全重试原安排，或解除锁定后修改。';controls();
 }
 async function action(fn){await busy(fn);controls()}
 function init(){if(ready||!options||!isAdmin||options.schedule_enabled===false)return;ready=true;$('schedule-panel').hidden=false;
  options.courses.forEach(c=>addOption($('schedule-course'),c.id,c.title));$('schedule-first').value=local(new Date()).slice(0,10);courseChanged();
  try{const p=JSON.parse(sessionStorage.getItem(key)||'null');if(p&&p.owner===owner())pending=p.body}catch{}
  $('schedule-add').onclick=addRow;$('schedule-arrange').onclick=arrange;$('schedule-first').onchange=arrange;$('schedule-course').onchange=courseChanged;
  $('schedule-select-all').onclick=()=>{if(pending)return;const inputs=[...$('schedule-students').querySelectorAll('input')],v=!inputs.every(i=>i.checked);inputs.forEach(i=>i.checked=v);invalidate()};
  $('schedule-form').addEventListener('input',invalidate);$('schedule-form').addEventListener('change',invalidate);
  $('schedule-preview-button').onclick=()=>action(async()=>{if(pending)return;preview=body();renderPreview(preview)});
  $('schedule-confirm').onclick=()=>action(send);$('schedule-check').onclick=()=>action(()=>checkResult());$('schedule-discard').onclick=()=>action(()=>checkResult(true));
  if(pending){renderPreview(pending);$('status').textContent='发现上次未确认的保存请求，请检查保存结果。'}else addRow();controls();
 }
 window.zxEditSchedule=r=>{if(!isAdmin||working)return;const panel=$('schedule-edit');panel.hidden=false;$('schedule-edit-name').textContent=r.title;
  const o=local(r.opens_at),d=local(r.due_at);$('edit-open-date').value=o.slice(0,10);$('edit-open-time').value=o.slice(11);$('edit-due-date').value=d.slice(0,10);$('edit-due-time').value=d.slice(11);
  const opened=Date.parse(r.server_at)>=Date.parse(r.opens_at);$('edit-open-date').disabled=$('edit-open-time').disabled=opened;let manual=true;
  const recalc=()=>{if(!manual)$('edit-due-date').value=day($('edit-open-date').value,6)};$('edit-open-date').onchange=recalc;
  $('edit-default').onclick=()=>{manual=false;$('edit-due-time').value='23:59';recalc()};$('edit-due-date').oninput=$('edit-due-time').oninput=()=>manual=true;
  $('schedule-edit-form').onsubmit=e=>{e.preventDefault();action(async()=>{await call('homework-reschedule',{batch_id:r.batch_id,opens_local:$('edit-open-date').value+'T'+$('edit-open-time').value,due_local:$('edit-due-date').value+'T'+$('edit-due-time').value});panel.hidden=true;await reload();$('status').textContent='日期已更新，已交成绩与历史记录保持不变。'})};$('edit-cancel').onclick=()=>panel.hidden=true;panel.scrollIntoView({behavior:'smooth',block:'start'});
 };
 window.addEventListener('zx-homework-options',init);init();
})();
