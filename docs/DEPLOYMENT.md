# Deployment and acceptance

## Application

Use a Node.js 22+ host supporting Next.js server routes, proxy cookies and persistent environment secrets (for example a Node container or Next.js hosting provider). This implementation targets the Next.js Node runtime; it is not a static export and has not been deployed to Sites or another host.

1. Review migrations against a staging Supabase project and apply them in order. Back up an existing database first. Do not use `supabase db reset` against production.
2. Configure environment variables from `.env.example` in the host secret manager. Set the exact HTTPS origin in `APP_URL` and Supabase Auth Site URL. Protect the service-role and job keys. Keep CDN caching disabled for authenticated pages, API responses, documents and archives.
3. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`. Start with `npm run start`; the default port is 3000. Terminate TLS at the hosting platform/reverse proxy and forward host/origin consistently.
4. Set request limits for documents (10 MB file plus multipart overhead), archive memory (50 MB input plus ZIP/PDF buffers), export duration and scheduled batches. Configure provider rate limits for login, ingestion, export and job routes. Do not cache personalized HTML.
5. Invite actual users through Supabase Auth, create the company, allocate roles and link employee UUIDs. Disable public Auth signup unless you intentionally support it. Use strong passwords and enforce organizational MFA through Supabase as appropriate.
6. Register trusted schedulers as described in README. Monitor their per-employee results. Install Windows connector with its dedicated service account and verify LAN reachability, device model, timezone, password and punch-code mapping.
7. Enable PostgreSQL backups/PITR appropriate to the service plan. Back up private Storage objects separately and test a coordinated database/object restoration. Keep connector SQLite backups protected with restricted NTFS access.

## First live acceptance test

Use synthetic employees in a dedicated staging company. Confirm login/session refresh and logout through real Supabase Auth. Create a second company with a separate account and test direct REST/Storage access attempts, not just hidden navigation. Verify all seven roles, branch transfers and employee self-service.

Upload a PDF/image, preview its signed URL, replace it, download an archive, and attempt to open another company's document. Inspect expiration notifications after maintenance. Test upload/storage cleanup failure handling before relying on deletion.

For each physical device model: compare device logs with ingested raw events, verify serial identity, clock offset and explicit punch meanings. Disconnect the PC/network, make punches, restart the connector, and compare counts after recovery. Confirm duplicate uploads do not create extra raw events. Verify logs remain on the device. Never retrieve fingerprint templates.

Run a shift including an overnight boundary and a split shift; review missing/uncertain punches and absences. Test paid and unpaid leave. Generate a draft payroll, independently approve it, make partial payments, reverse a payment and settle the balance. Verify advance and incident installments across two periods. Compare exported PDF/XLSX/CSV with the ledger, using local currency/contract rules and an independent payroll reviewer.

## Operational boundaries

- No bank transfer, tax filing or statutory contribution service is connected. Salary payments record actual external disbursements; they do not send money.
- Monetary storage supports two decimal places. Additional currency minor-unit precision, statutory formulas, accrual/carryover rules, jurisdiction-specific taxes and alternative partial-period proration require configuration/extension and review for your deployment.
- Basic salary is snapshotted from the employee record at generation. Salary history records changes, but retroactive/mid-period rate changes are not automatically weighted by effective date. Review and account for them before generating a period. Draft items are immutable; correction/void-and-regenerate support for an already generated draft requires an additional controlled workflow.
- Leave totals use whole scheduled working days, excluding holidays/rest days. Half-day/hourly leave, carryover and accrual engines are not implemented. Understating day counts for a longer range is rejected by the database.
- Split-shift segments must be ordered within one work date. Overnight shifts are supported as a single window. Shifts over 16 hours, overlapping assignments, unsupported device codes and disputed punches need manual review. Clock-change dates should be checked against device firmware; connector timestamps that are ambiguous at DST transitions are rejected.
- The selected device's latest successful full read is synchronization evidence, not proof that the physical device captured every punch. Absence still requires review. Device clocks, device retention and mapped user IDs remain operational responsibilities.
- The UI has no public invitation/password-reset flow; account invitations and recovery are handled by Supabase Auth administration. Company membership changes and payroll approval remain separate from Auth provisioning.
- PDF exports currently use built-in Latin fonts; unsupported scripts render as `?`. Add an embedded Unicode font before issuing reports requiring Somali names outside the supported glyph set or other scripts. Excel/CSV retain Unicode.
- No browser automation or physical-device test was performed in this environment. Live Supabase Auth, Storage HTTP APIs, deployment TLS/cookies, scheduler and real-device compatibility require the acceptance steps above.

## Maintenance

Use additive numbered migrations for future changes; do not edit an already-applied migration. `scripts/generate_schema.py` documents the initial table definition and is not a production migration runner. Regenerating it is only appropriate before first deployment; later schema changes must be new migrations.

Investigate mismatched document metadata and objects after network failures; metadata and Storage writes cannot be one transaction. Review audit logs for role changes and financial changes. Audit logs omit raw field values to avoid duplicating sensitive information; use controlled database backups for historical reconstruction.
