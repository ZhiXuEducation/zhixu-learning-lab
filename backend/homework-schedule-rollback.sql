-- Non-destructive rollback: disable new scheduling writes, retain all deadlines,
-- run attribution, results and existing scheduled homework enforcement.
begin;
do $rollback$
declare f text;
begin
 select pg_get_functiondef('public.zx_homework_gateway(text,jsonb)'::regprocedure) into f;
 if position('''schedule_enabled'',true' in f)=0 then raise exception 'Unexpected gateway version; inspect before rollback';end if;
 execute replace(f,'''schedule_enabled'',true','''schedule_enabled'',false');
 select pg_get_functiondef('zx_private.schedule_admin(text,jsonb)'::regprocedure) into f;
 if position(' if op=''homework-reschedule'' then' in f)=0 then raise exception 'Unexpected schedule version; inspect before rollback';end if;
 execute replace(f,' if op=''homework-reschedule'' then', E' if op in (''homework-schedule'',''homework-reschedule'') then raise exception ''Scheduling is temporarily disabled'';end if;\n if op=''homework-reschedule'' then');
end $rollback$;
commit;
