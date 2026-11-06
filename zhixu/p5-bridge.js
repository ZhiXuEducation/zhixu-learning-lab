// P5 uses the same authenticated reports endpoint; no credentials enter the lesson frame.
(()=>{window.addEventListener('message',async e=>{
 const frame=document.getElementById('lesson-frame'),b=e.data;
 if(e.source!==frame?.contentWindow||e.origin!==location.origin||window.zxActiveAssetId!=='p5-review'||b?.type!=='zx-p5-request'||!['p5-history','p5-start','p5-finish','p5-retry'].includes(b.op)||typeof b.id!=='string')return;
 let s;try{s=JSON.parse(sessionStorage.getItem('zx_session')||'null')}catch{}
 const respond=data=>{if(frame.contentWindow===e.source)e.source.postMessage({type:'zx-p5-response',id:b.id,...data},location.origin)};
 if(!s)return respond({error:'请重新登录。'});
 try{const body={op:b.op,asset_id:'p5-review',exercise_id:b.exercise_id,run_id:b.run_id,retry_id:b.retry_id,base_run_id:b.base_run_id,items:b.items};
 if(['p5-start','p5-finish'].includes(b.op)&&b.assigned===true&&b.exercise_id===window.zxHomeworkExerciseId&&window.zxHomeworkBatchId)body.homework_batch_id=window.zxHomeworkBatchId;
 const headers={'Content-Type':'application/json',...(s.type==='student'?{'x-student-token':s.token}:{Authorization:'Bearer '+s.access_token})};
 const r=await fetch('https://cogvtrcoifppwkzzhect.supabase.co/functions/v1/zhixu-reports',{method:'POST',headers,body:JSON.stringify(body)}),data=await r.json();if(!r.ok)throw Error(data.error||'保存失败，请重试。');respond({data});
 }catch(err){respond({error:err.message||'网络中断，请重试。'})}
 })})();
