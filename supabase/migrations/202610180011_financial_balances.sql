create view public.advance_balances with (security_invoker=true) as
select s.id,s.company_id,s.branch_id,s.employee_id,s.created_at,s.status,s.requested_amount,s.approved_amount,
coalesce(sum(a.amount),0)::numeric(18,2) as scheduled_amount,
coalesce(sum(a.amount) filter(where a.payroll_item_id is not null),0)::numeric(18,2) as reserved_amount,
coalesce(sum(a.amount) filter(where r.status in ('approved','partially_paid','paid','locked')),0)::numeric(18,2) as recovered_amount,
(coalesce(s.approved_amount,0)-coalesce(sum(a.amount) filter(where r.status in ('approved','partially_paid','paid','locked')),0))::numeric(18,2) as remaining_balance
from salary_advances s left join advance_repayments a on a.advance_id=s.id left join payroll_items i on i.id=a.payroll_item_id left join payroll_runs r on r.id=i.run_id group by s.id;
create view public.damage_balances with (security_invoker=true) as
select s.id,s.company_id,s.branch_id,s.employee_id,s.created_at,s.status,s.incident_id,s.approved_amount,
coalesce(sum(a.amount),0)::numeric(18,2) as scheduled_amount,
coalesce(sum(a.amount) filter(where a.payroll_item_id is not null),0)::numeric(18,2) as reserved_amount,
coalesce(sum(a.amount) filter(where r.status in ('approved','partially_paid','paid','locked')),0)::numeric(18,2) as recovered_amount,
(s.approved_amount-coalesce(sum(a.amount) filter(where r.status in ('approved','partially_paid','paid','locked')),0))::numeric(18,2) as remaining_balance
from damage_recovery_plans s left join damage_recovery_installments a on a.plan_id=s.id left join payroll_items i on i.id=a.payroll_item_id left join payroll_runs r on r.id=i.run_id group by s.id;
grant select on advance_balances,damage_balances to authenticated;
