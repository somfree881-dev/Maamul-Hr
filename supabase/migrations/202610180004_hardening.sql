-- A limited employee directory lets finance/branch staff choose employees without exposing private fields.
create function public.employee_directory(p_company uuid) returns table(id uuid,employee_number text,first_name text,last_name text) language sql stable security definer set search_path=public as $$
 select e.id,e.employee_number,e.first_name,e.last_name from employees e join company_memberships m on m.company_id=e.company_id and m.user_id=auth.uid()
 where e.company_id=p_company and (m.role in ('super_admin','company_admin','hr_manager','accountant') or (m.role in ('branch_manager','supervisor') and e.branch_id=m.branch_id) or e.user_id=auth.uid()) order by e.first_name,e.last_name; $$;
revoke all on function public.employee_directory(uuid) from public;
grant execute on function public.employee_directory(uuid) to authenticated;

-- Secret hashes must be strong SHA-256 hex, and device mappings stay within a branch.
alter table attendance_devices add check(connector_key_hash ~ '^[a-f0-9]{64}$');
create function public.validate_mapping() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from attendance_devices d join employees e on e.company_id=d.company_id and e.branch_id=d.branch_id where d.id=new.device_id and e.id=new.employee_id) then raise exception 'Device and employee must belong to the same branch'; end if;
 return new;
end; $$;
create trigger validate_mapping before insert or update on device_employee_mappings for each row execute function validate_mapping();

-- Prevent authorizations from being changed after draft payroll has consumed them.
create function public.guard_payroll_sources() returns trigger language plpgsql set search_path=public as $$
declare c uuid; e uuid;
begin
 c:=coalesce(new.company_id,old.company_id); e:=coalesce(new.employee_id,old.employee_id);
 if TG_TABLE_NAME='authorized_deductions' and exists(select 1 from payroll_runs where period_id=old.period_id) then raise exception 'Deduction already included in payroll'; end if;
 if TG_TABLE_NAME='salary_structures' and exists(select 1 from payroll_items where employee_id=e) then raise exception 'Use a new date-effective salary structure'; end if;
 return new;
end; $$;
create trigger guard_deductions before update on authorized_deductions for each row execute function guard_payroll_sources();
create trigger guard_structure before update on salary_structures for each row execute function guard_payroll_sources();

-- Normal authenticated users never directly assign approval identities.
create function public.default_pending() returns trigger language plpgsql set search_path=public as $$
begin
 if new.status<>'pending' then raise exception 'New requests must start pending'; end if;
 new.approved_by:=null;
 return new;
end; $$;
create trigger pending_leave before insert on leave_requests for each row execute function default_pending();
create trigger pending_overtime before insert on overtime_records for each row execute function default_pending();

-- Corrections are only approved using review_correction.
drop policy update_records on attendance_corrections;
drop policy delete_records on attendance_corrections;
-- Sensitive devices are administered by HR/company admins only, never branch-scoped supervisors.
drop policy insert_records on attendance_devices;
drop policy update_records on attendance_devices;
create policy device_insert on attendance_devices for insert to authenticated with check(has_role(company_id,array['super_admin','company_admin','hr_manager']));
create policy device_update on attendance_devices for update to authenticated using(has_role(company_id,array['super_admin','company_admin','hr_manager'])) with check(has_role(company_id,array['super_admin','company_admin','hr_manager']));
