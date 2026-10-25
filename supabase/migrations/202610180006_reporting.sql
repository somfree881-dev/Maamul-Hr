create view public.payroll_balances with (security_invoker=true) as
select i.*,p.start_date as period_start,p.end_date as period_end,p.currency,r.status as payroll_status,
coalesce((select sum(a.amount) from payment_allocations a join salary_payments s on s.id=a.payment_id where a.payroll_item_id=i.id and s.reversal_of is null and not exists(select 1 from salary_payments rev where rev.reversal_of=s.id)),0)::numeric(18,2) as total_paid,
(i.net-coalesce((select sum(a.amount) from payment_allocations a join salary_payments s on s.id=a.payment_id where a.payroll_item_id=i.id and s.reversal_of is null and not exists(select 1 from salary_payments rev where rev.reversal_of=s.id)),0))::numeric(18,2) as remaining_payable
from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id;
grant select on payroll_balances to authenticated;
create policy own_payroll_runs on payroll_runs for select to authenticated using(exists(select 1 from payroll_items i join employees e on e.id=i.employee_id where i.run_id=payroll_runs.id and e.user_id=auth.uid()));
create policy own_payroll_periods on payroll_periods for select to authenticated using(exists(select 1 from payroll_runs r join payroll_items i on i.run_id=r.id join employees e on e.id=i.employee_id where r.period_id=payroll_periods.id and e.user_id=auth.uid()));

create function public.employee_counts(p_company uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('total',count(*),'active',count(*) filter(where e.status='active')) from employees e join company_memberships m on m.company_id=e.company_id and m.user_id=auth.uid() where e.company_id=p_company and (m.role in ('super_admin','company_admin','hr_manager','accountant') or (m.role in ('branch_manager','supervisor') and e.branch_id=m.branch_id) or e.user_id=auth.uid()); $$;
revoke all on function public.employee_counts(uuid) from public;
grant execute on function public.employee_counts(uuid) to authenticated;

create function public.dashboard_metrics(p_company uuid) returns jsonb language sql stable set search_path=public as $$
with scope as (select timezone from companies where id=p_company), dates as (select (now() at time zone timezone)::date today from scope),
today_att as (select a.* from attendance_summaries a,dates d where a.company_id=p_company and a.work_date=d.today),
monthly as (select b.* from payroll_balances b,dates d where b.company_id=p_company and b.currency=(select currency from companies where id=p_company) and b.period_start<=d.today and b.period_end>=date_trunc('month',d.today)::date)
select jsonb_build_object(
 'total_employees',(select count(*) from employee_directory(p_company)),
 'active_employees',(employee_counts(p_company)->>'active')::integer,
 'attendance_records',(select count(*) from today_att),
 'needs_review',(select count(*) from today_att where status in ('uncertain','missing_in','missing_out') or (status='absent' and not reviewed)),
 'present',(select count(*) from today_att where status='present'),
 'absent',(select count(*) from today_att where status='absent' and reviewed),
 'late',(select count(*) from today_att where late_minutes>0),
 'on_leave',(select count(*) from today_att where status='leave'),
 'worked_hours',(select coalesce(sum(worked_minutes)/60.0,0) from today_att),
 'overtime_hours',(select coalesce(sum(overtime_minutes)/60.0,0) from today_att),
 'gross_payroll',(select coalesce(sum(gross),0) from monthly),
 'deductions',(select coalesce(sum(deductions),0) from monthly),
 'net_payroll',(select coalesce(sum(net),0) from monthly),
 'salary_paid',(select coalesce(sum(total_paid),0) from monthly),
 'outstanding',(select coalesce(sum(remaining_payable),0) from monthly),
 'document_alerts',(select count(*) from employee_documents,dates d where company_id=p_company and expiration_date<=d.today+30)
); $$;
revoke all on function public.dashboard_metrics(uuid) from public;
grant execute on function public.dashboard_metrics(uuid) to authenticated;

alter table notifications add column source_key text;
create unique index notification_source_unique on notifications(company_id,user_id,source_key) where source_key is not null;
create policy own_notifications on notifications for select to authenticated using(user_id=auth.uid());
create function public.run_maintenance() returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into notifications(company_id,user_id,title,message,source_key)
 select d.company_id,m.user_id,'Employee document expiring',d.title||' expires on '||d.expiration_date::text,'document:'||d.id::text||':'||d.expiration_date::text
 from employee_documents d join company_memberships m on m.company_id=d.company_id and m.role in ('super_admin','company_admin','hr_manager') join companies c on c.id=d.company_id
 where d.expiration_date<=(now() at time zone c.timezone)::date+30
 on conflict(company_id,user_id,source_key) where source_key is not null do nothing;
 get diagnostics n=row_count;
 update attendance_devices set status='stale' where last_sync_at<now()-interval '15 minutes' and status<>'stale';
 return n;
end; $$;
revoke all on function public.run_maintenance() from public,anon,authenticated;
grant execute on function public.run_maintenance() to service_role;

create function public.service_save_attendance(p_company uuid,p_employee uuid,p_date date,p_summary jsonb,p_shift uuid) returns void language plpgsql security definer set search_path=public as $$
declare e employees;
begin
 select * into e from employees where company_id=p_company and id=p_employee;
 if e.id is null then raise exception 'Invalid employee'; end if;
 if exists(select 1 from attendance_summaries where employee_id=e.id and work_date=p_date and reviewed) then return; end if;
 if exists(select 1 from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=e.id and p_date between p.start_date and p.end_date) then return; end if;
 insert into attendance_summaries(company_id,employee_id,work_date,shift_id,first_in,last_out,scheduled_minutes,worked_minutes,late_minutes,early_minutes,overtime_minutes,status,paid_leave)
 values(p_company,e.id,p_date,p_shift,(p_summary->>'first_in')::timestamptz,(p_summary->>'last_out')::timestamptz,(p_summary->>'scheduled_minutes')::int,(p_summary->>'worked_minutes')::int,(p_summary->>'late_minutes')::int,(p_summary->>'early_minutes')::int,(p_summary->>'overtime_minutes')::int,p_summary->>'status',(p_summary->>'paid_leave')::boolean)
 on conflict(employee_id,work_date) do update set shift_id=excluded.shift_id,first_in=excluded.first_in,last_out=excluded.last_out,scheduled_minutes=excluded.scheduled_minutes,worked_minutes=excluded.worked_minutes,late_minutes=excluded.late_minutes,early_minutes=excluded.early_minutes,overtime_minutes=excluded.overtime_minutes,status=excluded.status,paid_leave=excluded.paid_leave;
end; $$;
revoke all on function public.service_save_attendance(uuid,uuid,date,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.service_save_attendance(uuid,uuid,date,jsonb,uuid) to service_role;
