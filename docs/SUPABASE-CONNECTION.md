# Connect and verify the existing Maamul HR project

## Current status — 19 October 2026

The original README and all 12 migrations were reviewed. Their hashes, 41 table names, functions and views are recorded in `MIGRATION-INVENTORY.json`. The user confirmed a **new empty Supabase project** and authorized a **dedicated test company**. No remote migration or record operation has been executed, and the app is **not yet verified as connected**.

At initial inspection, `.env.local` did not exist, no Supabase process environment variables were set, and `.env.example` contained placeholders. A local template was created without replacing an existing file. No credentials were printed. Supabase CLI is not installed, and this workspace is not currently a Git repository.

## 1. Save public connection settings locally

Open `D:\Maamul Hr\.env.local` in your editor. From the target Supabase project's Connect dialog or Settings → API Keys, copy the URL and **publishable** key into:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REAL_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_REAL_PUBLISHABLE_KEY
APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=
JOB_SECRET=
```

Use your actual values, not the placeholders above. A legacy anon key also works. Never put `sb_secret_…`, a legacy service-role JWT, a database password or an Auth user access token in a `NEXT_PUBLIC_` variable. The startup/build guard now rejects recognized privileged keys before a browser bundle is built.

Do not paste keys/passwords into chat or commit `.env.local`. The file is covered by `.gitignore`. The service key and job secret are unnecessary for the initial employee/authentication checks; configure those server-only values later for device ingestion and scheduled jobs.

Tell the assistant **“Configuration saved”** once you have saved it. A local configuration check prints only present/missing/placeholder status:

```powershell
Set-Location 'D:\Maamul Hr'
npm.cmd run supabase:check
```

After valid settings exist, a read-only reachability probe is available:

```powershell
npm.cmd run supabase:check -- --probe
```

The probe uses the public key, GET Auth settings and an anonymous REST HEAD query. It does not use the service-role key, perform sign-up/login, insert records or run migrations. A reachable API is **not** evidence of an authenticated database connection.

## 2. Inspect remote compatibility before approval

Open `supabase/preflight.sql`, review it, and run it in the target project's Supabase SQL editor. It is wrapped in `BEGIN READ ONLY` / `ROLLBACK`. It reads schema metadata and the document bucket configuration, not employee rows, Auth users or file contents. Return the metadata results for review; do not include API keys or passwords.

We must verify:

- PostgreSQL 15+ for `security_invoker` views; `pgcrypto` and `btree_gist` availability.
- Managed `auth.users`, `auth.uid()`, `storage.buckets`, `storage.objects`, and the `anon`, `authenticated`, `service_role` roles.
- No conflicting Maamul table/view/function names, and whether any migration history already exists. An existing object does not justify creating a duplicate or marking a migration as applied.
- If `employee-documents` already exists, it must be private. The original `ON CONFLICT DO NOTHING` does not correct an existing public bucket.
- `public` must be an exposed Data API schema, and grants must accompany RLS. Existing unrelated objects are preserved.

The original migration set is an initial schema, **not an idempotent upgrade** for arbitrary existing tables. None contains `DROP TABLE`, but some replace functions or tighten policies/constraints. Stop and adapt if remote objects conflict. Do not rerun migrations or use `db reset` to resolve conflicts.

### Proposed additive fix (not remotely applied)

`202610190001_explicit_api_grants.sql` is a new 13th migration prepared after reviewing the original 12. Supabase's secure defaults no longer guarantee automatic table grants. The original local harness granted all table operations by default and masked this compatibility gap.

The new migration changes privileges only on Maamul's 41 named base tables and four views. It verifies RLS is enabled, grants reads, grants authenticated writes only where a final RLS policy exists, and keeps RPC-only financial/attendance ledgers and audit records read-only. Service jobs receive the reads needed by their existing service-only RPC workflow. It does not create duplicate tables, alter stored records, change managed Auth/Storage schemas, or alter unrelated/future tables.

All original 12 migration files remain unchanged. The isolated harness now starts **without automatic table grants** and tests the explicit-grants migration instead. This is a local test, not a remote deployment.

Local verification for this preparation passed: 43 TypeScript tests, TypeScript checking, production build, and 78 real PostgreSQL checks on isolated port 54339. The PostgreSQL checks include execution of the read-only preflight and explicit denial of anonymous personnel reads, forged audit writes and direct payroll modification. These results do not verify the real Supabase project.

After reviewing your metadata, the assistant will present the precise pending migration list and request your approval. **Do not apply migrations until that approval step.** A public API key cannot run DDL: after approval, use either the project's SQL editor or a separately configured local PostgreSQL/CLI connection, keeping privileged credentials out of chat and command arguments. Do not reconcile migration history by blindly running `migration repair`.

## 3. Verify an authenticated database operation

After approved migrations are applied:

1. Enable the intended email/password provider and create a confirmed **test account** in Supabase Auth. Keep its password private. Do not disable email confirmation or RLS merely to make a test pass.
2. Set Supabase Auth Site URL to `http://localhost:3000` for local use and configure any required redirect URLs.
3. Restart the development server after changing environment values. Open exactly `http://localhost:3000/login`; `127.0.0.1` is a different origin and will fail mutation checks if `APP_URL` remains `localhost`.
4. Sign in using the test account, then open `http://localhost:3000/api/connection-status` in the **same browser**.
5. The state `authenticated_database_verified` means `auth.getUser()` succeeded and a user-scoped `company_memberships` query succeeded under RLS. A membership count of zero is valid before creating the test company. `authentication_required` and `database_read_failed` do not verify a connection.

This read-only endpoint never returns credentials, user identity or employee records. A successful status proves only that authenticated read; it does not prove every module or cross-company isolation works.

## 4. Persistent record and security acceptance sequence

Use only the authorized dedicated test company. Keep a manifest of created test IDs; retain test records for inspection and do not delete actual data. Test entries must be clearly marked and must not trigger real salary disbursements, device enrollment or messages.

| Check               | Evidence required                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                | Sign-in, verified user, successful RLS-scoped read, session refresh and logout                                                                                         |
| Company/branch      | Test company and branches persist after a new request/session; memberships are scoped correctly                                                                        |
| Employees           | Create a synthetic employee through the app; reload/retrieve; edit; verify stored values from a separate request                                                       |
| RLS                 | A second test company/account cannot read/update the first company's data; employee and branch roles are restricted; tests use user sessions, not the service-role key |
| Documents           | Upload a test PDF/image to the private bucket; compare download content; verify other-company denial, signed preview, replacement and authorization                    |
| Attendance          | Assigned shifts, deduplicated raw punches, missing-punch review, overnight/split cases and reviewed corrections persist                                                |
| Leave               | Scheduled-day count, entitlement and overlap checks, independent approval, paid/unpaid classification                                                                  |
| Advances/deductions | Authorized disbursement evidence and installment schedules; duplicate/over-recovery rejection; no real money is sent                                                   |
| Payroll/payments    | Complete reviewed attendance; generate draft; independent verification/approval; partial payments, reversal, reconciliation and lock guards                            |
| Dashboard/reports   | Compare cards/chart aggregates and exported PDF/XLSX/CSV against the same persisted fixture records                                                                    |
| Browser             | Authenticated forms/navigation, validation errors and cookie/origin handling in an actual browser automation run; report failures separately from API-only tests       |

The existing 73-check PostgreSQL harness proves local SQL behavior. It does not prove hosted Auth, Storage HTTP APIs, browser cookies or remote grants. Those checks remain pending until the project and test accounts are ready. Browser automation is not installed/configured yet; installing/running it is a later verification step, not a completed result.

## 5. Local run and online deployment

For local development, dependencies already exist. From the project directory:

```powershell
npm.cmd run supabase:check
npm.cmd run dev
```

Open `http://localhost:3000`. If port 3000 is occupied, stop the existing Maamul server or choose another port and update `APP_URL` to that exact origin. For a clean dependency install use `npm.cmd ci`; do not overwrite an existing environment file with the example.

For a Node.js 22+ host supporting Next.js server routes:

1. After schema approval/verification, set the same project's public URL/key and the deployment's exact HTTPS `APP_URL` in the host environment.
2. Set public variables **before the build**; Next.js inlines them into browser code. Keep service/job keys in server-only secrets. Configure Supabase Auth Site URL/redirect allowlist for the HTTPS domain.
3. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`; start with `npm run start`. Use the hosting provider's assigned `PORT` as required.
4. Recheck `/api/connection-status` from the deployed browser after sign-in. Re-run role isolation, documents and financial fixture checks there.
5. Configure HTTPS, private/no-store response handling, backups, request limits, monitoring and explicit scheduler jobs. Install the Windows connector separately if physical devices are used.

This app cannot be hosted as a static export. No deployment is executed by this guide. See `DEPLOYMENT.md` for operational boundaries and `SECURITY.md` for the role model.

References: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [explicit Data API grants](https://supabase.com/docs/guides/api/securing-your-api), [database migrations](https://supabase.com/docs/guides/deployment/database-migrations). Next.js environment/proxy/testing guidance was read from this installed version's `node_modules/next/dist/docs/` before code changes.
