// Deterministic guidance from recorded answers. No generated teacher comments.
(()=>{
 const tips={
  '拼音字词':['复习本单元拼音和易混字词，再做一组针对练习。','Review this unit’s pinyin and commonly confused words, then complete a focused exercise.'],
  '拼音辨析':['对照声母、韵母和声调朗读易错词，再练习辨析。','Read the commonly confused words aloud, checking initials, finals and tones.'],
  '短文填空':['先通读短文，圈出前后文线索，再检查选词是否符合语境。','Read the whole passage, underline context clues and check whether each word fits.'],
  '词语替换':['复习词义与搭配，把易错词放回句子中比较和练习。','Review word meanings and collocations, then practise them in complete sentences.'],
  '词语应用':['复习词义与搭配，再用本单元词语完成情境练习。','Review meanings and collocations, then use the unit’s vocabulary in context.'],
  'collocation':['把易错搭配整理成短语，并放入句子中练习。','Group difficult collocations into phrases and practise using them in sentences.'],
  'meaning':['结合上下文辨析近义词，再用例句确认词义。','Use context to distinguish similar words and confirm meanings with example sentences.'],
  'replacement':['比较原词与替换词的意思和搭配，再检查句子是否通顺。','Compare meanings and collocations, then check that the revised sentence reads naturally.']
 };
 const number=x=>({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}[x]||x);
 function course(asset){const m=asset.match(/^s([1-4])-(express|higher)$/);if(m)return `中${({'1':'一','2':'二','3':'三','4':'四'}[m[1]])} · ${m[2]==='express'?'快捷':'高华'} / Secondary ${m[1]} ${m[2]==='express'?'Express':'Higher Chinese'}`;return asset.startsWith('p6')?'小六华文 / Primary 6 Chinese':asset==='essay-training'?'作文审题 / Writing task analysis':asset==='psle-review'?'PSLE复习 / PSLE revision':'基础复习 / Foundation revision';}
 function unit(label){const set=label.match(/作文审题第([0-9]+)套/);if(set)return label+' / Set '+set[1];const m=label.match(/(?:单元|第)([一二三四五六七八九十0-9]+)(课)?/);return label+(m?` / ${m[2]?'Lesson':'Unit'} ${number(m[1])}`:'');}
 globalThis.ZhixuProgress=(s,skillLabel=x=>x)=>{
  const units=(s.units||[]).filter(x=>x.total>=5&&x.total-x.correct>=2).sort((a,b)=>(b.total-b.correct)-(a.total-a.correct)||a.correct/a.total-b.correct/b.total);
  return units.slice(0,3).map(u=>{
   const focus=(u.skills||[]).filter(k=>k.total>=5&&k.total-k.correct>=2).sort((a,b)=>(b.total-b.correct)-(a.total-a.correct))[0];
   const writing=u.asset_id==='essay-training';
   const tip=focus&&tips[focus.skill]?tips[focus.skill]:writing?['先圈出题目关键词，确认写作任务与限制条件，再练习判断是否切题。','Underline key words, identify the writing task and constraints, then practise staying on topic.']:['复习本单元内容，订正易错知识点，再完成一组针对练习。','Review this unit, correct the difficult areas and complete a focused practice set.'];
   return {area:course(u.asset_id)+'\n'+unit(u.unit)+(focus?'\n重点 / Focus: '+skillLabel(focus.skill):''),evidence:`本月答题 ${u.correct}/${u.total}\nRecorded answers: ${u.correct}/${u.total}`+(focus?`\n${skillLabel(focus.skill)}: ${focus.correct}/${focus.total}`:''),advice:tip.join('\n')};
  });
 };
})();
