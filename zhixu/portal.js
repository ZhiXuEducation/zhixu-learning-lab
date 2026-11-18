'use strict';
const API='https://cogvtrcoifppwkzzhect.supabase.co';
const PUBLIC_KEY='sb_publishable_WrDX6Nm1mBMmRseM9XskBA_wzZyfbS7';
const $=id=>document.getElementById(id);
let session=null, allCourses=[], students=[];
try{session=JSON.parse(sessionStorage.getItem('zx_session')||'null');}catch{session=null;}
const editor=$('student-editor');
let restoring=null, openingCourse=false, lessonReturnView='workspace';
function showView(view){
 ['loading','login','workspace','holiday','lesson'].forEach(id=>$(id).hidden=id!==view);
}
function showLoading(text){$('loading-text').textContent=text;$('retry-session').hidden=true;showView('loading');}
function expired(error){return error.status===401 || (error.status===403 && error.op==='me');}
function showLogin(){ $('lesson-frame').srcdoc='';showView('login'); }
let holidayPeriod=null, holidayTrack=null, holidayAccess=false, holidayAdmin=false, holidayOnly=false;
let holidayGrants=[], holidayServerAt=0, holidayReceivedAt=0, holidayCheckRunning=false;
function courseUrl(assetId,exerciseId,homeworkId){
 // Avoid URL parsing of sandboxed/about:srcdoc locations (Safari throws SyntaxError).
 const url=new URL('https://zhixueducation.github.io/zhixu-learning-lab/zhixu/portal.html');
 for(const [key,value] of Object.entries({course:assetId,exercise:exerciseId,homework:homeworkId,holiday:holidayAccess&&(lessonReturnView==='holiday'||!$('holiday').hidden)?holidayPeriod?.id||'1':null,track:holidayTrack?.id})){
  if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);
 }
 try{history.replaceState(null,'',url.pathname+url.search+url.hash);}catch(e){console.warn('Cannot update course URL',e);}
}
function enterSession(){
 if(restoring)return restoring;
 showLoading('正在确认登录状态…');message('');
 restoring=showWorkspace().catch(e=>{
  if(expired(e)||!session){saveSession(null);showLogin();}
  else{showLoading('暂时无法连接，请检查网络后重试。');$('retry-session').hidden=false;}
  message(e.message,true);
 }).finally(()=>{restoring=null;});
 return restoring;
}
function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';}
function saveSession(value){session=value;if(value)sessionStorage.setItem('zx_session',JSON.stringify(value));else sessionStorage.removeItem('zx_session');}
async function authRequest(path,body){
 const response=await fetch(`${API}/auth/v1/${path}`,{method:'POST',headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw Object.assign(Error('邮箱或密码不正确，或登录暂时不可用。'),{status:response.status});return result;
}
async function request(op,body={}){
 if(session?.type==='admin' && session.expires_at<Date.now()/1000+60){
  try{const fresh=await authRequest('token?grant_type=refresh_token',{refresh_token:session.refresh_token});saveSession({...fresh,type:'admin',expires_at:fresh.expires_at||Date.now()/1000+fresh.expires_in});}
  catch(e){if(e.status===400||e.status===401){saveSession(null);throw Object.assign(Error('登录已过期，请重新登录。'),{status:401});}throw e;}
 }
 const headers={'Content-Type':'application/json',apikey:PUBLIC_KEY};
 if(session?.type==='student')headers['x-student-token']=session.token;
 if(session?.type==='admin')headers.Authorization=`Bearer ${session.access_token}`;
 const response=await fetch(`${API}/functions/v1/zhixu-students`,{method:'POST',headers,body:JSON.stringify({op,...body})});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'操作失败，请稍后重试。'),{status:response.status,op});return result;
}
async function busy(form,fn){const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);message('正在处理…');try{await fn();}catch(e){message(e.message,true);}finally{buttons.forEach(b=>b.disabled=false);}}
function button(label,action){const b=document.createElement('button');b.textContent=label;b.onclick=()=>busy(b.parentElement,action);return b;}
function hidePin(){ $('new-code').textContent='';$('new-pin').textContent='';$('credentials').hidden=true; }
const holidayDate=new Intl.DateTimeFormat('zh-SG',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const holidayTime=value=>value?holidayDate.format(new Date(value)):'—';
function holidayNow(){return holidayServerAt+performance.now()-holidayReceivedAt;}
function activeHolidayGrant(period){
 return holidayGrants.find(g=>g.period===period&&g.revoked_at===null&&(g.legacy||Date.parse(g.expires_at)>holidayNow()));
}
function mayEnterHoliday(period){return holidayAdmin||Boolean(activeHolidayGrant(period.id));}
async function refreshHolidayGrants(){
 const data=await request('holiday-status');
 holidayServerAt=Date.parse(data.server_at);holidayReceivedAt=performance.now();holidayGrants=data.grants;
}
function holidayAccessEnded(){
 if(holidayAdmin||!holidayPeriod||mayEnterHoliday(holidayPeriod)||(!session))return;
 $('lesson-frame').srcdoc='';window.zxHolidayPeriod=null;window.zxHomeworkBatchId=null;
 holidayPeriod=null;holidayTrack=null;lessonReturnView='workspace';
 holidayAccess=holidayCatalog.some(mayEnterHoliday);
 $('holiday-section').hidden=!holidayAccess;
 if(holidayAccess)showHoliday();else{showView('workspace');courseUrl(null,null,null);}
 message('假期班学习权限已到期，请联系老师',true);
}
async function checkHolidaySession(){
 if(session?.type!=='student'||holidayCheckRunning||($('lesson').hidden&&$('holiday').hidden&&$('workspace').hidden))return;
 holidayAccessEnded();
 if(document.hidden)return;
 holidayCheckRunning=true;
 try{
  const was=holidayAccess;
  await refreshHolidayGrants();
  holidayAccessEnded();
  holidayAccess=holidayCatalog.some(mayEnterHoliday);
  $('holiday-section').hidden=!holidayAccess;
  if(!holidayAccess&&!$('holiday').hidden){showView('workspace');lessonReturnView='workspace';courseUrl(null,null,null);}
  if(was&&!holidayAccess)message('假期班学习权限已到期，请联系老师',true);
  else if(!$('holiday').hidden&&!holidayPeriod)showHoliday(null,null,false);
 }catch(e){if(expired(e)){saveSession(null);showLogin();}}
 finally{holidayCheckRunning=false;}
}
function courseOptions(selected=[]){
 $('course-options').replaceChildren();const grade=editor.elements.grade.value.toLowerCase();
 allCourses.filter(c=>(grade==='p6'?c.id.startsWith('p6-'):c.id.startsWith('s'))).forEach(c=>{
  const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name='course';input.value=c.id;input.checked=selected.includes(c.id);label.append(input,document.createTextNode(c.title));$('course-options').append(label);
 });
}
function resetEditor(){editor.reset();$('holiday-create').hidden=false;editor.elements.id.value='';$('editor-title').textContent='新增学生';$('active-label').hidden=true;courseOptions();}
function renderStudents(){
 $('students').replaceChildren();students.forEach(s=>{
  const row=document.createElement('tr');
  [s.student_number||'—',s.username||s.student_code,s.display_name,s.grade==='SECONDARY'?'中学':s.grade,s.courses.map(id=>allCourses.find(c=>c.id===id)?.title||id).join('、'),s.active?'启用':'停用'].forEach(value=>{const td=document.createElement('td');td.textContent=value;row.append(td);});
  const cell=document.createElement('td');cell.append(button('编辑',async()=>{hidePin();editor.elements.id.value=s.id;editor.elements.name.value=s.display_name;editor.elements.username.value=s.username||'';editor.elements.grade.value=s.grade;editor.elements.active.checked=s.active;$('active-label').hidden=false;$('editor-title').textContent='编辑学生';$('holiday-create').hidden=true;courseOptions(s.courses);editor.scrollIntoView({behavior:'smooth'});}));cell.append(document.createTextNode(' '),button('重设 PIN',async()=>{hidePin();const result=await request('reset-pin',{id:s.id});$('new-code').textContent=`英文账号：${result.username||result.code}`;$('new-pin').textContent=`新 PIN：${result.pin}`;$('credentials').hidden=false;message('PIN 已重设，原 PIN 和现有登录已失效。');}));cell.append(document.createTextNode(' '),button('假期班权限',()=>{openHolidayAdmin(s.id);}));row.append(cell);$('students').append(row);
 });
}

// Teacher dashboard uses existing homework-list records; no new database writes.
async function loadTeacherDashboard(){
 const note=$('dashboard-status');note.textContent='正在更新功课概况…';
 $('dash-students').textContent=String(students.filter(s=>s.active).length);
 try{
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+session.access_token};
  const response=await fetch(API+'/functions/v1/zhixu-reports',{method:'POST',headers,body:JSON.stringify({op:'homework-list'})});
  const records=await response.json();if(!response.ok||!Array.isArray(records))throw Error(records?.error||'功课数据暂时不可用');
  const now=Date.now();
  const active=records.filter(r=>!r.closed_at&&r.status!=='ended');
  const pending=active.filter(r=>!r.submitted_at&&r.status!=='upcoming');
  const overdue=pending.filter(r=>r.status==='overdue');
  const finished=records.filter(r=>r.submitted_at);
  const eligible=records.filter(r=>r.status!=='upcoming');
  $('dash-pending').textContent=String(pending.length);
  $('dash-rate').textContent=eligible.length?Math.round(finished.filter(r=>r.status!=='upcoming').length/eligible.length*100)+'%':'—';
  const alerts=$('dashboard-alerts');alerts.replaceChildren();
  const add=(label,href)=>{const a=document.createElement('a');a.className='dashboard-alert';a.href=href;a.textContent=label;alerts.append(a)};
  if(overdue.length)add(overdue.length+' 项功课已逾期 · 查看名单','homework.html');
  if(pending.length)add(pending.length+' 项功课尚未完成 · 查看功课','homework.html');
  const weak=finished.filter(r=>Number(r.total)>0&&Number(r.correct)/Number(r.total)<.6);
  if(weak.length)add(weak.length+' 次已交功课正确率低于 60% · 查看报告','reports.html');
  if(!alerts.children.length){const p=document.createElement('p');p.className='muted';p.textContent='目前没有待处理的功课提醒。';alerts.append(p)}
  note.textContent='依据现有功课记录统计 · 更新于 '+new Intl.DateTimeFormat('zh-SG',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit'}).format(new Date());
 }catch(e){$('dash-pending').textContent='—';$('dash-rate').textContent='—';$('dashboard-alerts').textContent='暂时无法读取功课概况，可从下方进入功课页面。';note.textContent='概况读取失败：'+e.message;}
}

function showHomeworkRetry(batchId,assetId,exerciseId){
 if(!batchId||batchId!==window.zxHomeworkBatchId||assetId!==window.zxActiveAssetId||exerciseId!==window.zxHomeworkExerciseId||$('lesson').hidden)return;
 const wrapper=$('homework-retry');
 wrapper.querySelector('a').href='portal.html?'+new URLSearchParams({course:assetId,exercise:exerciseId});
 wrapper.hidden=false;
}
async function openCourse(assetId,exerciseId=null,homeworkId=null){
 if(openingCourse)return;openingCourse=true;
 lessonReturnView=$('holiday').hidden?'workspace':'holiday';
 $('close-lesson').textContent=lessonReturnView==='holiday'?(holidayTrack?'← 返回'+holidayTrack.title:'← 返回假期班训练'):'← 返回课程列表';
 $('homework-retry').hidden=true;showLoading('正在打开课程…');message('');
 try{
 if(homeworkId){
  const response=await fetch(API+'/functions/v1/zhixu-reports',{method:'POST',headers:{'Content-Type':'application/json','x-student-token':session?.token||''},body:JSON.stringify({op:'homework-open',homework_batch_id:homeworkId,holiday_period:lessonReturnView==='holiday'?holidayPeriod?.id:undefined,asset_id:assetId,exercise_id:exerciseId})});
  const check=await response.json();if(!response.ok)throw Object.assign(Error(check.error||'无法打开这份功课。'),{status:response.status,op:'homework-open'});
 }
 window.zxHomeworkBatchId=homeworkId;window.zxHomeworkExerciseId=exerciseId;
 window.zxHolidayPeriod=lessonReturnView==='holiday'?holidayPeriod?.id||null:null;
 const result=await request('content',{asset_id:assetId,holiday_period:window.zxHolidayPeriod});
 if(lessonReturnView==='holiday'&&holidayPeriod&&!mayEnterHoliday(holidayPeriod))throw Error('假期班学习权限已到期，请联系老师');
 window.zxActiveAssetId=assetId;
 let html=result.html;
 if(assetId==='p5-review'){
  // Pass the portal's HTTP(S) origin explicitly to the srcdoc lesson.
  const portalOrigin=JSON.stringify(location.origin);
  html=html.replace(/<a\b[^>]*>← 返回小学普通华文<\/a>/,'')
   .replace('async function start(s,original=null,assigned=false){', "async function start(s,original=null,assigned=false){if(!ready)throw Error('请先点击「刷新学习记录」，连接成功后再开始练习。');")
   .replace("task(async()=>{await refresh();home()}).then(", "home();task(async()=>{await refresh();home()}).then(")
   .replace("e.origin!==location.origin||e.data?.type!=='zx-p5-response'", `e.origin!==${portalOrigin}||e.data?.type!=='zx-p5-response'`)
   .replace("parent.postMessage({type:'zx-p5-request',id,op,...body},location.origin)", `parent.postMessage({type:'zx-p5-request',id,op,...body},${portalOrigin})`);
 }
 if(exerciseId){
  const id=JSON.stringify(exerciseId).replace(/</g,'\\u003c');
  const launch=`<script>window.addEventListener('load',()=>{try{const id=${id};
   if(typeof COURSE!=='undefined'){const s=COURSE.sets.find(s=>String(s.id)===id);if(!s)throw Error();start(s);}
   else if(typeof bank!=='undefined'&&Array.isArray(bank)){const s=bank.find(s=>String(s.id)===id);if(!s)throw Error();start(s);}
   else if(id.startsWith('p5-review-')&&typeof window.zxP5Open==='function'){window.zxP5Open(id);}
   else if(id.startsWith('psle-rev-')&&typeof window.zxRevisionOpen==='function'){window.zxRevisionOpen(id);}
   else if(typeof BANK!=='undefined'){const s=BANK.sets.find(s=>String(s.id)===id);if(!s)throw Error();start(s.id,allGroups.filter(g=>g.id.startsWith(s.id+'-')),s.title);}
   else if(document.querySelector('[data-start="'+CSS.escape(id)+'"]'))document.querySelector('[data-start="'+CSS.escape(id)+'"]').click();
   else if(id==='all'&&document.getElementById('mode')){document.getElementById('mode').value='all';start();}
   else throw Error();
  }catch{const p=document.createElement('p');p.textContent='请在下方选择老师布置的练习套数。';p.setAttribute('role','status');document.body.prepend(p);}});</script>`;
  html=html.replace('</body>',launch+'</body>');
 }
 $('lesson-frame').hidden=false;$('lesson-frame').srcdoc=html;showView('lesson');message('');courseUrl(assetId,exerciseId,homeworkId);
 }catch(e){
  if(expired(e)){saveSession(null);showLogin();}else showView(lessonReturnView);
  throw e;
 }finally{openingCourse=false;}
}
function showHoliday(period=null,track=null,updateUrl=true){
 if(!holidayAccess||period&&!mayEnterHoliday(period))return;
 holidayPeriod=period;holidayTrack=track;
 showView('holiday');
 $('holiday-title').textContent=track?track.title:period?period.title:'假期班训练';
 $('holiday-title').tabIndex=-1;
 $('holiday-homework').hidden=holidayAdmin||Boolean(period);
 $('close-holiday').hidden=Boolean(period)||holidayOnly;
 const up=$('holiday-up');up.hidden=!period;
 up.textContent=track?'← 返回假期专区':'← 返回假期班首页';
 const list=$('holiday-courses');list.replaceChildren();
 function card(title,label,action,description){
  const node=document.createElement('section');node.className='card';
  const heading=document.createElement('h3');heading.textContent=title;node.append(heading);
  if(description){const note=document.createElement('p');note.className='muted';note.textContent=description;node.append(note);}
  node.append(button(label,action));list.append(node);
 }
 if(!period){
  for(const item of holidayCatalog.filter(mayEnterHoliday)){
   const grant=holidayAdmin?null:activeHolidayGrant(item.id);
   const expiry=grant?.legacy?'旧授权 · 有效期待老师确认':grant?'有效至 '+holidayTime(grant.expires_at)+'（新加坡时间）':'';
   card(item.title,'进入专区',async()=>{
    if(!holidayAdmin)await refreshHolidayGrants();
    if(!mayEnterHoliday(item)){showHoliday(null,null,false);throw Error('假期班学习权限已到期，请联系老师');}
    showHoliday(item);
   },expiry);
  }
 }else if(!track){
  holidayTracks.forEach(item=>card(item.title,'进入专区',()=>showHoliday(period,item)));
 }else if(period.assets[track.id]){
  card(track.unit,'进入练习',()=>openCourse(period.assets[track.id]));
 }else{
  const empty=document.createElement('p');empty.className='muted';empty.textContent='练习筹备中';list.append(empty);
 }
 if(updateUrl){lessonReturnView='holiday';courseUrl(null,null,null);$('holiday-title').focus();}
}
async function showWorkspace(){
 const me=await request('me');allCourses=await request('courses');
 $('admin').hidden=me.role!=='admin';$('greeting').textContent=me.role==='admin'?'管理后台':`${me.name}，欢迎回来`;
 $('courses').replaceChildren();$('holiday-courses').replaceChildren();
 const isAdmin=me.role==='admin';
 holidayAdmin=isAdmin;
 await refreshHolidayGrants();
 const hasHoliday=holidayCatalog.some(mayEnterHoliday);
 const essay=allCourses.find(c=>c.id==='essay-training');
 const regular=allCourses.filter(c=>!['holiday-training','p5-review','essay-training'].includes(c.id));
 holidayOnly=!isAdmin&&hasHoliday&&!regular.length;
 const hasPsle=allCourses.some(c=>c.id==='p6-standard'||c.id==='p6-higher');
 function courseCard(c,label){
  const card=document.createElement('section');card.className='card';
  const heading=document.createElement('h3');heading.textContent=label||(c.id==='essay-training'?'作文审题训练':c.title);card.append(heading);
  if(c.id==='p6-standard'){const a=document.createElement('a');a.href='primary-standard.html';a.className='btn';a.textContent='进入课程';card.append(a);}
  else card.append(button('进入课程',()=>openCourse(c.id)));
  return card;
 }
 holidayAccess=hasHoliday;
 holidayAdmin=isAdmin;
 if(!hasHoliday&&essay){
  regular.push(essay);
 }
 $('close-holiday').hidden=holidayOnly;
 $('holiday-homework').hidden=isAdmin;
 if(hasPsle){const card=document.createElement('section');card.className='card';const title=document.createElement('h3');title.textContent='PSLE 冲刺';card.append(title);card.append(button('进入 PSLE 冲刺',()=>openCourse('psle-review')));$('psle-courses').replaceChildren(card);}
 else $('psle-courses').replaceChildren();
 $('psle-section').hidden=!hasPsle;
 regular.forEach(c=>$('courses').append(courseCard(c)));
 $('holiday-section').hidden=!hasHoliday;
 $('regular-section').hidden=!regular.length;
 $('student-homework').hidden=isAdmin;
 if(!allCourses.length)$('courses').textContent='暂未获授权课程，请联系老师。';
 if(me.role==='admin'){students=await request('list');renderStudents();resetEditor();renderHolidayAdmin();await loadTeacherDashboard();}
 message('');
 const query=new URLSearchParams(location.search),asset=query.get('course'),exercise=query.get('exercise');
 holidayPeriod=null;holidayTrack=null;lessonReturnView='workspace';
 const requestedHoliday=query.get('holiday');
 const period=holidayCatalog.find(item=>item.id===requestedHoliday&&mayEnterHoliday(item));
 const track=period?holidayTracks.find(item=>item.id===query.get('track')):null;
 const legacyTrack=hasHoliday&&!requestedHoliday&&mayEnterHoliday(holidayCatalog[0])?holidayTracks.find(item=>asset&&holidayCatalog[0].assets[item.id]===asset):null;
 if(hasHoliday&&(holidayOnly||requestedHoliday||legacyTrack)){
  showHoliday(period|| (legacyTrack?holidayCatalog[0]:null),track||legacyTrack,false);
 }else showView('workspace');
 if(asset&&(!requestedHoliday||period&&track&&period.assets[track.id]===asset)){
  try{await openCourse(asset,exercise,query.get('homework'));}catch(e){message(e.message,true);}
 }else if(requestedHoliday&&requestedHoliday!=='1'&&!period){
  message('假期班学习权限已到期，请联系老师',true);
 }
}
$('student-login').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;busy(f,async()=>{
 saveSession(null);const result=await request('login',{code:f.elements.code.value,pin:f.elements.pin.value});f.elements.pin.value='';saveSession({type:'student',token:result.token});await enterSession();
 }).finally(()=>{f.elements.pin.value='';});};
$('admin-login').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;busy(f,async()=>{
 const result=await authRequest('token?grant_type=password',{email:f.elements.email.value,password:f.elements.password.value});f.elements.password.value='';saveSession({...result,type:'admin',expires_at:result.expires_at||Date.now()/1000+result.expires_in});await enterSession();
 }).finally(()=>{f.elements.password.value='';});};
editor.elements.grade.onchange=()=>courseOptions();
editor.onsubmit=e=>{e.preventDefault();busy(editor,async()=>{
 hidePin();const id=editor.elements.id.value;const payload={name:editor.elements.name.value.trim(),username:editor.elements.username.value.trim(),grade:editor.elements.grade.value,active:editor.elements.active.checked,courses:[...editor.querySelectorAll('input[name=course]:checked')].map(i=>i.value)};
 if(!id){
  payload.holiday_periods=[...$('holiday-create-periods').querySelectorAll('input:checked')].map(input=>input.value);
  if(payload.holiday_periods.length)payload.courses.push('holiday-training');
 }else if(!payload.courses.length&&holidayGrants.some(g=>g.student_id===id))payload.courses.push('holiday-training');
 if(!payload.name || !payload.courses.length)throw Error('请填写姓名并选择至少一个课程或假期。');
 const result=await request(id?'update':'create',{...payload,...(id?{id}:{})});
 if(!id){$('new-code').textContent=`英文账号：${result.username||result.code}`;$('new-pin').textContent=`PIN：${result.pin}`;$('credentials').hidden=false;}
 // Keep one-time credentials visible even if the subsequent list refresh fails.
 resetEditor();message(id?'学生资料已更新。':'学生已创建，请记录编号和 PIN。');
 students=await request('list');renderStudents();await refreshHolidayGrants();renderHolidayAdmin();
 });};
$('cancel-edit').onclick=resetEditor;$('hide-credentials').onclick=hidePin;
$('enter-holiday').onclick=()=>{message('');showHoliday();};
$('holiday-up').onclick=()=>{message('');showHoliday(holidayTrack?holidayPeriod:null);};
$('close-holiday').onclick=()=>{message('');holidayPeriod=null;holidayTrack=null;lessonReturnView='workspace';showView('workspace');courseUrl(null,null,null);$('enter-holiday').focus();};
$('close-lesson').onclick=()=>{$('lesson-frame').srcdoc='';window.zxHolidayPeriod=null;window.zxHomeworkBatchId=null;courseUrl(null,null,null);showView(lessonReturnView);};
function logout(event){return busy(event.currentTarget.parentElement,async()=>{
 try{if(session?.type==='student')await request('logout');else if(session?.type==='admin')await fetch(`${API}/auth/v1/logout?scope=local`,{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:`Bearer ${session.access_token}`}});}
 finally{saveSession(null);hidePin();$('lesson-frame').srcdoc='';showLogin();$('students').replaceChildren();students=[];allCourses=[];message('已退出登录。');}
});}
$('logout').onclick=logout;
$('logout-holiday').onclick=logout;
$('retry-session').onclick=()=>enterSession();
let holidayPlan=null;
const holidayActions={grant:'授权45天',revoke:'撤销权限',renew:'重新授权／旧权限补设45天',extend:'延长有效期'};
function grantLabel(grant){
 if(!grant)return '未授权';
 if(grant.revoked_at)return '已撤销';
 if(grant.legacy)return '旧授权 · 授权时间待确认';
 return Date.parse(grant.expires_at)<=holidayNow()?'已过期':'有效';
}
function holidayInput(value,label){
 const row=document.createElement('label'),input=document.createElement('input');
 input.type='checkbox';input.value=value;row.append(input,document.createTextNode(' '+label));return row;
}
function renderHolidayAdmin(selected=[]){
 const selector=$('holiday-admin-period');
 if(!selector.options.length){
  for(const period of holidayCatalog){
   const option=document.createElement('option');option.value=period.id;option.textContent=period.title;selector.append(option);
   $('holiday-create-periods').append(holidayInput(period.id,period.title+'（45天）'));
  }
 }
 const period=selector.value,list=$('holiday-admin-students');list.replaceChildren();
 for(const student of students){
  const grant=holidayGrants.find(g=>g.student_id===student.id&&g.period===period);
  const days=grant?.expires_at&&!grant.revoked_at?Math.max(0,Math.ceil((Date.parse(grant.expires_at)-holidayNow())/86400000)):null;
  const label=student.display_name+' · '+grantLabel(grant)+'｜授权 '+holidayTime(grant?.granted_at)+'｜到期 '+holidayTime(grant?.expires_at)+(days===null?'':'｜剩余 '+days+' 天');
  const row=holidayInput(student.id,label);row.firstChild.checked=selected.includes(student.id);list.append(row);
 }
 holidayPlan=null;$('holiday-confirm-panel').hidden=true;
}
function openHolidayAdmin(id){
 $('holiday-admin').open=true;renderHolidayAdmin([id]);$('holiday-admin').scrollIntoView({block:'start'});
}
function previewHolidayChange(){
 const period=$('holiday-admin-period').value,action=$('holiday-admin-action').value;
 const selected=[...$('holiday-admin-students').querySelectorAll('input:checked')].map(i=>i.value);
 const days=Number($('holiday-admin-days').value);
 if(!selected.length||selected.length>100)throw Error('请选择 1–100 名学生。');
 if(action==='extend'&&(!Number.isInteger(days)||days<1||days>365))throw Error('请输入 1–365 天。');
 const time=holidayNow();
 const lines=selected.map(id=>{
  const student=students.find(s=>s.id===id);
  const grant=holidayGrants.find(g=>g.student_id===id&&g.period===period);
  const active=grantLabel(grant)==='有效';
  let outcome;
  if(!student.active&&action!=='revoke')outcome='账号已停用';
  else if(action==='revoke')outcome=grant?'撤销后立即失效':'未授权';
  else if(action==='extend')outcome=active?'预计到期 '+holidayTime(Date.parse(grant.expires_at)+days*86400000):'只有已有到期时间的有效权限可以延长';
  else if(active)outcome='保留原到期 '+holidayTime(grant.expires_at);
  else if(!grant&&action==='renew')outcome='未授权，请使用授权45天';
  else if(grant?.legacy&&!grant.revoked_at&&action==='grant')outcome='旧授权需使用补设45天';
  else outcome='预计到期 '+holidayTime(time+45*86400000);
  return student.display_name+' · '+outcome;
 });
 holidayPlan={period,action,student_ids:selected,days};
 $('holiday-preview-text').textContent=[holidayCatalog.find(p=>p.id===period).title+'｜'+holidayActions[action]+'｜'+selected.length+' 人（新加坡时间）',...lines].join('\n');
 $('holiday-confirm-panel').hidden=false;
}
$('holiday-admin-period').onchange=()=>renderHolidayAdmin();
$('holiday-admin-action').onchange=()=>{$('holiday-admin-days-label').hidden=$('holiday-admin-action').value!=='extend';};
$('holiday-admin').addEventListener('change',()=>{holidayPlan=null;$('holiday-confirm-panel').hidden=true;});
$('holiday-preview').onclick=()=>busy($('holiday-admin'),async()=>{previewHolidayChange();});
$('holiday-apply').onclick=()=>busy($('holiday-admin'),async()=>{
 if(!holidayPlan)return;
 const plan=holidayPlan;holidayPlan=null;$('holiday-confirm-panel').hidden=true;
 const results=await request('holiday-manage',plan);
 const ok=results.filter(r=>r.ok).length;
 $('holiday-admin-result').textContent=['成功 '+ok+' 人，失败 '+(results.length-ok)+' 人。',...results.map(r=>{
  const student=students.find(s=>s.id===r.student_id);
  return (student?.display_name||r.student_id)+' · '+(r.ok?(plan.action==='revoke'?'已撤销':(r.changed?'有效至 ':'保留原到期 ')+holidayTime(r.expires_at)):r.reason);
 })].join('\n');
 await refreshHolidayGrants();renderHolidayAdmin(plan.student_ids);
});
window.setInterval(()=>{
 if(session?.type!=='student')return;
 holidayAccessEnded();
},1000);
window.setInterval(()=>{void checkHolidaySession();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkHolidaySession();});

if(session)enterSession();else showLogin();

