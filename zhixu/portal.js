'use strict';
const API='https://cogvtrcoifppwkzzhect.supabase.co';
const PUBLIC_KEY='sb_publishable_WrDX6Nm1mBMmRseM9XskBA_wzZyfbS7';
const $=id=>document.getElementById(id);
let session=null, allCourses=[], students=[];
try{session=JSON.parse(sessionStorage.getItem('zx_session')||'null');}catch{session=null;}
const editor=$('student-editor');
let restoring=null, openingCourse=false;
function showView(view){
 ['loading','login','workspace','lesson'].forEach(id=>$(id).hidden=id!==view);
}
function showLoading(text){$('loading-text').textContent=text;$('retry-session').hidden=true;showView('loading');}
function expired(error){return error.status===401 || (error.status===403 && error.op==='me');}
function showLogin(){ $('lesson-frame').srcdoc='';showView('login'); }
function courseUrl(assetId,exerciseId,homeworkId){
 const url=new URL(location.href);
 for(const [key,value] of Object.entries({course:assetId,exercise:exerciseId,homework:homeworkId})){
  if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);
 }
 history.replaceState(null,'',url.pathname+url.search+url.hash);
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
function courseOptions(selected=[]){
 $('course-options').replaceChildren();const grade=editor.elements.grade.value.toLowerCase();
 allCourses.filter(c=>c.id==='essay-training' || (grade==='p6'?c.id.startsWith('p6-'):c.id.startsWith('s'))).forEach(c=>{
  const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name='course';input.value=c.id;input.checked=c.id==='essay-training'||selected.includes(c.id);input.disabled=c.id==='essay-training';label.append(input,document.createTextNode(c.title));$('course-options').append(label);
 });
}
function resetEditor(){editor.reset();editor.elements.id.value='';$('editor-title').textContent='新增学生';$('active-label').hidden=true;courseOptions();}
function renderStudents(){
 $('students').replaceChildren();students.forEach(s=>{
  const row=document.createElement('tr');
  [s.student_number||'—',s.username||s.student_code,s.display_name,s.grade==='SECONDARY'?'中学':s.grade,s.courses.map(id=>allCourses.find(c=>c.id===id)?.title||id).join('、'),s.active?'启用':'停用'].forEach(value=>{const td=document.createElement('td');td.textContent=value;row.append(td);});
  const cell=document.createElement('td');cell.append(button('编辑',async()=>{hidePin();editor.elements.id.value=s.id;editor.elements.name.value=s.display_name;editor.elements.username.value=s.username||'';editor.elements.grade.value=s.grade;editor.elements.active.checked=s.active;$('active-label').hidden=false;$('editor-title').textContent='编辑学生';courseOptions(s.courses);editor.scrollIntoView({behavior:'smooth'});}));cell.append(document.createTextNode(' '),button('重设 PIN',async()=>{hidePin();const result=await request('reset-pin',{id:s.id});$('new-code').textContent=`英文账号：${result.username||result.code}`;$('new-pin').textContent=`新 PIN：${result.pin}`;$('credentials').hidden=false;message('PIN 已重设，原 PIN 和现有登录已失效。');}));row.append(cell);$('students').append(row);
 });
}
async function openCourse(assetId,exerciseId=null,homeworkId=null){
 if(openingCourse)return;openingCourse=true;showLoading('正在打开课程…');message('');
 try{
 if(homeworkId){
  const response=await fetch(API+'/functions/v1/zhixu-reports',{method:'POST',headers:{'Content-Type':'application/json','x-student-token':session?.token||''},body:JSON.stringify({op:'homework-open',homework_batch_id:homeworkId,asset_id:assetId,exercise_id:exerciseId})});
  const check=await response.json();if(!response.ok)throw Object.assign(Error(check.error||'无法打开这份功课。'),{status:response.status,op:'homework-open'});
 }
 window.zxHomeworkBatchId=homeworkId;window.zxHomeworkExerciseId=exerciseId;
 const result=await request('content',{asset_id:assetId});
 window.zxActiveAssetId=assetId;
 let html=result.html;
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
 $('lesson-frame').hidden=false;$('lesson-frame').srcdoc=html;courseUrl(assetId,exerciseId,homeworkId);showView('lesson');message('');
 }catch(e){
  if(expired(e)){saveSession(null);showLogin();}else showView('workspace');
  throw e;
 }finally{openingCourse=false;}
}
async function showWorkspace(){
 const me=await request('me');allCourses=await request('courses');
 $('admin').hidden=me.role!=='admin';$('greeting').textContent=me.role==='admin'?'管理后台':`${me.name}，欢迎回来`;
 $('courses').replaceChildren();allCourses.forEach(c=>{const card=document.createElement('section');card.className='card';const heading=document.createElement('h3');heading.textContent=c.title;card.append(heading);if(c.id==='p6-standard'){const a=document.createElement('a');a.href='primary-standard.html';a.className='btn';a.textContent='进入小学普通华文';card.append(a)}else card.append(button('进入课程',()=>openCourse(c.id)));$('courses').append(card);});
 if(!allCourses.length)$('courses').textContent='暂未获授权课程，请联系老师。';
 if(me.role==='admin'){students=await request('list');renderStudents();resetEditor();}
 message('');
 const query=new URLSearchParams(location.search),asset=query.get('course'),exercise=query.get('exercise');
 if(asset){try{await openCourse(asset,exercise,query.get('homework'));}catch(e){message(e.message,true);}}
 else showView('workspace');
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
 if(!payload.name || !payload.courses.length)throw Error('请填写姓名并选择至少一个课程。');
 const result=await request(id?'update':'create',{...payload,...(id?{id}:{})});
 if(!id){$('new-code').textContent=`英文账号：${result.username||result.code}`;$('new-pin').textContent=`PIN：${result.pin}`;$('credentials').hidden=false;}
 // Keep one-time credentials visible even if the subsequent list refresh fails.
 resetEditor();message(id?'学生资料已更新。':'学生已创建，请记录编号和 PIN。');
 students=await request('list');renderStudents();
 });};
$('cancel-edit').onclick=resetEditor;$('hide-credentials').onclick=hidePin;
$('close-lesson').onclick=()=>{$('lesson-frame').srcdoc='';window.zxHomeworkBatchId=null;courseUrl(null,null,null);showView('workspace');};
$('logout').onclick=()=>busy($('workspace'),async()=>{
 try{if(session?.type==='student')await request('logout');else if(session?.type==='admin')await fetch(`${API}/auth/v1/logout?scope=local`,{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:`Bearer ${session.access_token}`}});}
 finally{saveSession(null);hidePin();$('lesson-frame').srcdoc='';showLogin();$('students').replaceChildren();students=[];allCourses=[];message('已退出登录。');}
});
$('retry-session').onclick=()=>enterSession();
if(session)enterSession();else showLogin();

