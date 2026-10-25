"""Generate the initial additive migration. Never connects to a database."""
from pathlib import Path

tables = {
'branches': "name text not null, timezone text not null default 'Africa/Nairobi', address text",
'departments': 'name text not null',
'positions': 'name text not null, description text',
'employees': "employee_number text not null default ('EMP-' || upper(substr(gen_random_uuid()::text,1,8))), user_id uuid references auth.users(id), department_id uuid, position_id uuid, first_name text not null, middle_name text, last_name text not null, father_name text, mother_name text, date_of_birth date, gender text, nationality text, phone text, alternative_phone text, district text, address text, photo_path text, emergency_name text, emergency_phone text, emergency_relationship text, start_date date not null, end_date date, employment_type text not null default 'full_time' check (employment_type in ('full_time','part_time','contract')), status text not null default 'active' check (status in ('active','inactive','terminated','on_leave')), reporting_manager_id uuid, basic_salary numeric(18,2) not null default 0 check (basic_salary>=0), currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'), payment_method text, unique(company_id,employee_number), unique(company_id,user_id), check(end_date is null or end_date>=start_date)",
'employee_contacts': 'name text not null, phone text not null, relationship text not null, address text',
'employee_guarantors': 'full_name text not null, phone text not null, address text, relationship text',
'employee_documents': "document_type text not null, title text not null, storage_path text not null unique, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 10485760), issue_date date, expiration_date date, notes text, uploaded_by uuid not null default auth.uid() references auth.users(id)",
'employment_contracts': 'contract_type text not null, start_date date not null, end_date date, terms text, document_id uuid',
'salary_structures': 'name text not null, allowances numeric(18,2) not null default 0 check(allowances>=0), bonuses numeric(18,2) not null default 0 check(bonuses>=0), effective_from date not null, effective_to date',
'salary_history': 'amount numeric(18,2) not null check(amount>=0), currency text not null, effective_from date not null, reason text not null',
'attendance_devices': "name text not null, model text not null, serial_number text not null, ip_address inet not null, port integer not null default 4370 check(port between 1 and 65535), connection_type text not null default 'pyzk' check(connection_type in ('pyzk','adms','vendor_api')), timezone text not null default 'Africa/Nairobi', connector_key_hash text not null, last_sync_at timestamptz, status text not null default 'unknown', sync_error text, unique(company_id,serial_number)",
'device_employee_mappings': 'device_id uuid not null, device_user_id text not null, unique(device_id,device_user_id)',
'raw_attendance_events': "device_id uuid not null, device_user_id text not null, occurred_at timestamptz not null, punch integer, source_key text not null, received_at timestamptz not null default now(), unique(device_id,source_key)",
'attendance_summaries': "work_date date not null, shift_id uuid, first_in timestamptz, last_out timestamptz, scheduled_minutes integer not null default 0, worked_minutes integer not null default 0, late_minutes integer not null default 0, early_minutes integer not null default 0, overtime_minutes integer not null default 0, status text not null check(status in ('present','absent','leave','rest','holiday','missing_in','missing_out','uncertain')), reviewed boolean not null default false, paid_leave boolean not null default false, unique(employee_id,work_date)",
'attendance_corrections': "work_date date not null, check_in timestamptz, check_out timestamptz, reason text not null, status text not null default 'pending' check(status in ('pending','approved','rejected')), requested_by uuid not null default auth.uid() references auth.users(id), reviewed_by uuid references auth.users(id), review_notes text",
'attendance_sync_logs': 'device_id uuid not null, started_at timestamptz not null default now(), completed_at timestamptz, received integer not null default 0, inserted integer not null default 0, error text',
'work_shifts': "name text not null, start_time time not null, end_time time not null, grace_minutes integer not null default 0 check(grace_minutes>=0), break_minutes integer not null default 0 check(break_minutes>=0), working_days integer[] not null default array[1,2,3,4,5,6], overtime_multiplier numeric(6,3) not null default 1.5 check(overtime_multiplier>=1), segments jsonb not null default '[]'",
'shift_assignments': 'shift_id uuid not null, department_id uuid, starts_on date not null, ends_on date, check(ends_on is null or ends_on>=starts_on)',
'leave_types': 'name text not null, paid boolean not null default true, annual_entitlement numeric(8,2) not null default 0 check(annual_entitlement>=0), requires_document boolean not null default false',
'leave_policies': 'leave_type_id uuid not null, annual_entitlement numeric(8,2) not null check(annual_entitlement>=0), effective_from date not null',
'leave_requests': "leave_type_id uuid not null, start_date date not null, end_date date not null, total_days numeric(8,2) not null check(total_days>0), reason text not null, description text, status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')), approved_by uuid references auth.users(id), manager_comments text, check(end_date>=start_date), check(date_part('year',start_date)=date_part('year',end_date)), exclude using gist (employee_id with =, daterange(start_date,end_date,'[]') with &&) where (status in ('pending','approved'))",
'overtime_records': "work_date date not null, hours numeric(8,2) not null check(hours>=0), multiplier numeric(6,3) not null default 1.5 check(multiplier>=1), category text not null default 'regular', status text not null default 'pending' check(status in ('pending','approved','rejected')), approved_by uuid references auth.users(id), unique(employee_id,work_date,category)",
'employee_incidents': "incident_date date not null, category text not null, description text not null, evidence_path text, estimated_loss numeric(18,2) not null default 0 check(estimated_loss>=0), verified_loss numeric(18,2) not null default 0 check(verified_loss>=0), employee_explanation text, manager_review text, status text not null default 'pending' check(status in ('pending','reviewed','disputed','approved','rejected'))",
'damage_recovery_plans': "incident_id uuid not null, approved_amount numeric(18,2) not null check(approved_amount>=0), authorization_reference text not null, employee_consent_at timestamptz not null, legal_basis text not null, status text not null default 'pending' check(status in ('pending','approved','closed','disputed'))",
'damage_recovery_installments': "plan_id uuid not null, due_date date not null, amount numeric(18,2) not null check(amount>0), payroll_item_id uuid, unique(plan_id,due_date)",
'salary_advances': "requested_amount numeric(18,2) not null check(requested_amount>0), approved_amount numeric(18,2) check(approved_amount>0), reason text not null, status text not null default 'pending' check(status in ('pending','approved','disbursed','rejected','closed')), disbursed_at timestamptz, disbursement_reference text, authorization_reference text",
'advance_repayments': 'advance_id uuid not null, due_date date not null, amount numeric(18,2) not null check(amount>0), payroll_item_id uuid, unique(advance_id,due_date)',
'payroll_periods': "name text not null, start_date date not null, end_date date not null, divisor numeric(8,2) not null check(divisor>0), daily_hours numeric(5,2) not null default 8 check(daily_hours>0 and daily_hours<=24), rounding_mode text not null default 'half_up' check(rounding_mode in ('half_up','half_even','down','up')), currency text not null default 'USD', check(end_date>=start_date), exclude using gist(company_id with =, currency with =, daterange(start_date,end_date,'[]') with &&)",
'payroll_runs': "period_id uuid not null, status text not null default 'draft' check(status in ('draft','verified','approved','partially_paid','paid','locked')), generated_by uuid not null default auth.uid() references auth.users(id), approved_by uuid references auth.users(id), unique(company_id,period_id)",
'payroll_items': 'run_id uuid not null, basic_salary numeric(18,2) not null check(basic_salary>=0), basic_earnings numeric(18,2) not null check(basic_earnings>=0), unpaid_absence numeric(18,2) not null default 0, overtime numeric(18,2) not null default 0, bonuses numeric(18,2) not null default 0, allowances numeric(18,2) not null default 0, late_deductions numeric(18,2) not null default 0, damage_recovery numeric(18,2) not null default 0, advance_recovery numeric(18,2) not null default 0, other_deductions numeric(18,2) not null default 0, gross numeric(18,2) not null, deductions numeric(18,2) not null, net numeric(18,2) not null check(net>=0), unique(run_id,employee_id), check(gross=basic_earnings+overtime+bonuses+allowances), check(deductions=late_deductions+damage_recovery+advance_recovery+other_deductions), check(net=gross-deductions)',
'payroll_approvals': 'run_id uuid not null, stage text not null, approved_by uuid not null default auth.uid() references auth.users(id), notes text, unique(run_id,stage)',
'salary_payments': 'amount numeric(18,2) not null check(amount>0), currency text not null, paid_at timestamptz not null default now(), reference text not null, method text not null, reversal_of uuid unique, recorded_by uuid not null default auth.uid() references auth.users(id), unique(company_id,reference)',
'payment_allocations': 'payment_id uuid not null, payroll_item_id uuid not null, amount numeric(18,2) not null check(amount>0), unique(payment_id,payroll_item_id)',
'employee_performance_reviews': 'review_date date not null, attendance_rate numeric(5,2) check(attendance_rate between 0 and 100), punctuality_rate numeric(5,2) check(punctuality_rate between 0 and 100), manager_comments text not null, reviewer_id uuid not null default auth.uid() references auth.users(id)',
'notifications': 'user_id uuid references auth.users(id), title text not null, message text not null, read_at timestamptz',
'application_settings': "key text not null, value jsonb not null, unique(company_id,key)",
'holidays': 'holiday_date date not null, name text not null, unique(company_id,holiday_date)',
'authorized_deductions': "period_id uuid not null, category text not null check(category in ('late','other')), amount numeric(18,2) not null check(amount>=0), legal_basis text not null, authorization_reference text not null, approved_by uuid not null default auth.uid() references auth.users(id), unique(employee_id,period_id,category)",
}
employee_tables = set('employee_contacts employee_guarantors employee_documents employment_contracts salary_structures salary_history device_employee_mappings attendance_summaries attendance_corrections shift_assignments leave_policies leave_requests overtime_records employee_incidents damage_recovery_plans damage_recovery_installments salary_advances advance_repayments payroll_items salary_payments payment_allocations employee_performance_reviews authorized_deductions'.split())
nullable_employee = {'shift_assignments','leave_policies'}
sql = '''-- Additive initial schema. Review against existing projects before applying.
create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create table public.companies (
 id uuid primary key default gen_random_uuid(), name text not null,
 currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'),
 timezone text not null default 'Africa/Nairobi', payroll_divisor numeric(8,2) not null default 26 check(payroll_divisor>0),
 created_at timestamptz not null default now(), unique(id)
);
create table public.company_memberships (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 user_id uuid not null references auth.users(id), role text not null check(role in ('super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee')),
 branch_id uuid, created_at timestamptz not null default now(), unique(company_id,user_id),
 check(role not in ('branch_manager','supervisor') or branch_id is not null)
);
'''
for name, fields in tables.items():
    branch = '' if name == 'branches' else ', branch_id uuid'
    employee = (', employee_id uuid' + ('' if name in nullable_employee else ' not null')) if name in employee_tables else ''
    if name == 'raw_attendance_events': employee = ', employee_id uuid'
    sql += f'create table public.{name} (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id){branch}{employee}, created_at timestamptz not null default now(), {fields}, unique(company_id,id));\n'
    sql += f'create index {name}_tenant_idx on public.{name}(company_id);\n'

links = {
'employees': [('department_id','departments'),('position_id','positions'),('reporting_manager_id','employees')],
'employment_contracts':[('document_id','employee_documents')],
'device_employee_mappings':[('device_id','attendance_devices')],
'raw_attendance_events':[('device_id','attendance_devices')],
'attendance_summaries':[('shift_id','work_shifts')],
'attendance_sync_logs':[('device_id','attendance_devices')],
'shift_assignments':[('shift_id','work_shifts'),('department_id','departments')],
'leave_policies':[('leave_type_id','leave_types')],
'leave_requests':[('leave_type_id','leave_types')],
'damage_recovery_plans':[('incident_id','employee_incidents')],
'damage_recovery_installments':[('plan_id','damage_recovery_plans'),('payroll_item_id','payroll_items')],
'advance_repayments':[('advance_id','salary_advances'),('payroll_item_id','payroll_items')],
'payroll_runs':[('period_id','payroll_periods')],
'payroll_items':[('run_id','payroll_runs')],
'payroll_approvals':[('run_id','payroll_runs')],
'salary_payments':[('reversal_of','salary_payments')],
'payment_allocations':[('payment_id','salary_payments'),('payroll_item_id','payroll_items')],
'authorized_deductions':[('period_id','payroll_periods')],
}
for name in tables:
    relations = list(links.get(name,[]))
    if name != 'branches': relations.append(('branch_id','branches'))
    if name in employee_tables or name == 'raw_attendance_events': relations.append(('employee_id','employees'))
    for col,target in relations:
        sql += f'alter table public.{name} add foreign key(company_id,{col}) references public.{target}(company_id,id);\ncreate index on public.{name}({col});\n'
sql += '''alter table public.company_memberships add foreign key(company_id,branch_id) references public.branches(company_id,id);
create table public.audit_logs(id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), actor_id uuid, action text not null, table_name text not null, record_id uuid, changed_fields text[], created_at timestamptz not null default now());
create index on public.audit_logs(company_id,created_at);
-- Helpers owned by migration owner; never use user-editable auth metadata for roles.
create function public.has_role(c uuid, roles text[]) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from company_memberships where company_id=c and user_id=auth.uid() and role=any(roles)); $$;
create function public.can_access(c uuid, b uuid, e uuid, area text, writing boolean default false) returns boolean language plpgsql stable security definer set search_path=public as $$
declare m company_memberships; own boolean;
begin
 select * into m from company_memberships where company_id=c and user_id=auth.uid();
 if m.id is null then return false; end if;
 if m.role in ('super_admin','company_admin') then return true; end if;
 own := exists(select 1 from employees where company_id=c and id=e and user_id=auth.uid());
 if area='settings' then return not writing and m.role in ('hr_manager','accountant','branch_manager','supervisor'); end if;
 if area='finance' then return m.role='accountant' or (not writing and own); end if;
 if area='private' then return m.role='hr_manager' or (not writing and own); end if;
 if area='hr' then return m.role='hr_manager' or (not writing and own); end if;
 if area='attendance' then return m.role='hr_manager' or (m.role in ('branch_manager','supervisor') and b=m.branch_id) or (not writing and own); end if;
 return false;
end; $$;
revoke all on function public.has_role(uuid,text[]), public.can_access(uuid,uuid,uuid,text,boolean) from public;
grant execute on function public.has_role(uuid,text[]), public.can_access(uuid,uuid,uuid,text,boolean) to authenticated;
alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
create policy company_read on public.companies for select to authenticated using(public.has_role(id,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']));
create policy company_edit on public.companies for update to authenticated using(public.has_role(id,array['super_admin','company_admin'])) with check(public.has_role(id,array['super_admin','company_admin']));
create policy membership_read on public.company_memberships for select to authenticated using(user_id=auth.uid() or public.has_role(company_id,array['super_admin','company_admin']));
-- Membership changes use an administrator-checked RPC; no direct writes.
alter table public.audit_logs enable row level security;
create policy audit_read on public.audit_logs for select to authenticated using(public.has_role(company_id,array['super_admin','company_admin']));
create function public.audit_change() returns trigger language plpgsql security definer set search_path=public as $$
declare r jsonb; fields text[];
begin
 r := case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 select array_agg(key) into fields from jsonb_each(r) where TG_OP<>'UPDATE' or value is distinct from to_jsonb(old)->key;
 insert into audit_logs(company_id,actor_id,action,table_name,record_id,changed_fields) values((r->>'company_id')::uuid,auth.uid(),TG_OP,TG_TABLE_NAME,(r->>'id')::uuid,fields);
 return case when TG_OP='DELETE' then old else new end;
end; $$;
'''
finance = set('salary_structures salary_history damage_recovery_plans damage_recovery_installments salary_advances advance_repayments payroll_periods payroll_runs payroll_items payroll_approvals salary_payments payment_allocations authorized_deductions'.split())
private = set('employee_contacts employee_guarantors employee_documents employment_contracts employee_incidents employee_performance_reviews'.split())
attendance = set('attendance_devices device_employee_mappings raw_attendance_events attendance_summaries attendance_corrections attendance_sync_logs work_shifts shift_assignments leave_types leave_policies leave_requests overtime_records holidays'.split())
rpc_only = set('raw_attendance_events attendance_sync_logs attendance_summaries payroll_runs payroll_items payroll_approvals salary_payments payment_allocations advance_repayments damage_recovery_installments'.split())
for name in tables:
    area = 'finance' if name in finance else 'private' if name in private else 'attendance' if name in attendance else 'settings' if name in {'application_settings','branches','departments','positions'} else 'hr'
    b = 'null' if name=='branches' else 'branch_id'
    e = 'id' if name=='employees' else 'employee_id' if name in employee_tables or name=='raw_attendance_events' else 'null'
    sql += f'alter table public.{name} enable row level security;\ncreate policy read_records on public.{name} for select to authenticated using(public.can_access(company_id,{b},{e},\'{area}\',false));\n'
    if name not in rpc_only:
        sql += f'create policy insert_records on public.{name} for insert to authenticated with check(public.can_access(company_id,{b},{e},\'{area}\',true));\ncreate policy update_records on public.{name} for update to authenticated using(public.can_access(company_id,{b},{e},\'{area}\',true)) with check(public.can_access(company_id,{b},{e},\'{area}\',true));\n'
    # No direct deletion of financial or audit records.
    if area not in ('finance',) and name not in rpc_only:
        sql += f'create policy delete_records on public.{name} for delete to authenticated using(public.has_role(company_id,array[\'super_admin\',\'company_admin\',\'hr_manager\']));\n'
    sql += f'create trigger audit_record after insert or update or delete on public.{name} for each row execute function public.audit_change();\n'

sql += '''-- Private bucket. Paths: company UUID / employee UUID / random UUID.ext.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('employee-documents','employee-documents',false,10485760,array['application/pdf','image/jpeg','image/png','application/zip']) on conflict(id) do nothing;
create function public.can_access_document(path text, writing boolean) returns boolean language plpgsql stable security definer set search_path=public as $$
declare c uuid; e uuid; b uuid;
begin
 begin c:=split_part(path,'/',1)::uuid; e:=split_part(path,'/',2)::uuid; exception when invalid_text_representation then return false; end;
 select branch_id into b from employees where company_id=c and id=e;
 if not found then return false; end if;
 return can_access(c,b,e,'private',writing);
end; $$;
revoke all on function public.can_access_document(text,boolean) from public;
grant execute on function public.can_access_document(text,boolean) to authenticated;
create policy private_document_read on storage.objects for select to authenticated using(bucket_id='employee-documents' and public.can_access_document(name,false));
create policy private_document_insert on storage.objects for insert to authenticated with check(bucket_id='employee-documents' and public.can_access_document(name,true));
create policy private_document_delete on storage.objects for delete to authenticated using(bucket_id='employee-documents' and public.can_access_document(name,true));
'''
Path('supabase/migrations/202610180001_foundation.sql').write_text(sql,encoding='utf-8')
print(f'Generated {len(tables)+3} tables, tenant foreign keys, RLS and private storage policies.')
