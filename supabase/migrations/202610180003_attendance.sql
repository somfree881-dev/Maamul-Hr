create function public.ingest_device_events(p_device uuid,p_events jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare d attendance_devices; n integer; l uuid;
begin
 select * into d from attendance_devices where id=p_device for update;
 if d.id is null or jsonb_array_length(p_events)>500 then raise exception 'Invalid batch'; end if;
 insert into attendance_sync_logs(company_id,branch_id,device_id,received) values(d.company_id,d.branch_id,d.id,jsonb_array_length(p_events)) returning id into l;
 insert into raw_attendance_events(company_id,branch_id,employee_id,device_id,device_user_id,occurred_at,punch,source_key)
 select d.company_id,d.branch_id,m.employee_id,d.id,x.device_user_id,x.occurred_at,x.punch,x.source_key from jsonb_to_recordset(p_events) as x(device_user_id text,occurred_at timestamptz,punch integer,source_key text)
 left join device_employee_mappings m on m.device_id=d.id and m.device_user_id=x.device_user_id and m.company_id=d.company_id
 on conflict(device_id,source_key) do nothing;
 get diagnostics n=row_count;
 update attendance_sync_logs set inserted=n,completed_at=now() where id=l;
 -- Only the connector's final empty heartbeat certifies a successful complete read.
 if jsonb_array_length(p_events)=0 then
 update attendance_devices set last_sync_at=now(),status='connected',sync_error=null where id=d.id;
 else update attendance_devices set status='syncing',sync_error=null where id=d.id;
 end if;
 return n;
end; $$;
revoke all on function public.ingest_device_events(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_device_events(uuid,jsonb) to service_role;

create function public.save_attendance(p_company uuid,p_employee uuid,p_date date,p_summary jsonb,p_shift uuid) returns void language plpgsql security definer set search_path=public as $$
declare e employees;
begin
 select * into e from employees where company_id=p_company and id=p_employee;
 if e.id is null or not can_access(p_company,e.branch_id,e.id,'attendance',true) then raise exception 'Forbidden'; end if;
 if exists(select 1 from attendance_summaries where employee_id=e.id and work_date=p_date and reviewed) then raise exception 'Reviewed attendance requires a correction'; end if;
 if exists(select 1 from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=e.id and p_date between p.start_date and p.end_date) then raise exception 'Attendance is included in payroll'; end if;
 insert into attendance_summaries(company_id,employee_id,work_date,shift_id,first_in,last_out,scheduled_minutes,worked_minutes,late_minutes,early_minutes,overtime_minutes,status,paid_leave)
 values(p_company,e.id,p_date,p_shift,(p_summary->>'first_in')::timestamptz,(p_summary->>'last_out')::timestamptz,(p_summary->>'scheduled_minutes')::int,(p_summary->>'worked_minutes')::int,(p_summary->>'late_minutes')::int,(p_summary->>'early_minutes')::int,(p_summary->>'overtime_minutes')::int,p_summary->>'status',(p_summary->>'paid_leave')::boolean)
 on conflict(employee_id,work_date) do update set shift_id=excluded.shift_id,first_in=excluded.first_in,last_out=excluded.last_out,scheduled_minutes=excluded.scheduled_minutes,worked_minutes=excluded.worked_minutes,late_minutes=excluded.late_minutes,early_minutes=excluded.early_minutes,overtime_minutes=excluded.overtime_minutes,status=excluded.status,paid_leave=excluded.paid_leave;
end; $$;
revoke all on function public.save_attendance(uuid,uuid,date,jsonb,uuid) from public;
grant execute on function public.save_attendance(uuid,uuid,date,jsonb,uuid) to authenticated;

create function public.review_absence(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare s attendance_summaries;
begin
 select * into s from attendance_summaries where id=p_id for update;
 if s.id is null or not can_access(s.company_id,s.branch_id,s.employee_id,'attendance',true) then raise exception 'Forbidden'; end if;
 if s.status<>'absent' then raise exception 'Only confirmed absence can be reviewed'; end if;
 update attendance_summaries set reviewed=true where id=p_id;
end; $$;
revoke all on function public.review_absence(uuid) from public;
grant execute on function public.review_absence(uuid) to authenticated;

-- Explicit leave/overtime approvals: no approval of one's own employee record.
create function public.review_request(p_kind text,p_id uuid,p_approve boolean,p_notes text default null) returns void language plpgsql security definer set search_path=public as $$
declare c uuid; b uuid; e uuid; s text;
begin
 if p_kind='leave' then select company_id,branch_id,employee_id,status into c,b,e,s from leave_requests where id=p_id for update;
 elsif p_kind='overtime' then select company_id,branch_id,employee_id,status into c,b,e,s from overtime_records where id=p_id for update;
 else raise exception 'Invalid request type'; end if;
 if c is null or not can_access(c,b,e,'attendance',true) or exists(select 1 from employees where id=e and user_id=auth.uid()) then raise exception 'Independent authorized reviewer required'; end if;
 if s<>'pending' then raise exception 'Already reviewed'; end if;
 if p_kind='leave' then update leave_requests set status=case when p_approve then 'approved' else 'rejected' end,approved_by=auth.uid(),manager_comments=p_notes where id=p_id;
 else update overtime_records set status=case when p_approve then 'approved' else 'rejected' end,approved_by=auth.uid() where id=p_id; end if;
end; $$;
revoke all on function public.review_request(text,uuid,boolean,text) from public;
grant execute on function public.review_request(text,uuid,boolean,text) to authenticated;
-- Approved requests cannot be edited through generic PostgREST writes.
drop policy update_records on public.leave_requests;
drop policy update_records on public.overtime_records;
drop policy delete_records on public.leave_requests;
drop policy delete_records on public.overtime_records;
