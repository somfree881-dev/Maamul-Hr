-- Maamul HR: approved initial installation for the NEW EMPTY project only.
-- Contains the 13 original migration files in filename order, unchanged.
-- Run the ENTIRE file once in Supabase SQL Editor. Do not run selected fragments.
-- Transaction rolls back all installation changes if any statement fails.
begin;
set local statement_timeout = '120s';
do $preflight$
begin
 if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m')) then
  raise exception 'Installation stopped: public already contains tables or views. Review existing schema; do not rerun this installer.';
 end if;
 if exists (select 1 from storage.buckets where id='employee-documents' and public) then
  raise exception 'Installation stopped: employee-documents bucket is public. Review storage configuration.';
 end if;
end
$preflight$;

-- BEGIN MIGRATION: 202610180001_foundation.sql

-- Additive initial schema. Review against existing projects before applying.
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
create table public.branches (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), created_at timestamptz not null default now(), name text not null, timezone text not null default 'Africa/Nairobi', address text, unique(company_id,id));
create index branches_tenant_idx on public.branches(company_id);
create table public.departments (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), name text not null, unique(company_id,id));
create index departments_tenant_idx on public.departments(company_id);
create table public.positions (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), name text not null, description text, unique(company_id,id));
create index positions_tenant_idx on public.positions(company_id);
create table public.employees (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), employee_number text not null default ('EMP-' || upper(substr(gen_random_uuid()::text,1,8))), user_id uuid references auth.users(id), department_id uuid, position_id uuid, first_name text not null, middle_name text, last_name text not null, father_name text, mother_name text, date_of_birth date, gender text, nationality text, phone text, alternative_phone text, district text, address text, photo_path text, emergency_name text, emergency_phone text, emergency_relationship text, start_date date not null, end_date date, employment_type text not null default 'full_time' check (employment_type in ('full_time','part_time','contract')), status text not null default 'active' check (status in ('active','inactive','terminated','on_leave')), reporting_manager_id uuid, basic_salary numeric(18,2) not null default 0 check (basic_salary>=0), currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'), payment_method text, unique(company_id,employee_number), unique(company_id,user_id), check(end_date is null or end_date>=start_date), unique(company_id,id));
create index employees_tenant_idx on public.employees(company_id);
create table public.employee_contacts (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), name text not null, phone text not null, relationship text not null, address text, unique(company_id,id));
create index employee_contacts_tenant_idx on public.employee_contacts(company_id);
create table public.employee_guarantors (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), full_name text not null, phone text not null, address text, relationship text, unique(company_id,id));
create index employee_guarantors_tenant_idx on public.employee_guarantors(company_id);
create table public.employee_documents (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), document_type text not null, title text not null, storage_path text not null unique, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 10485760), issue_date date, expiration_date date, notes text, uploaded_by uuid not null default auth.uid() references auth.users(id), unique(company_id,id));
create index employee_documents_tenant_idx on public.employee_documents(company_id);
create table public.employment_contracts (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), contract_type text not null, start_date date not null, end_date date, terms text, document_id uuid, unique(company_id,id));
create index employment_contracts_tenant_idx on public.employment_contracts(company_id);
create table public.salary_structures (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), name text not null, allowances numeric(18,2) not null default 0 check(allowances>=0), bonuses numeric(18,2) not null default 0 check(bonuses>=0), effective_from date not null, effective_to date, unique(company_id,id));
create index salary_structures_tenant_idx on public.salary_structures(company_id);
create table public.salary_history (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), amount numeric(18,2) not null check(amount>=0), currency text not null, effective_from date not null, reason text not null, unique(company_id,id));
create index salary_history_tenant_idx on public.salary_history(company_id);
create table public.attendance_devices (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), name text not null, model text not null, serial_number text not null, ip_address inet not null, port integer not null default 4370 check(port between 1 and 65535), connection_type text not null default 'pyzk' check(connection_type in ('pyzk','adms','vendor_api')), timezone text not null default 'Africa/Nairobi', connector_key_hash text not null, last_sync_at timestamptz, status text not null default 'unknown', sync_error text, unique(company_id,serial_number), unique(company_id,id));
create index attendance_devices_tenant_idx on public.attendance_devices(company_id);
create table public.device_employee_mappings (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), device_id uuid not null, device_user_id text not null, unique(device_id,device_user_id), unique(company_id,id));
create index device_employee_mappings_tenant_idx on public.device_employee_mappings(company_id);
create table public.raw_attendance_events (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid, created_at timestamptz not null default now(), device_id uuid not null, device_user_id text not null, occurred_at timestamptz not null, punch integer, source_key text not null, received_at timestamptz not null default now(), unique(device_id,source_key), unique(company_id,id));
create index raw_attendance_events_tenant_idx on public.raw_attendance_events(company_id);
create table public.attendance_summaries (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), work_date date not null, shift_id uuid, first_in timestamptz, last_out timestamptz, scheduled_minutes integer not null default 0, worked_minutes integer not null default 0, late_minutes integer not null default 0, early_minutes integer not null default 0, overtime_minutes integer not null default 0, status text not null check(status in ('present','absent','leave','rest','holiday','missing_in','missing_out','uncertain')), reviewed boolean not null default false, paid_leave boolean not null default false, unique(employee_id,work_date), unique(company_id,id));
create index attendance_summaries_tenant_idx on public.attendance_summaries(company_id);
create table public.attendance_corrections (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), work_date date not null, check_in timestamptz, check_out timestamptz, reason text not null, status text not null default 'pending' check(status in ('pending','approved','rejected')), requested_by uuid not null default auth.uid() references auth.users(id), reviewed_by uuid references auth.users(id), review_notes text, unique(company_id,id));
create index attendance_corrections_tenant_idx on public.attendance_corrections(company_id);
create table public.attendance_sync_logs (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), device_id uuid not null, started_at timestamptz not null default now(), completed_at timestamptz, received integer not null default 0, inserted integer not null default 0, error text, unique(company_id,id));
create index attendance_sync_logs_tenant_idx on public.attendance_sync_logs(company_id);
create table public.work_shifts (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), name text not null, start_time time not null, end_time time not null, grace_minutes integer not null default 0 check(grace_minutes>=0), break_minutes integer not null default 0 check(break_minutes>=0), working_days integer[] not null default array[1,2,3,4,5,6], overtime_multiplier numeric(6,3) not null default 1.5 check(overtime_multiplier>=1), segments jsonb not null default '[]', unique(company_id,id));
create index work_shifts_tenant_idx on public.work_shifts(company_id);
create table public.shift_assignments (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid, created_at timestamptz not null default now(), shift_id uuid not null, department_id uuid, starts_on date not null, ends_on date, check(ends_on is null or ends_on>=starts_on), unique(company_id,id));
create index shift_assignments_tenant_idx on public.shift_assignments(company_id);
create table public.leave_types (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), name text not null, paid boolean not null default true, annual_entitlement numeric(8,2) not null default 0 check(annual_entitlement>=0), requires_document boolean not null default false, unique(company_id,id));
create index leave_types_tenant_idx on public.leave_types(company_id);
create table public.leave_policies (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid, created_at timestamptz not null default now(), leave_type_id uuid not null, annual_entitlement numeric(8,2) not null check(annual_entitlement>=0), effective_from date not null, unique(company_id,id));
create index leave_policies_tenant_idx on public.leave_policies(company_id);
create table public.leave_requests (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), leave_type_id uuid not null, start_date date not null, end_date date not null, total_days numeric(8,2) not null check(total_days>0), reason text not null, description text, status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')), approved_by uuid references auth.users(id), manager_comments text, check(end_date>=start_date), check(date_part('year',start_date)=date_part('year',end_date)), exclude using gist (employee_id with =, daterange(start_date,end_date,'[]') with &&) where (status in ('pending','approved')), unique(company_id,id));
create index leave_requests_tenant_idx on public.leave_requests(company_id);
create table public.overtime_records (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), work_date date not null, hours numeric(8,2) not null check(hours>=0), multiplier numeric(6,3) not null default 1.5 check(multiplier>=1), category text not null default 'regular', status text not null default 'pending' check(status in ('pending','approved','rejected')), approved_by uuid references auth.users(id), unique(employee_id,work_date,category), unique(company_id,id));
create index overtime_records_tenant_idx on public.overtime_records(company_id);
create table public.employee_incidents (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), incident_date date not null, category text not null, description text not null, evidence_path text, estimated_loss numeric(18,2) not null default 0 check(estimated_loss>=0), verified_loss numeric(18,2) not null default 0 check(verified_loss>=0), employee_explanation text, manager_review text, status text not null default 'pending' check(status in ('pending','reviewed','disputed','approved','rejected')), unique(company_id,id));
create index employee_incidents_tenant_idx on public.employee_incidents(company_id);
create table public.damage_recovery_plans (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), incident_id uuid not null, approved_amount numeric(18,2) not null check(approved_amount>=0), authorization_reference text not null, employee_consent_at timestamptz not null, legal_basis text not null, status text not null default 'pending' check(status in ('pending','approved','closed','disputed')), unique(company_id,id));
create index damage_recovery_plans_tenant_idx on public.damage_recovery_plans(company_id);
create table public.damage_recovery_installments (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), plan_id uuid not null, due_date date not null, amount numeric(18,2) not null check(amount>0), payroll_item_id uuid, unique(plan_id,due_date), unique(company_id,id));
create index damage_recovery_installments_tenant_idx on public.damage_recovery_installments(company_id);
create table public.salary_advances (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), requested_amount numeric(18,2) not null check(requested_amount>0), approved_amount numeric(18,2) check(approved_amount>0), reason text not null, status text not null default 'pending' check(status in ('pending','approved','disbursed','rejected','closed')), disbursed_at timestamptz, disbursement_reference text, authorization_reference text, unique(company_id,id));
create index salary_advances_tenant_idx on public.salary_advances(company_id);
create table public.advance_repayments (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), advance_id uuid not null, due_date date not null, amount numeric(18,2) not null check(amount>0), payroll_item_id uuid, unique(advance_id,due_date), unique(company_id,id));
create index advance_repayments_tenant_idx on public.advance_repayments(company_id);
create table public.payroll_periods (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), name text not null, start_date date not null, end_date date not null, divisor numeric(8,2) not null check(divisor>0), daily_hours numeric(5,2) not null default 8 check(daily_hours>0 and daily_hours<=24), rounding_mode text not null default 'half_up' check(rounding_mode in ('half_up','half_even','down','up')), currency text not null default 'USD', check(end_date>=start_date), exclude using gist(company_id with =, currency with =, daterange(start_date,end_date,'[]') with &&), unique(company_id,id));
create index payroll_periods_tenant_idx on public.payroll_periods(company_id);
create table public.payroll_runs (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), period_id uuid not null, status text not null default 'draft' check(status in ('draft','verified','approved','partially_paid','paid','locked')), generated_by uuid not null default auth.uid() references auth.users(id), approved_by uuid references auth.users(id), unique(company_id,period_id), unique(company_id,id));
create index payroll_runs_tenant_idx on public.payroll_runs(company_id);
create table public.payroll_items (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), run_id uuid not null, basic_salary numeric(18,2) not null check(basic_salary>=0), basic_earnings numeric(18,2) not null check(basic_earnings>=0), unpaid_absence numeric(18,2) not null default 0, overtime numeric(18,2) not null default 0, bonuses numeric(18,2) not null default 0, allowances numeric(18,2) not null default 0, late_deductions numeric(18,2) not null default 0, damage_recovery numeric(18,2) not null default 0, advance_recovery numeric(18,2) not null default 0, other_deductions numeric(18,2) not null default 0, gross numeric(18,2) not null, deductions numeric(18,2) not null, net numeric(18,2) not null check(net>=0), unique(run_id,employee_id), check(gross=basic_earnings+overtime+bonuses+allowances), check(deductions=late_deductions+damage_recovery+advance_recovery+other_deductions), check(net=gross-deductions), unique(company_id,id));
create index payroll_items_tenant_idx on public.payroll_items(company_id);
create table public.payroll_approvals (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), run_id uuid not null, stage text not null, approved_by uuid not null default auth.uid() references auth.users(id), notes text, unique(run_id,stage), unique(company_id,id));
create index payroll_approvals_tenant_idx on public.payroll_approvals(company_id);
create table public.salary_payments (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), amount numeric(18,2) not null check(amount>0), currency text not null, paid_at timestamptz not null default now(), reference text not null, method text not null, reversal_of uuid unique, recorded_by uuid not null default auth.uid() references auth.users(id), unique(company_id,reference), unique(company_id,id));
create index salary_payments_tenant_idx on public.salary_payments(company_id);
create table public.payment_allocations (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), payment_id uuid not null, payroll_item_id uuid not null, amount numeric(18,2) not null check(amount>0), unique(payment_id,payroll_item_id), unique(company_id,id));
create index payment_allocations_tenant_idx on public.payment_allocations(company_id);
create table public.employee_performance_reviews (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), review_date date not null, attendance_rate numeric(5,2) check(attendance_rate between 0 and 100), punctuality_rate numeric(5,2) check(punctuality_rate between 0 and 100), manager_comments text not null, reviewer_id uuid not null default auth.uid() references auth.users(id), unique(company_id,id));
create index employee_performance_reviews_tenant_idx on public.employee_performance_reviews(company_id);
create table public.notifications (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), user_id uuid references auth.users(id), title text not null, message text not null, read_at timestamptz, unique(company_id,id));
create index notifications_tenant_idx on public.notifications(company_id);
create table public.application_settings (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), key text not null, value jsonb not null, unique(company_id,key), unique(company_id,id));
create index application_settings_tenant_idx on public.application_settings(company_id);
create table public.holidays (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, created_at timestamptz not null default now(), holiday_date date not null, name text not null, unique(company_id,holiday_date), unique(company_id,id));
create index holidays_tenant_idx on public.holidays(company_id);
create table public.authorized_deductions (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), branch_id uuid, employee_id uuid not null, created_at timestamptz not null default now(), period_id uuid not null, category text not null check(category in ('late','other')), amount numeric(18,2) not null check(amount>=0), legal_basis text not null, authorization_reference text not null, approved_by uuid not null default auth.uid() references auth.users(id), unique(employee_id,period_id,category), unique(company_id,id));
create index authorized_deductions_tenant_idx on public.authorized_deductions(company_id);
alter table public.departments add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.departments(branch_id);
alter table public.positions add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.positions(branch_id);
alter table public.employees add foreign key(company_id,department_id) references public.departments(company_id,id);
create index on public.employees(department_id);
alter table public.employees add foreign key(company_id,position_id) references public.positions(company_id,id);
create index on public.employees(position_id);
alter table public.employees add foreign key(company_id,reporting_manager_id) references public.employees(company_id,id);
create index on public.employees(reporting_manager_id);
alter table public.employees add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.employees(branch_id);
alter table public.employee_contacts add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.employee_contacts(branch_id);
alter table public.employee_contacts add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.employee_contacts(employee_id);
alter table public.employee_guarantors add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.employee_guarantors(branch_id);
alter table public.employee_guarantors add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.employee_guarantors(employee_id);
alter table public.employee_documents add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.employee_documents(branch_id);
alter table public.employee_documents add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.employee_documents(employee_id);
alter table public.employment_contracts add foreign key(company_id,document_id) references public.employee_documents(company_id,id);
create index on public.employment_contracts(document_id);
alter table public.employment_contracts add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.employment_contracts(branch_id);
alter table public.employment_contracts add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.employment_contracts(employee_id);
alter table public.salary_structures add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.salary_structures(branch_id);
alter table public.salary_structures add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.salary_structures(employee_id);
alter table public.salary_history add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.salary_history(branch_id);
alter table public.salary_history add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.salary_history(employee_id);
alter table public.attendance_devices add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.attendance_devices(branch_id);
alter table public.device_employee_mappings add foreign key(company_id,device_id) references public.attendance_devices(company_id,id);
create index on public.device_employee_mappings(device_id);
alter table public.device_employee_mappings add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.device_employee_mappings(branch_id);
alter table public.device_employee_mappings add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.device_employee_mappings(employee_id);
alter table public.raw_attendance_events add foreign key(company_id,device_id) references public.attendance_devices(company_id,id);
create index on public.raw_attendance_events(device_id);
alter table public.raw_attendance_events add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.raw_attendance_events(branch_id);
alter table public.raw_attendance_events add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.raw_attendance_events(employee_id);
alter table public.attendance_summaries add foreign key(company_id,shift_id) references public.work_shifts(company_id,id);
create index on public.attendance_summaries(shift_id);
alter table public.attendance_summaries add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.attendance_summaries(branch_id);
alter table public.attendance_summaries add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.attendance_summaries(employee_id);
alter table public.attendance_corrections add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.attendance_corrections(branch_id);
alter table public.attendance_corrections add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.attendance_corrections(employee_id);
alter table public.attendance_sync_logs add foreign key(company_id,device_id) references public.attendance_devices(company_id,id);
create index on public.attendance_sync_logs(device_id);
alter table public.attendance_sync_logs add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.attendance_sync_logs(branch_id);
alter table public.work_shifts add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.work_shifts(branch_id);
alter table public.shift_assignments add foreign key(company_id,shift_id) references public.work_shifts(company_id,id);
create index on public.shift_assignments(shift_id);
alter table public.shift_assignments add foreign key(company_id,department_id) references public.departments(company_id,id);
create index on public.shift_assignments(department_id);
alter table public.shift_assignments add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.shift_assignments(branch_id);
alter table public.shift_assignments add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.shift_assignments(employee_id);
alter table public.leave_types add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.leave_types(branch_id);
alter table public.leave_policies add foreign key(company_id,leave_type_id) references public.leave_types(company_id,id);
create index on public.leave_policies(leave_type_id);
alter table public.leave_policies add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.leave_policies(branch_id);
alter table public.leave_policies add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.leave_policies(employee_id);
alter table public.leave_requests add foreign key(company_id,leave_type_id) references public.leave_types(company_id,id);
create index on public.leave_requests(leave_type_id);
alter table public.leave_requests add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.leave_requests(branch_id);
alter table public.leave_requests add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.leave_requests(employee_id);
alter table public.overtime_records add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.overtime_records(branch_id);
alter table public.overtime_records add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.overtime_records(employee_id);
alter table public.employee_incidents add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.employee_incidents(branch_id);
alter table public.employee_incidents add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.employee_incidents(employee_id);
alter table public.damage_recovery_plans add foreign key(company_id,incident_id) references public.employee_incidents(company_id,id);
create index on public.damage_recovery_plans(incident_id);
alter table public.damage_recovery_plans add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.damage_recovery_plans(branch_id);
alter table public.damage_recovery_plans add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.damage_recovery_plans(employee_id);
alter table public.damage_recovery_installments add foreign key(company_id,plan_id) references public.damage_recovery_plans(company_id,id);
create index on public.damage_recovery_installments(plan_id);
alter table public.damage_recovery_installments add foreign key(company_id,payroll_item_id) references public.payroll_items(company_id,id);
create index on public.damage_recovery_installments(payroll_item_id);
alter table public.damage_recovery_installments add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.damage_recovery_installments(branch_id);
alter table public.damage_recovery_installments add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.damage_recovery_installments(employee_id);
alter table public.salary_advances add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.salary_advances(branch_id);
alter table public.salary_advances add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.salary_advances(employee_id);
alter table public.advance_repayments add foreign key(company_id,advance_id) references public.salary_advances(company_id,id);
create index on public.advance_repayments(advance_id);
alter table public.advance_repayments add foreign key(company_id,payroll_item_id) references public.payroll_items(company_id,id);
create index on public.advance_repayments(payroll_item_id);
alter table public.advance_repayments add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.advance_repayments(branch_id);
alter table public.advance_repayments add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.advance_repayments(employee_id);
alter table public.payroll_periods add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.payroll_periods(branch_id);
alter table public.payroll_runs add foreign key(company_id,period_id) references public.payroll_periods(company_id,id);
create index on public.payroll_runs(period_id);
alter table public.payroll_runs add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.payroll_runs(branch_id);
alter table public.payroll_items add foreign key(company_id,run_id) references public.payroll_runs(company_id,id);
create index on public.payroll_items(run_id);
alter table public.payroll_items add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.payroll_items(branch_id);
alter table public.payroll_items add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.payroll_items(employee_id);
alter table public.payroll_approvals add foreign key(company_id,run_id) references public.payroll_runs(company_id,id);
create index on public.payroll_approvals(run_id);
alter table public.payroll_approvals add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.payroll_approvals(branch_id);
alter table public.salary_payments add foreign key(company_id,reversal_of) references public.salary_payments(company_id,id);
create index on public.salary_payments(reversal_of);
alter table public.salary_payments add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.salary_payments(branch_id);
alter table public.salary_payments add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.salary_payments(employee_id);
alter table public.payment_allocations add foreign key(company_id,payment_id) references public.salary_payments(company_id,id);
create index on public.payment_allocations(payment_id);
alter table public.payment_allocations add foreign key(company_id,payroll_item_id) references public.payroll_items(company_id,id);
create index on public.payment_allocations(payroll_item_id);
alter table public.payment_allocations add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.payment_allocations(branch_id);
alter table public.payment_allocations add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.payment_allocations(employee_id);
alter table public.employee_performance_reviews add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.employee_performance_reviews(branch_id);
alter table public.employee_performance_reviews add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.employee_performance_reviews(employee_id);
alter table public.notifications add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.notifications(branch_id);
alter table public.application_settings add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.application_settings(branch_id);
alter table public.holidays add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.holidays(branch_id);
alter table public.authorized_deductions add foreign key(company_id,period_id) references public.payroll_periods(company_id,id);
create index on public.authorized_deductions(period_id);
alter table public.authorized_deductions add foreign key(company_id,branch_id) references public.branches(company_id,id);
create index on public.authorized_deductions(branch_id);
alter table public.authorized_deductions add foreign key(company_id,employee_id) references public.employees(company_id,id);
create index on public.authorized_deductions(employee_id);
alter table public.company_memberships add foreign key(company_id,branch_id) references public.branches(company_id,id);
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
alter table public.branches enable row level security;
create policy read_records on public.branches for select to authenticated using(public.can_access(company_id,null,null,'settings',false));
create policy insert_records on public.branches for insert to authenticated with check(public.can_access(company_id,null,null,'settings',true));
create policy update_records on public.branches for update to authenticated using(public.can_access(company_id,null,null,'settings',true)) with check(public.can_access(company_id,null,null,'settings',true));
create policy delete_records on public.branches for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.branches for each row execute function public.audit_change();
alter table public.departments enable row level security;
create policy read_records on public.departments for select to authenticated using(public.can_access(company_id,branch_id,null,'settings',false));
create policy insert_records on public.departments for insert to authenticated with check(public.can_access(company_id,branch_id,null,'settings',true));
create policy update_records on public.departments for update to authenticated using(public.can_access(company_id,branch_id,null,'settings',true)) with check(public.can_access(company_id,branch_id,null,'settings',true));
create policy delete_records on public.departments for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.departments for each row execute function public.audit_change();
alter table public.positions enable row level security;
create policy read_records on public.positions for select to authenticated using(public.can_access(company_id,branch_id,null,'settings',false));
create policy insert_records on public.positions for insert to authenticated with check(public.can_access(company_id,branch_id,null,'settings',true));
create policy update_records on public.positions for update to authenticated using(public.can_access(company_id,branch_id,null,'settings',true)) with check(public.can_access(company_id,branch_id,null,'settings',true));
create policy delete_records on public.positions for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.positions for each row execute function public.audit_change();
alter table public.employees enable row level security;
create policy read_records on public.employees for select to authenticated using(public.can_access(company_id,branch_id,id,'hr',false));
create policy insert_records on public.employees for insert to authenticated with check(public.can_access(company_id,branch_id,id,'hr',true));
create policy update_records on public.employees for update to authenticated using(public.can_access(company_id,branch_id,id,'hr',true)) with check(public.can_access(company_id,branch_id,id,'hr',true));
create policy delete_records on public.employees for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.employees for each row execute function public.audit_change();
alter table public.employee_contacts enable row level security;
create policy read_records on public.employee_contacts for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',false));
create policy insert_records on public.employee_contacts for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy update_records on public.employee_contacts for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',true)) with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy delete_records on public.employee_contacts for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.employee_contacts for each row execute function public.audit_change();
alter table public.employee_guarantors enable row level security;
create policy read_records on public.employee_guarantors for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',false));
create policy insert_records on public.employee_guarantors for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy update_records on public.employee_guarantors for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',true)) with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy delete_records on public.employee_guarantors for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.employee_guarantors for each row execute function public.audit_change();
alter table public.employee_documents enable row level security;
create policy read_records on public.employee_documents for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',false));
create policy insert_records on public.employee_documents for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy update_records on public.employee_documents for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',true)) with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy delete_records on public.employee_documents for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.employee_documents for each row execute function public.audit_change();
alter table public.employment_contracts enable row level security;
create policy read_records on public.employment_contracts for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',false));
create policy insert_records on public.employment_contracts for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy update_records on public.employment_contracts for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',true)) with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy delete_records on public.employment_contracts for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.employment_contracts for each row execute function public.audit_change();
alter table public.salary_structures enable row level security;
create policy read_records on public.salary_structures for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',false));
create policy insert_records on public.salary_structures for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'finance',true));
create policy update_records on public.salary_structures for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',true)) with check(public.can_access(company_id,branch_id,employee_id,'finance',true));
create trigger audit_record after insert or update or delete on public.salary_structures for each row execute function public.audit_change();
alter table public.salary_history enable row level security;
create policy read_records on public.salary_history for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',false));
create policy insert_records on public.salary_history for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'finance',true));
create policy update_records on public.salary_history for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',true)) with check(public.can_access(company_id,branch_id,employee_id,'finance',true));
create trigger audit_record after insert or update or delete on public.salary_history for each row execute function public.audit_change();
alter table public.attendance_devices enable row level security;
create policy read_records on public.attendance_devices for select to authenticated using(public.can_access(company_id,branch_id,null,'attendance',false));
create policy insert_records on public.attendance_devices for insert to authenticated with check(public.can_access(company_id,branch_id,null,'attendance',true));
create policy update_records on public.attendance_devices for update to authenticated using(public.can_access(company_id,branch_id,null,'attendance',true)) with check(public.can_access(company_id,branch_id,null,'attendance',true));
create policy delete_records on public.attendance_devices for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.attendance_devices for each row execute function public.audit_change();
alter table public.device_employee_mappings enable row level security;
create policy read_records on public.device_employee_mappings for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',false));
create policy insert_records on public.device_employee_mappings for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy update_records on public.device_employee_mappings for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',true)) with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy delete_records on public.device_employee_mappings for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.device_employee_mappings for each row execute function public.audit_change();
alter table public.raw_attendance_events enable row level security;
create policy read_records on public.raw_attendance_events for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',false));
create trigger audit_record after insert or update or delete on public.raw_attendance_events for each row execute function public.audit_change();
alter table public.attendance_summaries enable row level security;
create policy read_records on public.attendance_summaries for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',false));
create trigger audit_record after insert or update or delete on public.attendance_summaries for each row execute function public.audit_change();
alter table public.attendance_corrections enable row level security;
create policy read_records on public.attendance_corrections for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',false));
create policy insert_records on public.attendance_corrections for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy update_records on public.attendance_corrections for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',true)) with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy delete_records on public.attendance_corrections for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.attendance_corrections for each row execute function public.audit_change();
alter table public.attendance_sync_logs enable row level security;
create policy read_records on public.attendance_sync_logs for select to authenticated using(public.can_access(company_id,branch_id,null,'attendance',false));
create trigger audit_record after insert or update or delete on public.attendance_sync_logs for each row execute function public.audit_change();
alter table public.work_shifts enable row level security;
create policy read_records on public.work_shifts for select to authenticated using(public.can_access(company_id,branch_id,null,'attendance',false));
create policy insert_records on public.work_shifts for insert to authenticated with check(public.can_access(company_id,branch_id,null,'attendance',true));
create policy update_records on public.work_shifts for update to authenticated using(public.can_access(company_id,branch_id,null,'attendance',true)) with check(public.can_access(company_id,branch_id,null,'attendance',true));
create policy delete_records on public.work_shifts for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.work_shifts for each row execute function public.audit_change();
alter table public.shift_assignments enable row level security;
create policy read_records on public.shift_assignments for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',false));
create policy insert_records on public.shift_assignments for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy update_records on public.shift_assignments for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',true)) with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy delete_records on public.shift_assignments for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.shift_assignments for each row execute function public.audit_change();
alter table public.leave_types enable row level security;
create policy read_records on public.leave_types for select to authenticated using(public.can_access(company_id,branch_id,null,'attendance',false));
create policy insert_records on public.leave_types for insert to authenticated with check(public.can_access(company_id,branch_id,null,'attendance',true));
create policy update_records on public.leave_types for update to authenticated using(public.can_access(company_id,branch_id,null,'attendance',true)) with check(public.can_access(company_id,branch_id,null,'attendance',true));
create policy delete_records on public.leave_types for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.leave_types for each row execute function public.audit_change();
alter table public.leave_policies enable row level security;
create policy read_records on public.leave_policies for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',false));
create policy insert_records on public.leave_policies for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy update_records on public.leave_policies for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',true)) with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy delete_records on public.leave_policies for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.leave_policies for each row execute function public.audit_change();
alter table public.leave_requests enable row level security;
create policy read_records on public.leave_requests for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',false));
create policy insert_records on public.leave_requests for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy update_records on public.leave_requests for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',true)) with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy delete_records on public.leave_requests for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.leave_requests for each row execute function public.audit_change();
alter table public.overtime_records enable row level security;
create policy read_records on public.overtime_records for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',false));
create policy insert_records on public.overtime_records for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy update_records on public.overtime_records for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'attendance',true)) with check(public.can_access(company_id,branch_id,employee_id,'attendance',true));
create policy delete_records on public.overtime_records for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.overtime_records for each row execute function public.audit_change();
alter table public.employee_incidents enable row level security;
create policy read_records on public.employee_incidents for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',false));
create policy insert_records on public.employee_incidents for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy update_records on public.employee_incidents for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',true)) with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy delete_records on public.employee_incidents for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.employee_incidents for each row execute function public.audit_change();
alter table public.damage_recovery_plans enable row level security;
create policy read_records on public.damage_recovery_plans for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',false));
create policy insert_records on public.damage_recovery_plans for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'finance',true));
create policy update_records on public.damage_recovery_plans for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',true)) with check(public.can_access(company_id,branch_id,employee_id,'finance',true));
create trigger audit_record after insert or update or delete on public.damage_recovery_plans for each row execute function public.audit_change();
alter table public.damage_recovery_installments enable row level security;
create policy read_records on public.damage_recovery_installments for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',false));
create trigger audit_record after insert or update or delete on public.damage_recovery_installments for each row execute function public.audit_change();
alter table public.salary_advances enable row level security;
create policy read_records on public.salary_advances for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',false));
create policy insert_records on public.salary_advances for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'finance',true));
create policy update_records on public.salary_advances for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',true)) with check(public.can_access(company_id,branch_id,employee_id,'finance',true));
create trigger audit_record after insert or update or delete on public.salary_advances for each row execute function public.audit_change();
alter table public.advance_repayments enable row level security;
create policy read_records on public.advance_repayments for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',false));
create trigger audit_record after insert or update or delete on public.advance_repayments for each row execute function public.audit_change();
alter table public.payroll_periods enable row level security;
create policy read_records on public.payroll_periods for select to authenticated using(public.can_access(company_id,branch_id,null,'finance',false));
create policy insert_records on public.payroll_periods for insert to authenticated with check(public.can_access(company_id,branch_id,null,'finance',true));
create policy update_records on public.payroll_periods for update to authenticated using(public.can_access(company_id,branch_id,null,'finance',true)) with check(public.can_access(company_id,branch_id,null,'finance',true));
create trigger audit_record after insert or update or delete on public.payroll_periods for each row execute function public.audit_change();
alter table public.payroll_runs enable row level security;
create policy read_records on public.payroll_runs for select to authenticated using(public.can_access(company_id,branch_id,null,'finance',false));
create trigger audit_record after insert or update or delete on public.payroll_runs for each row execute function public.audit_change();
alter table public.payroll_items enable row level security;
create policy read_records on public.payroll_items for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',false));
create trigger audit_record after insert or update or delete on public.payroll_items for each row execute function public.audit_change();
alter table public.payroll_approvals enable row level security;
create policy read_records on public.payroll_approvals for select to authenticated using(public.can_access(company_id,branch_id,null,'finance',false));
create trigger audit_record after insert or update or delete on public.payroll_approvals for each row execute function public.audit_change();
alter table public.salary_payments enable row level security;
create policy read_records on public.salary_payments for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',false));
create trigger audit_record after insert or update or delete on public.salary_payments for each row execute function public.audit_change();
alter table public.payment_allocations enable row level security;
create policy read_records on public.payment_allocations for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',false));
create trigger audit_record after insert or update or delete on public.payment_allocations for each row execute function public.audit_change();
alter table public.employee_performance_reviews enable row level security;
create policy read_records on public.employee_performance_reviews for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',false));
create policy insert_records on public.employee_performance_reviews for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy update_records on public.employee_performance_reviews for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'private',true)) with check(public.can_access(company_id,branch_id,employee_id,'private',true));
create policy delete_records on public.employee_performance_reviews for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.employee_performance_reviews for each row execute function public.audit_change();
alter table public.notifications enable row level security;
create policy read_records on public.notifications for select to authenticated using(public.can_access(company_id,branch_id,null,'hr',false));
create policy insert_records on public.notifications for insert to authenticated with check(public.can_access(company_id,branch_id,null,'hr',true));
create policy update_records on public.notifications for update to authenticated using(public.can_access(company_id,branch_id,null,'hr',true)) with check(public.can_access(company_id,branch_id,null,'hr',true));
create policy delete_records on public.notifications for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.notifications for each row execute function public.audit_change();
alter table public.application_settings enable row level security;
create policy read_records on public.application_settings for select to authenticated using(public.can_access(company_id,branch_id,null,'settings',false));
create policy insert_records on public.application_settings for insert to authenticated with check(public.can_access(company_id,branch_id,null,'settings',true));
create policy update_records on public.application_settings for update to authenticated using(public.can_access(company_id,branch_id,null,'settings',true)) with check(public.can_access(company_id,branch_id,null,'settings',true));
create policy delete_records on public.application_settings for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.application_settings for each row execute function public.audit_change();
alter table public.holidays enable row level security;
create policy read_records on public.holidays for select to authenticated using(public.can_access(company_id,branch_id,null,'attendance',false));
create policy insert_records on public.holidays for insert to authenticated with check(public.can_access(company_id,branch_id,null,'attendance',true));
create policy update_records on public.holidays for update to authenticated using(public.can_access(company_id,branch_id,null,'attendance',true)) with check(public.can_access(company_id,branch_id,null,'attendance',true));
create policy delete_records on public.holidays for delete to authenticated using(public.has_role(company_id,array['super_admin','company_admin','hr_manager']));
create trigger audit_record after insert or update or delete on public.holidays for each row execute function public.audit_change();
alter table public.authorized_deductions enable row level security;
create policy read_records on public.authorized_deductions for select to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',false));
create policy insert_records on public.authorized_deductions for insert to authenticated with check(public.can_access(company_id,branch_id,employee_id,'finance',true));
create policy update_records on public.authorized_deductions for update to authenticated using(public.can_access(company_id,branch_id,employee_id,'finance',true)) with check(public.can_access(company_id,branch_id,employee_id,'finance',true));
create trigger audit_record after insert or update or delete on public.authorized_deductions for each row execute function public.audit_change();
-- Private bucket. Paths: company UUID / employee UUID / random UUID.ext.
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


-- END MIGRATION: 202610180001_foundation.sql


-- BEGIN MIGRATION: 202610180002_workflows.sql

-- Transactional workflows. All SECURITY DEFINER functions pin search_path and verify identity.
create function public.payroll_round(value numeric, mode text) returns numeric language sql immutable set search_path=public as $$
 select case when mode='down' then trunc(value,2) when mode='up' then ceil(value*100)/100 when mode='half_even' and abs(value*100-trunc(value*100))=0.5 and mod(trunc(value*100),2)=0 then trunc(value,2) else round(value,2) end; $$;
create function public.apply_payroll_policy() returns trigger language plpgsql security definer set search_path=public as $$
declare policy jsonb;
begin
 select value into policy from application_settings where company_id=new.company_id and key='payroll_policy';
 new.daily_hours:=coalesce((policy->>'daily_hours')::numeric,new.daily_hours);
 new.rounding_mode:=coalesce(policy->>'rounding_mode',new.rounding_mode);
 return new;
end; $$;
create trigger apply_payroll_policy before insert on payroll_periods for each row execute function apply_payroll_policy();

create function public.create_company(p_name text, p_currency text default 'USD', p_timezone text default 'Africa/Nairobi') returns uuid language plpgsql security definer set search_path=public as $$
declare c uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(p_name))<2 or p_currency !~ '^[A-Z]{3}$' or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid company'; end if;
 insert into companies(name,currency,timezone) values(trim(p_name),p_currency,p_timezone) returning id into c;
 insert into company_memberships(company_id,user_id,role) values(c,auth.uid(),'company_admin');
 return c;
end; $$;

create function public.set_membership(p_company uuid,p_user uuid,p_role text,p_branch uuid default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if not has_role(p_company,array['super_admin','company_admin']) then raise exception 'Forbidden'; end if;
 if p_user=auth.uid() then raise exception 'Cannot change your own membership'; end if;
 insert into company_memberships(company_id,user_id,role,branch_id) values(p_company,p_user,p_role,p_branch)
 on conflict(company_id,user_id) do update set role=excluded.role,branch_id=excluded.branch_id;
 insert into audit_logs(company_id,actor_id,action,table_name,record_id) values(p_company,auth.uid(),'membership_changed','company_memberships',p_user);
end; $$;

-- Employee association must agree with its employee's branch. Prevents branch-scope spoofing.
create function public.enforce_employee_scope() returns trigger language plpgsql security definer set search_path=public as $$
declare b uuid;
begin
 if new.employee_id is not null then
 select branch_id into b from employees where id=new.employee_id and company_id=new.company_id;
 if not found then raise exception 'Employee does not belong to company'; end if;
 new.branch_id:=b;
 end if;
 return new;
end; $$;
do $$ declare t text; begin
 foreach t in array array['employee_contacts','employee_guarantors','employee_documents','employment_contracts','salary_structures','salary_history','device_employee_mappings','raw_attendance_events','attendance_summaries','attendance_corrections','shift_assignments','leave_policies','leave_requests','overtime_records','employee_incidents','damage_recovery_plans','damage_recovery_installments','salary_advances','advance_repayments','payroll_items','salary_payments','payment_allocations','employee_performance_reviews','authorized_deductions'] loop
 execute format('create trigger enforce_scope before insert or update on public.%I for each row execute function public.enforce_employee_scope()',t);
 end loop;
end $$;

create function public.validate_leave() returns trigger language plpgsql set search_path=public as $$
declare entitlement numeric; used numeric; paid boolean;
begin
 -- Serialize concurrent leave requests on this employee.
 perform 1 from employees where id=new.employee_id for update;
 select annual_entitlement,leave_types.paid into entitlement,paid from leave_types where id=new.leave_type_id and company_id=new.company_id;
 select lp.annual_entitlement into entitlement from leave_policies lp where lp.employee_id=new.employee_id and lp.leave_type_id=new.leave_type_id and lp.effective_from<=new.start_date order by lp.effective_from desc limit 1;
 if entitlement is null then select annual_entitlement into entitlement from leave_types where id=new.leave_type_id; end if;
 if new.total_days>(new.end_date-new.start_date+1) then raise exception 'Leave days exceed date range'; end if;
 if new.status in ('pending','approved') and entitlement>0 then
 select coalesce(sum(total_days),0) into used from leave_requests where employee_id=new.employee_id and leave_type_id=new.leave_type_id and id<>new.id and status in ('pending','approved') and date_part('year',start_date)=date_part('year',new.start_date);
 if used+new.total_days>entitlement then raise exception 'Leave entitlement exceeded'; end if;
 end if;
 if new.status='approved' then new.approved_by:=auth.uid(); end if;
 return new;
end; $$;
create trigger validate_leave before insert or update on public.leave_requests for each row execute function public.validate_leave();

create function public.request_leave(p_company uuid,p_employee uuid,p_type uuid,p_start date,p_end date,p_days numeric,p_reason text,p_description text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare e employees; r uuid;
begin
 select * into e from employees where company_id=p_company and id=p_employee;
 if not found or not (coalesce(e.user_id=auth.uid(),false) or can_access(p_company,e.branch_id,e.id,'attendance',true)) then raise exception 'Forbidden'; end if;
 insert into leave_requests(company_id,branch_id,employee_id,leave_type_id,start_date,end_date,total_days,reason,description) values(p_company,e.branch_id,e.id,p_type,p_start,p_end,p_days,p_reason,p_description) returning id into r;
 return r;
end; $$;

create function public.review_correction(p_id uuid,p_approve boolean,p_notes text) returns void language plpgsql security definer set search_path=public as $$
declare c attendance_corrections; mins integer;
begin
 select * into c from attendance_corrections where id=p_id for update;
 if c.id is null or not can_access(c.company_id,c.branch_id,c.employee_id,'attendance',true) or c.requested_by=auth.uid() then raise exception 'Independent reviewer required'; end if;
 if c.status<>'pending' then raise exception 'Already reviewed'; end if;
 if p_approve then
 if c.check_in is null or c.check_out is null or c.check_out<=c.check_in then raise exception 'A valid punch pair is required'; end if;
 mins:=floor(extract(epoch from c.check_out-c.check_in)/60);
 insert into attendance_summaries(company_id,employee_id,work_date,first_in,last_out,worked_minutes,status,reviewed) values(c.company_id,c.employee_id,c.work_date,c.check_in,c.check_out,mins,'present',true)
 on conflict(employee_id,work_date) do update set first_in=c.check_in,last_out=c.check_out,worked_minutes=mins,status='present',reviewed=true;
 end if;
 update attendance_corrections set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),review_notes=p_notes where id=p_id;
end; $$;

create function public.schedule_recovery(p_kind text,p_parent uuid,p_dates date[],p_amounts numeric[]) returns void language plpgsql security definer set search_path=public as $$
declare c uuid; e uuid; cap numeric; existing numeric; i integer;
begin
 if cardinality(p_dates) is distinct from cardinality(p_amounts) or cardinality(p_dates) not between 1 and 120 then raise exception 'Invalid schedule'; end if;
 if p_kind='advance' then
 select company_id,employee_id,approved_amount into c,e,cap from salary_advances where id=p_parent and status='disbursed' for update;
 select coalesce(sum(amount),0) into existing from advance_repayments where advance_id=p_parent;
 elsif p_kind='damage' then
 select company_id,employee_id,approved_amount into c,e,cap from damage_recovery_plans where id=p_parent and status='approved' for update;
 select coalesce(sum(amount),0) into existing from damage_recovery_installments where plan_id=p_parent;
 else raise exception 'Unknown schedule'; end if;
 if c is null or not can_access(c,null,e,'finance',true) then raise exception 'Forbidden'; end if;
 if existing+(select sum(x) from unnest(p_amounts) x)>cap then raise exception 'Schedule exceeds recoverable balance'; end if;
 for i in 1..cardinality(p_dates) loop
 if p_kind='advance' then insert into advance_repayments(company_id,employee_id,advance_id,due_date,amount) values(c,e,p_parent,p_dates[i],p_amounts[i]);
 else insert into damage_recovery_installments(company_id,employee_id,plan_id,due_date,amount) values(c,e,p_parent,p_dates[i],p_amounts[i]); end if;
 end loop;
end; $$;

create function public.generate_payroll(p_period uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare p payroll_periods; r uuid; e employees; base numeric; unpaid numeric; ot numeric; ad numeric; dm numeric; late numeric; other numeric; bonus numeric; allowance numeric; gross numeric; deduct numeric; item uuid; uncertain integer; days_expected integer; days_seen integer; d date; hired date; ended date;
begin
 select * into p from payroll_periods where id=p_period for update;
 if p.id is null or not can_access(p.company_id,null,null,'finance',true) then raise exception 'Forbidden'; end if;
 insert into payroll_runs(company_id,period_id) values(p.company_id,p.id) returning id into r;
 for e in select * from employees where company_id=p.company_id and currency=p.currency and start_date<=p.end_date and (end_date is null or end_date>=p.start_date) order by id for update loop
 perform id from salary_advances where employee_id=e.id order by id for update;
 perform id from damage_recovery_plans where employee_id=e.id order by id for update;
 hired:=greatest(e.start_date,p.start_date); ended:=least(coalesce(e.end_date,p.end_date),p.end_date);
 select count(*),count(*) filter(where status in ('uncertain','missing_in','missing_out') or (status='absent' and not reviewed)) into days_seen,uncertain from attendance_summaries where employee_id=e.id and work_date between hired and ended;
 -- Every calendar date needs a reviewed/processed summary, including rest days and holidays.
 days_expected:=ended-hired+1;
 if uncertain>0 or days_seen<days_expected then raise exception 'Attendance unresolved for employee %',e.employee_number; end if;
 select count(*) into unpaid from attendance_summaries where employee_id=e.id and work_date between hired and ended and (status='absent' or (status='leave' and not paid_leave));
 -- Prorate employment for partial periods, then subtract unpaid days once.
 base:=payroll_round(e.basic_salary*(ended-hired+1)/(p.end_date-p.start_date+1),p.rounding_mode);
 unpaid:=least(base,payroll_round(e.basic_salary/p.divisor*unpaid,p.rounding_mode)); base:=base-unpaid;
 select coalesce(payroll_round(sum(hours*multiplier*e.basic_salary/p.divisor/p.daily_hours),p.rounding_mode),0) into ot from overtime_records where employee_id=e.id and work_date between p.start_date and p.end_date and status='approved';
 select coalesce(sum(amount) filter(where category='late'),0),coalesce(sum(amount) filter(where category='other'),0) into late,other from authorized_deductions where employee_id=e.id and period_id=p.id;
 select coalesce(sum(a.amount),0) into ad from advance_repayments a join salary_advances s on s.id=a.advance_id where a.employee_id=e.id and a.due_date<=p.end_date and a.payroll_item_id is null and s.status='disbursed';
 select coalesce(sum(a.amount),0) into dm from damage_recovery_installments a join damage_recovery_plans s on s.id=a.plan_id where a.employee_id=e.id and a.due_date<=p.end_date and a.payroll_item_id is null and s.status='approved';
 select s.bonuses,s.allowances into bonus,allowance from salary_structures s where s.employee_id=e.id and effective_from<=p.end_date and (effective_to is null or effective_to>=p.end_date) order by effective_from desc limit 1;
 bonus:=coalesce(bonus,0); allowance:=coalesce(allowance,0); gross:=base+ot+bonus+allowance; deduct:=late+other+ad+dm;
 if deduct>gross then raise exception 'Deductions exceed earnings for %',e.employee_number; end if;
 insert into payroll_items(company_id,employee_id,run_id,basic_salary,basic_earnings,unpaid_absence,overtime,bonuses,allowances,late_deductions,damage_recovery,advance_recovery,other_deductions,gross,deductions,net)
 values(p.company_id,e.id,r,e.basic_salary,base,unpaid,ot,bonus,allowance,late,dm,ad,other,gross,deduct,gross-deduct) returning id into item;
 update advance_repayments set payroll_item_id=item where employee_id=e.id and due_date<=p.end_date and payroll_item_id is null and advance_id in(select id from salary_advances where status='disbursed');
 update damage_recovery_installments set payroll_item_id=item where employee_id=e.id and due_date<=p.end_date and payroll_item_id is null and plan_id in(select id from damage_recovery_plans where status='approved');
 end loop;
 if not exists(select 1 from payroll_items where run_id=r) then raise exception 'No eligible employees'; end if;
 return r;
end; $$;

create function public.transition_payroll(p_run uuid,p_status text,p_notes text default null) returns void language plpgsql security definer set search_path=public as $$
declare r payroll_runs;
begin
 select * into r from payroll_runs where id=p_run for update;
 if r.id is null then raise exception 'Unknown payroll'; end if;
 if p_status='verified' and r.status='draft' and has_role(r.company_id,array['super_admin','company_admin','accountant']) then null;
 elsif p_status='approved' and r.status='verified' and has_role(r.company_id,array['super_admin','company_admin']) and r.generated_by<>auth.uid() then null;
 elsif p_status='locked' and r.status='paid' and has_role(r.company_id,array['super_admin','company_admin']) then null;
 else raise exception 'Invalid transition or independent approver required'; end if;
 insert into payroll_approvals(company_id,run_id,stage,notes) values(r.company_id,r.id,p_status,p_notes);
 update payroll_runs set status=p_status,approved_by=case when p_status='approved' then auth.uid() else approved_by end where id=r.id;
end; $$;

create function public.record_payment(p_item uuid,p_amount numeric,p_reference text,p_method text) returns uuid language plpgsql security definer set search_path=public as $$
declare i payroll_items; r payroll_runs; p uuid; paid numeric; curr text;
begin
 select * into i from payroll_items where id=p_item;
 select * into r from payroll_runs where id=i.run_id for update;
 if i.id is null or not can_access(i.company_id,i.branch_id,i.employee_id,'finance',true) then raise exception 'Forbidden'; end if;
 if r.status not in ('approved','partially_paid') or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Invalid payment or payroll state'; end if;
 select coalesce(sum(a.amount),0) into paid from payment_allocations a join salary_payments s on s.id=a.payment_id where a.payroll_item_id=i.id and s.reversal_of is null and not exists(select 1 from salary_payments z where z.reversal_of=s.id);
 if paid+p_amount>i.net then raise exception 'Payment exceeds payable'; end if;
 select currency into curr from payroll_periods where id=r.period_id;
 insert into salary_payments(company_id,employee_id,amount,currency,reference,method) values(i.company_id,i.employee_id,p_amount,curr,p_reference,p_method) returning id into p;
 insert into payment_allocations(company_id,employee_id,payment_id,payroll_item_id,amount) values(i.company_id,i.employee_id,p,i.id,p_amount);
 update payroll_runs set status=case when not exists(select 1 from payroll_items x where x.run_id=r.id and x.net>(select coalesce(sum(a.amount),0) from payment_allocations a join salary_payments s on s.id=a.payment_id where a.payroll_item_id=x.id and s.reversal_of is null and not exists(select 1 from salary_payments z where z.reversal_of=s.id))) then 'paid' else 'partially_paid' end where id=r.id;
 return p;
end; $$;

create function public.reverse_payment(p_payment uuid,p_reference text) returns uuid language plpgsql security definer set search_path=public as $$
declare s salary_payments; r payroll_runs; result uuid;
begin
 select * into s from salary_payments where id=p_payment;
 select pr.* into r from payroll_runs pr join payroll_items i on i.run_id=pr.id join payment_allocations a on a.payroll_item_id=i.id where a.payment_id=s.id for update of pr;
 if s.id is null or not has_role(s.company_id,array['super_admin','company_admin','accountant']) or s.reversal_of is not null or r.status='locked' then raise exception 'Forbidden or locked payroll'; end if;
 insert into salary_payments(company_id,employee_id,amount,currency,reference,method,reversal_of) values(s.company_id,s.employee_id,s.amount,s.currency,p_reference,'reversal',s.id) returning id into result;
 update payroll_runs set status='partially_paid' where id=r.id;
 return result;
end; $$;

-- Protect finalized source authorizations and schedule ownership even through the REST API.
create function public.protect_financial_source() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_TABLE_NAME='salary_advances' then
 if old.status in ('disbursed','closed') then raise exception 'Disbursed advance is immutable'; end if;
 if new.status='disbursed' and (new.approved_amount is null or new.disbursed_at is null or new.disbursement_reference is null or new.authorization_reference is null) then raise exception 'Disbursement evidence required'; end if;
 elsif TG_TABLE_NAME='damage_recovery_plans' and old.status='approved' then raise exception 'Approved recovery is immutable';
 end if;
 return new;
end; $$;
create trigger protect_advance before update on salary_advances for each row execute function protect_financial_source();
create trigger protect_damage before update on damage_recovery_plans for each row execute function protect_financial_source();

-- Explicitly remove PostgreSQL's default PUBLIC function execution.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_company','set_membership','request_leave','review_correction','schedule_recovery','generate_payroll','transition_payroll','record_payment','reverse_payment') loop
 execute format('revoke all on function %s from public',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;


-- END MIGRATION: 202610180002_workflows.sql


-- BEGIN MIGRATION: 202610180003_attendance.sql

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


-- END MIGRATION: 202610180003_attendance.sql


-- BEGIN MIGRATION: 202610180004_hardening.sql

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


-- END MIGRATION: 202610180004_hardening.sql


-- BEGIN MIGRATION: 202610180005_integrity.sql

-- Freeze source periods once payroll is generated.
create function public.freeze_period() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from payroll_runs where period_id=old.id) then raise exception 'Period already has payroll'; end if;
 return new;
end; $$;
create trigger freeze_period before update on payroll_periods for each row execute function freeze_period();

create function public.validate_recovery_source() returns trigger language plpgsql set search_path=public as $$
declare loss numeric;
begin
 if TG_TABLE_NAME='damage_recovery_plans' then
 select verified_loss into loss from employee_incidents where company_id=new.company_id and id=new.incident_id and employee_id=new.employee_id and status='approved';
 if new.status='approved' and (loss is null or new.approved_amount>loss) then raise exception 'Approved recovery exceeds approved incident loss or employee mismatch'; end if;
 elsif TG_TABLE_NAME='salary_advances' then
 if new.approved_amount>new.requested_amount then raise exception 'Advance approval exceeds request'; end if;
 if new.status='disbursed' and (new.approved_amount is null or new.disbursed_at is null or nullif(trim(new.disbursement_reference),'') is null or nullif(trim(new.authorization_reference),'') is null) then raise exception 'Disbursement evidence required'; end if;
 end if;
 return new;
end; $$;
create trigger validate_damage_source before insert or update on damage_recovery_plans for each row execute function validate_recovery_source();
create trigger validate_advance_source before insert or update on salary_advances for each row execute function validate_recovery_source();

create function public.record_salary_history() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' or new.basic_salary is distinct from old.basic_salary or new.currency is distinct from old.currency then
 insert into salary_history(company_id,employee_id,amount,currency,effective_from,reason) values(new.company_id,new.id,new.basic_salary,new.currency,current_date,case when TG_OP='INSERT' then 'Initial salary' else 'Employee salary updated' end);
 end if;
 return new;
end; $$;
create trigger record_salary_history after insert or update on employees for each row execute function record_salary_history();

create function public.guard_correction() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' then
 new.requested_by:=auth.uid();new.reviewed_by:=null;
 if new.status<>'pending' then raise exception 'Corrections must start pending'; end if;
 elsif new.status='approved' and exists(select 1 from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=new.employee_id and new.work_date between p.start_date and p.end_date) then raise exception 'Correction affects generated payroll; use an adjustment in a subsequent period';
 end if;
 return new;
end; $$;
create trigger guard_correction before insert or update on attendance_corrections for each row execute function guard_correction();
-- Approved correction must check before its summary update, so guard the summaries too.
create function public.freeze_payroll_attendance() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=new.employee_id and new.work_date between p.start_date and p.end_date) then raise exception 'Attendance belongs to generated payroll'; end if;
 return new;
end; $$;
create trigger freeze_payroll_attendance before update on attendance_summaries for each row execute function freeze_payroll_attendance();

-- Self-service users need company leave definitions, without broader staff privileges.
create policy member_leave_types on leave_types for select to authenticated using(has_role(company_id,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']));
create policy member_branches on branches for select to authenticated using(has_role(company_id,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']));
create policy member_departments on departments for select to authenticated using(has_role(company_id,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']));
create policy member_positions on positions for select to authenticated using(has_role(company_id,array['super_admin','company_admin','hr_manager','branch_manager','accountant','supervisor','employee']));

create function public.backfill_device_mappings(p_device uuid) returns integer language plpgsql security definer set search_path=public as $$
declare d attendance_devices; n integer;
begin
 select * into d from attendance_devices where id=p_device;
 if d.id is null or not has_role(d.company_id,array['super_admin','company_admin','hr_manager']) then raise exception 'Forbidden'; end if;
 update raw_attendance_events r set employee_id=m.employee_id from device_employee_mappings m where r.device_id=d.id and m.device_id=d.id and m.device_user_id=r.device_user_id and r.employee_id is null;
 get diagnostics n=row_count;return n;
end; $$;
revoke all on function public.backfill_device_mappings(uuid) from public;
grant execute on function public.backfill_device_mappings(uuid) to authenticated;


-- END MIGRATION: 202610180005_integrity.sql


-- BEGIN MIGRATION: 202610180006_reporting.sql

create view public.payroll_balances with (security_invoker=true) as
select i.*,p.start_date as period_start,p.end_date as period_end,p.currency,r.status as payroll_status,
coalesce((select sum(a.amount) from payment_allocations a join salary_payments s on s.id=a.payment_id where a.payroll_item_id=i.id and s.reversal_of is null and not exists(select 1 from salary_payments rev where rev.reversal_of=s.id)),0)::numeric(18,2) as total_paid,
(i.net-coalesce((select sum(a.amount) from payment_allocations a join salary_payments s on s.id=a.payment_id where a.payroll_item_id=i.id and s.reversal_of is null and not exists(select 1 from salary_payments rev where rev.reversal_of=s.id)),0))::numeric(18,2) as remaining_payable
from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id;
grant select on payroll_balances to authenticated;
create policy own_payroll_runs on payroll_runs for select to authenticated using(exists(select 1 from payroll_items i join employees e on e.id=i.employee_id where i.run_id=payroll_runs.id and e.user_id=auth.uid()));
create policy own_payroll_periods on payroll_periods for select to authenticated using(exists(select 1 from payroll_runs r join payroll_items i on i.run_id=r.id join employees e on e.id=i.employee_id where r.period_id=payroll_periods.id and e.user_id=auth.uid()));

create function public.employee_counts(p_company uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('total',count(*),'active',count(*) filter(where e.status='active')) from employees e join company_memberships m on m.company_id=e.company_id and m.user_id=auth.uid() where e.company_id=p_company and (m.role in ('super_admin','company_admin','hr_manager','accountant') or (m.role in ('branch_manager','supervisor') and e.branch_id=m.branch_id) or e.user_id=auth.uid()); $$;
revoke all on function public.employee_counts(uuid) from public;
grant execute on function public.employee_counts(uuid) to authenticated;

create function public.dashboard_metrics(p_company uuid) returns jsonb language sql stable set search_path=public as $$
with scope as (select timezone from companies where id=p_company), dates as (select (now() at time zone timezone)::date today from scope),
today_att as (select a.* from attendance_summaries a,dates d where a.company_id=p_company and a.work_date=d.today),
monthly as (select b.* from payroll_balances b,dates d where b.company_id=p_company and b.currency=(select currency from companies where id=p_company) and b.period_start<=d.today and b.period_end>=date_trunc('month',d.today)::date)
select jsonb_build_object(
 'total_employees',(select count(*) from employee_directory(p_company)),
 'active_employees',(employee_counts(p_company)->>'active')::integer,
 'attendance_records',(select count(*) from today_att),
 'needs_review',(select count(*) from today_att where status in ('uncertain','missing_in','missing_out') or (status='absent' and not reviewed)),
 'present',(select count(*) from today_att where status='present'),
 'absent',(select count(*) from today_att where status='absent' and reviewed),
 'late',(select count(*) from today_att where late_minutes>0),
 'on_leave',(select count(*) from today_att where status='leave'),
 'worked_hours',(select coalesce(sum(worked_minutes)/60.0,0) from today_att),
 'overtime_hours',(select coalesce(sum(overtime_minutes)/60.0,0) from today_att),
 'gross_payroll',(select coalesce(sum(gross),0) from monthly),
 'deductions',(select coalesce(sum(deductions),0) from monthly),
 'net_payroll',(select coalesce(sum(net),0) from monthly),
 'salary_paid',(select coalesce(sum(total_paid),0) from monthly),
 'outstanding',(select coalesce(sum(remaining_payable),0) from monthly),
 'document_alerts',(select count(*) from employee_documents,dates d where company_id=p_company and expiration_date<=d.today+30)
); $$;
revoke all on function public.dashboard_metrics(uuid) from public;
grant execute on function public.dashboard_metrics(uuid) to authenticated;

alter table notifications add column source_key text;
create unique index notification_source_unique on notifications(company_id,user_id,source_key) where source_key is not null;
create policy own_notifications on notifications for select to authenticated using(user_id=auth.uid());
create function public.run_maintenance() returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into notifications(company_id,user_id,title,message,source_key)
 select d.company_id,m.user_id,'Employee document expiring',d.title||' expires on '||d.expiration_date::text,'document:'||d.id::text||':'||d.expiration_date::text
 from employee_documents d join company_memberships m on m.company_id=d.company_id and m.role in ('super_admin','company_admin','hr_manager') join companies c on c.id=d.company_id
 where d.expiration_date<=(now() at time zone c.timezone)::date+30
 on conflict(company_id,user_id,source_key) where source_key is not null do nothing;
 get diagnostics n=row_count;
 update attendance_devices set status='stale' where last_sync_at<now()-interval '15 minutes' and status<>'stale';
 return n;
end; $$;
revoke all on function public.run_maintenance() from public,anon,authenticated;
grant execute on function public.run_maintenance() to service_role;

create function public.service_save_attendance(p_company uuid,p_employee uuid,p_date date,p_summary jsonb,p_shift uuid) returns void language plpgsql security definer set search_path=public as $$
declare e employees;
begin
 select * into e from employees where company_id=p_company and id=p_employee;
 if e.id is null then raise exception 'Invalid employee'; end if;
 if exists(select 1 from attendance_summaries where employee_id=e.id and work_date=p_date and reviewed) then return; end if;
 if exists(select 1 from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=e.id and p_date between p.start_date and p.end_date) then return; end if;
 insert into attendance_summaries(company_id,employee_id,work_date,shift_id,first_in,last_out,scheduled_minutes,worked_minutes,late_minutes,early_minutes,overtime_minutes,status,paid_leave)
 values(p_company,e.id,p_date,p_shift,(p_summary->>'first_in')::timestamptz,(p_summary->>'last_out')::timestamptz,(p_summary->>'scheduled_minutes')::int,(p_summary->>'worked_minutes')::int,(p_summary->>'late_minutes')::int,(p_summary->>'early_minutes')::int,(p_summary->>'overtime_minutes')::int,p_summary->>'status',(p_summary->>'paid_leave')::boolean)
 on conflict(employee_id,work_date) do update set shift_id=excluded.shift_id,first_in=excluded.first_in,last_out=excluded.last_out,scheduled_minutes=excluded.scheduled_minutes,worked_minutes=excluded.worked_minutes,late_minutes=excluded.late_minutes,early_minutes=excluded.early_minutes,overtime_minutes=excluded.overtime_minutes,status=excluded.status,paid_leave=excluded.paid_leave;
end; $$;
revoke all on function public.service_save_attendance(uuid,uuid,date,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.service_save_attendance(uuid,uuid,date,jsonb,uuid) to service_role;


-- END MIGRATION: 202610180006_reporting.sql


-- BEGIN MIGRATION: 202610180007_permissions.sql

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


-- END MIGRATION: 202610180007_permissions.sql


-- BEGIN MIGRATION: 202610180008_analytics.sql

create or replace function public.employee_counts(p_company uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('total',count(*),'active',count(*) filter(where e.status='active')) from employees e join company_memberships m on m.company_id=e.company_id and m.user_id=auth.uid() where e.company_id=p_company and (m.role in ('super_admin','company_admin','hr_manager','accountant') or (m.role in ('branch_manager','supervisor') and e.branch_id=m.branch_id) or e.user_id=auth.uid()); $$;
revoke all on function public.employee_counts(uuid) from public;
grant execute on function public.employee_counts(uuid) to authenticated;

create function public.analytics_series(p_company uuid,p_from date,p_to date,p_currency text) returns jsonb language sql stable set search_path=public as $$
with daily as (
 select work_date, count(*) total, count(*) filter(where status='present') present, count(*) filter(where late_minutes>0) late, count(*) filter(where status='absent' and reviewed) absent,coalesce(sum(overtime_minutes)/60.0,0) overtime_hours from attendance_summaries where company_id=p_company and work_date between p_from and p_to group by work_date
), monthly as (
 select to_char(period_start,'YYYY-MM') as "month",sum(gross) gross,sum(deductions) deductions,sum(net) net,sum(overtime) overtime_cost from payroll_balances where company_id=p_company and currency=p_currency and period_start<=p_to and period_end>=p_from group by to_char(period_start,'YYYY-MM')
), by_branch as (
 select b.name branch,coalesce(sum(p.net),0) net,coalesce(sum(p.overtime),0) overtime_cost from branches b left join payroll_balances p on p.company_id=b.company_id and p.branch_id=b.id and p.currency=p_currency and p.period_start<=p_to and p.period_end>=p_from where b.company_id=p_company group by b.id,b.name
)
select jsonb_build_object('attendance',coalesce((select jsonb_agg(d order by work_date) from daily d),'[]'::jsonb),'payroll',coalesce((select jsonb_agg(m order by "month") from monthly m),'[]'::jsonb),'branches',coalesce((select jsonb_agg(b order by branch) from by_branch b),'[]'::jsonb)); $$;
revoke all on function public.analytics_series(uuid,date,date,text) from public;
grant execute on function public.analytics_series(uuid,date,date,text) to authenticated;

create view public.leave_balances with (security_invoker=true) as
select e.company_id,e.branch_id,e.id employee_id,t.id leave_type_id,t.name,t.paid,
coalesce((select p.annual_entitlement from leave_policies p where p.employee_id=e.id and p.leave_type_id=t.id and p.effective_from<=current_date order by p.effective_from desc limit 1),t.annual_entitlement) entitlement,
coalesce(sum(r.total_days) filter(where r.status='approved'),0) used,
coalesce(sum(r.total_days) filter(where r.status='pending'),0) pending,
greatest(0,coalesce((select p.annual_entitlement from leave_policies p where p.employee_id=e.id and p.leave_type_id=t.id and p.effective_from<=current_date order by p.effective_from desc limit 1),t.annual_entitlement)-coalesce(sum(r.total_days) filter(where r.status='approved'),0)) remaining,
e.created_at
from employees e join leave_types t on t.company_id=e.company_id left join leave_requests r on r.employee_id=e.id and r.leave_type_id=t.id and extract(year from r.start_date)=extract(year from current_date) group by e.company_id,e.branch_id,e.id,t.id,t.name,t.paid,t.annual_entitlement;
grant select on leave_balances to authenticated;

-- Device mappings for transferred employees must be re-established at the new branch.
create function public.transfer_device_mappings() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.branch_id is distinct from old.branch_id then delete from device_employee_mappings where employee_id=new.id; end if;
 return new;
end; $$;
create trigger transfer_device_mappings after update of branch_id on employees for each row execute function transfer_device_mappings();


-- END MIGRATION: 202610180008_analytics.sql


-- BEGIN MIGRATION: 202610180009_final_guards.sql

create index membership_user_idx on company_memberships(user_id);
create index attendance_company_date_idx on attendance_summaries(company_id,work_date);
create index raw_employee_time_idx on raw_attendance_events(employee_id,occurred_at);
create index documents_expiry_idx on employee_documents(company_id,expiration_date) where expiration_date is not null;
create index leave_employee_dates_idx on leave_requests(employee_id,start_date,end_date);
create index payroll_period_dates_idx on payroll_periods(company_id,start_date,end_date);
create index advance_pending_idx on advance_repayments(employee_id,due_date) where payroll_item_id is null;
create index damage_pending_idx on damage_recovery_installments(employee_id,due_date) where payroll_item_id is null;

create or replace function public.guard_payroll_sources() returns trigger language plpgsql set search_path=public as $$
declare last_period date;
begin
 if TG_TABLE_NAME='authorized_deductions' and exists(select 1 from payroll_runs where period_id=old.period_id) then raise exception 'Deduction already included in payroll'; end if;
 if TG_TABLE_NAME='salary_structures' then
 select max(p.end_date) into last_period from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=old.employee_id;
 if last_period is not null and not(new.company_id=old.company_id and new.employee_id=old.employee_id and new.name=old.name and new.allowances=old.allowances and new.bonuses=old.bonuses and new.effective_from=old.effective_from and new.effective_to is not null and new.effective_to>=last_period) then raise exception 'Use a new date-effective salary structure'; end if;
 end if;
 return new;
end; $$;
alter table salary_structures add constraint salary_structure_dates check(effective_to is null or effective_to>=effective_from);
alter table salary_structures add constraint salary_structure_no_overlap exclude using gist(employee_id with =,daterange(effective_from,effective_to,'[]') with &&);

create function public.guard_payroll_request() returns trigger language plpgsql set search_path=public as $$
declare from_date date; to_date date;
begin
 if TG_TABLE_NAME='leave_requests' then from_date:=old.start_date;to_date:=old.end_date;else from_date:=old.work_date;to_date:=old.work_date;end if;
 if exists(select 1 from payroll_items i join payroll_runs r on r.id=i.run_id join payroll_periods p on p.id=r.period_id where i.employee_id=old.employee_id and p.start_date<=to_date and p.end_date>=from_date) then raise exception 'Request affects generated payroll';end if;
 return new;
end; $$;
create trigger guard_payroll_leave before update on leave_requests for each row execute function guard_payroll_request();
create trigger guard_payroll_overtime before update on overtime_records for each row execute function guard_payroll_request();

-- Finance gets the minimum attendance ledger needed for payroll reconciliation.
create policy finance_attendance_read on attendance_summaries for select to authenticated using(has_role(company_id,array['accountant']));
create policy finance_overtime_read on overtime_records for select to authenticated using(has_role(company_id,array['accountant']));
create function public.recovery_incidents(p_company uuid) returns table(id uuid,name text) language sql stable security definer set search_path=public as $$
select i.id,i.category||' | '||e.employee_number||' | '||i.verified_loss::text from employee_incidents i join employees e on e.id=i.employee_id where i.company_id=p_company and i.status='approved' and has_role(p_company,array['super_admin','company_admin','accountant']); $$;
revoke all on function public.recovery_incidents(uuid) from public;
grant execute on function public.recovery_incidents(uuid) to authenticated;


-- END MIGRATION: 202610180009_final_guards.sql


-- BEGIN MIGRATION: 202610180010_self_service.sql

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


-- END MIGRATION: 202610180010_self_service.sql


-- BEGIN MIGRATION: 202610180011_financial_balances.sql

create view public.advance_balances with (security_invoker=true) as
select s.id,s.company_id,s.branch_id,s.employee_id,s.created_at,s.status,s.requested_amount,s.approved_amount,
coalesce(sum(a.amount),0)::numeric(18,2) as scheduled_amount,
coalesce(sum(a.amount) filter(where a.payroll_item_id is not null),0)::numeric(18,2) as reserved_amount,
coalesce(sum(a.amount) filter(where r.status in ('approved','partially_paid','paid','locked')),0)::numeric(18,2) as recovered_amount,
(coalesce(s.approved_amount,0)-coalesce(sum(a.amount) filter(where r.status in ('approved','partially_paid','paid','locked')),0))::numeric(18,2) as remaining_balance
from salary_advances s left join advance_repayments a on a.advance_id=s.id left join payroll_items i on i.id=a.payroll_item_id left join payroll_runs r on r.id=i.run_id group by s.id;
create view public.damage_balances with (security_invoker=true) as
select s.id,s.company_id,s.branch_id,s.employee_id,s.created_at,s.status,s.incident_id,s.approved_amount,
coalesce(sum(a.amount),0)::numeric(18,2) as scheduled_amount,
coalesce(sum(a.amount) filter(where a.payroll_item_id is not null),0)::numeric(18,2) as reserved_amount,
coalesce(sum(a.amount) filter(where r.status in ('approved','partially_paid','paid','locked')),0)::numeric(18,2) as recovered_amount,
(s.approved_amount-coalesce(sum(a.amount) filter(where r.status in ('approved','partially_paid','paid','locked')),0))::numeric(18,2) as remaining_balance
from damage_recovery_plans s left join damage_recovery_installments a on a.plan_id=s.id left join payroll_items i on i.id=a.payroll_item_id left join payroll_runs r on r.id=i.run_id group by s.id;
grant select on advance_balances,damage_balances to authenticated;


-- END MIGRATION: 202610180011_financial_balances.sql


-- BEGIN MIGRATION: 202610180012_payroll_leave_guards.sql

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


-- END MIGRATION: 202610180012_payroll_leave_guards.sql


-- BEGIN MIGRATION: 202610190001_explicit_api_grants.sql

-- Pending operator approval. Additive compatibility fix: no tables/data are created or deleted.
-- Do not assume legacy Supabase automatic grants. Restrict changes to Maamul's named objects.
grant usage on schema public to authenticated, service_role;
do $$
declare table_name text; command text;
begin
 foreach table_name in array array[
  'companies','company_memberships','branches','departments','positions','employees',
  'employee_contacts','employee_guarantors','employee_documents','employment_contracts',
  'salary_structures','salary_history','attendance_devices','device_employee_mappings',
  'raw_attendance_events','attendance_summaries','attendance_corrections','attendance_sync_logs',
  'work_shifts','shift_assignments','leave_types','leave_policies','leave_requests','overtime_records',
  'employee_incidents','damage_recovery_plans','damage_recovery_installments','salary_advances',
  'advance_repayments','payroll_periods','payroll_runs','payroll_items','payroll_approvals',
  'salary_payments','payment_allocations','employee_performance_reviews','notifications',
  'application_settings','holidays','authorized_deductions','audit_logs'
 ] loop
  if to_regclass(format('public.%I',table_name)) is null then raise exception 'Required Maamul table missing: %',table_name;end if;
  if not(select relrowsecurity from pg_class where oid=to_regclass(format('public.%I',table_name))) then raise exception 'Refusing grants without RLS: %',table_name;end if;
  execute format('revoke all on table public.%I from anon, authenticated, service_role',table_name);
  execute format('grant select on table public.%I to authenticated, service_role',table_name);
  -- Grant only operations backed by an explicit authenticated policy after all 12 migrations.
  for command in select distinct cmd from pg_policies p where p.schemaname='public' and p.tablename=table_name and 'authenticated'=any(p.roles) and p.cmd in ('INSERT','UPDATE','DELETE') loop
   execute format('grant %s on table public.%I to authenticated',command,table_name);
  end loop;
 end loop;
 foreach table_name in array array['payroll_balances','leave_balances','advance_balances','damage_balances'] loop
  execute format('revoke all on table public.%I from anon, authenticated, service_role',table_name);
  execute format('grant select on table public.%I to authenticated, service_role',table_name);
 end loop;
end $$;
-- RPC-only ledgers and audit tables remain read-only for authenticated clients.
-- Managed auth/storage schemas, unrelated tables and future default privileges are untouched.


-- END MIGRATION: 202610190001_explicit_api_grants.sql


notify pgrst, 'reload schema';
commit;
select 'maamul_schema_installed' as status, count(*) as rls_enabled_tables from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity;
