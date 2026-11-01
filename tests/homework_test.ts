import {PGlite} from 'npm:@electric-sql/pglite@0.3.14';
const A='11111111-1111-4111-8111-111111111111',S='22222222-2222-4222-8222-222222222222',T='22222222-2222-4222-8222-222222222223',B='33333333-3333-4333-8333-333333333333',C='33333333-3333-4333-8333-333333333334';
function assert(v:unknown,m='assertion failed'){if(!v)throw Error(m)}
Deno.test('homework: authorization, publication, deadlines, first submission, overlap, retries, cancellation and report totals',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema zx_private;
 create table public.zx_profiles(id uuid primary key,role text,active boolean);create table public.zx_students(id uuid primary key,display_name text,username text,student_number int,active boolean);
 create table public.zx_courses(id text primary key,title text,active boolean);create table public.zx_student_courses(student_id uuid,course_id text);
 create table zx_private.student_sessions(token_hash text,student_id uuid,expires_at timestamptz);create table zx_private.course_content(asset_id text,allowed_courses text[]);
 create function zx_private.current_role() returns text language sql as $$select null::text$$;
 insert into public.zx_profiles values('${A}','admin',true);insert into public.zx_students values('${S}','测试一','Test1',1,true),('${T}','测试二','Test2',2,true);
 insert into public.zx_courses values('s1-express','中一快捷',true);insert into public.zx_student_courses values('${S}','s1-express');
 insert into zx_private.student_sessions values('token','${S}',now()+interval '1 day'),('token2','${T}',now()+interval '1 day');insert into zx_private.course_content values('s1-express',array['s1-express']);
 grant usage on schema zx_private to service_role;grant select on all tables in schema zx_private,public to service_role;`);
 await db.exec(await Deno.readTextFile(new URL('../backend/report-schema.sql',import.meta.url)));
 await db.exec(await Deno.readTextFile(new URL('../backend/homework-schema.sql',import.meta.url)));
 await db.exec(await Deno.readTextFile(new URL('../backend/homework-history.sql',import.meta.url)));
 await db.exec(`insert into zx_private.exercise_catalog values('s1-express','set1','A套','[]'),('s1-express','set2','B套','[]');set role service_role;`);
 async function call(op:string,payload:any){return (await db.query<{v:any}>('select public.zx_homework_gateway($1,$2::jsonb) v',[op,JSON.stringify(payload)])).rows[0].v;}
 async function rejects(fn:()=>Promise<unknown>,reason:string){try{await fn()}catch{return}throw Error('expected denial: '+reason)}
 const due=(await db.query<{d:string}>("select to_char((now() at time zone 'Asia/Singapore')::date+7,'YYYY-MM-DD') d")).rows[0].d;
 const pub={actor:A,batch_id:B,title:'单元一两套',due_date:due,student_ids:[S],exercises:[{asset_id:'s1-express',exercise_id:'set1'},{asset_id:'s1-express',exercise_id:'set2'}]};
 await rejects(()=>call('homework-options',{actor:S}),'student admin impersonation');await rejects(()=>call('homework-list',{token_hash:'fake'}),'invalid token');
 await rejects(()=>call('homework-publish',{...pub,token_hash:'token'}),'student publishing');await rejects(()=>call('homework-publish',{...pub,student_ids:[T]}),'course permission');
 await rejects(()=>call('homework-publish',{...pub,due_date:'2020-01-01'}),'past due');await rejects(()=>call('homework-publish',{...pub,exercises:[]}),'empty selection');
 await db.exec(`reset role;insert into zx_private.learning_runs(id,student_id,asset_id,exercise_id,started_at,submitted_at,results) values('44444444-4444-4444-8444-444444444444','${S}','s1-express','set1',now()-interval '1 day',now()-interval '1 day','[]');set role service_role;`);
 await call('homework-publish',pub);await call('homework-publish',pub);
 assert((await db.query<{d:string}>("select to_char(due_at at time zone 'Asia/Singapore','HH24:MI:SS.US') d from zx_private.homework_batches")).rows[0].d==='23:59:59.999999','Singapore end-of-day deadline');
 let list=await call('homework-list',{token_hash:'token'});assert(list.length===2&&list.every((r:any)=>r.status==='pending'),'old practice counted or retry duplicated');
 assert((await call('homework-list',{token_hash:'token2'})).length===0,'cross-student leak');
 await rejects(()=>call('homework-publish',{...pub,batch_id:C}),'overlapping unfinished work');
 await db.exec(`reset role;update zx_private.homework_batches set created_at=now()-interval '1 hour',due_at=now()+interval '1 hour';
 insert into zx_private.learning_runs(id,student_id,asset_id,exercise_id,submitted_at,results) values('44444444-4444-4444-8444-444444444445','${S}','s1-express','set1',now(),'[]');set role service_role;`);
 list=await call('homework-list',{actor:A});assert(list.find((r:any)=>r.exercise_id==='set1').status==='completed','submission not linked');
 await db.exec(`reset role;update zx_private.homework_batches set due_at=now()-interval '30 minutes';set role service_role;`);
 list=await call('homework-list',{token_hash:'token'});assert(list.find((r:any)=>r.exercise_id==='set1').status==='late');assert(list.find((r:any)=>r.exercise_id==='set2').status==='overdue');
 await db.exec(`reset role;update zx_private.homework_batches set due_at=now()+interval '1 minute';insert into zx_private.learning_runs(id,student_id,asset_id,exercise_id,submitted_at,results) values('44444444-4444-4444-8444-444444444446','${S}','s1-express','set1',now()+interval '2 minutes','[]');set role service_role;`);
 list=await call('homework-list',{token_hash:'token'});assert(list.find((r:any)=>r.exercise_id==='set1').status==='completed','retry replaced first submission');
 const snap=(await db.query<{v:any}>("select zx_private.month_snapshot($1,date_trunc('month',now() at time zone 'Asia/Singapore')::date) v",[S])).rows[0].v;
 assert(snap.homework.assigned===2&&snap.homework.completed===1&&snap.homework.on_time===1&&snap.homework.incomplete===1,'monthly homework totals');
 const deadline=(await db.query<{d:string}>("select to_char(due_at at time zone 'Asia/Singapore','HH24:MI:SS.US') d from zx_private.homework_batches")).rows[0].d;assert(!!deadline);
 await rejects(()=>call('homework-close',{token_hash:'token',batch_id:B}),'student closing homework');
 await call('homework-close',{actor:A,batch_id:B});
 list=await call('homework-list',{token_hash:'token'});assert(list.length===2&&list.every((r:any)=>r.closed_at),'closed history lost');
 await db.exec(`reset role;insert into zx_private.learning_runs(id,student_id,asset_id,exercise_id,submitted_at,results) values('44444444-4444-4444-8444-444444444447','${S}','s1-express','set2',now()+interval '3 minutes','[]');set role service_role;`);
 list=await call('homework-list',{token_hash:'token'});assert(!list.find((r:any)=>r.exercise_id==='set2').submitted_at,'submission after closure changed unsubmitted history');
 await call('homework-publish',{...pub,batch_id:C});await call('homework-cancel',{actor:A,batch_id:C});
 await call('homework-cancel',{actor:A,batch_id:B});assert((await call('homework-list',{token_hash:'token'})).length===0,'cancel not excluded');
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await rejects(()=>call('homework-list',{actor:A}),'direct RPC '+role);await rejects(()=>db.query('select * from zx_private.homework_items'),'direct table '+role)}
 }finally{await db.close()}
});
