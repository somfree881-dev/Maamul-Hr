create or replace function public.employee_counts(p_company uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('total',count(*),'active',count(*) filter(where e.status='active')) from employees e join company_memberships m on m.company_id=e.company_id and m.user_id=auth.uid() where e.company_id=p_company and (m.role in ('super_admin','company_admin','hr_manager','accountant') or (m.role in ('branch_manager','supervisor') and e.branch_id=m.branch_id) or e.user_id=auth.uid()); $$;
revoke all on function public.employee_counts(uuid) from public;
grant execute on function public.employee_counts(uuid) to authenticated;

create function public.analytics_series(p_company uuid,p_from date,p_to date,p_currency text) returns jsonb language sql stable set search_path=public as $$
with daily as (
 select work_date, count(*) total, count(*) filter(where status='present') present, count(*) filter(where late_minutes>0) late, count(*) filter(where status='absent' and reviewed) absent,coalesce(sum(overtime_minutes)/60.0,0) overtime_hours from attendance_summaries where company_id=p_company and work_date between p_from and p_to group by work_date
), monthly as (
 select to_char(period_start,'YYYY-MM') as "month",sum(gross) gross,sum(deductions) deductions,sum(net) net,sum(overtime) overtime_cost from payroll_balances where company_id=p_company and currency=p_currency and period_start<=p_to and period_end>=p_from group by to_char(period_start,'YYYY-MM')
), by_branch as (
 select b.name branch,coalesce(sum(p.net),0) net,coalesce(sum(p.overtime),0) overtime_cost from branches b left join payroll_balances p on p.company_id=b.company_id and p.branch_id=b.id and p.currency=p_currency and p.period_start<=p_to and p.period_end>=p_from where b.company_id=p_company group by b.id,b.name
)
select jsonb_build_object('attendance',coalesce((select jsonb_agg(d order by work_date) from daily d),'[]'::jsonb),'payroll',coalesce((select jsonb_agg(m order by "month") from monthly m),'[]'::jsonb),'branches',coalesce((select jsonb_agg(b order by branch) from by_branch b),'[]'::jsonb)); $$;
revoke all on function public.analytics_series(uuid,date,date,text) from public;
grant execute on function public.analytics_series(uuid,date,date,text) to authenticated;

create view public.leave_balances with (security_invoker=true) as
select e.company_id,e.branch_id,e.id employee_id,t.id leave_type_id,t.name,t.paid,
coalesce((select p.annual_entitlement from leave_policies p where p.employee_id=e.id and p.leave_type_id=t.id and p.effective_from<=current_date order by p.effective_from desc limit 1),t.annual_entitlement) entitlement,
coalesce(sum(r.total_days) filter(where r.status='approved'),0) used,
coalesce(sum(r.total_days) filter(where r.status='pending'),0) pending,
greatest(0,coalesce((select p.annual_entitlement from leave_policies p where p.employee_id=e.id and p.leave_type_id=t.id and p.effective_from<=current_date order by p.effective_from desc limit 1),t.annual_entitlement)-coalesce(sum(r.total_days) filter(where r.status='approved'),0)) remaining,
e.created_at
from employees e join leave_types t on t.company_id=e.company_id left join leave_requests r on r.employee_id=e.id and r.leave_type_id=t.id and extract(year from r.start_date)=extract(year from current_date) group by e.company_id,e.branch_id,e.id,t.id,t.name,t.paid,t.annual_entitlement;
grant select on leave_balances to authenticated;

-- Device mappings for transferred employees must be re-established at the new branch.
create function public.transfer_device_mappings() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.branch_id is distinct from old.branch_id then delete from device_employee_mappings where employee_id=new.id; end if;
 return new;
end; $$;
create trigger transfer_device_mappings after update of branch_id on employees for each row execute function transfer_device_mappings();
