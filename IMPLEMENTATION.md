# Maamul HR implementation ledger

Repository inspection: the only existing file was `Maamul HR Team Logo.png`. No source, auth, Lovable artifacts, database configuration, migrations, or user records were present. Logo preserved.

Plan: (1) additive tenant schema, RLS, auth and organization setup; (2) employee CRUD and private storage; (3) shifts, attendance and leave; (4) durable Python device connector and secure ingestion; (5) transactional payroll, approvals, recoveries and payments; (6) database reports and exports; (7) automated checks and deployment guide.

All migrations are delivered for operator review and application. No remote schema is automatically changed. Live verification requires a Supabase project, test accounts and a compatible physical device. Implementation and verification details are maintained in docs/VERIFICATION.md.
