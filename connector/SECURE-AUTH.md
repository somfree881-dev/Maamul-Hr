# Secure per-device connector authentication

The raw key is generated locally using Python `secrets.token_urlsafe(48)` (384 random bits). Its 64-character value lives only in the connector's ignored `.env`. SHA-256 is computed locally and written to `.secrets/DEVICE_ONE_TOKEN.json`. Both files get current-account-only NTFS ACLs on Windows (0600 on POSIX). The raw key is never printed, included in command arguments, uploaded to the browser, or stored in Supabase. Use separate environment variables/credentials for every device.

## Enrollment

1. In `connector/`, run `py provision_key.py --token-env DEVICE_ONE_TOKEN`. An existing nonempty credential is not overwritten unless `--rotate` is explicitly used. Keep this directory on an encrypted local disk; anyone who controls the connector account can read its local environment.
2. In Maamul HR → Devices choose the correct existing device. Click **Install / rotate connector key** and select `connector/.secrets/DEVICE_ONE_TOKEN.json`. Only this hash-only file may be selected. Company Admin/HR authorization, same-origin protection and Supabase RLS are enforced. The update targets the selected device and company, preserves all attendance records and uses the existing audit trigger. For a new device, copy only the `connector_key_hash` value into its registration form. No database migration is required.
3. On the **Next.js server only**, set `SUPABASE_SERVICE_ROLE_KEY` in the root `.env.local` or hosting secret store. This key is currently missing in this workspace. It is distinct from the device key, must not be placed in the Python config and must never have a `NEXT_PUBLIC_` prefix. Restart/rebuild the application after configuration changes. Never paste credentials into chat or a terminal command.
4. Copy `devices.example.json` to ignored `devices.json` if needed. Set its endpoint to `http://localhost:3000/api/connector` for same-computer development, or `https://YOUR_HOST/api/connector` for deployment. Set the real device UUID, LAN IP, supported protocol and `Africa/Mogadishu`; set `token_env` to `DEVICE_ONE_TOKEN`. The JSON holds the variable name, never the token. Use the final HTTPS URL: all HTTP redirects are rejected to prevent forwarding Authorization headers. HTTP is permitted only on loopback. URL credentials, query strings and fragments are rejected.
5. Restart the connector after changing `.env`. The explicitly configured local `.env` overrides stale inherited device tokens. If Windows Task Scheduler uses a different account, grant only that dedicated account read access to `.env` through Windows file security settings; do not grant Everyone/Users. Keep write access restricted to the administrator provisioning keys.

## Safe testing

From `connector/`, use your virtual environment's Python:

```powershell
.venv\Scripts\python.exe connector.py --config devices.json --test-api
.venv\Scripts\python.exe connector.py --config devices.json --test
.venv\Scripts\python.exe connector.py --config devices.json --once
```

`--test-api` verifies the bearer credential against the selected device's stored hash without uploading punches, changing attendance or certifying synchronization coverage. It logs only success/failure and the device UUID. `--test` separately tests physical pyzk connectivity. `--once` reads historical device events, drains the durable queue and sends a completion heartbeat only after success. Never use an empty synchronization batch as an authentication-only test.

401 means the key/device is not authorized. 503 means server ingestion credentials are not configured. The connector logs exception types, never Authorization headers, response bodies or raw keys. Configure hosting/proxy/APM logs to redact Authorization and avoid request/response body capture on connector endpoints; third-party logging configuration cannot be enforced by application code.

## Immediate rotation

Stop the connector. Run `py provision_key.py --token-env DEVICE_ONE_TOKEN --rotate`. This replaces the local raw key and enrollment hash without printing either raw key. In the matching device row import the regenerated enrollment JSON, restart the connector, then run `--test-api`. Updating the device hash immediately invalidates the old key; there is no overlap window. Unsent events remain in SQLite and retry after rotation. If enrollment fails, retain the new local key and retry the same enrollment file; generating again is unnecessary. Supabase stores only the current hash; audit logs record changed field names, never old/new values.

`.env*`, `connector/devices.json`, `.secrets/`, SQLite files and logs are ignored by Git. Do not add them with `git add -f` or upload them to GitHub. If a raw key ever leaks, rotate immediately; deleting a file or commit does not revoke it. No secrets appear in example files or tests. Local unit/integration tests do not prove a live hosted device or network connection.
