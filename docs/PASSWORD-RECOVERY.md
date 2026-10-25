# Email recovery and optional login names

Existing Supabase accounts continue to sign in with email/password. Login also accepts a unique case-insensitive login name chosen after sign-in under avatar → Your account (`/account`). There is no public signup, role assignment, or public email lookup. If a user forgets their login name, email still works. Password recovery always uses their existing Supabase account email.

One-time Supabase configuration:

1. Authentication → URL Configuration: set Site URL to your deployed HTTPS app origin (locally `http://localhost:3000`). Add `http://localhost:3000/auth/callback` and the deployed `https://YOUR_DOMAIN/auth/callback` to Redirect URLs. Allow only the origins you operate.
2. Keep the standard reset email `ConfirmationURL` link. The in-app Forgot password flow uses PKCE and opens `/auth/callback`, where the code is exchanged and redirected only to `/reset-password`. Open the email link in the same browser that requested it. Expired/invalid links require a new request. The callback also supports a custom recovery template using `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`; this verifies the one-time token on the server and never accepts an arbitrary redirect destination.
3. Ensure Supabase email delivery/SMTP is configured. Default sender restrictions/rate limits can prevent delivery to non-team users; configure your own SMTP for production. Do not put SMTP secrets in NEXT_PUBLIC variables.
4. Review and run `supabase/migrations/202610250002_login_names.sql` in SQL Editor after approval. This creates one new account-name table (no duplicate employee/auth tables), own-row RLS, an authenticated own-name setter, and a service-role-only email resolver. No existing records or migrations are replaced. The source is validated with isolated PostgreSQL fixtures; the migration is not automatically applied to your project.

Usage: Login → Forgot password → enter email → follow link → choose and confirm a 12–128 character password → sign in again. Avatar → Your account lets the user save a display name and unique login name. Display-name metadata is not an authorization source. Role/company/branch remain controlled by existing memberships/RLS.

The login API returns only a success flag; it never returns the resolved email, bearer token or refresh token. Unknown login names and incorrect passwords use the same generic authentication error. Supabase Auth's password authentication protection still applies. Username login needs the server-only Supabase service-role configuration; email login and recovery do not depend on the username migration. Browser pages receive only the public project key. No reset emails are sent by automated tests.

Verified: unit tests for validation, exact public routes, generic login failures, CSRF protection and callback redirect safety; existing privacy checks; production build. Live email delivery and the final emailed-link/password change need acceptance testing after your project's Redirect URLs and SMTP are configured. Do not send passwords, recovery codes or email reset links in chat or logs.
