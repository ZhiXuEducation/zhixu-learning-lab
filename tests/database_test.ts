import {PGlite} from 'npm:@electric-sql/pglite@0.3.14';
function assert(v:unknown,m='assertion failed'){if(!v)throw Error(m);}
const admin='11111111-1111-4111-8111-111111111111';
Deno.test('database: isolation, administrator checks, courses, throttle, expiry and revocation',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema zx_private; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table public.zx_profiles(id uuid primary key,role text,active boolean);
 create table public.zx_courses(id text primary key,title text,level text,active boolean);
 create function zx_private.current_role() returns text language sql stable security definer set search_path='' as $$ select role from public.zx_profiles where id=auth.uid() and active $$;
 grant usage on schema zx_private,auth to authenticated;
 grant execute on function zx_private.current_role() to authenticated;
 grant select on public.zx_profiles,public.zx_courses to service_role;
 insert into public.zx_profiles values('${admin}','admin',true);
 insert into public.zx_courses values('p6-standard','小六普华','primary',true),('s1-higher','中一高华','secondary',true),('essay-training','审题','secondary',true);`);
 await db.exec(await Deno.readTextFile(new URL('../backend/schema.sql',import.meta.url)));
 await db.exec("insert into zx_private.course_content values('p6-standard',array['p6-standard'],'<p>primary</p>'),('s1-higher',array['s1-higher'],'<p>secondary</p>'); set role service_role;");
 async function rpc(op:string,payload:unknown){return (await db.query<{v:any}>('select public.zx_student_gateway($1,$2::jsonb) v',[op,JSON.stringify(payload)])).rows[0].v;}
 async function denied(fn:()=>Promise<unknown>,text?:string){try{await fn();}catch(e){if(text)assert(String(e).includes(text),String(e));return;}throw Error('expected rejection');}
 const created=await rpc('create',{actor:admin,name:'测试学生',grade:'P6',code:'ZX0123456789AB',salt:'salt',pin_hash:'hash',courses:['p6-standard']});
 const id=created.id;assert(id);
 await denied(()=>rpc('create',{actor:'22222222-2222-4222-8222-222222222222',name:'伪管理员'}),'denied');
 await denied(()=>rpc('update',{actor:admin,id,name:'测试',grade:'P6',active:true,courses:['s1-higher']}),'invalid course');
 assert((await rpc('list',{actor:admin})).length===1);
 await rpc('login',{id,token_hash:'test-token'});
 assert((await rpc('courses',{token_hash:'test-token'})).length===1);
 assert((await rpc('content',{token_hash:'test-token',asset_id:'p6-standard'})).html.includes('primary'));
 await denied(()=>rpc('content',{token_hash:'test-token',asset_id:'s1-higher'}),'content unavailable');
 await denied(()=>rpc('list',{token_hash:'test-token'}),'denied');
 await denied(()=>rpc('me',{token_hash:'forged'}),'denied');
 for(let i=0;i<5;i++)assert((await rpc('reserve',{code:'ZX0123456789AB'})).id===id);
 assert((await rpc('reserve',{code:'ZX0123456789AB'})).limited===true);
 await db.exec("update zx_private.login_limits set started_at=now()-interval '16 minutes';");
 assert((await rpc('reserve',{code:'ZX0123456789AB'})).id===id);
 for(let i=0;i<4;i++)assert((await rpc('reserve',{code:'ZX0123456789AB'})).id===id);
 await db.exec("update zx_private.login_limits set started_at=now()-interval '16 minutes' where bucket not like '%:day';");
 assert((await rpc('reserve',{code:'ZX0123456789AB'})).limited,'daily guessing cap failed');
 await db.exec("update zx_private.student_sessions set expires_at=now()-interval '1 second';");
 await denied(()=>rpc('me',{token_hash:'test-token'}),'denied');
 await rpc('login',{id,token_hash:'new-token'});
 await rpc('update',{actor:admin,id,name:'测试学生',grade:'P6',active:false,courses:['p6-standard']});
 await denied(()=>rpc('me',{token_hash:'new-token'}),'denied');
 assert(!(await rpc('reserve',{code:'ZX0123456789AB'})).id);
 await rpc('update',{actor:admin,id,name:'测试学生',grade:'P6',active:true,courses:['p6-standard']});
 await rpc('login',{id,token_hash:'logout-token'});await rpc('logout',{token_hash:'logout-token'});
 await denied(()=>rpc('me',{token_hash:'logout-token'}),'denied');
 await db.exec("update zx_private.login_limits set attempts=100 where bucket='global';");
 assert((await rpc('reserve',{code:'ZXFFFFFFFFFFFF'})).limited);
 await db.exec('reset role; set role anon;');
 await denied(()=>rpc('reserve',{code:'ZX0123456789AB'}),'permission denied');
 await denied(()=>db.query('select * from public.zx_students'),'permission denied');
 await denied(()=>db.query('select * from zx_private.student_credentials'),'permission denied');
 await db.exec('reset role; set role authenticated;');
 await denied(()=>rpc('list',{actor:admin}),'permission denied');
 assert((await db.query('select * from public.zx_students')).rows.length===0,'RLS exposed students');
 await db.exec(`reset role; set request.jwt.claim.sub='${admin}'; set role authenticated;`);
 assert((await db.query('select * from public.zx_students')).rows.length===1,'admin RLS failed');
 await denied(()=>db.query('update public.zx_students set active=false'),'permission denied');
 }finally{await db.close();}
});
