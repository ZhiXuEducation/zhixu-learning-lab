begin;
create table zx_private.homework_batches(
 id uuid primary key, title text not null check(length(title) between 1 and 100),
 due_at timestamptz not null, created_at timestamptz not null default now(),
 created_by uuid not null references public.zx_profiles(id),cancelled_at timestamptz
);
create table zx_private.homework_items(
 batch_id uuid not null references zx_private.homework_batches(id),
 student_id uuid not null references public.zx_students(id),asset_id text not null,exercise_id text not null,
 primary key(batch_id,student_id,asset_id,exercise_id),
 foreign key(asset_id,exercise_id) references zx_private.exercise_catalog(asset_id,exercise_id)
);
create index homework_items_student on zx_private.homework_items(student_id,asset_id,exercise_id);
create index learning_runs_homework on zx_private.learning_runs(student_id,asset_id,exercise_id,submitted_at) where submitted_at is not null;
alter table zx_private.homework_batches enable row level security;
alter table zx_private.homework_items enable row level security;
revoke all on zx_private.homework_batches,zx_private.homework_items from public,anon,authenticated;
grant all on zx_private.homework_batches,zx_private.homework_items to service_role;

-- Completion is the first full submission after publication, including free practice.
-- Earlier submissions never complete new homework; retries never count twice.
create function zx_private.homework_rows(sid uuid default null) returns table(
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
 and lr.submitted_at>=b.created_at order by lr.submitted_at,lr.id limit 1) r on true
 where b.cancelled_at is null and (sid is null or i.student_id=sid);
$$;
revoke all on function zx_private.homework_rows(uuid) from public,anon,authenticated;
grant execute on function zx_private.homework_rows(uuid) to service_role;

create function public.zx_homework_gateway(op text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor uuid;sid uuid;bid uuid;deadline timestamptz;ret jsonb;ids uuid[];exercises jsonb;label text;
begin
 if payload ? 'token_hash' then
  select st.id into sid from zx_private.student_sessions ss join public.zx_students st on st.id=ss.student_id
  where ss.token_hash=payload->>'token_hash' and ss.expires_at>now() and st.active;
  if sid is null or op<>'homework-list' then raise exception 'denied';end if;
 else
  actor:=(payload->>'actor')::uuid;
  if actor is null or not exists(select 1 from public.zx_profiles where id=actor and role='admin' and active) then raise exception 'denied';end if;
 end if;
 if op='homework-list' then
  select coalesce(jsonb_agg(to_jsonb(h)||case when sid is null then jsonb_build_object('student_name',s.display_name,'student_number',s.student_number) else '{}'::jsonb end order by h.due_at desc,h.title,s.student_number,h.exercise_title),'[]') into ret
  from zx_private.homework_rows(sid) h join public.zx_students s on s.id=h.student_id;
  return ret;
 end if;
 if op='homework-options' then
  return jsonb_build_object('students',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.display_name,'number',s.student_number,'courses',coalesce((select jsonb_agg(sc.course_id) from public.zx_student_courses sc where sc.student_id=s.id),'[]')) order by s.student_number),'[]') from public.zx_students s where s.active),
   'exercises',(select coalesce(jsonb_agg(jsonb_build_object('asset_id',c.asset_id,'exercise_id',c.exercise_id,'title',c.title,'courses',ct.allowed_courses) order by c.asset_id,c.exercise_id),'[]') from zx_private.exercise_catalog c join zx_private.course_content ct on ct.asset_id=c.asset_id),
   'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title) order by id),'[]') from public.zx_courses where active));
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
  where h.student_id=any(ids) and h.asset_id=e->>'asset_id' and h.exercise_id=e->>'exercise_id' and h.submitted_at is null) then raise exception '所选练习已有未完成的功课，请先完成或撤销旧功课';end if;
 insert into zx_private.homework_batches(id,title,due_at,created_by) values(bid,label,deadline,actor);
 insert into zx_private.homework_items select distinct bid,x,e->>'asset_id',e->>'exercise_id' from unnest(ids) x cross join jsonb_array_elements(exercises) e;
 return '{"ok":true}';
end $$;
revoke all on function public.zx_homework_gateway(text,jsonb) from public,anon,authenticated;
grant execute on function public.zx_homework_gateway(text,jsonb) to service_role;

-- Keep historical snapshots intact. Refresh/save generates homework totals by due month.
alter function zx_private.month_snapshot(uuid,date) rename to practice_month_snapshot;
create function zx_private.month_snapshot(sid uuid,m date) returns jsonb language sql stable security invoker set search_path='' as $$
 select zx_private.practice_month_snapshot(sid,m)||jsonb_build_object('homework',(
 select jsonb_build_object('assigned',count(*),'completed',count(*) filter(where submitted_at is not null),
 'on_time',count(*) filter(where status='completed'),'late',count(*) filter(where status='late'),
 'incomplete',count(*) filter(where submitted_at is null),'overdue',count(*) filter(where status='overdue'))
 from zx_private.homework_rows(sid) where due_at>=m::timestamp at time zone 'Asia/Singapore'
 and due_at<(m+interval '1 month')::timestamp at time zone 'Asia/Singapore'));
$$;
revoke all on function zx_private.month_snapshot(uuid,date) from public,anon,authenticated;
grant execute on function zx_private.month_snapshot(uuid,date) to service_role;
commit;
