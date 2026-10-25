create function public.request_correction(p_company uuid,p_employee uuid,p_date date,p_in timestamptz,p_out timestamptz,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare e employees;r uuid;
begin
 select * into e from employees where company_id=p_company and id=p_employee;
 if e.id is null or not(coalesce(e.user_id=auth.uid(),false) or can_access(p_company,e.branch_id,e.id,'attendance',true)) then raise exception 'Forbidden';end if;
 if p_in is null or p_out is null or p_out<=p_in or nullif(trim(p_reason),'') is null then raise exception 'Valid punches and reason required';end if;
 insert into attendance_corrections(company_id,employee_id,work_date,check_in,check_out,reason) values(p_company,e.id,p_date,p_in,p_out,p_reason) returning id into r;return r;
end; $$;
create function public.request_advance(p_company uuid,p_employee uuid,p_amount numeric,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare e employees;r uuid;
begin
 select * into e from employees where company_id=p_company and id=p_employee;
 if e.id is null or not(coalesce(e.user_id=auth.uid(),false) or can_access(p_company,e.branch_id,e.id,'finance',true)) then raise exception 'Forbidden';end if;
 if p_amount<=0 or nullif(trim(p_reason),'') is null then raise exception 'Positive amount and reason required';end if;
 insert into salary_advances(company_id,employee_id,requested_amount,reason) values(p_company,e.id,p_amount,p_reason) returning id into r;return r;
end; $$;
revoke all on function public.request_correction(uuid,uuid,date,timestamptz,timestamptz,text),public.request_advance(uuid,uuid,numeric,text) from public;
grant execute on function public.request_correction(uuid,uuid,date,timestamptz,timestamptz,text),public.request_advance(uuid,uuid,numeric,text) to authenticated;
