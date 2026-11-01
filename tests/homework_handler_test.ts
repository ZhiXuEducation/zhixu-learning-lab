function assert(v:unknown,m='assertion failed'){if(!v)throw Error(m)}
Deno.test('homework edge: authenticates students/admins, strips actor spoofing and selects correct gateway',async()=>{
 const oldUrl=Deno.env.get('SUPABASE_URL'),oldKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),original=globalThis.fetch;
 Deno.env.set('SUPABASE_URL','https://example.test');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','test-key');
 try{const {reportHandler}=await import('../backend/reports.ts');const calls:{url:string,body:any}[]=[];
 globalThis.fetch=(async(url:any,init:any)=>{calls.push({url:String(url),body:init?.body?JSON.parse(init.body):null});return String(url).endsWith('/auth/v1/user')?Response.json({id:'verified-admin'}):Response.json([])}) as typeof fetch;
 const request=(body:any,headers:any={})=>reportHandler(new Request('https://example.test/reports',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}));
 let r=await request({op:'homework-list',actor:'spoof','student_id':'other'},{'x-student-token':'a'.repeat(64)});assert(r.ok);assert(calls.at(-1)!.url.endsWith('zx_homework_gateway'));assert(!calls.at(-1)!.body.payload.actor&&!calls.at(-1)!.body.payload.student_id,'client controlled identity');
 assert(calls.at(-1)!.body.payload.token_hash!== 'a'.repeat(64),'unhashed student token');
 const count=calls.length;r=await request({op:'homework-publish',actor:'spoof'},{'x-student-token':'a'.repeat(64)});assert(r.status===401&&calls.length===count,'student publication allowed');
 r=await request({op:'homework-publish',actor:'spoof',student_ids:['s'],exercises:[],title:'x',batch_id:'b',due_date:'2026-11-08'},{Authorization:'Bearer test'});assert(r.ok&&calls.at(-1)!.body.payload.actor==='verified-admin');
 r=await request({op:'homework-close',batch_id:'b'},{Authorization:'Bearer test'});assert(r.ok&&calls.at(-1)!.body.payload.batch_id==='b'&&calls.at(-1)!.url.endsWith('zx_homework_gateway'));
 r=await request({op:'load',student_id:'s',month:'2026-11'},{Authorization:'Bearer test'});assert(r.ok&&calls.at(-1)!.url.endsWith('zx_reports_gateway'),'existing reports routing broken');
 r=await request({op:'homework-list'},{'x-student-token':'invalid'});assert(r.status===401);
 }finally{globalThis.fetch=original;if(oldUrl===undefined)Deno.env.delete('SUPABASE_URL');else Deno.env.set('SUPABASE_URL',oldUrl);if(oldKey===undefined)Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY',oldKey)}
});
