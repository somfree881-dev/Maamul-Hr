# Windows automatic background connector

Double-click `Setup-WindowsConnector.cmd` and accept the Windows administrator (UAC) prompt. Setup installs dependencies using the existing Python runtime and preserves the connector key/hash and SQLite queue. Internet is needed for pip on first installation. Python 3.11+ must be installed for all users (not in a personal AppData directory), so Local Service can run it before login.

The installed deployment is `C:\ProgramData\MaamulHRConnector` (or the Windows ProgramData location). The task **Maamul HR Attendance Connector** runs as **Local Service**, starts 30 seconds after Windows boots, and uses `pythonw.exe` in a noninteractive session. It needs no user password and no login. This is a Task Scheduler background service, not a Windows SCM service. Code/configuration are writable only by administrators/SYSTEM; Local Service can read the token and write only the state directory. No Supabase service-role key is installed in the connector.

Manual installation from Administrator PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Maamul Hr\connector\Install-WindowsConnector.ps1" -StopExisting
```

`-StopExisting` takes over only manual Python processes using this connector's source virtual environment and script. Without that switch, setup asks you to close the manual process first. Existing installed state remains authoritative during upgrades. SQLite's backup API copies an existing source queue on first install, including unsent records. Reinstalling copies the source `.env` and devices configuration again; keep them up to date when rotating keys or changing device IPs. Do not launch a second source connector while the installed task is running (its copied queue is separate); server deduplication still rejects repeated source keys.

Setup never clears the physical clock's attendance records, changes Supabase tables, opens firewall ports, or configures Maamul HR's web server. With `http://localhost:3000/api/connector`, the local Next.js server must also be running for uploads. For uninterrupted operation after reboot, point `connector/devices.json` at your deployed HTTPS Maamul HR URL, then rerun setup. Never use a public HTTP endpoint. Reconnecting cannot work while the computer is powered off; records retained by the clock are collected after restart, subject to device retention. Keep Wi-Fi/LAN access and a stable/reserved device IP.

Operations (Administrator PowerShell):

```powershell
& "D:\Maamul Hr\connector\Manage-WindowsConnector.ps1" -Action Status
& "D:\Maamul Hr\connector\Manage-WindowsConnector.ps1" -Action Restart
& "D:\Maamul Hr\connector\Manage-WindowsConnector.ps1" -Action Stop
& "D:\Maamul Hr\connector\Manage-WindowsConnector.ps1" -Action Uninstall
```

Uninstall removes the task only. Credentials, queue, history and logs remain protected in ProgramData; no employee or Supabase records are deleted. Stop the task before manually running tests against the installed configuration. Do not print or upload the installed `.env`.

Recovery and verification:

1. `Status` must show Running; `synchronized` in the rotating log confirms a successful device read plus API delivery. Running alone does not prove connectivity.
2. In Maamul HR → Attendance, check the device's last synchronization timestamp. After 15 minutes with no completed heartbeat the page shows **No recent sync**; refresh the page to update it. Missing heartbeat does not prove employee absence.
3. Disconnect the PC network, make punches on the clock, then reconnect. The same process retries with exponential backoff and jitter (maximum about one hour). A restart can trigger an immediate attempt. API downtime still permits collection from a reachable clock into SQLite. Unsent records are acknowledged only after server success; repeated uploads use existing source-key deduplication.
4. Reboot Windows and verify the task starts before login. Check no terminal is opened and the timestamp advances when device and API are reachable.
5. Trigger Start twice: Task Scheduler ignores a second instance, and the process has an OS-owned queue lock. A crash releases that lock; the scheduler retries after one minute. Startup errors log exception types only, not response bodies, tokens or employee rows.

Logs are bounded to the current 2 MB file plus five rotated files under `state`. Preserve the SQLite database and WAL files together for backup; use SQLite backup for a consistent live backup. A source key is retained for replay protection. Disk capacity should be monitored; the program does not discard unsent attendance to make space.

Implemented tests cover offline API collection, no false synchronization heartbeat, retry delivery, persistent queue, event deduplication, single-instance lock release and setup backup preservation. Actual boot/UAC/task-account/hardware acceptance must be confirmed on the target Windows installation.
