-- Transactional workflows. All SECURITY DEFINER functions pin search_path and verify identity.
create function public.payroll_round(value numeric, mode text) returns numeric language sql immutable set search_path=public as $$
 select case when mode='down' then trunc(value,2) when mode='up' then ceil(value*100)/100 when mode='half_even' and abs(value*100-trunc(value*100))=0.5 and mod(trunc(value*100),2)=0 then trunc(value,2) else round(value,2) end; $$;
create function public.apply_payroll_policy() returns trigger language plpgsql security definer set search_path=public as $$
declare policy jsonb;
begin
 select value into policy from application_settings where company_id=new.company_id and key='payroll_policy';
 new.daily_hours:=coalesce((policy->>'daily_hours')::numeric,new.daily_hours);
 new.rounding_mode:=coalesce(policy->>'rounding_mode',new.rounding_mode);
 return new;
end; $$;
create trigger apply_payroll_policy before insert on payroll_periods for each row execute function apply_payroll_policy();

create function public.create_company(p_name text, p_currency text default 'USD', p_timezone text default 'Africa/Nairobi') returns uuid language plpgsql security definer set search_path=public as $$
declare c uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(p_name))<2 or p_currency !~ '^[A-Z]{3}$' or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid company'; end if;
 insert into companies(name,currency,timezone) values(trim(p_name),p_currency,p_timezone) returning id into c;
 insert into company_memberships(company_id,user_id,role) values(c,auth.uid(),'company_admin');
 return c;
end; $$;

create function public.set_membership(p_company uuid,p_user uuid,p_role text,p_branch uuid default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if not has_role(p_company,array['super_admin','company_admin']) then raise exception 'Forbidden'; end if;
 if p_user=auth.uid() then raise exception 'Cannot change your own membership'; end if;
 insert into company_memberships(company_id,user_id,role,branch_id) values(p_company,p_user,p_role,p_branch)
 on conflict(company_id,user_id) do update set role=excluded.role,branch_id=excluded.branch_id;
 insert into audit_logs(company_id,actor_id,action,table_name,record_id) values(p_company,auth.uid(),'membership_changed','company_memberships',p_user);
end; $$;

-- Employee association must agree with its employee's branch. Prevents branch-scope spoofing.
create function public.enforce_employee_scope() returns trigger language plpgsql security definer set search_path=public as $$
declare b uuid;
begin
 if new.employee_id is not null then
 select branch_id into b from employees where id=new.employee_id and company_id=new.company_id;
 if not found then raise exception 'Employee does not belong to company'; end if;
 new.branch_id:=b;
 end if;
 return new;
end; $$;
do $$ declare t text; begin
 foreach t in array array['employee_contacts','employee_guarantors','employee_documents','employment_contracts','salary_structures','salary_history','device_employee_mappings','raw_attendance_events','attendance_summaries','attendance_corrections','shift_assignments','leave_policies','leave_requests','overtime_records','employee_incidents','damage_recovery_plans','damage_recovery_installments','salary_advances','advance_repayments','payroll_items','salary_payments','payment_allocations','employee_performance_reviews','authorized_deductions'] loop
 execute format('create trigger enforce_scope before insert or update on public.%I for each row execute function public.enforce_employee_scope()',t);
 end loop;
end $$;

create function public.validate_leave() returns trigger language plpgsql set search_path=public as $$
declare entitlement numeric; used numeric; paid boolean;
begin
 -- Serialize concurrent leave requests on this employee.
 perform 1 from employees where id=new.employee_id for update;
 select annual_entitlement,leave_types.paid into entitlement,paid from leave_types where id=new.leave_type_id and company_id=new.company_id;
 select lp.annual_entitlement into entitlement from leave_policies lp where lp.employee_id=new.employee_id and lp.leave_type_id=new.leave_type_id and lp.effective_from<=new.start_date order by lp.effective_from desc limit 1;
 if entitlement is null then select annual_entitlement into entitlement from leave_types where id=new.leave_type_id; end if;
 if new.total_days>(new.end_date-new.start_date+1) then raise exception 'Leave days exceed date range'; end if;
 if new.status in ('pending','approved') and entitlement>0 then
 select coalesce(sum(total_days),0) into used from leave_requests where employee_id=new.employee_id and leave_type_id=new.leave_type_id and id<>new.id and status in ('pending','approved') and date_part('year',start_date)=date_part('year',new.start_date);
 if used+new.total_days>entitlement then raise exception 'Leave entitlement exceeded'; end if;
 end if;
 if new.status='approved' then new.approved_by:=auth.uid(); end if;
 return new;
end; $$;
create trigger validate_leave before insert or update on public.leave_requests for each row execute function public.validate_leave();

create function public.request_leave(p_company uuid,p_employee uuid,p_type uuid,p_start date,p_end date,p_days numeric,p_reason text,p_description text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare e employees; r uuid;
begin
 select * into e from employees where company_id=p_company and id=p_employee;
 if not found or not (coalesce(e.user_id=auth.uid(),false) or can_access(p_company,e.branch_id,e.id,'attendance',true)) then raise exception 'Forbidden'; end if;
 insert into leave_requests(company_id,branch_id,employee_id,leave_type_id,start_date,end_date,total_days,reason,description) values(p_company,e.branch_id,e.id,p_type,p_start,p_end,p_days,p_reason,p_description) returning id into r;
 return r;
end; $$;

create function public.review_correction(p_id uuid,p_approve boolean,p_notes text) returns void language plpgsql security definer set search_path=public as $$
declare c attendance_corrections; mins integer;
begin
 select * into c from attendance_corrections where id=p_id for update;
 if c.id is null or not can_access(c.company_id,c.branch_id,c.employee_id,'attendance',true) or c.requested_by=auth.uid() then raise exception 'Independent reviewer required'; end if;
 if c.status<>'pending' then raise exception 'Already reviewed'; end if;
 if p_approve then
 if c.check_in is null or c.check_out is null or c.check_out<=c.check_in then raise exception 'A valid punch pair is required'; end if;
 mins:=floor(extract(epoch from c.check_out-c.check_in)/60);
 insert into attendance_summaries(company_id,employee_id,work_date,first_in,last_out,worked_minutes,status,reviewed) values(c.company_id,c.employee_id,c.work_date,c.check_in,c.check_out,mins,'present',true)
 on conflict(employee_id,work_date) do update set first_in=c.check_in,last_out=c.check_out,worked_minutes=mins,status='present',reviewed=true;
 end if;
 update attendance_corrections set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),review_notes=p_notes where id=p_id;
end; $$;

create function public.schedule_recovery(p_kind text,p_parent uuid,p_dates date[],p_amounts numeric[]) returns void language plpgsql security definer set search_path=public as $$
declare c uuid; e uuid; cap numeric; existing numeric; i integer;
begin
 if cardinality(p_dates) is distinct from cardinality(p_amounts) or cardinality(p_dates) not between 1 and 120 then raise exception 'Invalid schedule'; end if;
 if p_kind='advance' then
 select company_id,employee_id,approved_amount into c,e,cap from salary_advances where id=p_parent and status='disbursed' for update;
 select coalesce(sum(amount),0) into existing from advance_repayments where advance_id=p_parent;
 elsif p_kind='damage' then
 select company_id,employee_id,approved_amount into c,e,cap from damage_recovery_plans where id=p_parent and status='approved' for update;
 select coalesce(sum(amount),0) into existing from damage_recovery_installments where plan_id=p_parent;
 else raise exception 'Unknown schedule'; end if;
 if c is null or not can_access(c,null,e,'finance',true) then raise exception 'Forbidden'; end if;
 if existing+(select sum(x) from unnest(p_amounts) x)>cap then raise exception 'Schedule exceeds recoverable balance'; end if;
 for i in 1..cardinality(p_dates) loop
 if p_kind='advance' then insert into advance_repayments(company_id,employee_id,advance_id,due_date,amount) values(c,e,p_parent,p_dates[i],p_amounts[i]);
 else insert into damage_recovery_installments(company_id,employee_id,plan_id,due_date,amount) values(c,e,p_parent,p_dates[i],p_amounts[i]); end if;
 end loop;
end; $$;

create function public.generate_payroll(p_period uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare p payroll_periods; r uuid; e employees; base numeric; unpaid numeric; ot numeric; ad numeric; dm numeric; late numeric; other numeric; bonus numeric; allowance numeric; gross numeric; deduct numeric; item uuid; uncertain integer; days_expected integer; days_seen integer; d date; hired date; ended date;
begin
 select * into p from payroll_periods where id=p_period for update;
 if p.id is null or not can_access(p.company_id,null,null,'finance',true) then raise exception 'Forbidden'; end if;
 insert into payroll_runs(company_id,period_id) values(p.company_id,p.id) returning id into r;
 for e in select * from employees where company_id=p.company_id and currency=p.currency and start_date<=p.end_date and (end_date is null or end_date>=p.start_date) order by id for update loop
 perform id from salary_advances where employee_id=e.id order by id for update;
 perform id from damage_recovery_plans where employee_id=e.id order by id for update;
 hired:=greatest(e.start_date,p.start_date); ended:=least(coalesce(e.end_date,p.end_date),p.end_date);
 select count(*),count(*) filter(where status in ('uncertain','missing_in','missing_out') or (status='absent' and not reviewed)) into days_seen,uncertain from attendance_summaries where employee_id=e.id and work_date between hired and ended;
 -- Every calendar date needs a reviewed/processed summary, including rest days and holidays.
 days_expected:=ended-hired+1;
 if uncertain>0 or days_seen<days_expected then raise exception 'Attendance unresolved for employee %',e.employee_number; end if;
 select count(*) into unpaid from attendance_summaries where employee_id=e.id and work_date between hired and ended and (status='absent' or (status='leave' and not paid_leave));
 -- Prorate employment for partial periods, then subtract unpaid days once.
 base:=payroll_round(e.basic_salary*(ended-hired+1)/(p.end_date-p.start_date+1),p.rounding_mode);
 unpaid:=least(base,payroll_round(e.basic_salary/p.divisor*unpaid,p.rounding_mode)); base:=base-unpaid;
 select coalesce(payroll_round(sum(hours*multiplier*e.basic_salary/p.divisor/p.daily_hours),p.rounding_mode),0) into ot from overtime_records where employee_id=e.id and work_date between p.start_date and p.end_date and status='approved';
 select coalesce(sum(amount) filter(where category='late'),0),coalesce(sum(amount) filter(where category='other'),0) into late,other from authorized_deductions where employee_id=e.id and period_id=p.id;
 select coalesce(sum(a.amount),0) into ad from advance_repayments a join salary_advances s on s.id=a.advance_id where a.employee_id=e.id and a.due_date<=p.end_date and a.payroll_item_id is null and s.status='disbursed';
 select coalesce(sum(a.amount),0) into dm from damage_recovery_installments a join damage_recovery_plans s on s.id=a.plan_id where a.employee_id=e.id and a.due_date<=p.end_date and a.payroll_item_id is null and s.status='approved';
 select s.bonuses,s.allowances into bonus,allowance from salary_structures s where s.employee_id=e.id and effective_from<=p.end_date and (effective_to is null or effective_to>=p.end_date) order by effective_from desc limit 1;
 bonus:=coalesce(bonus,0); allowance:=coalesce(allowance,0); gross:=base+ot+bonus+allowance; deduct:=late+other+ad+dm;
 if deduct>gross then raise exception 'Deductions exceed earnings for %',e.employee_number; end if;
 insert into payroll_items(company_id,employee_id,run_id,basic_salary,basic_earnings,unpaid_absence,overtime,bonuses,allowances,late_deductions,damage_recovery,advance_recovery,other_deductions,gross,deductions,net)
 values(p.company_id,e.id,r,e.basic_salary,base,unpaid,ot,bonus,allowance,late,dm,ad,other,gross,deduct,gross-deduct) returning id into item;
 update advance_repayments set payroll_item_id=item where employee_id=e.id and due_date<=p.end_date and payroll_item_id is null and advance_id in(select id from salary_advances where status='disbursed');
 update damage_recovery_installments set payroll_item_id=item where employee_id=e.id and due_date<=p.end_date and payroll_item_id is null and plan_id in(select id from damage_recovery_plans where status='approved');
 end loop;
 if not exists(select 1 from payroll_items where run_id=r) then raise exception 'No eligible employees'; end if;
 return r;
end; $$;

create function public.transition_payroll(p_run uuid,p_status text,p_notes text default null) returns void language plpgsql security definer set search_path=public as $$
declare r payroll_runs;
begin
 select * into r from payroll_runs where id=p_run for update;
 if r.id is null then raise exception 'Unknown payroll'; end if;
 if p_status='verified' and r.status='draft' and has_role(r.company_id,array['super_admin','company_admin','accountant']) then null;
 elsif p_status='approved' and r.status='verified' and has_role(r.company_id,array['super_admin','company_admin']) and r.generated_by<>auth.uid() then null;
 elsif p_status='locked' and r.status='paid' and has_role(r.company_id,array['super_admin','company_admin']) then null;
 else raise exception 'Invalid transition or independent approver required'; end if;
 insert into payroll_approvals(company_id,run_id,stage,notes) values(r.company_id,r.id,p_status,p_notes);
 update payroll_runs set status=p_status,approved_by=case when p_status='approved' then auth.uid() else approved_by end where id=r.id;
end; $$;

create function public.record_payment(p_item uuid,p_amount numeric,p_reference text,p_method text) returns uuid language plpgsql security definer set search_path=public as $$
declare i payroll_items; r payroll_runs; p uuid; paid numeric; curr text;
begin
 select * into i from payroll_items where id=p_item;
 select * into r from payroll_runs where id=i.run_id for update;
 if i.id is null or not can_access(i.company_id,i.branch_id,i.employee_id,'finance',true) then raise exception 'Forbidden'; end if;
 if r.status not in ('approved','partially_paid') or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Invalid payment or payroll state'; end if;
 select coalesce(sum(a.amount),0) into paid from payment_allocations a join salary_payments s on s.id=a.payment_id where a.payroll_item_id=i.id and s.reversal_of is null and not exists(select 1 from salary_payments z where z.reversal_of=s.id);
 if paid+p_amount>i.net then raise exception 'Payment exceeds payable'; end if;
 select currency into curr from payroll_periods where id=r.period_id;
 insert into salary_payments(company_id,employee_id,amount,currency,reference,method) values(i.company_id,i.employee_id,p_amount,curr,p_reference,p_method) returning id into p;
 insert into payment_allocations(company_id,employee_id,payment_id,payroll_item_id,amount) values(i.company_id,i.employee_id,p,i.id,p_amount);
 update payroll_runs set status=case when not exists(select 1 from payroll_items x where x.run_id=r.id and x.net>(select coalesce(sum(a.amount),0) from payment_allocations a join salary_payments s on s.id=a.payment_id where a.payroll_item_id=x.id and s.reversal_of is null and not exists(select 1 from salary_payments z where z.reversal_of=s.id))) then 'paid' else 'partially_paid' end where id=r.id;
 return p;
end; $$;

create function public.reverse_payment(p_payment uuid,p_reference text) returns uuid language plpgsql security definer set search_path=public as $$
declare s salary_payments; r payroll_runs; result uuid;
begin
 select * into s from salary_payments where id=p_payment;
 select pr.* into r from payroll_runs pr join payroll_items i on i.run_id=pr.id join payment_allocations a on a.payroll_item_id=i.id where a.payment_id=s.id for update of pr;
 if s.id is null or not has_role(s.company_id,array['super_admin','company_admin','accountant']) or s.reversal_of is not null or r.status='locked' then raise exception 'Forbidden or locked payroll'; end if;
 insert into salary_payments(company_id,employee_id,amount,currency,reference,method,reversal_of) values(s.company_id,s.employee_id,s.amount,s.currency,p_reference,'reversal',s.id) returning id into result;
 update payroll_runs set status='partially_paid' where id=r.id;
 return result;
end; $$;

-- Protect finalized source authorizations and schedule ownership even through the REST API.
create function public.protect_financial_source() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_TABLE_NAME='salary_advances' then
 if old.status in ('disbursed','closed') then raise exception 'Disbursed advance is immutable'; end if;
 if new.status='disbursed' and (new.approved_amount is null or new.disbursed_at is null or new.disbursement_reference is null or new.authorization_reference is null) then raise exception 'Disbursement evidence required'; end if;
 elsif TG_TABLE_NAME='damage_recovery_plans' and old.status='approved' then raise exception 'Approved recovery is immutable';
 end if;
 return new;
end; $$;
create trigger protect_advance before update on salary_advances for each row execute function protect_financial_source();
create trigger protect_damage before update on damage_recovery_plans for each row execute function protect_financial_source();

-- Explicitly remove PostgreSQL's default PUBLIC function execution.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_company','set_membership','request_leave','review_correction','schedule_recovery','generate_payroll','transition_payroll','record_payment','reverse_payment') loop
 execute format('revoke all on function %s from public',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
