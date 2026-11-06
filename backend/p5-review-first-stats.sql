CREATE OR REPLACE FUNCTION zx_private.practice_month_snapshot(sid uuid, m date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with bounds as (select m::timestamp at time zone 'Asia/Singapore' a,(m+interval '1 month')::timestamp at time zone 'Asia/Singapore' b),
 started as (select count(distinct (r.asset_id,r.exercise_id)) n from zx_private.learning_runs r,bounds where r.student_id=sid and ((r.started_at>=a and r.started_at<b) or (r.submitted_at>=a and r.submitted_at<b))),
 latest as (select distinct on(asset_id,exercise_id) r.* from zx_private.learning_runs r,bounds where r.student_id=sid and r.submitted_at>=a and r.submitted_at<b
 and ((r.asset_id<>'p5-review' and (r.asset_id<>'psle-review' or r.exercise_id not like 'psle-rev-%')) or not exists(
  select 1 from zx_private.learning_runs prior where prior.student_id=r.student_id and prior.asset_id=r.asset_id and prior.exercise_id=r.exercise_id
  and prior.submitted_at is not null and (prior.submitted_at,prior.id)<(r.submitted_at,r.id)
 )) order by asset_id,exercise_id,submitted_at desc,id desc),
 answers as (select l.asset_id,l.exercise_id,regexp_replace(c.title,'[[:space:]]*[AB]套.*$','') as unit,q from latest l join zx_private.exercise_catalog c on c.asset_id=l.asset_id and c.exercise_id=l.exercise_id cross join lateral jsonb_array_elements(l.results) q),
 objective as (select * from answers where not (q->>'self')::boolean),
 weak as (select q->>'skill' skill,count(*) total,count(*) filter(where (q->>'correct')::boolean) correct from objective group by q->>'skill'),
 unit_skills as (select asset_id,unit,q->>'skill' skill,count(*) total,count(*) filter(where (q->>'correct')::boolean) correct from objective group by asset_id,unit,q->>'skill'),
 unit_stats as (select asset_id,unit,count(*) total,count(*) filter(where (q->>'correct')::boolean) correct from objective group by asset_id,unit),
 wrong as (select q||jsonb_build_object('asset_id',asset_id,'exercise_id',exercise_id) q from objective where not (q->>'correct')::boolean limit 100)
 select jsonb_build_object('started',(select n from started),'completed',(select count(*) from latest),'questions',(select count(*) from objective),'correct',(select count(*) from objective where (q->>'correct')::boolean),'self_assessed',(select count(*) from answers where (q->>'self')::boolean),'wrong_count',(select count(*) from objective where not (q->>'correct')::boolean),'wrong',coalesce((select jsonb_agg(q) from wrong),'[]'),'skills',coalesce((select jsonb_agg(to_jsonb(w) order by (total-correct) desc,skill) from weak w),'[]'),'units',coalesce((select jsonb_agg(to_jsonb(u)||jsonb_build_object('skills',(select jsonb_agg(to_jsonb(k)-'asset_id'-'unit') from unit_skills k where k.asset_id=u.asset_id and k.unit=u.unit))) from unit_stats u),'[]'),'generated_at',now());
$function$;
