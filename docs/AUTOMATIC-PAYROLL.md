# Monthly payroll on the 28th

Prepared locally; no remote migration, schedule or payroll has been executed.

1. Apply only `supabase/migrations/202610190003_payroll_schedule.sql` in Supabase SQL Editor. Employee numbering is a separate migration and is not required by this feature.
2. Enable Supabase Cron (`pg_cron`), then run `supabase/enable-payroll-cron.sql` once. This performs an hourly check, independently of whether the local computer is on. Inspect Cron job history for failures.
3. As Company Admin, open Settings → Automatic payroll. Choose the salary period explicitly and enable the schedule. The scheduled administrator must retain Company Admin access. Disabling the setting stops draft generation for that company.
4. Maintain employment salaries, shift assignments, processed attendance for every employment date (including rest days), and review uncertain records. On and after the 28th the job retries incomplete drafts through the end of that month, notifying the scheduling administrator when review is needed. A current-calendar-month schedule cannot generate on the 28th while future attendance is unresolved.
5. Register advances, authorized deductions and overtime through their respective modules before generation. Advance recoveries need actual disbursement evidence and an installment schedule. Overtime needs independent approval. Deductions must reference the payroll period; create that exact period ahead of the 28th to enter deductions beforehand.
6. Review, verify and independently approve generated drafts. Record payments separately. Existing runs are never regenerated. The job never pays salaries, approves payroll, confirms absences or bypasses attendance checks. Entries added after a draft require review and an appropriate later adjustment; they do not silently rewrite a draft.

An alternative external scheduler may POST `{"task":"payroll"}` to `/api/jobs` using the server-only `JOB_SECRET` bearer header and `SUPABASE_SERVICE_ROLE_KEY` configuration. Use either Supabase Cron or the external scheduler. Never place secrets in URLs. No service key is needed when using the SQL Cron job.

The job serializes each company, uses the existing payroll engine and records `scheduled_payroll_draft` audit events under the administrator who enabled the schedule. The separate scheduling audit action identifies automation; changing/removing that administrator's role blocks execution. Company currency/divisor and payroll policy are reused. Each company's registered time zone controls the 28th.
