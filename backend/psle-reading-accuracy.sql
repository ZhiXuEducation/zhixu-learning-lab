-- Read-only analysis for an already-authorized administrator/service connection.
-- No new endpoint, grants, table, account or management function.
-- First-attempt accuracy is separate from all-practice accuracy.
with runs as (
 select r.*,row_number() over(partition by student_id,asset_id,exercise_id order by submitted_at,id) attempt_no
 from zx_private.learning_runs r
 where asset_id='psle-review' and exercise_id like 'psle-rev-reading-%' and submitted_at is not null
), answers as (
 select r.exercise_id,r.attempt_no,q from runs r cross join lateral jsonb_array_elements(r.results) q
 where (q->>'self')::boolean is false
)
select exercise_id,q->>'id' question_id,q->>'skill' skill,
 count(*) filter(where attempt_no=1) first_attempts,
 count(*) filter(where attempt_no=1 and (q->>'correct')::boolean) first_correct,
 round(100.0*(count(*) filter(where attempt_no=1 and (q->>'correct')::boolean))/nullif(count(*) filter(where attempt_no=1),0),1) first_accuracy_pct,
 count(*) practice_attempts,count(*) filter(where (q->>'correct')::boolean) practice_correct,
 round(100.0*(count(*) filter(where (q->>'correct')::boolean))/nullif(count(*),0),1) practice_accuracy_pct
from answers group by exercise_id,q->>'id',q->>'skill' order by exercise_id,q->>'id';
