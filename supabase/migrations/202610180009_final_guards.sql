create index membership_user_idx on company_memberships(user_id);
create index attendance_company_date_idx on attendance_summaries(company_id,work_date);
create index raw_employee_time_idx on raw_attendance_events(employee_id,occurred_at);
create index documents_expiry_idx on employee_documents(company_id,expiration_date) where expiration_date is not null;
create index leave_employee_dates_idx on leave_requests(employee_id,start_date,end_date);
create index payroll_period_dates_idx on payroll_periods(company_id,start_date,end_date);
create index advance_pending_idx on advance_repayments(employee_id,due_date) where payroll_item_id is null;
create index damage_pending_idx on damage_recovery_installments(employee_id,due_date) where payroll_item_id is null;

create or replace function public.guard_payroll_sources() returns trigger language plpgsql set search_path=public as $$
declare last_period date;
begin
 if TG_TABLE_NAME='authorized_deductions' and exists(select 1 from payroll_runs where period_id=old.period_id) then raise exception 'Deduction already included in payroll'; end if;
 if TG_TABLE_NAME='salary_structures' then
 select max(p.end_date) into last_period from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=old.employee_id;
 if last_period is not null and not(new.company_id=old.company_id and new.employee_id=old.employee_id and new.name=old.name and new.allowances=old.allowances and new.bonuses=old.bonuses and new.effective_from=old.effective_from and new.effective_to is not null and new.effective_to>=last_period) then raise exception 'Use a new date-effective salary structure'; end if;
 end if;
 return new;
end; $$;
alter table salary_structures add constraint salary_structure_dates check(effective_to is null or effective_to>=effective_from);
alter table salary_structures add constraint salary_structure_no_overlap exclude using gist(employee_id with =,daterange(effective_from,effective_to,'[]') with &&);

create function public.guard_payroll_request() returns trigger language plpgsql set search_path=public as $$
declare from_date date; to_date date;
begin
 if TG_TABLE_NAME='leave_requests' then from_date:=old.start_date;to_date:=old.end_date;else from_date:=old.work_date;to_date:=old.work_date;end if;
 if exists(select 1 from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=old.employee_id and p.start_date<=to_date and p.end_date>=from_date) then raise exception 'Request affects generated payroll';end if;
 return new;
end; $$;
create trigger guard_payroll_leave before update on leave_requests for each row execute function guard_payroll_request();
create trigger guard_payroll_overtime before update on overtime_records for each row execute function guard_payroll_request();

-- Finance gets the minimum attendance ledger needed for payroll reconciliation.
create policy finance_attendance_read on attendance_summaries for select to authenticated using(has_role(company_id,array['accountant']));
create policy finance_overtime_read on overtime_records for select to authenticated using(has_role(company_id,array['accountant']));
create function public.recovery_incidents(p_company uuid) returns table(id uuid,name text) language sql stable security definer set search_path=public as $$
select i.id,i.category||' | '||e.employee_number||' | '||i.verified_loss::text from employee_incidents i join employees e on e.id=i.employee_id where i.company_id=p_company and i.status='approved' and has_role(p_company,array['super_admin','company_admin','accountant']); $$;
revoke all on function public.recovery_incidents(uuid) from public;
grant execute on function public.recovery_incidents(uuid) to authenticated;
