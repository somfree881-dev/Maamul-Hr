-- Run only after applying 202610190003_payroll_schedule.sql.
-- Enable Supabase Cron (pg_cron) first. No credentials are embedded.
-- One hourly check; each enabled company uses its own time zone.
do $$ begin
 if not exists(select 1 from pg_extension where extname='pg_cron') then
  raise exception 'Enable Cron / pg_cron in your Supabase project first';
 end if;
end $$;
select cron.schedule('maamul-payroll-28','5 * * * *','select public.run_scheduled_payroll();')
where not exists(select 1 from cron.job where jobname='maamul-payroll-28');
