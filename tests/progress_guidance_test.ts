import '../zhixu/progress-guidance.js';
const guidance=(globalThis as any).ZhixuProgress;
Deno.test('parent guidance is bounded, grounded in unit evidence, and excludes sparse samples',()=>{
 const units=Array.from({length:30},(_,i)=>({asset_id:'s1-express',unit:'单元'+(i+1),total:25,correct:20,skills:[{skill:'拼音字词',total:5,correct:1}]}));
 const rows=guidance({units});if(rows.length!==3)throw Error('unbounded report');
 if(!rows[0].area.includes('单元1')||!rows[0].evidence.includes('20/25')||!rows[0].advice.includes('pinyin'))throw Error('unit evidence/advice missing');
 if(guidance({units:[{...units[0],total:4,correct:0}]}).length)throw Error('insufficient data treated as weak unit');
 if(guidance({units:[{...units[0],correct:25}]}).length)throw Error('invented weakness');
});
