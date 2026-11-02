-- Data-only publication. The private payload is transferred separately; never commit it.
-- Expected payload/HTML hashes are substituted by the local release script.
begin;
do $publish$
declare p jsonb;bank jsonb;s jsonb;new_questions jsonb;h text;new_title text;label_a text;label_b text;
begin
 select html::jsonb into p from zx_private.course_content where asset_id='__psle_combo_stage_20261102' and md5(html)='__UPLOAD_MD5__' for update;
 if p is null then raise exception 'Missing or invalid private upload';end if;
 bank:=(p->>'bank')::jsonb;
 if jsonb_typeof(bank)<>'array' or jsonb_array_length(bank)<>12 then raise exception 'Expected twelve sets';end if;
 select html into h from zx_private.course_content where asset_id='psle-review' and md5(html)='07b460db5d75c04ae5663f5709530d11' for update;
 if h is null then raise exception 'Original course changed; rebase publication';end if;
 if (select md5(string_agg(exercise_id||title||questions::text,'' order by exercise_id)) from zx_private.exercise_catalog where asset_id='psle-review')<>'7750d76f2e5f81f8d3ac4d7801e90666' then raise exception 'Original catalog changed';end if;
 if exists(select 1 from zx_private.exercise_catalog where asset_id='psle-review' and exercise_id like 'psle-rev-combo-%') then raise exception 'Combined sets already exist';end if;
 if length(h)-length(replace(h,p->>'oldUi',''))<>length(p->>'oldUi') or length(h)-length(replace(h,'</body>',''))<>length('</body>') then raise exception 'UI anchor is not unique';end if;
 for s in select value from jsonb_array_elements(bank) loop
  if s->>'kind'<>'combo' or s->>'id' !~ '^psle-rev-combo-[0-9]{2,}$' or jsonb_array_length(s->'groups')<>2 then raise exception 'Invalid combined set';end if;
  select jsonb_agg(jsonb_build_object(
   'id',q.item->>'id',
   'skill','组合训练｜'||case g.item->>'kind' when 'language' then '语文应用' when 'cloze' then '短文填空' when 'dialogue' then '完成对话' when 'reading' then '阅读理解（一）' end||'｜Part '||(g.item->>'part')||'｜'||(q.item->>'tag'),
   'prompt','Part '||(g.item->>'part')||'｜'||case g.item->>'kind' when 'language' then '语文应用' when 'cloze' then '短文填空' when 'dialogue' then '完成对话' when 'reading' then '阅读理解（一）' end||'｜'||(q.item->>'prompt'),
   'answer',(q.item->'options')->>((q.item->>'answer')::int),
   'accepted','[]'::jsonb,'self',false,'points',q.item->'points','part',g.item->>'part','kind',g.item->>'kind') order by g.ord,q.ord) into new_questions
  from jsonb_array_elements(s->'groups') with ordinality g(item,ord) cross join lateral jsonb_array_elements(g.item->'items') with ordinality q(item,ord);
  label_a:=case s->'groups'->0->>'kind' when 'language' then '语文应用' when 'cloze' then '短文填空' when 'dialogue' then '完成对话' when 'reading' then '阅读理解（一）' end;
  label_b:=case s->'groups'->1->>'kind' when 'language' then '语文应用' when 'cloze' then '短文填空' when 'dialogue' then '完成对话' when 'reading' then '阅读理解（一）' end;
  new_title:='PSLE 第二阶段｜'||(s->>'title')||'｜'||label_a||'＋'||label_b;
  insert into zx_private.exercise_catalog(asset_id,exercise_id,title,questions) values('psle-review',s->>'id',new_title,new_questions);
 end loop;
 if (select count(*) from zx_private.exercise_catalog where asset_id='psle-review' and exercise_id like 'psle-rev-combo-%')<>12
  or (select sum(jsonb_array_length(questions)) from zx_private.exercise_catalog where asset_id='psle-review' and exercise_id like 'psle-rev-combo-%')<>174
  or (select md5(string_agg(exercise_id||title||questions::text,'' order by exercise_id)) from zx_private.exercise_catalog where asset_id='psle-review' and exercise_id like 'psle-rev-combo-%')<>'__CATALOG_MD5__' then raise exception 'New catalog verification failed';end if;
 h:=replace(h,p->>'oldUi',p->>'newUi');
 h:=replace(h,'</body>','<script>window.PSLE_COMBO='||(p->>'bank')||';</script><script>'||(p->>'js')||'</script></body>');
 if md5(h)<>'__HTML_MD5__' then raise exception 'New protected course verification failed';end if;
 update zx_private.course_content set html=h where asset_id='psle-review';
 if (select md5(string_agg(exercise_id||title||questions::text,'' order by exercise_id)) from zx_private.exercise_catalog where asset_id='psle-review' and exercise_id not like 'psle-rev-combo-%')<>'7750d76f2e5f81f8d3ac4d7801e90666' then raise exception 'Original catalog was altered';end if;
 update zx_private.course_content set html='' where asset_id='__psle_combo_stage_20261102' and allowed_courses=array[]::text[];
end $publish$;
commit;
