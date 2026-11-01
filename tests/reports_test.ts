import {PGlite} from 'npm:@electric-sql/pglite@0.3.14';
const A='11111111-1111-4111-8111-111111111111',S='22222222-2222-4222-8222-222222222222',R='33333333-3333-4333-8333-333333333333';
function assert(v:unknown,m='assertion failed'){if(!v)throw Error(m)}
Deno.test('reports: server grading, zero data, Singapore month, snapshots, comments and admin isolation',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema zx_private;
 create table public.zx_profiles(id uuid primary key,role text,active boolean);create table public.zx_students(id uuid primary key,display_name text,username text,student_number int,active boolean);
 create table public.zx_courses(id text primary key,active boolean);create table public.zx_student_courses(student_id uuid,course_id text);
 create table zx_private.student_sessions(token_hash text,student_id uuid,expires_at timestamptz);create table zx_private.course_content(asset_id text,allowed_courses text[]);
 create function zx_private.current_role() returns text language sql as $$select null::text$$;
 insert into public.zx_profiles values('${A}','admin',true);insert into public.zx_students values('${S}','测试学生','Test',1,true);
 insert into public.zx_courses values('s1-express',true);insert into public.zx_student_courses values('${S}','s1-express');
 insert into zx_private.student_sessions values('token','${S}',now()+interval '1 day');insert into zx_private.course_content values('s1-express',array['s1-express']);
 grant usage on schema zx_private to service_role;grant select on all tables in schema zx_private,public to service_role;`);
 await db.exec(await Deno.readTextFile(new URL('../backend/report-schema.sql',import.meta.url)));
 const qs=[{id:'q1',skill:'字词',prompt:'测试一',answer:'正确',accepted:[],self:false},{id:'q2',skill:'审题',prompt:'测试二',answer:[0,2],accepted:[],self:false},{id:'q3',skill:'造句',prompt:'测试三',answer:'例句',accepted:[],self:true}];
 await db.query("insert into zx_private.exercise_catalog values('s1-express','set1','测试套',$1)",[JSON.stringify(qs)]);await db.exec('set role service_role;');
 async function call(op:string,payload:any){return (await db.query<{v:any}>('select public.zx_reports_gateway($1,$2::jsonb) v',[op,JSON.stringify(payload)])).rows[0].v;}
 async function rejects(fn:()=>Promise<unknown>){try{await fn()}catch{return}throw Error('expected denial')}
 const auth={actor:A,student_id:S,month:'2026-11'},run={token_hash:'token',asset_id:'s1-express',exercise_id:'set1',run_id:R};
 let report=await call('load',auth);assert(report.snapshot.started===0 && report.snapshot.questions===0 && report.snapshot.skills.length===0,'invented stats');
 await rejects(()=>call('load',{...auth,actor:S}));await rejects(()=>call('start',{...run,token_hash:'fake'}));
 await call('start',run);await rejects(()=>call('finish',{...run,items:[{id:'q1',answer:'正确'}]}));
 await call('finish',{...run,items:[{id:'q1',answer:'错误',ok:true},{id:'q2',answer:[2,0]},{id:'q3',answer:true}]});
 await db.exec(`reset role;update zx_private.learning_runs set started_at='2026-10-31T16:01:00Z',submitted_at='2026-10-31T16:02:00Z';set role service_role;`);
 report=await call('refresh',auth);assert(report.snapshot.started===1 && report.snapshot.completed===1);assert(report.snapshot.questions===2 && report.snapshot.correct===1 && report.snapshot.self_assessed===1);assert(report.snapshot.wrong[0].id==='q1','trusted client score');
 const october=await call('refresh',{...auth,month:'2026-10'});assert(october.snapshot.questions===0,'Singapore month boundary wrong');
 await call('finish',{...run,items:[{id:'q1',answer:'正确'}]});assert((await call('refresh',auth)).snapshot.correct===1,'replay overwrote submission');
 await call('save',{...auth,comment:'老师实际填写的评语',comment_en:'Teacher comments'});assert((await call('load',auth)).comment==='老师实际填写的评语');assert((await call('load',auth)).comment_en==='Teacher comments');assert((await call('history',auth)).length===1);
 await rejects(()=>call('save',{...auth,comment:'x'.repeat(401)}));
 await db.exec("reset role;update zx_private.learning_runs set results='[]';set role service_role;");assert((await call('load',auth)).snapshot.questions===2,'saved snapshot changed');assert((await call('refresh',auth)).snapshot.questions===0);
 await db.exec('reset role;set role anon;');await rejects(()=>call('students',{}));await rejects(()=>db.query('select * from public.zx_monthly_reports'));
 await db.exec('reset role;set role authenticated;');assert((await db.query('select * from public.zx_monthly_reports')).rows.length===0,'RLS exposed reports');
 }finally{await db.close()}
});
