begin;
create table zx_private.exercise_catalog(asset_id text not null,exercise_id text not null,title text not null,questions jsonb not null,primary key(asset_id,exercise_id));
create table zx_private.learning_runs(id uuid primary key,student_id uuid not null references public.zx_students(id),asset_id text not null,exercise_id text not null,started_at timestamptz not null default now(),submitted_at timestamptz,results jsonb,foreign key(asset_id,exercise_id) references zx_private.exercise_catalog);
create index learning_runs_student_month on zx_private.learning_runs(student_id,started_at);
create index learning_runs_submitted on zx_private.learning_runs(student_id,submitted_at);
create table public.zx_monthly_reports(student_id uuid not null references public.zx_students(id),month date not null check(extract(day from month)=1),snapshot jsonb not null,teacher_comment text not null default '' check(length(teacher_comment)<=400),teacher_comment_en text not null default '' check(length(teacher_comment_en)<=800),updated_at timestamptz not null default now(),updated_by uuid not null references public.zx_profiles(id),primary key(student_id,month));
alter table zx_private.exercise_catalog enable row level security;
alter table zx_private.learning_runs enable row level security;
alter table public.zx_monthly_reports enable row level security;
revoke all on zx_private.exercise_catalog,zx_private.learning_runs,public.zx_monthly_reports from public,anon,authenticated;
grant all on zx_private.exercise_catalog,zx_private.learning_runs,public.zx_monthly_reports to service_role;
grant select on public.zx_monthly_reports to authenticated;
create policy monthly_reports_admin on public.zx_monthly_reports for select to authenticated using(zx_private.current_role()='admin');
create function zx_private.normal_answer(v jsonb) returns text language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='array' then (select coalesce(jsonb_agg(x order by x),'[]')::text from jsonb_array_elements(v) x)
 else regexp_replace(lower(coalesce(v#>>'{}','')),'[[:space:]]','','g') end;
$$;
revoke all on function zx_private.normal_answer(jsonb) from public,anon,authenticated;
grant execute on function zx_private.normal_answer(jsonb) to service_role;
create function zx_private.month_snapshot(sid uuid,m date) returns jsonb language sql stable security invoker set search_path='' as $$
 with bounds as (select m::timestamp at time zone 'Asia/Singapore' a,(m+interval '1 month')::timestamp at time zone 'Asia/Singapore' b),
 started as (select count(distinct (r.asset_id,r.exercise_id)) n from zx_private.learning_runs r,bounds where r.student_id=sid and ((r.started_at>=a and r.started_at<b) or (r.submitted_at>=a and r.submitted_at<b))),
 latest as (select distinct on(asset_id,exercise_id) r.* from zx_private.learning_runs r,bounds where r.student_id=sid and r.submitted_at>=a and r.submitted_at<b order by asset_id,exercise_id,submitted_at desc,id desc),
 answers as (select l.asset_id,l.exercise_id,regexp_replace(c.title,'[[:space:]]*[AB]套.*$','') as unit,q from latest l join zx_private.exercise_catalog c on c.asset_id=l.asset_id and c.exercise_id=l.exercise_id cross join lateral jsonb_array_elements(l.results) q),
 objective as (select * from answers where not (q->>'self')::boolean),
 weak as (select q->>'skill' skill,count(*) total,count(*) filter(where (q->>'correct')::boolean) correct from objective group by q->>'skill'),
 unit_skills as (select asset_id,unit,q->>'skill' skill,count(*) total,count(*) filter(where (q->>'correct')::boolean) correct from objective group by asset_id,unit,q->>'skill'),
 unit_stats as (select asset_id,unit,count(*) total,count(*) filter(where (q->>'correct')::boolean) correct from objective group by asset_id,unit),
 wrong as (select q||jsonb_build_object('asset_id',asset_id,'exercise_id',exercise_id) q from objective where not (q->>'correct')::boolean limit 100)
 select jsonb_build_object('started',(select n from started),'completed',(select count(*) from latest),'questions',(select count(*) from objective),'correct',(select count(*) from objective where (q->>'correct')::boolean),'self_assessed',(select count(*) from answers where (q->>'self')::boolean),'wrong_count',(select count(*) from objective where not (q->>'correct')::boolean),'wrong',coalesce((select jsonb_agg(q) from wrong),'[]'),'skills',coalesce((select jsonb_agg(to_jsonb(w) order by (total-correct) desc,skill) from weak w),'[]'),'units',coalesce((select jsonb_agg(to_jsonb(u)||jsonb_build_object('skills',(select jsonb_agg(to_jsonb(k)-'asset_id'-'unit') from unit_skills k where k.asset_id=u.asset_id and k.unit=u.unit))) from unit_stats u),'[]'),'generated_at',now());
$$;
revoke all on function zx_private.month_snapshot(uuid,date) from public,anon,authenticated;
grant execute on function zx_private.month_snapshot(uuid,date) to service_role;
create function public.zx_reports_gateway(op text,payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid;sid uuid;m date;cat zx_private.exercise_catalog;r zx_private.learning_runs;q jsonb;v jsonb;graded jsonb:='[]';good boolean;snap jsonb;saved public.zx_monthly_reports;ret jsonb;
begin
 if op in ('start','finish') then
  select st.id into sid from zx_private.student_sessions ss join public.zx_students st on st.id=ss.student_id where ss.token_hash=payload->>'token_hash' and ss.expires_at>now() and st.active;
  if sid is null then raise exception 'denied'; end if;
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
revoke all on function public.zx_reports_gateway(text,jsonb) from public,anon,authenticated;
grant execute on function public.zx_reports_gateway(text,jsonb) to service_role;
commit;
