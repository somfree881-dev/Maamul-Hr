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
