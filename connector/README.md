# Windows ZKTeco connector

Automatic startup: double-click **Setup-WindowsConnector.cmd** and accept the administrator prompt. See [Windows background setup](WINDOWS-SERVICE.md) for installation, secure logs, status, reconnect testing and uninstall.

Compatible standalone devices only: confirm model/firmware support with your vendor. `pyzk` TCP/UDP port 4370 is not the ADMS push protocol. ADMS/vendor-API devices require a separate vendor adapter. No fingerprint templates are requested, transmitted or stored. This program never clears attendance or disables the device.

1. Install Python 3.11+ for Windows. In this directory run `py -m venv .venv`, then `.venv\Scripts\python.exe -m pip install -r requirements.txt`.
2. Copy `.env.example` to `.env`, and `devices.example.json` to `devices.json`. Keep these private and outside source control.
3. Run `py provision_key.py --token-env DEVICE_ONE_TOKEN`. It writes a 384-bit random key directly to `.env`, restricted to the current account, without printing it. In Maamul Devices, choose the correct existing device and **Install / rotate connector key**; select `.secrets/DEVICE_ONE_TOKEN.json`. Only its SHA-256 hash is uploaded. For a new device, use that file's `connector_key_hash` in the registration form. Never upload `.env`. See [SECURE-AUTH.md](SECURE-AUTH.md).
4. Configure the physical device IP, communication password and clock. Permit required LAN traffic; do not expose port 4370 to the internet. Use an HTTPS application endpoint.
5. Map each device user ID to a company employee in Maamul. Confirm the device's punch-code semantics and adjust `punch_map`; omit unknown values so records require inference/review.
6. Test connectivity: `.venv\Scripts\python.exe connector.py --config devices.json --test`. Test full sync: `.venv\Scripts\python.exe connector.py --config devices.json --once`.
7. Run continuously: `.venv\Scripts\python.exe connector.py --config devices.json`.

For automatic startup, create a Windows Task Scheduler task with trigger **At startup**, choose a dedicated restricted account, and select **Run whether user is logged on or not**. Program: full path to `.venv\Scripts\python.exe`; arguments: full path to `connector.py --config FULL_PATH\devices.json`; **Start in**: connector directory. Enable restart on failure and disable the execution time limit. Protect `.env`, the SQLite queue and logs with NTFS permissions for that account only. Use only one connector process per queue file.

Each poll reads historical device logs. SQLite WAL/FULL persistence keeps unsent records across restarts; failed HTTP batches remain pending. Retries back off with jitter to one hour. A repeated successful upload after an acknowledgement loss is harmless because PostgreSQL rejects duplicate device/source keys. Sent keys are retained locally for historical deduplication; monitor disk usage and securely back up the queue. Local queue data contains user IDs/timestamps and must be protected.

An empty heartbeat is sent only after a successful read and complete queue drain. No heartbeat is sent when the device is unreachable. Offline logs sync when the PC and device reconnect, subject to the device's retention capacity. Logs contain error types and device UUIDs; inspect network, credentials, clock, firmware and API status when errors repeat. Rotate device credentials by changing the app digest and local token together. Hardware, DST clock behavior and Windows Task Scheduler require on-site acceptance testing.

Employee roster import: see [Device employee import activation](../docs/DEVICE-EMPLOYEE-IMPORT.md). Update the connector only after the application and new staging migration are deployed; no token rotation is needed. Employee creation requires administrator preview/confirmation.
