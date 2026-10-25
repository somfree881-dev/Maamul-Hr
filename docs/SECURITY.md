# Security model

Company → Branch → Department → Employee is enforced with composite `(company_id,id)` foreign keys, authenticated company memberships, RLS and database workflow functions. A company admin or super admin is scoped to explicitly assigned companies; there is no implicit global super-admin bypass. Browser code never receives the service-role key.

| Role                        | Access                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Super Admin / Company Admin | Explicitly joined companies, organization settings, private records, finance, membership administration; independent payroll approval                   |
| HR Manager                  | Company employee/private HR records, attendance, leave, documents and incident review; no payroll accounting writes                                     |
| Branch Manager / Supervisor | Assigned branch attendance/requests and restricted employee directory; no private personnel/financial files                                             |
| Accountant                  | Company financial ledger, authorized deductions/recoveries/payments, limited employee directory and attendance summaries; no private employee documents |
| Employee                    | Own profile, documents, leave, attendance, performance and financial history; own leave/advance/correction requests                                     |

Permission checks exist in frontend routes, API operations, SQL RPCs, RLS, exports and Storage policies. A hidden button is not a security boundary. The company selector is an untrusted cookie: membership and RLS re-check its company ID.

Security-definer functions pin `search_path=public`, validate membership/branch/employee scope and have explicit execution grants. Service-only ingestion, maintenance and scheduled attendance functions are not executable by authenticated or anonymous users. Trigger functions normalize branch scope from actual employee records before policy evaluation.

Raw events, payroll runs/items/approvals, payment allocations and repayments cannot be written directly by authenticated REST users. Payroll generation locks periods, eligible employees and recovery sources; payments serialize on the payroll run. Unique constraints prevent repeated source events, period generation, installment dates, payment references and reversals. Approved payroll items are immutable. A generator cannot approve its own payroll.

Private files use `company_uuid/employee_uuid/random_uuid.ext`; metadata paths must match the employee/company. Upload/download/delete Storage policies independently verify private-record permissions. Preview links expire after 60 seconds and must be treated as bearer capabilities until expiry. Files are never put in public buckets. ZIPs are built from RLS-readable rows and independently authorized downloads.

Device credentials are random per-device bearer tokens. Only SHA-256 digests are stored; the ingestion endpoint compares them in constant time, validates timestamp offsets and bounds batches at 500 records. Use HTTPS and provider rate limits. Possession of a device token permits submitting punches for that registered device: restrict connector host access and rotate tokens if compromised. Logs do not contain biometric templates, bearer tokens, employee names or full request payloads.

Audit rows are written by database triggers and cannot be inserted/updated/deleted by authenticated clients. They contain actor, company, record identity, action and changed field names rather than sensitive field values. Database-owner/service credentials remain privileged and require operational protection.

Unit and real PostgreSQL checks cover many unauthorized-access paths. The isolated harness stubs Supabase's `auth.users`, `auth.uid()` and Storage table contracts; it does not validate the hosted Auth service, HTTP gateway, Storage signing service or production configuration. Those require staging acceptance testing.
