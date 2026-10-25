-- Manual one-click monthly drafts; never approves payroll or sends payments.
begin;
create or replace function public.generate_monthly_salaries(p_company uuid,p_month date,p_late boolean default true)
returns uuid language plpgsql security definer set search_path=public as $$
declare c companies; p payroll_periods; r uuid; first_day date; last_day date; e record; a salary_advances; amount numeric;
begin
 if not has_role(p_company,array['super_admin','company_admin','accountant']) then raise exception 'Forbidden';end if;
 if p_month is null then raise exception 'Payroll workflow ready';end if;
 select * into c from companies where id=p_company for update;
 first_day:=date_trunc('month',p_month)::date;
 last_day:=(first_day+interval '1 month')::date-1;
 select * into p from payroll_periods where company_id=c.id and currency=c.currency and start_date=first_day and end_date=last_day for update;
 if p.id is not null then
  select id into r from payroll_runs where period_id=p.id;
  if r is not null then return r;end if;
 end if;
 if last_day>=(now() at time zone c.timezone)::date then raise exception 'Select a completed month. Future attendance cannot be assumed.';end if;
 if p.id is null then
  if exists(select 1 from payroll_periods where company_id=c.id and currency=c.currency and start_date<=last_day and end_date>=first_day) then
   raise exception 'An existing salary period overlaps this month. Use that period or choose another month; no records were deleted.';
  end if;
  insert into payroll_periods(company_id,name,start_date,end_date,divisor,currency)
  values(c.id,to_char(first_day,'Mon YYYY')||' salaries',first_day,last_day,c.payroll_divisor,c.currency) returning * into p;
 end if;
 -- Explicit manual authorization: automatic minutes-based late deduction replaces no existing authorization.
 if p_late then
  for e in select emp.id,emp.basic_salary,sum(s.late_minutes) minutes
   from employees emp join attendance_summaries s on s.employee_id=emp.id
   where emp.company_id=c.id and emp.currency=p.currency and s.work_date between first_day and last_day
   and s.work_date>=emp.start_date and (emp.end_date is null or s.work_date<=emp.end_date)
   group by emp.id,emp.basic_salary having sum(s.late_minutes)>0 loop
   amount:=payroll_round(e.basic_salary/p.divisor/p.daily_hours/60*e.minutes,p.rounding_mode);
   insert into authorized_deductions(company_id,employee_id,period_id,category,amount,legal_basis,authorization_reference)
   values(c.id,e.id,p.id,'late',amount,'Company payroll policy authorized by generating administrator','monthly-late:'||p.id::text)
   on conflict(employee_id,period_id,category) do nothing;
  end loop;
 end if;
 -- Recover only disbursed advances: preserve all existing installment schedules.
 for a in select * from salary_advances where company_id=c.id and status='disbursed' order by id for update loop
  select a.approved_amount-coalesce(sum(x.amount),0) into amount from advance_repayments x where x.advance_id=a.id;
  if amount>0 then
   if exists(select 1 from advance_repayments where advance_id=a.id and due_date=last_day) then
    raise exception 'Advance has an incomplete installment schedule. Complete it before generating salaries.';
   end if;
   perform schedule_recovery('advance',a.id,array[last_day],array[amount]);
  end if;
 end loop;
 r:=generate_payroll(p.id);
 insert into audit_logs(company_id,actor_id,action,table_name,record_id)
 values(c.id,auth.uid(),'manual_monthly_salary_generation','payroll_runs',r);
 return r;
end; $$;
revoke all on function public.generate_monthly_salaries(uuid,date,boolean) from public,anon;
grant execute on function public.generate_monthly_salaries(uuid,date,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
