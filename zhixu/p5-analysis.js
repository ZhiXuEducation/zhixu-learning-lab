// A scoped panel inside the existing teacher report, retaining its student/month controls.
(()=>{
 const skills=['语境选词','近义词辨析','词语搭配','病句辨析','语序与句子成分','关联词运用','句意逻辑'];
 const config={minimum:5,mastery:.8,consolidate:.6};
 const n=(t,text)=>{const e=document.createElement(t);if(text!==undefined)e.textContent=text;return e};
 let seq=0,data=null,currentRows=[];
 const section=n('section');section.id='p5-analysis';section.className='section screen-only';section.hidden=true;
 const h=n('h2','小五复习区｜考点与错题重做'),note=n('p','仅统计首次正式完整提交。错题重做和后续完整练习另列，不计入首次正确率。'),live=n('p'),scope=n('select');scope.setAttribute('aria-label','小五复习统计范围');
 for(const [v,t]of [['monthly','所选月份首次作答'],['cumulative','累计至所选月末']]){const o=n('option',t);o.value=v;scope.append(o)}
 const summary=n('p'),table=n('table'),head=n('thead'),header=n('tr'),tbody=n('tbody');for(const t of ['考点','作答','正确','错误','正确率','掌握情况','与上月比较'])header.append(n('th',t));head.append(header);table.append(head,tbody);const wrap=n('div');wrap.style.overflowX='auto';wrap.append(table);
 const sets=n('div'),download=n('button','导出小五考点与首次成绩 CSV');download.type='button';
 section.append(h,note,live,scope,summary,wrap,n('h3','各套首次成绩与重做情况'),sets,download);document.getElementById('report').append(section);
 const pct=x=>x.total?Math.round(x.correct/x.total*100)+'%':'—';
 const label=x=>x.total===0?'尚无记录':x.total<config.minimum?'样本不足':x.correct/x.total>=config.mastery?'基本掌握':x.correct/x.total>=config.consolidate?'需要巩固':'优先强化';
 const score=r=>r?.results?`${r.results.filter(q=>q.correct).length}/${r.results.length}`:'尚未完成';
 const stamp=v=>new Intl.DateTimeFormat('zh-SG',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
 function draw(){tbody.replaceChildren();sets.replaceChildren();const selected=data[scope.value]||[];currentRows=skills.map(skill=>selected.find(x=>x.skill===skill)||{skill,total:0,correct:0,wrong:0});
 const weak=currentRows.filter(x=>x.total>=config.minimum&&x.correct/x.total<config.mastery).sort((a,b)=>a.correct/a.total-b.correct/b.total||b.wrong-a.wrong).slice(0,3);summary.textContent='优先关注：'+(weak.length?weak.map(x=>`${x.skill} ${pct(x)}（错${x.wrong}题）`).join('；'):'暂无足够样本支持的薄弱项');
 for(const x of currentRows){const previous=data.previous.find(p=>p.skill===x.skill),present=data.monthly.find(p=>p.skill===x.skill);const trend=scope.value==='monthly'&&previous?.total>=config.minimum&&present?.total>=config.minimum?`${Math.round((present.correct/present.total-previous.correct/previous.total)*100)}个百分点（上月${previous.total}题／本月${present.total}题）`:'样本不足或非月度范围';const tr=n('tr');for(const v of [x.skill,x.total,x.correct,x.wrong,pct(x),label(x),trend])tr.append(n('td',v));tbody.append(tr)}
 const m=data.month;for(let i=1;i<=12;i++){const id='p5-review-'+String(i).padStart(2,'0'),r=data.sets.find(x=>x.exercise_id===id),box=n('details'),sgMonth=r?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit'}).format(new Date(r.first.submitted_at)).replace('/','-'):null;box.append(n('summary',`第${i}套｜首次 ${score(r?.first)}${scope.value==='monthly'&&sgMonth!==m?'（首次不在本月或尚未完成）':''}`));
 if(r){box.append(n('p',`首次提交：${stamp(r.first.submitted_at)}；最新完整练习 ${score(r.latest)}；完整提交共${r.attempts}次。`),n('p',`错题重做：${r.retry_count}次；最近一次 ${score(r.retry)}${r.retry?' · '+stamp(r.retry.submitted_at):''}`));const wrong=r.first.results.filter(q=>!q.correct);if(wrong.length){const ul=n('ul');for(const q of wrong)ul.append(n('li',`${q.skill}｜${q.prompt}｜原答案：${'ABCD'[q.answer]}；正确：${'ABCD'[q.expected]}`));box.append(ul)}}sets.append(box)}
 }
 scope.onchange=()=>{if(data)draw()};
 download.onclick=()=>{if(!data)return;const escape=v=>'"'+String(v).replace(/"/g,'""')+'"';const rows=[['小五复习区',data.month,scope.selectedOptions[0].textContent],['考点','作答','正确','错误','正确率','掌握情况'],...currentRows.map(x=>[x.skill,x.total,x.correct,x.wrong,pct(x),label(x)]),[],['练习','首次分数','首次时间','最新完整练习','重做次数','最近错题重做'],...data.sets.map(x=>[x.exercise_id,score(x.first),stamp(x.first.submitted_at),score(x.latest),x.retry_count,score(x.retry)])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=n('a');a.href=url;a.download='小五复习区-'+data.month+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 window.addEventListener('zx-p5-report',async()=>{const ticket=++seq;data=null;section.hidden=false;scope.hidden=true;download.hidden=true;tbody.replaceChildren();sets.replaceChildren();summary.textContent='';live.textContent='正在读取小五复习记录…';try{const r=await call('p5-analysis');if(ticket!==seq)return;data=r;scope.hidden=false;download.hidden=false;live.textContent='按当前练习记录统计，截至'+r.month+'月底；不改写已保存的历史报告。';draw()}catch(e){if(ticket===seq)live.textContent='小五分析暂未读取：'+e.message}});
})();
