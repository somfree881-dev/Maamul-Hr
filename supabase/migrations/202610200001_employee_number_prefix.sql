-- Employee display numbers: EMP-01, EMP-02, ... independently per company.
-- Safe after the original installation, with or without the earlier numeric-number migration.
-- Employee UUIDs and related attendance/payroll records are preserved.
begin;
lock table public.employees in access exclusive mode;
update public.employees set employee_number='__maamul_emp_' || id::text;
with numbered as (
 select id,row_number() over(partition by company_id order by created_at,id)::text n
 from public.employees
)
update public.employees e
set employee_number='EMP-' || lpad(n.n,greatest(2,length(n.n)),'0')
from numbered n where e.id=n.id;

insert into public.application_settings(company_id,key,value)
select c.id,'employee_number_counter',jsonb_build_object('last_number',count(e.id))
from public.companies c left join public.employees e on e.company_id=c.id group by c.id
on conflict(company_id,key) do update set value=excluded.value;

alter table public.employees alter column employee_number drop default;
create or replace function public.assign_employee_number() returns trigger
language plpgsql security definer set search_path=public as $$
declare next_number bigint; current_max bigint;
begin
 perform 1 from companies where id=new.company_id for update;
 select coalesce(max(substring(employee_number from '^EMP-([0-9]+)$')::bigint),0)
 into current_max from employees where company_id=new.company_id;
 select greatest(coalesce((value->>'last_number')::bigint,0),current_max)+1
 into next_number from application_settings
 where company_id=new.company_id and key='employee_number_counter';
 next_number:=coalesce(next_number,current_max+1);
 new.employee_number:='EMP-' || lpad(next_number::text,greatest(2,length(next_number::text)),'0');
 insert into application_settings(company_id,key,value)
 values(new.company_id,'employee_number_counter',jsonb_build_object('last_number',next_number))
 on conflict(company_id,key) do update set value=excluded.value;
 return new;
end; $$;
revoke all on function public.assign_employee_number() from public,anon,authenticated;
drop trigger if exists assign_employee_number on public.employees;
create trigger assign_employee_number before insert on public.employees
for each row execute function public.assign_employee_number();
notify pgrst,'reload schema';
commit;
