# Manual monthly salaries

Open Payroll runs and use Generate all salaries. Choose a completed calendar month; no period form is required. The selected company currency, divisor, daily hours and rounding settings apply. Existing exact monthly runs are reused. Overlapping custom periods are preserved and must be handled through their existing workflow.

Deployment: review and apply supabase/migrations/202610200002_manual_monthly_salaries.sql in Supabase SQL Editor after operator approval. It adds one RPC, no tables, and preserves existing records. It does not depend on the numbering or scheduler migrations. Do not rerun the initial installer.

The authenticated, same-origin API checks company membership and finance role, then uses the server-only service key to process company-scoped attendance. Reviewed summaries are preserved. Unresolved punches, unreviewed absence, missing shifts and future dates stop salary generation with an actionable list. Successfully processed attendance remains available if later processing fails; financial changes are atomic in the RPC.

Late deduction is opt-in in the form and authorizes the displayed company-policy formula: basic salary / divisor / daily hours / 60 * late minutes after grace. Existing late authorizations win (never added twice). Approved overtime, other authorized deductions, reviewed unpaid absence and recovery schedules use the existing payroll engine. Disbursed advances with an unscheduled balance get that balance scheduled at month end; existing installment schedules remain intact. If an existing month-end installment prevents completing the schedule, generation fails instead of overwriting it. Excess deductions stop generation rather than producing negative salary. Raw punches, approvals and payments remain unchanged.

No payroll approval or salary payment occurs automatically. Open Payroll ledger for the resulting gross, each deduction and net pay; use the existing independent approval and payment workflow.

Validation: local unit tests, production build, and isolated PostgreSQL tests. Live authenticated monthly generation must be verified after migration approval and deployment. The service key is never sent to the browser.
