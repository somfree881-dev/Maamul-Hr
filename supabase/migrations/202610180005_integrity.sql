-- Freeze source periods once payroll is generated.
create function public.freeze_period() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from payroll_runs where period_id=old.id) then raise exception 'Period already has payroll'; end if;
 return new;
end; $$;
create trigger freeze_period before update on payroll_periods for each row execute function freeze_period();

create function public.validate_recovery_source() returns trigger language plpgsql set search_path=public as $$
declare loss numeric;
begin
 if TG_TABLE_NAME='damage_recovery_plans' then
 select verified_loss into loss from employee_incidents where company_id=new.company_id and id=new.incident_id and employee_id=new.employee_id and status='approved';
 if new.status='approved' and (loss is null or new.approved_amount>loss) then raise exception 'Approved recovery exceeds approved incident loss or employee mismatch'; end if;
 elsif TG_TABLE_NAME='salary_advances' then
 if new.approved_amount>new.requested_amount then raise exception 'Advance approval exceeds request'; end if;
 if new.status='disbursed' and (new.approved_amount is null or new.disbursed_at is null or nullif(trim(new.disbursement_reference),'') is null or nullif(trim(new.authorization_reference),'') is null) then raise exception 'Disbursement evidence required'; end if;
 end if;
 return new;
end; $$;
create trigger validate_damage_source before insert or update on damage_recovery_plans for each row execute function validate_recovery_source();
create trigger validate_advance_source before insert or update on salary_advances for each row execute function validate_recovery_source();

create function public.record_salary_history() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' or new.basic_salary is distinct from old.basic_salary or new.currency is distinct from old.currency then
 insert into salary_history(company_id,employee_id,amount,currency,effective_from,reason) values(new.company_id,new.id,new.basic_salary,new.currency,current_date,case when TG_OP='INSERT' then 'Initial salary' else 'Employee salary updated' end);
 end if;
 return new;
end; $$;
create trigger record_salary_history after insert or update on employees for each row execute function record_salary_history();

create function public.guard_correction() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' then
 new.requested_by:=auth.uid();new.reviewed_by:=null;
 if new.status<>'pending' then raise exception 'Corrections must start pending'; end if;
 elsif new.status='approved' and exists(select 1 from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=new.employee_id and new.work_date between p.start_date and p.end_date) then raise exception 'Correction affects generated payroll; use an adjustment in a subsequent period';
 end if;
 return new;
end; $$;
create trigger guard_correction before insert or update on attendance_corrections for each row execute function guard_correction();
-- Approved correction must check before its summary update, so guard the summaries too.
create function public.freeze_payroll_attendance() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=new.employee_id and new.work_date between p.start_date and p.end_date) then raise exception 'Attendance belongs to generated payroll'; end if;
 return new;
end; $$;
create trigger freeze_payroll_attendance before update on attendance_summaries for each row execute function freeze_payroll_attendance();

-- Self-service users need company leave definitions, without broader staff privileges.
create policy member_leave_types on leave_types for select to authenticated using(has_role(company_id,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']));
create policy member_branches on branches for select to authenticated using(has_role(company_id,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']));
create policy member_departments on departments for select to authenticated using(has_role(company_id,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']));
create policy member_positions on positions for select to authenticated using(has_role(company_id,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']));

create function public.backfill_device_mappings(p_device uuid) returns integer language plpgsql security definer set search_path=public as $$
declare d attendance_devices; n integer;
begin
 select * into d from attendance_devices where id=p_device;
 if d.id is null or not has_role(d.company_id,array['super_admin','company_admin','hr_manager']) then raise exception 'Forbidden'; end if;
 update raw_attendance_events r set employee_id=m.employee_id from device_employee_mappings m where r.device_id=d.id and m.device_id=d.id and m.device_user_id=r.device_user_id and r.employee_id is null;
 get diagnostics n=row_count;return n;
end; $$;
revoke all on function public.backfill_device_mappings(uuid) from public;
grant execute on function public.backfill_device_mappings(uuid) to authenticated;
