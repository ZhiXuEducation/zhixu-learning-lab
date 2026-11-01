import {digest,equalHash,pinHash,randomHex,randomPin} from './security.ts';
const URL=Deno.env.get('SUPABASE_URL')!;
const KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Derive PIN hashes with a server-only key. Rotating this key requires resetting student PINs.
const PEPPER=Deno.env.get('ZX_PIN_PEPPER') || KEY;
const ORIGIN='https://zhixueducation.github.io';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'content-type,authorization,x-student-token,apikey',
 'Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
class Failure extends Error { constructor(public status:number,message:string) {super(message);} }
async function api(path:string,body?:unknown,method='POST') {
 const r=await fetch(`${URL}${path}`,{method,headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok) {
  const detail=await r.json().catch(()=>({}));
  if(detail.message==='denied') throw new Failure(403,'没有访问权限，账号可能已停用或登录已过期。');
  if(detail.code==='23505') throw new Failure(400,'英文账号已被使用，请换一个。');
  if(['P0001','23514','22P02'].includes(detail.code)) throw new Failure(400,'请检查姓名、年级和课程设置。');
  throw new Failure(503,'服务暂时不可用，请稍后重试。');
 }
 return r.status===204?null:await r.json();
}
async function rpc(op:string,payload:Record<string,unknown>) {return await api('/rest/v1/rpc/zx_student_gateway',{op,payload});}
async function identity(req:Request) {
 const student=req.headers.get('x-student-token');
 if(student) {
  if(!/^[a-f0-9]{64}$/.test(student)) throw new Failure(401,'请重新登录。');
  return {token_hash:await digest(student)};
 }
 const authorization=req.headers.get('authorization');
 if(!authorization?.startsWith('Bearer ')) throw new Failure(401,'请先登录。');
 const r=await fetch(`${URL}/auth/v1/user`,{headers:{apikey:KEY,Authorization:authorization}});
 if(!r.ok) throw new Failure(401,'请重新登录。');
 const user=await r.json();
 // The database rechecks the current active admin role on EVERY RPC.
 return {actor:user.id};
}
export async function handler(req:Request) {
 if(req.method==='OPTIONS') return new Response(null,{headers});
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try {
  if(req.method!=='POST') throw new Failure(405,'请求方式不支持。');
  if(req.headers.get('origin') && req.headers.get('origin')!==ORIGIN) throw new Failure(403,'访问来源不支持。');
  const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
  if(reader) { while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;
   if(size>8192){await reader.cancel();throw new Failure(413,'请求过大。');}chunks.push(value);} }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const raw=new TextDecoder().decode(bytes);
  let body; try {body=JSON.parse(raw);} catch {throw new Failure(400,'请求格式不正确。');}
  if(!body || typeof body!=='object' || Array.isArray(body)) throw new Failure(400,'请求格式不正确。');
  const op=body.op;
  if(op==='login') {
   const code=String(body.code||'').trim().toUpperCase(), pin=String(body.pin||'');
   if(!code || code.length>80 || !/^\d{4}$/.test(pin)) throw new Failure(401,'账号或 PIN 不正确。');
   const stored=await rpc('reserve',{code});
   if(stored.limited) throw new Failure(429,'尝试次数过多，请稍后重试或联系老师重设 PIN。');
   const actual=await pinHash(stored.code||code,pin,stored.salt||'unknown-student-salt',PEPPER);
   if(!stored.id || !equalHash(actual,stored.pin_hash||'')) throw new Failure(401,'账号或 PIN 不正确。');
   const token=randomHex();
   await rpc('login',{id:stored.id,token_hash:await digest(token)});
   return reply({token});
  }
  if(!['me','courses','content','list','create','update','reset-pin','logout'].includes(op)) throw new Failure(400,'操作不支持。');
  const auth=await identity(req);
  if(op==='create') {
   // Explicitly verify administrator before performing expensive hashing.
   const me=await rpc('me',auth);
   if(me.role!=='admin') throw new Failure(403,'需要管理员权限。');
   const code=`ZX${randomHex(6).toUpperCase()}`,pin=randomPin(),salt=randomHex();
   const pin_hash=await pinHash(code,pin,salt,PEPPER);
   const result=await rpc('create',{name:body.name,username:body.username,grade:body.grade,courses:body.courses,code,salt,pin_hash,...auth});
   return reply({...result,code,pin,username:body.username?.trim()||code});
  }
  if(op==='reset-pin') {
   const me=await rpc('me',auth);
   if(me.role!=='admin') throw new Failure(403,'需要管理员权限。');
   const list=await rpc('list',auth), student=list.find((s:{id:string})=>s.id===body.id);
   if(!student) throw new Failure(400,'找不到该学生。');
   const previous=await rpc('pin-material',{id:student.id,...auth});
   let pin:string;
   do {pin=randomPin();} while(equalHash(await pinHash(student.student_code,pin,previous.salt,PEPPER),previous.pin_hash));
   const salt=randomHex(),pin_hash=await pinHash(student.student_code,pin,salt,PEPPER);
   await rpc('reset-pin',{id:student.id,salt,pin_hash,...auth});
   return reply({code:student.student_code,pin,username:student.username||student.student_code});
  }
  const payload=op==='update'?{id:body.id,name:body.name,username:body.username,grade:body.grade,active:body.active,courses:body.courses}:
   op==='content'?{asset_id:body.asset_id}:{};
  return reply(await rpc(op,{...payload,...auth}));
 } catch(e) {
  if(e instanceof Failure) return reply({error:e.message},e.status);
  // Never reflect raw database errors, tokens, PINs or request bodies.
  return reply({error:'操作未完成，请重新登录或检查输入。'},400);
 }
}
if(import.meta.main) Deno.serve(handler);
