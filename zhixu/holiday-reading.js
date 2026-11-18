'use strict';

const readingRoot=document.getElementById('reading');
const readingTitle=document.getElementById('reading-title');
const readingOrigin=new URL(document.baseURI).origin;
let readingRun=null;
let readingSet=null;
let readingAnswers=[];

function readingNode(tag,text){
 const element=document.createElement(tag);
 if(text!==undefined)element.textContent=text;
 return element;
}
function readingButton(label,action){
 const button=readingNode('button',label);
 button.type='button';button.onclick=action;
 return button;
}
function readingEvent(op,items){
 if(parent===window)return;
 parent.postMessage({type:'zx-learning',op,asset_id:COURSE.id,exercise_id:readingSet.id,run_id:readingRun,items},readingOrigin);
}
function readingHome(){
 readingTitle.textContent=COURSE.title;
 readingRoot.replaceChildren();
 const grid=readingNode('div');grid.className='grid';
 for(const set of COURSE.sets){
  const card=readingNode('section');card.className='card';
  card.append(readingNode('h2',set.title),readingNode('p',set.level+' · '+set.questions.length+'题'),readingButton('开始练习',()=>start(set)));
  grid.append(card);
 }
 readingRoot.append(grid);
}
function readingFocus(){
 readingTitle.focus();window.scrollTo(0,0);
}
function start(set){
 readingRun=crypto.randomUUID();readingSet=set;readingAnswers=[];
 readingTitle.textContent=set.title;
 const form=readingNode('form');
 for(const [i,q] of set.questions.entries()){
  const field=readingNode('fieldset');field.className='card';
  field.append(readingNode('legend','第'+(i+1)+'题'),readingNode('p',q.passage),readingNode('p','原题：'+q.original+'（模拟 '+q.marks+' 分）'));
  if(q.draft)field.append(readingNode('p','示例作答：'+q.draft));
  field.append(readingNode('p',q.task));
  q.options.forEach((option,index)=>{
   const label=readingNode('label'),input=readingNode('input');
   input.type='radio';input.name=q.id;input.value=String(index);input.required=true;
   input.addEventListener('change',()=>{readingAnswers[i]=input.value;});
   label.append(input,document.createTextNode(' '+'ABCD'[index]+'．'+option));field.append(label);
  });
  form.append(field);
 }
 form.append(readingNode('button','提交答案'));
 form.onsubmit=event=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  readingEvent('finish',set.questions.map((q,i)=>({id:q.id,answer:readingAnswers[i]})));
  readingResult(set);
 };
 readingRoot.replaceChildren(readingButton('← 返回练习列表',()=>{if(!readingAnswers.some(v=>v!==undefined)||confirm('返回会放弃本次未提交答案。确定返回？')){readingHome();readingFocus();}}),readingNode('p','完成全部 20 题后统一提交。'),form);
 readingEvent('start');readingFocus();
}
function readingResult(set){
 const total=set.questions.length;
 const correct=set.questions.filter((q,i)=>readingAnswers[i]===q.answer).length;
 readingTitle.textContent=set.title+'｜练习结果';
 const summary=readingNode('p','答对 '+correct+' / '+total+' 题（'+Math.round(correct/total*100)+'%）');
 readingRoot.replaceChildren(summary,readingButton('← 返回练习列表',()=>{readingHome();readingFocus();}));
 for(const [i,q] of set.questions.entries()){
  const section=readingNode('section');section.className='card';
  section.append(readingNode('h2','第'+(i+1)+'题 · '+(readingAnswers[i]===q.answer?'正确':'错误')),
   readingNode('p',q.passage),readingNode('p','原题：'+q.original+'（模拟 '+q.marks+' 分）'));
  if(q.draft)section.append(readingNode('p','示例作答：'+q.draft));
  section.append(readingNode('p',q.task),readingNode('p','你的选择：'+'ABCD'[Number(readingAnswers[i])]+'；正确选项：'+'ABCD'[Number(q.answer)]));
  const explanations=readingNode('ul');
  q.options.forEach((option,index)=>explanations.append(readingNode('li','ABCD'[index]+'．'+option+' —— '+q.explanations[index])));
  section.append(explanations,readingNode('p','参考答案：'+q.reference),readingNode('h3','知序模拟得分点（每点 1 分）'));
  const rubric=readingNode('ol');q.rubric.forEach(point=>rubric.append(readingNode('li',point)));
  section.append(rubric,readingNode('p','答题技巧：'+q.tip));readingRoot.append(section);
 }
 readingFocus();
}
readingHome();
