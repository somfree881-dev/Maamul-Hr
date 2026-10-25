# Authentication and privacy hardening — 25 October 2026

The root layout is presentation-only. `app/(public)` contains `/login`; `app/(workspace)` contains the authenticated shell and existing business pages. Public URLs are unchanged. Proxy authentication fails closed using a server-confirmed Supabase user. The workspace layout and each data-access/API handler also validate authentication independently. Missing/invalid/expired credentials redirect page requests to `/login`; user API requests return JSON 401. Unknown company membership, disallowed roles and rejected RLS writes return 403. Request validation happens after authentication. Private responses are not cached. Restored browser snapshots reload and visible tabs periodically revalidate authentication.

Roles use the existing database values:

| User role | Existing value | Access |
| --- | --- | --- |
| Super Admin / Company Admin | `super_admin`, `company_admin` | Administration within companies where they have membership; not a global cross-company bypass |
| Branch Admin | `branch_manager` | Attendance/supervision in assigned branch |
| Supervisor | `supervisor` | Assigned-branch attendance |
| HR | `hr_manager` | HR, private employee data and attendance; not payroll administration |
| Accountant | `accountant` | Finance and payroll; not private employee profiles |
| Employee | `employee` | Own employee, attendance and salary records through RLS; no payroll generation or approval |

The new `canViewModule` policy distinguishes own salary balances from payroll administration. Server workflow authorization resolves the target record's company using the user-scoped client and checks that company's membership/role before calling the existing independently authorized RPC. Record reads, documents and exports use the authenticated Supabase client with existing RLS; they never use the service-role client. Monthly salary generation retains its server-only service client only after explicit finance-role and company checks. The connector and jobs endpoints intentionally use machine authentication (per-device bearer key / constant-time JOB_SECRET), not browser sessions. They are exact exceptions, not prefix-based public routes. Unauthenticated connector calls now return 401 before parsing payloads or exposing configuration diagnostics.

Deployment:

1. Deploy the new application build.
2. Review `supabase/migrations/202610250001_access_hardening.sql` and apply it in Supabase SQL Editor only after operator approval. It re-enables RLS on Maamul's existing named tables, revokes anonymous table grants, and replaces only three self-service RPCs with an additional active-membership check. It creates no tables and removes no records. Original migrations remain intact. Existing role/branch policies are preserved.
3. This extra database hardening is necessary for direct Supabase RPC calls made using an old employee link after membership removal. The application's HTTP authentication/privacy fixes do not depend on this migration, but direct-RPC hardening is not active remotely until it is applied.
4. Keep SUPABASE_SERVICE_ROLE_KEY and JOB_SECRET server-only. No NEXT_PUBLIC variable may contain privileged credentials. The build guard rejects a privileged Supabase key in the public-key setting.

Validation performed:

- 84 unit/route/proxy tests: no session, expired/invalid session, failing Auth service, public-prefix lookalikes, 401 before validation, 403 for unauthorized payroll and cross-company requests, and employee own-salary access.
- 94 isolated PostgreSQL checks: tenant/branch isolation, restricted roles, private Storage policies, payroll approvals, immutable audit/finance records, no anonymous privileges, and self-service denial after membership removal. Uses synthetic fixtures, not production data. Includes the pending migration.
- Production Next.js build and TypeScript validation passed.
- `npm run test:security` against the running production server: protected direct URLs and refreshes redirect; login HTML contains no workspace shell; 14 anonymous API/sign-out requests return 401; configured service-role/JOB_SECRET values are absent from `.next/static` and login HTML.
- `npm run test:security:browser` uses a separate headless Chrome profile to test direct navigation and refresh at desktop/mobile sizes. It confirms only login is visible and saves login-only screenshots under ignored `.preview`.

Run the production server first (`npm run build`, `npm run start`), then the HTTP/browser checks. The browser script requires Chrome at the standard Windows installation path. Unit authorization tests mock Auth/HTTP sessions; PostgreSQL tests use real isolated local role/RLS fixtures. These are not a claim that every authenticated production browser role or the new migration has been verified live. No existing production records were modified during these checks.

Supabase guidance: https://supabase.com/docs/guides/auth/server-side/creating-a-client . The implementation uses getUser for server-confirmed user identity and never trusts getSession/user-editable metadata as role authorization.
