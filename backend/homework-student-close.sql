begin;
alter table zx_private.homework_items add column closed_at timestamptz;
create or replace function zx_private.homework_rows(sid uuid default null) returns table(
 batch_id uuid,student_id uuid,asset_id text,exercise_id text,title text,exercise_title text,
 due_at timestamptz,assigned_at timestamptz,submitted_at timestamptz,status text
) language sql stable security invoker set search_path='' as $$
 select b.id,i.student_id,i.asset_id,i.exercise_id,b.title,c.title,b.due_at,b.created_at,r.submitted_at,
 case when r.submitted_at is not null then case when r.submitted_at<=b.due_at then 'completed' else 'late' end
 when now()>b.due_at then 'overdue' else 'pending' end
 from zx_private.homework_items i join zx_private.homework_batches b on b.id=i.batch_id
 join zx_private.exercise_catalog c on c.asset_id=i.asset_id and c.exercise_id=i.exercise_id
 left join lateral(select lr.submitted_at from zx_private.learning_runs lr
 where lr.student_id=i.student_id and lr.asset_id=i.asset_id and lr.exercise_id=i.exercise_id
 and (least(b.closed_at,i.closed_at) is null or lr.submitted_at<=least(b.closed_at,i.closed_at)) and lr.submitted_at>=b.created_at order by lr.submitted_at,lr.id limit 1) r on true
 where b.cancelled_at is null and (sid is null or i.student_id=sid);
$$;
create or replace function public.zx_homework_gateway(op text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor uuid;sid uuid;bid uuid;deadline timestamptz;ret jsonb;ids uuid[];exercises jsonb;label text;
begin
 if payload ? 'token_hash' then
  select st.id into sid from zx_private.student_sessions ss join public.zx_students st on st.id=ss.student_id
  where ss.token_hash=payload->>'token_hash' and ss.expires_at>now() and st.active;
  if sid is null or op not in ('homework-list','homework-open') then raise exception 'denied';end if;
 else
  actor:=(payload->>'actor')::uuid;
  if actor is null or not exists(select 1 from public.zx_profiles where id=actor and role='admin' and active) then raise exception 'denied';end if;
 end if;
 if op='homework-list' then
  select coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('closed_at',least(b.closed_at,i.closed_at))||case when sid is null then jsonb_build_object('student_name',s.display_name,'student_number',s.student_number) else '{}'::jsonb end order by h.due_at desc,h.title,s.student_number,h.exercise_title),'[]') into ret
  from zx_private.homework_rows(sid) h join public.zx_students s on s.id=h.student_id join zx_private.homework_batches b on b.id=h.batch_id join zx_private.homework_items i on i.batch_id=h.batch_id and i.student_id=h.student_id and i.asset_id=h.asset_id and i.exercise_id=h.exercise_id;
  return ret;
 end if;
 if op='homework-open' then
  if sid is null then raise exception 'denied';end if;
  perform 1 from zx_private.homework_items i join zx_private.homework_batches b on b.id=i.batch_id
   where i.batch_id=(payload->>'homework_batch_id')::uuid and i.student_id=sid
   and i.asset_id=payload->>'asset_id' and i.exercise_id=payload->>'exercise_id'
   and b.cancelled_at is null;
  if not found then raise exception 'denied';end if;
  if exists(select 1 from zx_private.homework_items i join zx_private.homework_batches b on b.id=i.batch_id
   where i.batch_id=(payload->>'homework_batch_id')::uuid and i.student_id=sid and i.asset_id=payload->>'asset_id' and i.exercise_id=payload->>'exercise_id'
   and (b.closed_at is not null or i.closed_at is not null)) then raise exception '功课已结束，不能通过原功课入口补交；请前往自由练习。';end if;
  return '{"ok":true}';
 end if;
 if op='homework-close-student' then
  update zx_private.homework_items set closed_at=coalesce(closed_at,now())
   where batch_id=(payload->>'batch_id')::uuid and student_id=(payload->>'student_id')::uuid;
  if not found then raise exception 'homework missing';end if;
  return '{"ok":true}';
 end if;
 if op='homework-options' then
  return jsonb_build_object('students',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.display_name,'number',s.student_number,'courses',coalesce((select jsonb_agg(sc.course_id) from public.zx_student_courses sc where sc.student_id=s.id),'[]')) order by s.student_number),'[]') from public.zx_students s where s.active),
   'exercises',(select coalesce(jsonb_agg(jsonb_build_object('asset_id',c.asset_id,'exercise_id',c.exercise_id,'title',c.title,'courses',ct.allowed_courses) order by c.asset_id,c.exercise_id),'[]') from zx_private.exercise_catalog c join zx_private.course_content ct on ct.asset_id=c.asset_id),
   'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title) order by id),'[]') from public.zx_courses where active));
 end if;
 if op='homework-close' then
  update zx_private.homework_batches set closed_at=coalesce(closed_at,now()) where id=(payload->>'batch_id')::uuid and cancelled_at is null;
  if not found then raise exception 'homework missing';end if;
  return '{"ok":true}';
 end if;
 if op='homework-cancel' then
  update zx_private.homework_batches set cancelled_at=coalesce(cancelled_at,now()) where id=(payload->>'batch_id')::uuid;
  if not found then raise exception 'homework missing';end if;
  return '{"ok":true}';
 end if;
 if op<>'homework-publish' then raise exception 'unknown operation';end if;
 bid:=(payload->>'batch_id')::uuid;label:=trim(payload->>'title');exercises:=payload->'exercises';
 if bid is null or label is null or length(label) not between 1 and 100 then raise exception '请填写功课名称';end if;
 -- Serialize publication, making retries idempotent and overlapping assignments unambiguous.
 perform pg_advisory_xact_lock(729114);
 if exists(select 1 from zx_private.homework_batches where id=bid) then return '{"ok":true,"replayed":true}';end if;
 if coalesce(payload->>'due_date','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then raise exception '请选择截止日期';end if;
 deadline:=((payload->>'due_date')::date+1)::timestamp at time zone 'Asia/Singapore';
 deadline:=deadline-interval '1 microsecond';
 if deadline<=now() then raise exception '截止日期不能早于今天';end if;
 if jsonb_typeof(payload->'student_ids') is distinct from 'array' or jsonb_array_length(payload->'student_ids') not between 1 and 100 then raise exception '请选择学生';end if;
 if jsonb_typeof(exercises) is distinct from 'array' or jsonb_array_length(exercises) not between 1 and 30 then raise exception '请选择1至30套练习';end if;
 select array_agg(distinct x::uuid) into ids from jsonb_array_elements_text(payload->'student_ids') x;
 if exists(select 1 from unnest(ids) x where not exists(select 1 from public.zx_students where id=x and active)) then raise exception '学生不存在或已停用';end if;
 if exists(select 1 from jsonb_array_elements(exercises) e where not exists(select 1 from zx_private.exercise_catalog c where c.asset_id=e->>'asset_id' and c.exercise_id=e->>'exercise_id')) then raise exception '练习不存在';end if;
 if exists(select 1 from unnest(ids) x cross join jsonb_array_elements(exercises) e where not exists(
  select 1 from zx_private.course_content ct join public.zx_courses co on co.id=any(ct.allowed_courses) and co.active
  where ct.asset_id=e->>'asset_id' and (co.id='essay-training' or exists(select 1 from public.zx_student_courses sc where sc.student_id=x and sc.course_id=co.id)))) then raise exception '部分学生尚未获授权访问所选课程';end if;
 if exists(select 1 from zx_private.homework_rows(null) h cross join jsonb_array_elements(exercises) e
  where h.student_id=any(ids) and h.asset_id=e->>'asset_id' and h.exercise_id=e->>'exercise_id' and h.submitted_at is null and exists(select 1 from zx_private.homework_batches b where b.id=h.batch_id and b.closed_at is null and exists(select 1 from zx_private.homework_items i where i.batch_id=h.batch_id and i.student_id=h.student_id and i.asset_id=h.asset_id and i.exercise_id=h.exercise_id and i.closed_at is null))) then raise exception '所选练习已有未完成的功课，请先完成或撤销旧功课';end if;
 insert into zx_private.homework_batches(id,title,due_at,created_by) values(bid,label,deadline,actor);
 insert into zx_private.homework_items select distinct bid,x,e->>'asset_id',e->>'exercise_id' from unnest(ids) x cross join jsonb_array_elements(exercises) e;
 return '{"ok":true}';
end $$;
create or replace function public.zx_reports_gateway(op text,payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid;sid uuid;m date;cat zx_private.exercise_catalog;r zx_private.learning_runs;q jsonb;v jsonb;graded jsonb:='[]';good boolean;snap jsonb;saved public.zx_monthly_reports;ret jsonb;
begin
 if op in ('start','finish') then
  select st.id into sid from zx_private.student_sessions ss join public.zx_students st on st.id=ss.student_id where ss.token_hash=payload->>'token_hash' and ss.expires_at>now() and st.active;
  if sid is null then raise exception 'denied'; end if;
  if payload->>'homework_batch_id' is not null then perform public.zx_homework_gateway('homework-open',payload);end if;
  select * into cat from zx_private.exercise_catalog where asset_id=payload->>'asset_id' and exercise_id=payload->>'exercise_id';
  if not found then raise exception 'unknown exercise'; end if;
  if not exists(select 1 from zx_private.course_content ct join public.zx_courses co on co.id=any(ct.allowed_courses) where ct.asset_id=cat.asset_id and co.active and (co.id='essay-training' or exists(select 1 from public.zx_student_courses sc where sc.student_id=sid and sc.course_id=co.id))) then raise exception 'denied'; end if;
  if op='start' then
   if (select count(*) from zx_private.learning_runs where student_id=sid and started_at>now()-interval '1 minute')>=20 then raise exception 'too many starts'; end if;
   insert into zx_private.learning_runs(id,student_id,asset_id,exercise_id) values((payload->>'run_id')::uuid,sid,cat.asset_id,cat.exercise_id) on conflict do nothing;
   if not exists(select 1 from zx_private.learning_runs where id=(payload->>'run_id')::uuid and student_id=sid and asset_id=cat.asset_id and exercise_id=cat.exercise_id) then raise exception 'denied'; end if;
   return '{"ok":true}';
  end if;
  select * into r from zx_private.learning_runs where id=(payload->>'run_id')::uuid and student_id=sid and asset_id=cat.asset_id and exercise_id=cat.exercise_id for update;
  if not found then raise exception 'start missing'; end if;
  if r.submitted_at is not null then return '{"ok":true}'; end if;
  if jsonb_array_length(payload->'items')<>jsonb_array_length(cat.questions) or (select count(distinct x->>'id') from jsonb_array_elements(payload->'items') x)<>jsonb_array_length(cat.questions) then raise exception 'incomplete submission'; end if;
  for q in select value from jsonb_array_elements(cat.questions) loop
   select x->'answer' into v from jsonb_array_elements(payload->'items') x where x->>'id'=q->>'id';
   if v is null or length(v::text)>2000 then raise exception 'invalid answer'; end if;
   if (q->>'self')::boolean then good:=null;
   else good:=zx_private.normal_answer(v)=zx_private.normal_answer(q->'answer') or exists(select 1 from jsonb_array_elements(q->'accepted') a where zx_private.normal_answer(v)=zx_private.normal_answer(a)); end if;
   graded:=graded||jsonb_build_array(jsonb_build_object('id',q->>'id','skill',q->>'skill','prompt',q->>'prompt','answer',v,'expected',q->'answer','correct',good,'self',(q->>'self')::boolean));
  end loop;
  update zx_private.learning_runs set submitted_at=now(),results=graded where id=r.id;
  return '{"ok":true}';
 end if;
 actor:=(payload->>'actor')::uuid;
 if actor is null or not exists(select 1 from public.zx_profiles where id=actor and role='admin' and active) then raise exception 'denied'; end if;
 if op='students' then select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name,'username',username,'number',student_number) order by student_number),'[]') into ret from public.zx_students;return ret; end if;
 sid:=(payload->>'student_id')::uuid;
 if not exists(select 1 from public.zx_students where id=sid) then raise exception 'student missing'; end if;
 if op='history' then select coalesce(jsonb_agg(jsonb_build_object('month',month,'updated_at',updated_at) order by month desc),'[]') into ret from public.zx_monthly_reports where student_id=sid;return ret; end if;
 if coalesce(payload->>'month','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
 m:=make_date(left(payload->>'month',4)::int,right(payload->>'month',2)::int,1);
 select * into saved from public.zx_monthly_reports where student_id=sid and month=m;
 if op='load' and saved.student_id is not null then return jsonb_build_object('snapshot',saved.snapshot,'comment',saved.teacher_comment,'comment_en',saved.teacher_comment_en,'saved',true,'updated_at',saved.updated_at); end if;
 snap:=zx_private.month_snapshot(sid,m);
 if op in ('load','refresh') then return jsonb_build_object('snapshot',snap,'comment',coalesce(saved.teacher_comment,''),'comment_en',coalesce(saved.teacher_comment_en,''),'saved',false); end if;
 if op='save' then
  if length(coalesce(payload->>'comment',''))>400 or length(coalesce(payload->>'comment_en',''))>800 then raise exception 'comment too long'; end if;
  insert into public.zx_monthly_reports(student_id,month,snapshot,teacher_comment,teacher_comment_en,updated_by) values(sid,m,snap,coalesce(payload->>'comment',''),coalesce(payload->>'comment_en',''),actor) on conflict(student_id,month) do update set snapshot=excluded.snapshot,teacher_comment=excluded.teacher_comment,teacher_comment_en=excluded.teacher_comment_en,updated_at=now(),updated_by=actor;
  return jsonb_build_object('snapshot',snap,'comment',coalesce(payload->>'comment',''),'comment_en',coalesce(payload->>'comment_en',''),'saved',true);
 end if;
 raise exception 'unknown operation';
end $$;
commit;
