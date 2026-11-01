import {PGlite} from 'npm:@electric-sql/pglite@0.3.14';
Deno.env.set('SUPABASE_URL','https://test.supabase.co');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','test-server-key');
const {handler}=await import('../backend/index.ts');
const admin='11111111-1111-4111-8111-111111111111';
function assert(v:unknown,m='assertion failed'){if(!v)throw Error(m);}
Deno.test('HTTP integration: admin validation, PIN login/reset, course isolation and request filtering',async()=>{
 const originalFetch=globalThis.fetch, db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema zx_private;
 create table public.zx_profiles(id uuid primary key,role text,active boolean);create table public.zx_courses(id text primary key,title text,level text,active boolean);
 create function zx_private.current_role() returns text language sql as $$ select null::text $$;
 grant select on public.zx_profiles,public.zx_courses to service_role;
 insert into public.zx_profiles values('${admin}','admin',true);
 insert into public.zx_courses values('p6-standard','小学','primary',true),('s1-higher','中学','secondary',true);`);
 await db.exec(await Deno.readTextFile(new URL('../backend/schema.sql',import.meta.url)));
 await db.exec("insert into zx_private.course_content values('p6-standard',array['p6-standard'],'<p>primary</p>'),('s1-higher',array['s1-higher'],'<p>secondary</p>');set role service_role;");
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:admin}),{status:new Headers(init?.headers).get('Authorization')==='Bearer valid-admin'?200:401});
  assert(url.endsWith('/rest/v1/rpc/zx_student_gateway'));
  const {op,payload}=JSON.parse(String(init?.body));
  try{const r=await db.query<{v:unknown}>('select public.zx_student_gateway($1,$2::jsonb) v',[op,JSON.stringify(payload)]);return new Response(JSON.stringify(r.rows[0].v));}
  catch(e){return new Response(JSON.stringify({code:'P0001',message:(e as Error).message}),{status:400});}
 };
 async function call(op:string,data:Record<string,unknown>={},auth?:string,student?:string){const headers:Record<string,string>={'Content-Type':'application/json'};if(auth)headers.Authorization='Bearer '+auth;if(student)headers['x-student-token']=student;const r=await handler(new Request('https://test/edge',{method:'POST',headers,body:JSON.stringify({op,...data})}));return {status:r.status,body:await r.json()};}
 assert((await call('list',{},'forged-admin')).status===401);
 assert((await call('list')).status===401);
 const created=await call('create',{name:'学生 <script>',username:'StudentOne',grade:'P6',courses:['p6-standard']},'valid-admin');
 assert(created.status===200);assert(/^\d{4}$/.test(created.body.pin));assert(/^ZX[0-9A-F]{12}$/.test(created.body.code));
 const {id,code,pin}=created.body;
 const login=await call('login',{code,pin});assert(login.status===200);
 const aliasLogin=await call('login',{code:'studentone',pin});assert(aliasLogin.status===200,'English username login failed');
 const token=login.body.token;assert(token.length===64);
 assert((await call('content',{asset_id:'p6-standard'},undefined,token)).status===200);
 assert((await call('content',{asset_id:'s1-higher'},undefined,token)).status!==200);
 assert((await call('list',{actor:admin},undefined,token)).status===403);
 assert((await call('create',{actor:admin},undefined,token)).status===403);
 assert((await call('reserve',{code})).status===400);
 assert((await call('me',{},undefined,'f'.repeat(64))).status===403);
 const wrong=String((Number(pin)+1)%10000).padStart(4,'0');
 for(let i=0;i<5;i++)assert((await call('login',{code,pin:wrong})).status===401);
 assert((await call('login',{code,pin:wrong})).status===429);
 const reset=await call('reset-pin',{id},'valid-admin');assert(reset.status===200);assert(reset.body.pin!==pin,'reset reused old PIN');assert((await call('login',{code,pin})).status===401);
 assert((await call('me',{},undefined,token)).status===403);
 const newLogin=await call('login',{code,pin:reset.body.pin});assert(newLogin.status===200);
 await call('update',{id,name:'学生',grade:'P6',active:false,courses:['p6-standard']},'valid-admin');
 assert((await call('me',{},undefined,newLogin.body.token)).status===403);
 assert((await call('login',{code,pin:reset.body.pin})).status===401);
 assert((await handler(new Request('https://test/edge',{method:'POST',body:'x'.repeat(9000)}))).status===413);
 assert((await handler(new Request('https://test/edge',{method:'POST',body:'{'}))).status===400);
 assert((await handler(new Request('https://test/edge',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}))).status===403);
 }finally{globalThis.fetch=originalFetch;await db.close();}
});
