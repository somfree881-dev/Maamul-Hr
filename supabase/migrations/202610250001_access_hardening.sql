-- Additive security hardening. No tables or records are deleted.
-- Review/apply after approval. Existing role/branch policies remain in effect.
begin;
do $$ declare t text; begin
 foreach t in array array['companies','company_memberships','branches','departments','positions','employees','employee_contacts','employee_guarantors','employee_documents','employment_contracts','salary_structures','salary_history','attendance_devices','device_employee_mappings','raw_attendance_events','attendance_summaries','attendance_corrections','attendance_sync_logs','work_shifts','shift_assignments','leave_types','leave_policies','leave_requests','overtime_records','employee_incidents','damage_recovery_plans','damage_recovery_installments','salary_advances','advance_repayments','payroll_periods','payroll_runs','payroll_items','payroll_approvals','salary_payments','payment_allocations','employee_performance_reviews','notifications','application_settings','holidays','authorized_deductions','audit_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from anon',t);
 end loop;
end $$;
-- An employee link alone must never authorize self-service after membership removal.
create or replace function public.request_leave(p_company uuid,p_employee uuid,p_type uuid,p_start date,p_end date,p_days numeric,p_reason text,p_description text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare e employees; r uuid;
begin
 if auth.uid() is null or not has_role(p_company,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']) then raise exception 'Forbidden';end if;
 select * into e from employees where company_id=p_company and id=p_employee;
 if not found or not (coalesce(e.user_id=auth.uid(),false) or can_access(p_company,e.branch_id,e.id,'attendance',true)) then raise exception 'Forbidden'; end if;
 insert into leave_requests(company_id,branch_id,employee_id,leave_type_id,start_date,end_date,total_days,reason,description) values(p_company,e.branch_id,e.id,p_type,p_start,p_end,p_days,p_reason,p_description) returning id into r;
 return r;
end; $$;

create or replace function public.request_correction(p_company uuid,p_employee uuid,p_date date,p_in timestamptz,p_out timestamptz,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare e employees;r uuid;
begin
 if auth.uid() is null or not has_role(p_company,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']) then raise exception 'Forbidden';end if;
 select * into e from employees where company_id=p_company and id=p_employee;
 if e.id is null or not(coalesce(e.user_id=auth.uid(),false) or can_access(p_company,e.branch_id,e.id,'attendance',true)) then raise exception 'Forbidden';end if;
 if p_in is null or p_out is null or p_out<=p_in or nullif(trim(p_reason),'') is null then raise exception 'Valid punches and reason required';end if;
 insert into attendance_corrections(company_id,employee_id,work_date,check_in,check_out,reason) values(p_company,e.id,p_date,p_in,p_out,p_reason) returning id into r;return r;
end; $$;

create or replace function public.request_advance(p_company uuid,p_employee uuid,p_amount numeric,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare e employees;r uuid;
begin
 if auth.uid() is null or not has_role(p_company,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']) then raise exception 'Forbidden';end if;
 select * into e from employees where company_id=p_company and id=p_employee;
 if e.id is null or not(coalesce(e.user_id=auth.uid(),false) or can_access(p_company,e.branch_id,e.id,'finance',true)) then raise exception 'Forbidden';end if;
 if p_amount<=0 or nullif(trim(p_reason),'') is null then raise exception 'Positive amount and reason required';end if;
 insert into salary_advances(company_id,employee_id,requested_amount,reason) values(p_company,e.id,p_amount,p_reason) returning id into r;return r;
end; $$;
notify pgrst,'reload schema';
commit;
