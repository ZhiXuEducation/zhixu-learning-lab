// Sends practice submissions; the existing login flow is unchanged.
(()=>{
 const pending=[];let sending=false;
 const note=document.createElement('p');note.id='sync-status';note.setAttribute('role','status');note.style.cssText='padding:8px 0;color:#425d52';
 const retry=document.createElement('button');retry.type='button';retry.textContent='重试成绩同步';retry.hidden=true;
 document.querySelector('main').prepend(note,retry);
 function current(){try{return JSON.parse(sessionStorage.getItem('zx_session')||'null')}catch{return null}}
 async function flush(){
  if(sending)return;sending=true;
  try{while(pending.length){
   const e=pending[0],s=current();if(s?.type!=='student'||s.token!==e.owner){note.textContent='有未同步的练习记录，请保持原学生登录后重试。';retry.hidden=false;return;}
   const r=await fetch('https://cogvtrcoifppwkzzhect.supabase.co/functions/v1/zhixu-reports',{method:'POST',headers:{'Content-Type':'application/json','x-student-token':s.token},body:JSON.stringify(e.body)});
   if(!r.ok)throw Error('sync failed');pending.shift();
  }note.textContent='本次练习记录已同步，老师可在月报中查看。';retry.hidden=true;
  }catch{note.textContent='练习记录尚未同步，请勿关闭本页，检查网络后点击重试。';retry.hidden=false;}finally{sending=false;}
 }
 window.addEventListener('message',event=>{
  const frame=document.getElementById('lesson-frame'),s=current(),b=event.data;
  if(event.source!==frame?.contentWindow||event.origin!==location.origin||s?.type!=='student'||b?.type!=='zx-learning'||!['start','finish'].includes(b.op))return;
  pending.push({owner:s.token,body:{op:b.op,asset_id:b.asset_id,exercise_id:b.exercise_id,run_id:b.run_id,...(b.op==='finish'?{items:b.items}:{})}});note.textContent='正在同步练习记录…';flush();
 });
 retry.onclick=flush;window.addEventListener('online',flush);
 window.addEventListener('beforeunload',e=>{if(pending.length){e.preventDefault();e.returnValue='';}});
})();
