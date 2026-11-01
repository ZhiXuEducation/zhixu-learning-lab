'use strict';
const $=id=>document.getElementById(id),API='https://cogvtrcoifppwkzzhect.supabase.co/functions/v1/zhixu-reports';
const noData='暂无数据 / No data';
const skillNames={"语文应用": "Language use", "短文填空": "Cloze passage", "综合填空": "Cloze passage", "词语替换": "Vocabulary replacement", "造句自评": "Sentence writing (self-assessed)", "拼音字词": "Pinyin and vocabulary", "完成对话": "Dialogue completion", "拼音辨析": "Pinyin discrimination", "词义辨析": "Word meanings", "字词": "Vocabulary", "偏题辨认": "Recognising off-topic content", "写作任务": "Writing task", "切题判断": "Staying on topic", "情境意识": "Audience and context", "材料焦点": "Focus of source material", "材料理解": "Understanding source material", "核心问题": "Key issue", "讨论对象": "Subject of discussion", "论证分寸": "Scope of argument", "论证组织": "Organising arguments", "词语应用": "Vocabulary use", "词语理解": "Vocabulary comprehension", "限制条件": "Task constraints", "choice": "Contextual choice", "collocation": "Collocations", "meaning": "Word meanings", "replacement": "Vocabulary replacement"};
const skillChinese={"choice": "语境选择", "collocation": "搭配", "meaning": "词义理解", "replacement": "词语替换"};
const skillLabel=s=>(skillChinese[s]||s)+(skillNames[s]?' / '+skillNames[s]:'');
let students=[],loaded=null,studentId='',month='',loading=false;
const fmt=v=>v===null?noData:v;
function status(t){$('status').textContent=t;}
function session(){try{return JSON.parse(sessionStorage.getItem('zx_session')||'null')}catch{return null}}
async function call(op,extra={}){
 const s=session();if(s?.type!=='admin')throw Error('请先返回后台完成管理员登录。');
 const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.access_token},body:JSON.stringify({op,student_id:studentId,month,...extra})});
 const d=await r.json();if(!r.ok)throw Error(d.error||'请求失败。');return d;
}
async function busy(fn){if(loading)return;loading=true;document.querySelectorAll('button,select,input').forEach(e=>e.disabled=true);try{await fn();}catch(e){status(e.message);}finally{loading=false;document.querySelectorAll('button,select,input').forEach(e=>e.disabled=false);}}
function row(tbody,cells){const tr=document.createElement('tr');cells.forEach(x=>{const td=document.createElement('td');td.textContent=x;tr.append(td)});$(tbody).append(tr);}
const textAnswer=v=>Array.isArray(v)?v.map(i=>Number.isInteger(i)?'ABCD'[i]:String(i)).join('、'):typeof v==='number'?String(v+1):String(v??'');
function render(){
 const s=loaded.snapshot,h=s.homework,who=students.find(x=>x.id===studentId);$('report').hidden=false;$('student-name').textContent=who?`${who.name}（${who.username||who.number}）`:'';$('report-month').textContent=month;
 $('homework-summary').textContent=!h?'此历史版本未含功课统计；请刷新并保存。 / Refresh and save to include homework.':!h.assigned?'本月暂无到期功课 / No homework due this month.':`功课完成 ${h.completed}/${h.assigned}（${Math.round(h.completed/h.assigned*100)}%）· 按时 ${h.on_time}/${h.assigned}（${Math.round(h.on_time/h.assigned*100)}%）· 未完成 ${h.incomplete}（逾期 ${h.overdue}）· 迟交 ${h.late} / Homework completed ${h.completed}/${h.assigned}; on time ${h.on_time}/${h.assigned}; incomplete ${h.incomplete} (overdue ${h.overdue}); late ${h.late}.`;
 $('saved-label').textContent=loaded.saved?'已保存的历史版本':'按现有真实记录生成，尚未保存';
 $('completion').textContent=s.started?Math.round(s.completed/s.started*100)+'%':noData;$('accuracy').textContent=s.questions?Math.round(s.correct/s.questions*100)+'%':noData;
 $('sets').textContent=s.started?`${s.completed} / ${s.started}`:noData;$('wrong-count').textContent=s.questions?String(s.wrong_count):noData;
 $('strengths').replaceChildren();const strengths=s.skills.filter(x=>x.total>=5&&x.correct/x.total>=0.8).sort((a,b)=>b.correct/b.total-a.correct/a.total||b.total-a.total).slice(0,2);
 if(strengths.length)strengths.forEach(x=>row('strengths',[skillLabel(x.skill),`本月已记录练习答对 ${x.correct}/${x.total} 题。\nCorrect answers in recorded practice: ${x.correct}/${x.total}.`]));
 else row('strengths',[s.questions?'继续积累练习记录，再观察表现较稳定的方面。 / More practice is needed to identify consistent strengths.':noData,'—']);
 $('priorities').replaceChildren();const priorities=ZhixuProgress(s,skillLabel);
 if(priorities.length)priorities.forEach(p=>row('priorities',[p.area,p.evidence,p.advice]));
 else row('priorities',[s.questions?(s.wrong_count?'记录较少，暂不判断具体薄弱单元 / More practice is needed to identify specific areas.':'本月已记录客观题未发现明显薄弱项 / No clear difficulty found in recorded questions.') : noData,'—',s.questions?'继续完成单元练习，积累更多学习记录。 / Complete further unit practice to build a clearer picture.':'暂无建议 / No recommendation yet']);
 $('wrong-all').replaceChildren();if(s.wrong.length)s.wrong.forEach(x=>row('wrong-all',[x.asset_id+' / '+x.exercise_id,x.skill+'：'+x.prompt,textAnswer(x.answer)+' / '+textAnswer(x.expected)]));else row('wrong-all',['暂无错题记录','—','—']);
 $('comment').value=loaded.comment||'';$('comment-en').value=loaded.comment_en||'';syncComments();
}
async function openReport(id,m){loaded=null;$('report').hidden=true;studentId=id;month=m;loaded=await call('load');render();}
async function history(){const list=await call('history');$('history').replaceChildren();if(!list.length){$('history').textContent='暂无历史报告';return;}list.forEach(x=>{const b=document.createElement('button');b.type='button';b.textContent=x.month.slice(0,7);b.onclick=()=>busy(async()=>{if(!canLeave())return;await openReport(studentId,x.month.slice(0,7));$('month').value=month;status('已打开历史报告。')});$('history').append(b)});}
function canLeave(){return !loaded||($('comment').value===(loaded.comment||'')&&$('comment-en').value===(loaded.comment_en||''))||confirm('教师评语尚未保存，确定离开当前报告吗？');}
$('filters').onsubmit=e=>{e.preventDefault();busy(async()=>{if(!canLeave())return;await openReport($('student').value,$('month').value);await history();status(loaded.saved?'已载入保存的报告。':'已读取实际练习记录。')});};
$('refresh').onclick=()=>busy(async()=>{if(!loaded)return;const comment=$('comment').value,commentEn=$('comment-en').value;loaded=await call('refresh');render();$('comment').value=comment;$('comment-en').value=commentEn;$('comment').dispatchEvent(new Event('input'));status('统计已刷新；请保存以更新历史报告。')});
$('save').onclick=()=>busy(async()=>{if(!loaded)return;loaded=await call('save',{comment:$('comment').value,comment_en:$('comment-en').value});render();await history();status('报告和教师评语已保存。')});
function syncComments(){
 $('comment-print').textContent=$('comment').value||'暂无教师评语';$('comment-en-print').textContent=$('comment-en').value||'No teacher comment yet.';
 if(loaded)$('saved-label').textContent=($('comment').value!==(loaded.comment||'')||$('comment-en').value!==(loaded.comment_en||''))?'教师评语有未保存修改':(loaded.saved?'已保存的历史版本':'按现有真实记录生成，尚未保存');
}
$('comment').oninput=syncComments;$('comment-en').oninput=syncComments;
$('export').onclick=()=>busy(async()=>{
 if(!loaded){status('请先查看报告。');return;}
 syncComments();
 await document.fonts.ready;
 const canvas=await html2canvas($('report'),{scale:2,backgroundColor:'#ffffff',logging:false,windowWidth:794,onclone:doc=>doc.getElementById('report').classList.add('pdf-export')});
 const pdf=new jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
 const ratio=Math.min(186/canvas.width,273/canvas.height),width=canvas.width*ratio,height=canvas.height*ratio;
 pdf.setFillColor(255,255,255);pdf.rect(0,0,210,297,'F');
 pdf.addImage(canvas.toDataURL('image/jpeg',0.96),'JPEG',12,12,width,height);
 const who=students.find(x=>x.id===studentId);pdf.save(`ZHIXU-${who?.username||who?.number||'student'}-${month}.pdf`);
 status('PDF 已生成。'+(($('comment').value!==(loaded.comment||'')||$('comment-en').value!==(loaded.comment_en||''))?'评语尚未保存到历史报告。':''));
});
busy(async()=>{
 students=await call('students');students.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=`${s.number}号 ${s.name} (${s.username||''})`;$('student').append(o)});
 $('month').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit'}).format(new Date()).replace('/','-');
 if(!/^\d{4}-\d{2}$/.test($('month').value)){const p=new Intl.DateTimeFormat('en',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit'}).formatToParts(new Date());$('month').value=p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value;}
 status(students.length?'选择学生和月份后查看报告。':'暂无学生。');
});

