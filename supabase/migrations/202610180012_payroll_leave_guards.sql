-- Prevent the same employee from being paid for overlapping periods in different currencies.
create function public.guard_employee_payroll_overlap() returns trigger language plpgsql security definer set search_path=public as $$
declare period payroll_periods;
begin
 perform 1 from employees where id=new.employee_id for update;
 select p.* into period from payroll_periods p join payroll_runs r on r.period_id=p.id where r.id=new.run_id;
 if exists(select 1 from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=new.employee_id and i.id<>new.id and p.start_date<=period.end_date and p.end_date>=period.start_date) then raise exception 'Employee already belongs to an overlapping payroll period'; end if;
 return new;
end; $$;
create trigger guard_employee_payroll_overlap before insert on payroll_items for each row execute function guard_employee_payroll_overlap();

-- Requested day counts cannot understate a long paid-leave range to bypass entitlement.
create function public.validate_scheduled_leave_days() returns trigger language plpgsql security definer set search_path=public as $$
declare e employees;d date;days integer[];expected integer:=0;
begin
 select * into e from employees where id=new.employee_id and company_id=new.company_id;
 if new.start_date<e.start_date or (e.end_date is not null and new.end_date>e.end_date) then raise exception 'Leave dates outside employment';end if;
 d:=new.start_date;
 while d<=new.end_date loop
 select s.working_days into days from shift_assignments a join work_shifts s on s.id=a.shift_id
 where a.company_id=new.company_id and a.starts_on<=d and (a.ends_on is null or a.ends_on>=d)
 and (a.employee_id=e.id or (a.employee_id is null and a.department_id is not null and a.department_id=e.department_id) or (a.employee_id is null and a.department_id is null and a.branch_id=e.branch_id))
 order by case when a.employee_id is not null then 0 when a.department_id is not null then 1 else 2 end,a.starts_on desc limit 1;
 if days is null then raise exception 'Assign a shift for every leave date before requesting leave';end if;
 if extract(isodow from d)::integer=any(days) and not exists(select 1 from holidays where company_id=new.company_id and holiday_date=d) then expected:=expected+1;end if;
 d:=d+1;
 end loop;
 if new.total_days<>expected then raise exception 'Leave days must equal scheduled working days: %',expected;end if;
 return new;
end; $$;
create trigger validate_scheduled_leave_days before insert or update on leave_requests for each row execute function validate_scheduled_leave_days();
alter table attendance_summaries add check(scheduled_minutes>=0 and worked_minutes>=0 and late_minutes>=0 and early_minutes>=0 and overtime_minutes>=0);
