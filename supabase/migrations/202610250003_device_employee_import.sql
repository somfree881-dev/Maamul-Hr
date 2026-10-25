-- Device roster staging and explicitly confirmed employee import. No device data is deleted.
begin;
create table public.device_employee_imports (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 branch_id uuid not null, device_id uuid not null,
 requested_by uuid not null default auth.uid() references auth.users(id),
 status text not null default 'waiting' check(status in ('waiting','uploading','ready','imported','error','cancelled')),
 users jsonb not null default '[]' check(jsonb_typeof(users)='array' and jsonb_array_length(users)<=20000),
 error_code text, results jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(company_id,branch_id) references public.branches(company_id,id),
 foreign key(company_id,device_id) references public.attendance_devices(company_id,id)
);
create unique index device_employee_import_active on public.device_employee_imports(device_id) where status in ('waiting','uploading','ready');
create index employees_device_import_name_idx on public.employees(company_id, (lower(regexp_replace(btrim(coalesce(first_name,'')||' '||coalesce(middle_name,'')||' '||coalesce(last_name,'')),'\s+',' ','g'))));
create index device_employee_import_company on public.device_employee_imports(company_id,created_at);
alter table public.device_employee_imports enable row level security;
revoke all on public.device_employee_imports from public,anon,authenticated,service_role;
grant select on public.device_employee_imports to authenticated;
create function public.device_import_allowed(p_device uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from attendance_devices d join company_memberships m on m.company_id=d.company_id where d.id=p_device and m.user_id=auth.uid() and m.role in ('super_admin','company_admin','hr_manager'));
$$;
revoke all on function public.device_import_allowed(uuid) from public,anon;
grant execute on function public.device_import_allowed(uuid) to authenticated;
create policy import_read on public.device_employee_imports for select to authenticated using(public.device_import_allowed(device_id));

create function public.request_device_employee_import(p_device uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare d attendance_devices; r uuid;
begin
 if not device_import_allowed(p_device) then raise exception 'Forbidden';end if;
 select * into d from attendance_devices where id=p_device for update;
 if d.branch_id is null then raise exception 'Assign a branch to the device first';end if;
 select id into r from device_employee_imports where device_id=d.id and status in ('waiting','uploading','ready');
 if r is not null then return r;end if;
 insert into device_employee_imports(company_id,branch_id,device_id) values(d.company_id,d.branch_id,d.id) returning id into r;
 insert into audit_logs(company_id,actor_id,action,table_name,record_id) values(d.company_id,auth.uid(),'device_import_requested','device_employee_imports',r);
 return r;
end; $$;

create function public.poll_device_employee_import(p_device uuid) returns uuid language sql stable security definer set search_path=public as $$
 select id from device_employee_imports where device_id=p_device and status in ('waiting','uploading') order by created_at limit 1;
$$;
create function public.stage_device_employee_users(p_device uuid,p_request uuid,p_offset integer,p_users jsonb,p_final boolean) returns integer language plpgsql security definer set search_path=public as $$
declare b device_employee_imports; d attendance_devices; n integer; existing jsonb;
begin
 select * into b from device_employee_imports where id=p_request and device_id=p_device for update;
 select * into d from attendance_devices where id=p_device;
 if b.id is null or b.company_id<>d.company_id or b.branch_id is distinct from d.branch_id then raise exception 'Invalid import scope';end if;
 if jsonb_typeof(p_users)<>'array' or jsonb_array_length(p_users)>500 or p_offset<0 or p_offset+jsonb_array_length(p_users)>20000 then raise exception 'Invalid roster batch';end if;
 if exists(select 1 from jsonb_array_elements(p_users) x where jsonb_typeof(x)<>'object' or jsonb_typeof(x->'device_user_id') is distinct from 'string' or length(trim(x->>'device_user_id')) not between 1 and 100 or jsonb_typeof(x->'name') is distinct from 'string' or length(x->>'name')>200 or (x ? 'device_group' and (jsonb_typeof(x->'device_group')<>'string' or length(x->>'device_group')>40)) or exists(select 1 from jsonb_object_keys(x) k where k not in ('device_user_id','name','device_group'))) then raise exception 'Only approved non-biometric fields are allowed';end if;
 n:=jsonb_array_length(b.users);
 if p_offset<n or b.status in ('ready','imported') then
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into existing from jsonb_array_elements(b.users) with ordinality a(value,ord) where ord>p_offset and ord<=p_offset+jsonb_array_length(p_users);
  if existing=p_users and p_offset+jsonb_array_length(p_users)<=n then return p_offset+jsonb_array_length(p_users);end if;
  raise exception 'Snapshot changed; request a new import';
 end if;
 if b.status not in ('waiting','uploading') or p_offset<>n then raise exception 'Invalid roster offset';end if;
 if (select count(*) from jsonb_array_elements(b.users||p_users))<>(select count(distinct value->>'device_user_id') from jsonb_array_elements(b.users||p_users)) then raise exception 'Duplicate device user IDs';end if;
 update device_employee_imports set users=users||p_users,status=case when p_final then 'ready' else 'uploading' end,updated_at=now() where id=b.id;
 return p_offset+jsonb_array_length(p_users);
end; $$;
create function public.fail_device_employee_import(p_device uuid,p_request uuid,p_error text) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_error not in ('device_unreachable','read_failed') then raise exception 'Invalid error code';end if;
 update device_employee_imports set status='error',error_code=p_error,updated_at=now() where id=p_request and device_id=p_device and status in ('waiting','uploading');
end; $$;

create function public.preview_device_employee_import(p_request uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare b device_employee_imports; d attendance_devices; u jsonb; ids uuid[]; matched uuid; kind text; reason text; rows jsonb:='[]'; options jsonb; full_name text; mapped boolean; name_counts jsonb;
begin
 select * into b from device_employee_imports where id=p_request;
 if b.id is null or not device_import_allowed(b.device_id) then raise exception 'Forbidden';end if;
 select * into d from attendance_devices where id=b.device_id;
 if b.company_id<>d.company_id or b.branch_id is distinct from d.branch_id then raise exception 'Device branch changed; cancel and request a new import';end if;
 if b.status='ready' then
 select coalesce(jsonb_object_agg(k,n),'{}'::jsonb) into name_counts from (select lower(regexp_replace(trim(value->>'name'),'\s+',' ','g')) k,count(*) n from jsonb_array_elements(b.users) group by 1) counts;
 for u in select value from jsonb_array_elements(b.users) loop
  matched:=null; ids:=null; reason:=null;
  full_name:=lower(regexp_replace(trim(u->>'name'),'\s+',' ','g'));
  select employee_id into matched from device_employee_mappings where device_id=d.id and device_user_id=u->>'device_user_id';
  mapped:=matched is not null;
  if mapped then
   if exists(select 1 from employees where id=matched and company_id=d.company_id and branch_id=d.branch_id) then kind:='mapped';else kind:='conflict';reason:='Existing mapping is outside the device branch';matched:=null;end if;
  else
   select array_agg(id order by id) into ids from employees where company_id=d.company_id and (employee_number=u->>'device_user_id' or (full_name<>'' and lower(regexp_replace(btrim(coalesce(first_name,'')||' '||coalesce(middle_name,'')||' '||coalesce(last_name,'')),'\s+',' ','g'))=full_name));
   if cardinality(ids)=1 and exists(select 1 from employees where id=ids[1] and branch_id=d.branch_id) then kind:='match';matched:=ids[1];
   elsif cardinality(ids)>0 then kind:='conflict';reason:='Multiple matches or an existing employee in another branch';
   elsif full_name='' then kind:='conflict';reason:='Missing device name; select an existing employee';
   elsif coalesce((name_counts->>full_name)::integer,0)>1 then kind:='conflict';reason:='Duplicate device names; resolve before creating profiles';
   else kind:='new';end if;
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('device_user_id',u->>'device_user_id','name',u->>'name','kind',kind,'employee_id',matched,'reason',reason));
 end loop;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',concat_ws(' ',first_name,middle_name,last_name)||' ('||employee_number||')') order by first_name,id),'[]'::jsonb) into options from employees where company_id=d.company_id and branch_id=d.branch_id;
 return jsonb_build_object('id',b.id,'status',b.status,'error',b.error_code,'results',b.results,'users',rows,'employees',options,'device_name',d.name,'timezone',d.timezone,
 'preview_token',md5(b.id::text||b.users::text||rows::text||d.branch_id::text),
 'new_users',(select count(*) from jsonb_array_elements(rows) x where x->>'kind'='new'),
 'existing_matches',(select count(*) from jsonb_array_elements(rows) x where x->>'kind' in ('match','mapped')),
 'conflicts',(select count(*) from jsonb_array_elements(rows) x where x->>'kind'='conflict'),
 'historical_records',(select count(*) from raw_attendance_events where device_id=d.id),
 'unmapped_attendance',(select count(*) from raw_attendance_events where device_id=d.id and employee_id is null));
end; $$;

create function public.confirm_device_employee_import(p_request uuid,p_token text,p_start date,p_decisions jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare b device_employee_imports; d attendance_devices; preview jsonb; choice jsonb; item jsonb; e uuid; previous uuid; created integer:=0; linked integer:=0; skipped integer:=0; mappings integer:=0; n integer; history integer; result jsonb; imported_name text;
begin
 select * into b from device_employee_imports where id=p_request for update;
 if b.id is null or not device_import_allowed(b.device_id) then raise exception 'Forbidden';end if;
 if b.status='imported' then return b.results;end if;
 if b.status<>'ready' then raise exception 'Wait for a complete device roster';end if;
 -- Serialize matching with employee writes; stale previews fail instead of creating duplicates.
 lock table employees in share row exclusive mode;
 select * into d from attendance_devices where id=b.device_id for update;
 preview:=preview_device_employee_import(b.id);
 if preview->>'preview_token' is distinct from p_token then raise exception 'Preview changed; refresh and review again';end if;
 if exists(select 1 from jsonb_array_elements(p_decisions) x where x->>'action'='create') and (p_start is null or p_start>(now() at time zone d.timezone)::date) then raise exception 'Provide the actual employment start date for new employees';end if;
 if jsonb_typeof(p_decisions)<>'array' or jsonb_array_length(p_decisions)<>jsonb_array_length(b.users) or (select count(distinct x->>'device_user_id') from jsonb_array_elements(p_decisions) x)<>jsonb_array_length(b.users) then raise exception 'Review every device user exactly once';end if;
 for choice in select value from jsonb_array_elements(p_decisions) loop
  select value into item from jsonb_array_elements(preview->'users') where value->>'device_user_id'=choice->>'device_user_id';
  if item is null then raise exception 'Unknown device user';end if;
  if choice->>'action'='skip' then skipped:=skipped+1;continue;end if;
  select employee_id into previous from device_employee_mappings where device_id=d.id and device_user_id=choice->>'device_user_id';
  if choice->>'action'='create' then
   if item->>'kind'<>'new' then raise exception 'Resolve existing matches or conflicts without creating duplicate employees';end if;
   imported_name:=trim(item->>'name');
   insert into employees(company_id,branch_id,first_name,last_name,start_date,status,basic_salary,currency)
   select d.company_id,d.branch_id,split_part(imported_name,' ',1),trim(substr(imported_name,length(split_part(imported_name,' ',1))+1)),p_start,'inactive',0,c.currency from companies c where c.id=d.company_id returning id into e;
   created:=created+1;
  elsif choice->>'action'='link' then
   e:=(choice->>'employee_id')::uuid;
   if e is null or not exists(select 1 from employees where id=e and company_id=d.company_id and branch_id=d.branch_id) then raise exception 'Employee must belong to the device company and branch';end if;
   if previous is not null and previous<>e then raise exception 'Existing mapping cannot be reassigned by an import';end if;
   linked:=linked+1;
  else raise exception 'Invalid import decision';end if;
  insert into device_employee_mappings(company_id,branch_id,employee_id,device_id,device_user_id) values(d.company_id,d.branch_id,e,d.id,choice->>'device_user_id') on conflict(device_id,device_user_id) do nothing;
  get diagnostics n=row_count;mappings:=mappings+n;
  if not exists(select 1 from device_employee_mappings where device_id=d.id and device_user_id=choice->>'device_user_id' and employee_id=e) then raise exception 'Mapping changed; refresh preview';end if;
 end loop;
 update raw_attendance_events r set employee_id=m.employee_id from device_employee_mappings m where r.device_id=d.id and r.company_id=d.company_id and m.device_id=d.id and m.company_id=d.company_id and m.device_user_id=r.device_user_id and r.employee_id is null;
 get diagnostics history=row_count;
 result:=jsonb_build_object('created',created,'linked',linked,'skipped',skipped,'mappings_created',mappings,'history_mapped',history,'unmapped_remaining',(select count(*) from raw_attendance_events where device_id=d.id and employee_id is null));
 update device_employee_imports set status='imported',results=result,updated_at=now() where id=b.id;
 insert into audit_logs(company_id,actor_id,action,table_name,record_id) values(d.company_id,auth.uid(),'device_employees_imported','device_employee_imports',b.id);
 return result;
end; $$;
create function public.cancel_device_employee_import(p_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare d uuid;
begin
 select device_id into d from device_employee_imports where id=p_request;
 if not device_import_allowed(d) then raise exception 'Forbidden';end if;
 update device_employee_imports set status='cancelled',updated_at=now() where id=p_request and status in ('waiting','uploading','ready');
end; $$;

do $$ declare f text;begin
 foreach f in array array['request_device_employee_import(uuid)','preview_device_employee_import(uuid)','confirm_device_employee_import(uuid,text,date,jsonb)','cancel_device_employee_import(uuid)'] loop
 execute 'revoke all on function public.'||f||' from public,anon';execute 'grant execute on function public.'||f||' to authenticated';end loop;
 foreach f in array array['poll_device_employee_import(uuid)','stage_device_employee_users(uuid,uuid,integer,jsonb,boolean)','fail_device_employee_import(uuid,uuid,text)'] loop
 execute 'revoke all on function public.'||f||' from public,anon,authenticated';execute 'grant execute on function public.'||f||' to service_role';end loop;
end $$;
notify pgrst,'reload schema';
commit;
