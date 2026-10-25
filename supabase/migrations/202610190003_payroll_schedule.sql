-- Opt-in monthly payroll drafts. Does not approve payroll or record salary payments.
begin;
create function public.configure_payroll_schedule(p_company uuid,p_enabled boolean,p_mode text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not has_role(p_company,array['super_admin','company_admin']) then raise exception 'Company administrator required';end if;
 if p_mode not in ('cycle_29_28','previous_month','calendar_month') then raise exception 'Invalid payroll period mode';end if;
 insert into application_settings(company_id,key,value)
 values(p_company,'payroll_schedule',jsonb_build_object('enabled',p_enabled,'day',28,'period_mode',p_mode,'scheduled_by',auth.uid()))
 on conflict(company_id,key) do update set value=excluded.value;
end; $$;
revoke all on function public.configure_payroll_schedule(uuid,boolean,text) from public,anon;
grant execute on function public.configure_payroll_schedule(uuid,boolean,text) to authenticated;

create function public.run_scheduled_payroll(p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item record; today date; first_day date; starts date; ends date; target_period uuid; run_id uuid; actor uuid;
 original_sub text:=current_setting('request.jwt.claim.sub',true);
 original_claims text:=current_setting('request.jwt.claims',true);
 results jsonb:='[]'::jsonb; mode text;
begin
 for item in select c.*,s.value config from companies c join application_settings s on s.company_id=c.id and s.key='payroll_schedule' where s.value->>'enabled'='true' loop
  today:=(p_at at time zone item.timezone)::date;
  if extract(day from today)<28 then continue;end if;
  begin
   -- Lock the company so retries/concurrent scheduler runs cannot duplicate drafts.
   perform 1 from companies where id=item.id for update;
   actor:=(item.config->>'scheduled_by')::uuid;
   if not exists(select 1 from company_memberships where company_id=item.id and user_id=actor and role in ('super_admin','company_admin')) then raise exception 'Scheduling administrator no longer authorized';end if;
   perform set_config('request.jwt.claim.sub',actor::text,true);
   perform set_config('request.jwt.claims',jsonb_set(coalesce(nullif(original_claims,'')::jsonb,'{}'::jsonb),'{sub}',to_jsonb(actor::text))::text,true);
   first_day:=date_trunc('month',today)::date; mode:=item.config->>'period_mode';
   if mode='cycle_29_28' then starts:=(first_day-interval '1 month')::date+28;ends:=first_day+27;
   elsif mode='previous_month' then starts:=(first_day-interval '1 month')::date;ends:=first_day-1;
   elsif mode='calendar_month' then starts:=first_day;ends:=(first_day+interval '1 month')::date-1;
   else raise exception 'Configure a valid payroll period mode';end if;
   select id into target_period from payroll_periods where company_id=item.id and start_date=starts and end_date=ends and currency=item.currency;
   if target_period is null then
    insert into payroll_periods(company_id,name,start_date,end_date,divisor,currency)
    values(item.id,to_char(ends,'Mon YYYY')||' payroll',starts,ends,item.payroll_divisor,item.currency) returning id into target_period;
   end if;
   select id into run_id from payroll_runs where company_id=item.id and payroll_runs.period_id=target_period;
   if run_id is null then
    run_id:=generate_payroll(target_period);
    insert into audit_logs(company_id,actor_id,action,table_name,record_id) values(item.id,actor,'scheduled_payroll_draft','payroll_runs',run_id);
    results:=results||jsonb_build_array(jsonb_build_object('company_id',item.id,'status','draft_created','run_id',run_id));
   else results:=results||jsonb_build_array(jsonb_build_object('company_id',item.id,'status','already_exists'));end if;
  exception when others then
   insert into notifications(company_id,user_id,title,message,source_key)
   values(item.id,actor,'Automatic payroll needs review','Draft was not generated. Check attendance coverage, payroll periods, advance schedules and approved overtime. No payment was issued.','scheduled-payroll:'||today::text)
   on conflict(company_id,user_id,source_key) where source_key is not null do nothing;
   results:=results||jsonb_build_array(jsonb_build_object('company_id',item.id,'status','needs_review','reason',sqlerrm));
  end;
  perform set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(original_claims,''),true);
 end loop;
 return results;
end; $$;
revoke all on function public.run_scheduled_payroll(timestamptz) from public,anon,authenticated;
grant execute on function public.run_scheduled_payroll(timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
