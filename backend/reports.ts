import {digest} from './security.ts';
const URL=Deno.env.get('SUPABASE_URL')!,KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={'Access-Control-Allow-Origin':'https://zhixueducation.github.io','Access-Control-Allow-Headers':'content-type,authorization,apikey,x-student-token','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
export async function reportHandler(req:Request){
 const reply=(b:unknown,status=200)=>Response.json(b,{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply({error:'请求方式不支持。'},405);
 try{
  if(req.headers.get('origin')&&req.headers.get('origin')!==headers['Access-Control-Allow-Origin'])return reply({error:'访问来源不支持。'},403);
  const reader=req.body?.getReader(),chunks=[];let size=0;
  if(reader)while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return reply({error:'提交内容过大。'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}
  const b=JSON.parse(new TextDecoder().decode(bytes));let payload:Record<string,unknown>;
  if(['start','finish'].includes(b.op)||(b.op==='homework-list'&&req.headers.has('x-student-token'))){
   const token=req.headers.get('x-student-token')||'';if(!/^[a-f0-9]{64}$/.test(token))return reply({error:'请重新登录。'},401);
   payload={token_hash:await digest(token),asset_id:b.asset_id,exercise_id:b.exercise_id,run_id:b.run_id,items:b.items};
  }else{
   if(!['students','history','load','refresh','save','homework-list','homework-options','homework-publish','homework-cancel'].includes(b.op))return reply({error:'操作不支持。'},400);
   const bearer=req.headers.get('authorization')||'';if(!bearer.startsWith('Bearer '))return reply({error:'需要管理员登录。'},401);
   const user=await fetch(URL+'/auth/v1/user',{headers:{apikey:KEY,Authorization:bearer}});if(!user.ok)return reply({error:'管理员登录已过期，请重新登录。'},401);
   payload={actor:(await user.json()).id,student_id:b.student_id,month:b.month,comment:b.comment,comment_en:b.comment_en,
    batch_id:b.batch_id,title:b.title,due_date:b.due_date,student_ids:b.student_ids,exercises:b.exercises};
  }
  const rpc=b.op.startsWith('homework-')?'zx_homework_gateway':'zx_reports_gateway';
  const r=await fetch(URL+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({op:b.op,payload})});
  if(!r.ok){const e=await r.json();return reply({error:e.message==='denied'?'没有访问权限。':(b.op.startsWith('homework-')&&/^[\u3400-\u9fff]/.test(e.message)?e.message:'保存未完成，请检查输入或稍后重试。')},e.message==='denied'?403:400);}
  return reply(await r.json());
 }catch{return reply({error:'请求未完成，请检查网络并重试。'},400);}
}
if(import.meta.main)Deno.serve(reportHandler);

