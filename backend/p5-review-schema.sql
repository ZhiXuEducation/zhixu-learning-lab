begin;
-- Additive, private retry records. Existing runs/homework are never rewritten.
create table zx_private.p5_retries(
 id uuid primary key,student_id uuid not null references public.zx_students(id),
 base_run_id uuid not null references zx_private.learning_runs(id),
 submitted_at timestamptz not null default clock_timestamp(),results jsonb not null
);
create index p5_retries_student_base on zx_private.p5_retries(student_id,base_run_id,submitted_at);
alter table zx_private.p5_retries enable row level security;
revoke all on zx_private.p5_retries from public,anon,authenticated;
grant select,insert on zx_private.p5_retries to service_role;

create function zx_private.p5_skills(sid uuid,a timestamptz,b timestamptz) returns jsonb
language sql stable security invoker set search_path='' as $$
 with firsts as (select distinct on(exercise_id) exercise_id,submitted_at,results from zx_private.learning_runs
 where student_id=sid and asset_id='p5-review' and submitted_at is not null order by exercise_id,submitted_at,id),
 answers as(select q from firsts f cross join lateral jsonb_array_elements(f.results) q where f.submitted_at>=a and f.submitted_at<b)
 select coalesce(jsonb_agg(to_jsonb(t) order by skill),'[]') from
 (select q->>'skill' skill,count(*) total,count(*) filter(where (q->>'correct')::boolean) correct,count(*) filter(where not (q->>'correct')::boolean) wrong from answers group by q->>'skill') t;
$$;

create function public.zx_p5_gateway(op text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare sid uuid;actor uuid;ret jsonb;rr zx_private.learning_runs;old zx_private.p5_retries;cat zx_private.exercise_catalog;
 q jsonb;v jsonb;graded jsonb:='[]';rid uuid;count_wrong integer;month_start timestamptz;month_end timestamptz;records jsonb;
begin
 if payload ? 'actor' then
  actor:=(payload->>'actor')::uuid;
  if actor is null or not exists(select 1 from public.zx_profiles where id=actor and role='admin' and active) then raise exception 'denied';end if;
  if op='p5-history' then return '{"preview":true,"sets":[]}';end if;
  if op<>'p5-analysis' then raise exception 'denied';end if;
  sid:=(payload->>'student_id')::uuid;
  if not exists(select 1 from public.zx_students where id=sid) then raise exception 'denied';end if;
 else
  select st.id into sid from zx_private.student_sessions ss join public.zx_students st on st.id=ss.student_id
   where ss.token_hash=payload->>'token_hash' and ss.expires_at>now() and st.active;
  if sid is null or not exists(select 1 from public.zx_student_courses sc join public.zx_courses co on co.id=sc.course_id where sc.student_id=sid and sc.course_id='p6-standard' and co.active) then raise exception 'denied';end if;
  if op not in ('p5-history','p5-start','p5-finish','p5-retry') then raise exception 'denied';end if;
 end if;
 if op in ('p5-start','p5-finish') then
  if payload->>'asset_id' is distinct from 'p5-review' then raise exception 'denied';end if;
  perform pg_advisory_xact_lock(hashtextextended(sid::text||':'||(payload->>'exercise_id'),0));
  ret:=public.zx_reports_gateway(case when op='p5-start' then 'start' else 'finish' end,payload);
  select * into rr from zx_private.learning_runs where id=(payload->>'run_id')::uuid and student_id=sid;
  return ret||jsonb_build_object('run',jsonb_build_object('id',rr.id,'submitted_at',rr.submitted_at,'results',rr.results));
 end if;
 if op='p5-retry' then
  rid:=(payload->>'retry_id')::uuid;if rid is null then raise exception '提交缺少记录编号';end if;
  perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
  select * into old from zx_private.p5_retries where id=rid;
  if found then
   if old.student_id<>sid or old.base_run_id is distinct from (payload->>'base_run_id')::uuid then raise exception 'denied';end if;
   return jsonb_build_object('saved',true,'retry',to_jsonb(old));
  end if;
  if (select count(*) from zx_private.p5_retries where student_id=sid and submitted_at>now()-interval '1 minute')>=20 then raise exception '重做提交过于频繁，请稍后再试';end if;
  select * into rr from zx_private.learning_runs where id=(payload->>'base_run_id')::uuid and student_id=sid and asset_id='p5-review' and submitted_at is not null;
  if not found or exists(select 1 from zx_private.learning_runs p where p.student_id=sid and p.asset_id=rr.asset_id and p.exercise_id=rr.exercise_id and p.submitted_at is not null and (p.submitted_at,p.id)<(rr.submitted_at,rr.id)) then raise exception 'denied';end if;
  select count(*) into count_wrong from jsonb_array_elements(rr.results) x where not (x->>'correct')::boolean;
  if count_wrong=0 then raise exception '没有需要重做的原始错题';end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items')<>count_wrong or (select count(distinct x->>'id') from jsonb_array_elements(payload->'items') x)<>count_wrong then raise exception '请完成全部原始错题';end if;
  select * into cat from zx_private.exercise_catalog where asset_id='p5-review' and exercise_id=rr.exercise_id;
  for q in select value from jsonb_array_elements(cat.questions) c where exists(select 1 from jsonb_array_elements(rr.results) x where x->>'id'=c->>'id' and not (x->>'correct')::boolean) loop
   select x->'answer' into v from jsonb_array_elements(payload->'items') x where x->>'id'=q->>'id';
   if v is null or jsonb_typeof(v)<>'number' or v::text not in ('0','1','2','3') then raise exception '请选择有效选项';end if;
   graded:=graded||jsonb_build_array(jsonb_build_object('id',q->>'id','skill',q->>'skill','prompt',q->>'prompt','answer',v,'expected',q->'answer','correct',v=q->'answer','self',false));
  end loop;
  if jsonb_array_length(graded)<>count_wrong then raise exception '错题目录不一致';end if;
  insert into zx_private.p5_retries(id,student_id,base_run_id,results) values(rid,sid,rr.id,graded) returning * into old;
  return jsonb_build_object('saved',true,'retry',to_jsonb(old));
 end if;
 if op='p5-analysis' then
  if coalesce(payload->>'month','')!~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception '请选择月份';end if;
  month_start:=((payload->>'month')||'-01')::timestamp at time zone 'Asia/Singapore';
  month_end:=(((payload->>'month')||'-01')::timestamp+interval '1 month') at time zone 'Asia/Singapore';
 else month_end:='infinity';end if;
 with firsts as(select distinct on(exercise_id) * from zx_private.learning_runs where student_id=sid and asset_id='p5-review' and submitted_at is not null order by exercise_id,submitted_at,id)
 select coalesce(jsonb_agg(jsonb_build_object('exercise_id',f.exercise_id,'first',jsonb_build_object('id',f.id,'submitted_at',f.submitted_at,'results',f.results),
 'latest',(select jsonb_build_object('id',r.id,'submitted_at',r.submitted_at,'results',r.results) from zx_private.learning_runs r where r.student_id=sid and r.asset_id='p5-review' and r.exercise_id=f.exercise_id and r.submitted_at<month_end order by r.submitted_at desc,r.id desc limit 1),
 'attempts',(select count(*) from zx_private.learning_runs r where r.student_id=sid and r.asset_id='p5-review' and r.exercise_id=f.exercise_id and r.submitted_at<month_end),
 'retry_count',(select count(*) from zx_private.p5_retries t where t.student_id=sid and t.base_run_id=f.id and t.submitted_at<month_end),
 'retry',(select jsonb_build_object('id',t.id,'submitted_at',t.submitted_at,'results',t.results) from zx_private.p5_retries t where t.student_id=sid and t.base_run_id=f.id and t.submitted_at<month_end order by t.submitted_at desc,t.id desc limit 1)
 ) order by f.exercise_id),'[]') into records from firsts f where f.submitted_at<month_end;
 if op='p5-history' then return jsonb_build_object('sets',records,'preview',false);end if;
 return jsonb_build_object('sets',records,'month',payload->>'month','monthly',zx_private.p5_skills(sid,month_start,month_end),'cumulative',zx_private.p5_skills(sid,'-infinity',month_end),
 'previous',zx_private.p5_skills(sid,((((payload->>'month')||'-01')::timestamp)-interval '1 month') at time zone 'Asia/Singapore',month_start));
end $$;
revoke all on function zx_private.p5_skills(uuid,timestamptz,timestamptz),public.zx_p5_gateway(text,jsonb) from public,anon,authenticated;
grant execute on function zx_private.p5_skills(uuid,timestamptz,timestamptz),public.zx_p5_gateway(text,jsonb) to service_role;
commit;
