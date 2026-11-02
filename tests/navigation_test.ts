// @ts-nocheck
import {JSDOM} from 'npm:jsdom@26.1.0';
import assert from 'node:assert/strict';
const fs={readFileSync:(p:string,_encoding?:string)=>Deno.readTextFileSync(p)};
const root=new URL('../',import.meta.url).pathname,html=fs.readFileSync(root+'zhixu/portal.html','utf8'),js=fs.readFileSync(root+'zhixu/portal.js','utf8');
const student={type:'student',token:'local-test-only'},pause=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
function setup({session=student,query='?course=psle-review',handler}={}){
 const d=new JSDOM(html,{url:'https://zhixueducation.github.io/zhixu-learning-lab/zhixu/portal.html'+query,runScripts:'outside-only'}),w=d.window,calls=[];
 if(session)w.sessionStorage.setItem('zx_session',JSON.stringify(session));
 w.fetch=async(url,opts)=>{const b=JSON.parse(opts.body);calls.push({url,b,headers:opts.headers});const out=handler?await handler(b,url):null;return out||response(b.op==='me'?{role:'student',name:'本地测试'}:b.op==='courses'?[{id:'psle-review',title:'PSLE'},{id:'p6-standard',title:'普华'}]:b.op==='content'?{html:'<!doctype html><body>模拟课程</body>'}:b.op==='login'?{token:'local-test-only'}:{});};
 const view=id=>!w.document.getElementById(id).hidden;
 return {d,w,calls,view,start:()=>w.eval(js),close:()=>w.close()};
}
function response(body,status=200){return {ok:status<400,status,json:async()=>body};}
Deno.test('shared portal navigation preserves auth and target without login flash',async()=>{
 // Reproduce the old first-paint defect and assert new static HTML never exposes a form.
 assert(new JSDOM(html).window.document.getElementById('login').hidden);
 let release;const gate=new Promise(r=>release=r);const a=setup({handler:async b=>{if(b.op==='me')await gate;}});a.start();await pause();assert(a.view('loading'));assert(!a.view('login'));assert(!a.view('workspace'));assert.equal(a.calls.length,1);release();await pause();assert(a.view('lesson'));assert(!a.view('login'));assert.deepEqual(a.calls.map(x=>x.b.op),['me','courses','content']);assert.equal(a.w.location.search,'?course=psle-review');assert(a.calls.every(x=>x.headers['x-student-token']===student.token));a.close();
 // Signed-out homework link stays intact through login and server verification.
 const q='?course=psle-review&exercise=psle-rev-reading-2&homework=local-homework',b=setup({session:null,query:q});b.start();assert(b.view('login'));assert.equal(b.calls.length,0);const f=b.w.document.getElementById('student-login');f.elements.code.value='Example';f.elements.pin.value='1234';f.dispatchEvent(new b.w.Event('submit',{cancelable:true}));await pause();assert(b.view('lesson'));assert.equal(b.w.location.search,q);assert.deepEqual(b.calls.map(x=>x.b.op),['login','me','courses','homework-open','content']);assert(b.w.document.getElementById('lesson-frame').srcdoc.includes('psle-rev-reading-2'));b.w.document.getElementById('close-lesson').click();assert(b.view('workspace'));assert.equal(b.w.location.search,'');assert.equal(b.w.zxHomeworkBatchId,null);b.close();
 // Expired/revoked sessions show login, never request protected content.
 for(const status of [401,403]){const t=setup({handler:b=>b.op==='me'?response({error:'登录已过期'},status):null});t.start();await pause();assert(t.view('login'));assert.equal(t.w.sessionStorage.getItem('zx_session'),null);assert.equal(t.calls.length,1);assert.equal(t.w.location.search,'?course=psle-review');t.close();}
 // A temporary network failure must not erase a still-valid session or target.
 let online=false;const c=setup({handler:()=>{if(!online)throw Error('network unavailable');}});c.start();await pause();assert(c.view('loading'));assert(!c.view('login'));assert(c.w.sessionStorage.getItem('zx_session'));assert(!c.w.document.getElementById('retry-session').hidden);online=true;c.w.document.getElementById('retry-session').click();c.w.document.getElementById('retry-session').click();await pause();assert(c.view('lesson'));assert.equal(c.calls.filter(x=>x.b.op==='content').length,1);c.close();
 // Forbidden course remains forbidden without mislabelling the user as logged out.
 const e=setup({handler:b=>b.op==='content'?response({error:'没有课程权限'},403):null});e.start();await pause();assert(e.view('workspace'));assert(!e.view('login'));assert(e.w.sessionStorage.getItem('zx_session'));assert.equal(e.w.document.getElementById('lesson-frame').srcdoc,'');assert.equal(e.w.location.search,'?course=psle-review');e.close();
 // Shared code covers all course routes and a rapid double tap makes one content request.
 for(const course of ['p6-standard','p6-higher','s1-higher','s2-express','essay-training']){const t=setup({query:'?course='+course});t.start();await pause();assert(t.view('lesson'));assert.equal(t.calls.at(-1).b.asset_id,course);t.close();}
 const f2=setup({query:''});f2.start();await pause();assert(f2.view('workspace'));const courseButton=f2.w.document.querySelector('#courses button');courseButton.onclick();courseButton.onclick();await pause();assert.equal(f2.calls.filter(x=>x.b.op==='content').length,1);assert(f2.view('lesson'));f2.close();
 // Existing admin refresh remains server verified and happens once.
 const g=setup({session:{type:'admin',access_token:'old',refresh_token:'local-refresh',expires_at:0},query:'',handler:(b,url)=>url.includes('/auth/v1/')?response({access_token:'fresh',refresh_token:'next',expires_in:3600}):b.op==='me'?response({role:'admin'}):b.op==='list'?response([]):null});g.start();await pause();assert(g.view('workspace'));assert.equal(g.calls.filter(x=>x.url.includes('/auth/v1/')).length,1);assert(g.calls.filter(x=>x.b.op).every(x=>x.headers.Authorization==='Bearer fresh'));g.close();
 console.log('PASS: first paint, slow validation, signed-out/deep homework login, expired/revoked session, offline retry, denied course, shared course routes, double tap, admin refresh. No live account or database writes.');
});
