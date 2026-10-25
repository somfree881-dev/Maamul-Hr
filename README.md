# Maamul HR

A Next.js 16 / React 19 / TypeScript HR application backed by Supabase PostgreSQL, Supabase Auth and private Supabase Storage. Tailwind CSS and a shadcn-style Radix button support the responsive interface. The supplied Maamul HR logo is retained in `public/logo.png`.

The starting directory contained only the logo. No previous application, Lovable project, credentials, database or production data was found. **No remote database has been modified or verified.**

For the current connection task, follow [SUPABASE-CONNECTION.md](docs/SUPABASE-CONNECTION.md) first. It adds read-only preflight checks and a proposed 13th compatibility migration for explicit API grants. Do not apply the initial schema or the compatibility migration to a real project without reviewing its existing schema and approving the pending changes.

## Run locally

Requirements: Node.js 22+, npm, and a Supabase project. Python 3.11+ is needed for the connector.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# Edit .env.local with your project values.
npm.cmd run dev
```

Open http://localhost:3000. Without credentials the application shows a setup workspace and empty states. It does not insert demonstration people, punches or payroll.

## Connect Supabase

1. Create a development Supabase project. If using an existing project, back it up and compare existing table/function names before applying migrations; these initial migrations intentionally fail on name conflicts rather than silently replacing existing tables.
2. First review `supabase/preflight.sql` against the real project and approve the exact pending migration list. There are 12 original migrations plus the proposed `202610190001_explicit_api_grants.sql` compatibility migration. Do not blindly replay them against existing objects. After approval, apply only the reviewed pending files in order using the SQL editor or an approved CLI workflow. This repository does not automatically run remote migrations or reset a database.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. A legacy anon key also works. These public values alone do not confer tenant access; database policies check authenticated memberships.
4. Set `APP_URL` to the exact application origin, e.g. `http://localhost:3000`. Set the corresponding Site URL and redirect URLs in Supabase Auth.
5. Create the first user in Supabase Dashboard → Authentication → Users. Use an email/password account with a confirmed email. Public sign-up is intentionally absent from the app; invite subsequent users through Supabase Auth.
6. Sign in at `/login`. Open Settings and create a company. The authenticated creator receives a Company Admin membership atomically. Create at least one branch, then departments and positions.
7. Add users under Settings → Manage access using their Auth UUID. Branch Managers and Supervisors require a branch UUID. Link an Employee's Auth UUID on their employee record for self-service access. Provision a second Company Admin for independent payroll approval.
8. For devices and background jobs only, set `SUPABASE_SERVICE_ROLE_KEY` server-side and a separate random `JOB_SECRET` with at least 32 characters. Neither key may use a `NEXT_PUBLIC_` prefix. Browser operations and exports use the user's own RLS-scoped session.
9. Verify the `employee-documents` bucket is private. Migrations install company/employee path policies and a 10 MB limit. Uploads accept PDF, JPEG and PNG with content-signature checks; no public file URLs are created.

Authentication follows the [Supabase SSR client model](https://supabase.com/docs/guides/auth/server-side/creating-a-client): a request-specific cookie client, validated Auth user and proxy session refresh. Mutating browser APIs enforce same-origin requests.

## Daily workflows

- Employees: `/manage/employees` provides validated creation and editing, search, status filtering, pagination and authorized exports. Profiles contain employment, attendance, leave, payroll, financial, documents and performance tabs. Contacts, guarantors and contracts have related modules. Upload a private `photo` document to display a profile photo. Financial/audit history prevents destructive employee deletion: terminate an employee with a valid end date while retaining historical records.
- Attendance: configure shifts, weekdays and breaks; assign by employee, department or branch over date ranges. More-specific assignments take priority; conflicting assignments require review. Rotating schedules use successive dated assignments. Split shifts accept ordered same-day JSON segments. Register devices and employee mappings, then process days from Attendance or the jobs endpoint.
- Device logs: raw punches are immutable and deduplicated by `(device_id, source_key)`. Use Devices → Map historical events after creating a previously missing user mapping. Employee branch transfers remove outdated device mappings, which must be recreated for the destination device. No fingerprint templates are stored.
- Leave: create leave types and employee-specific policies. Employees can request leave, advances and attendance corrections. Overlapping pending/approved leave is blocked; entitlement counts pending reservations. Requests spanning a calendar year must be split. Managers approve leave and overtime through guarded workflows; own-request approval is rejected.
- Corrections: submit a valid timestamp pair and reason. A different authorized person approves. Confirmed absence requires explicit review before payroll. Missing sync remains uncertain. Approved corrections and generated-payroll attendance cannot be silently overwritten.
- Documents: private upload, preview, download, replacement and authorized deletion. Employee profiles provide PDF and complete authorized ZIP archives. Metadata/reference checks occur before old file deletion. Storage and PostgreSQL cannot share a transaction; cleanup failures are reported and require administrator reconciliation.
- Incidents: record evidence, employee explanation, dispute status and review. Recovery is separate and requires an approved incident, legal basis, employee authorization and consent timestamp. Combined approved plans cannot exceed verified loss. Schedule installments through the recovery module.
- Advances: record request, approved amount, authorization and actual disbursement evidence before scheduling installments. A disbursed advance is immutable. Schedules cannot exceed principal.
- Payroll: create a currency-specific period with its agreed divisor. Generate a draft from the period row. Every eligible employment date needs an attendance summary, including rest/holiday dates; unresolved punches and unreviewed absences block generation. Verify the draft, then have an independent Company Admin approve. Record payments against payroll items. Reconciliation shows net, paid and outstanding; reversals restore payable and locked payroll rejects changes. Generation never initiates money movement.
- Reports: PDF, Excel and CSV download routes enforce the same RLS as the app. Report dates, branch and employee filters support company and branch reporting. Profile monthly reports include attendance, leave, earnings, deductions and balances. The analytics selector covers attendance, lateness, absence, payroll, overtime cost and branch comparison. Exports stop at 50,000 rows and archives at 50 MB; narrow large requests.

Money uses PostgreSQL `NUMERIC(18,2)`. Unpaid absence reduces basic earnings once and is displayed separately; it is not added to deductions again. Partial employment uses a calendar-day ratio within the period, while unpaid days use the configured period divisor. Approved overtime uses the period daily-hours divisor and each approved record's multiplier. Payroll reservations and payments use database row locks to prevent duplicate recovery and concurrent overpayment.

## Company policy settings

Settings → Company policies (`/manage/policies`) stores company-specific JSON. Configure before creating periods. Periods snapshot daily-hours and rounding settings and become immutable once payroll is generated.

`payroll_policy` example:

```json
{ "daily_hours": 8, "rounding_mode": "half_up" }
```

Rounding modes: `half_up`, `half_even`, `down`, `up`, to two decimal places. The period's explicit `divisor` controls unpaid-day and overtime-rate calculations. Configure separate approved multipliers for regular, weekend, holiday and night overtime records.

`late_policy` example:

```json
{
  "mode": "per_minute",
  "rate": 0.05,
  "maximum": 10,
  "legal_basis": "Reviewed contractual basis",
  "authorization_reference": "Signed authorization reference"
}
```

Modes: `warning`, `fixed`, `per_minute`, `per_hour`. `lib/late-policy.ts` provides the capped preview calculation. Late policies never create deductions automatically. Finance must review and create an authorized deduction for the period, with its legal basis and authorization reference. Check local employment law, statutory leave and contracts before configuring these policies; no jurisdiction is assumed.

## Connector and unattended processing

See [connector/README.md](connector/README.md) for compatible-model checks, Python installation, credentials, multi-device configuration, connectivity testing, SQLite queue behavior, retries and Windows Task Scheduler startup.

The connector only runs while its Windows computer is operating. Device-retained offline logs are read on reconnect, subject to model storage capacity. ADMS and vendor-API devices need a model-specific adapter; selecting those protocol types does not make `pyzk` compatible.

Schedule authenticated POST requests to `/api/jobs` from your hosting scheduler or a trusted worker. Supply `Authorization: Bearer JOB_SECRET` via the scheduler's secret store, never a URL parameter. Request bodies:

```json
{ "task": "maintenance" }
```

```json
{
  "task": "attendance",
  "company_id": "COMPANY_UUID",
  "date": "2026-10-01",
  "offset": 0
}
```

Run maintenance daily for document expiration notifications and stale-device status. Run attendance after synchronization (e.g. hourly for the last two work dates in each company's IANA zone) and replay historical dates after offline recovery. Each call handles 50 employees; continue with returned `next_offset` until null. Inspect per-employee errors and alert on unresolved shifts/punches; a HTTP 200 does not mean every employee processed successfully. Jobs preserve reviewed records and payroll snapshots. Configure a sufficiently long server request timeout or lower the batch size for your host. The application does not install a scheduler automatically.

## Tests and deployment

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
python -m venv connector/.venv
connector/.venv/Scripts/python.exe -m pip install -r connector/requirements.txt
npm.cmd run test:connector
npm.cmd run test:db
```

`test:db` starts an isolated real PostgreSQL instance on loopback port 54329, creates test-only Auth/Storage schema contracts, applies the actual migrations, and runs RLS/accounting scenarios. It never accepts a remote connection URL. Data remains in ignored `.test-postgres/run-*` directories for inspection; no production records are used. On Linux run as a regular non-root user; the harness never creates operating-system accounts. Only one harness may use that port at a time.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/SECURITY.md](docs/SECURITY.md), and [docs/VERIFICATION.md](docs/VERIFICATION.md) for operational setup, phase/file coverage, recorded results and remaining acceptance work.
