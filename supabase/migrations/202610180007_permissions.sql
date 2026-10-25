create function public.attendance_employee(p_company uuid,p_employee uuid) returns table(id uuid,branch_id uuid,department_id uuid,start_date date,end_date date) language sql stable security definer set search_path=public as $$
select e.id,e.branch_id,e.department_id,e.start_date,e.end_date from employees e where e.company_id=p_company and e.id=p_employee and can_access(p_company,e.branch_id,e.id,'attendance',true); $$;
revoke all on function public.attendance_employee(uuid,uuid) from public;
grant execute on function public.attendance_employee(uuid,uuid) to authenticated;
create policy member_shifts on work_shifts for select to authenticated using(has_role(company_id,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']));
create policy member_holidays on holidays for select to authenticated using(has_role(company_id,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']));

-- One incident cannot fund multiple plans beyond its verified loss.
create or replace function public.validate_recovery_source() returns trigger language plpgsql security definer set search_path=public as $$
declare loss numeric; committed numeric;
begin
 if TG_TABLE_NAME='damage_recovery_plans' then
 select verified_loss into loss from employee_incidents where company_id=new.company_id and id=new.incident_id and employee_id=new.employee_id and status='approved' for update;
 select coalesce(sum(approved_amount),0) into committed from damage_recovery_plans where incident_id=new.incident_id and id<>new.id and status in ('approved','closed');
 if new.status='approved' and (loss is null or new.approved_amount+committed>loss) then raise exception 'Approved recovery exceeds approved incident loss or employee mismatch'; end if;
 elsif TG_TABLE_NAME='salary_advances' then
 if new.approved_amount>new.requested_amount then raise exception 'Advance approval exceeds request'; end if;
 if new.status='disbursed' and (new.approved_amount is null or new.disbursed_at is null or nullif(trim(new.disbursement_reference),'') is null or nullif(trim(new.authorization_reference),'') is null) then raise exception 'Disbursement evidence required'; end if;
 end if;
 return new;
end; $$;
-- A document row cannot point at a different employee's object.
alter table employee_documents add constraint document_path_matches_employee check(split_part(storage_path,'/',1)=company_id::text and split_part(storage_path,'/',2)=employee_id::text and array_length(string_to_array(storage_path,'/'),1)=3);

-- Immutable historical data is visible to the appropriate roles but never directly edited.
drop policy insert_records on salary_history;
drop policy update_records on salary_history;
-- Tenant membership changes must remain auditable, even if performed by a database operator.
create trigger audit_membership after insert or update or delete on company_memberships for each row execute function audit_change();
