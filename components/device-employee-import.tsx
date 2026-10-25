"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ImportPreview } from "@/lib/device-import";
export function DeviceEmployeeImport({
  device,
  company,
}: {
  device: string;
  company: string;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [requestId, setRequestId] = useState<string | null>(null),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [choices, setChoices] = useState<Record<string, string>>({}),
    [confirmed, setConfirmed] = useState(false),
    [start, setStart] = useState("");
  const needsNew = Object.values(choices).includes("create");
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  async function send(action: string, extra: Record<string, unknown> = {}) {
    const r = await fetch("/api/device-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, company, device, ...extra }),
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error || "Import request failed");
    return result;
  }
  async function load(id: string) {
    const result = await send("preview", { request_id: id });
    const p = result.data as ImportPreview;
    setPreview(p);
    setChoices(
      Object.fromEntries(
        p.users.map((u) => [
          u.device_user_id,
          u.kind === "new" ? "create" : u.employee_id ? u.employee_id : "skip",
        ]),
      ),
    );
    setConfirmed(false);
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  useEffect(() => {
    if (
      !open ||
      !requestId ||
      !["waiting", "uploading"].includes(preview?.status ?? "")
    )
      return;
    const timer = setInterval(() => {
      void load(requestId).catch((e) => setMessage(e.message));
    }, 5000);
    return () => clearInterval(timer);
  }, [open, requestId, preview?.status]);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void run(async () => {
            const result = await send("latest");
            setRequestId(result.request_id);
            if (result.request_id) await load(result.request_id);
          });
        }}
      >
        Import Employees from Device
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            className="device-import-dialog"
            onCancel={() => setOpen(false)}
          >
            <div className="modal-head">
              <h2>Import employees from device</h2>
              <button
                aria-label="Close import"
                type="button"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <p>
              Read user IDs and names only. Existing profiles, salaries,
              attendance timestamps and payroll will not be overwritten.
            </p>
            <div className="device-import-actions">
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await send("request");
                    setRequestId(r.request_id);
                    await load(r.request_id);
                  })
                }
              >
                Request device users
              </button>
              {requestId && (
                <button
                  disabled={busy}
                  onClick={() => void run(() => load(requestId))}
                >
                  Refresh preview
                </button>
              )}
              {requestId &&
                (!preview ||
                  ["waiting", "uploading", "ready"].includes(
                    preview.status,
                  )) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await send("cancel", { request_id: requestId });
                        setPreview(null);
                        setRequestId(null);
                        setMessage(
                          "Request cancelled. You may request a fresh device snapshot.",
                        );
                      })
                    }
                  >
                    Cancel this request
                  </button>
                )}
            </div>
            {preview && (
              <>
                <p>
                  <strong>{preview.device_name}</strong> · {preview.timezone} ·
                  Status: {preview.status}
                </p>
                {["waiting", "uploading"].includes(preview.status) && (
                  <p role="status">
                    Waiting for the Windows connector to read a complete roster.
                    It must be online and updated to support employee import.
                  </p>
                )}
                {preview.status === "error" && (
                  <p className="alert error">
                    Device roster could not be read ({preview.error}). Check the
                    device network and request again. Existing employees and
                    attendance are unchanged.
                  </p>
                )}
                <div className="device-import-counts">
                  {[
                    ["New users", preview.new_users],
                    ["Existing matches", preview.existing_matches],
                    ["Conflicts", preview.conflicts],
                    ["Historical logs", preview.historical_records],
                    ["Unmapped logs", preview.unmapped_attendance],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                {preview.status === "ready" && (
                  <>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Device user ID</th>
                            <th>Device name</th>
                            <th>Match</th>
                            <th>Import decision</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.users.map((user) => (
                            <tr key={user.device_user_id}>
                              <td>{user.device_user_id}</td>
                              <td>{user.name || "No name"}</td>
                              <td>
                                {user.kind}
                                {user.reason && <p>{user.reason}</p>}
                              </td>
                              <td>
                                <select
                                  aria-label={`Import choice for ${user.name || user.device_user_id}`}
                                  disabled={busy || user.kind === "mapped"}
                                  value={choices[user.device_user_id] ?? "skip"}
                                  onChange={(e) => {
                                    setChoices({
                                      ...choices,
                                      [user.device_user_id]: e.target.value,
                                    });
                                    setConfirmed(false);
                                  }}
                                >
                                  <option value="skip">Skip</option>
                                  {user.kind === "new" && (
                                    <option value="create">
                                      Create new employee
                                    </option>
                                  )}
                                  {preview.employees.map((e) => (
                                    <option key={e.id} value={e.id}>
                                      {e.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <label>
                      Actual employment start date (new profiles only)
                      <input
                        type="date"
                        value={start}
                        onChange={(e) => {
                          setStart(e.target.value);
                          setConfirmed(false);
                        }}
                        required
                      />
                    </label>
                    <p>
                      New profiles start inactive with zero salary. Confirm
                      employment dates and salary with HR before payroll. Device
                      history dates are not inferred as employment dates.
                    </p>
                    <label className="device-import-confirm">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                        disabled={busy}
                      />
                      <span>
                        I reviewed the names, matches and skipped conflicts, and
                        approve this import and historical mapping.
                      </span>
                    </label>
                    <button
                      className="button button-primary"
                      disabled={busy || !confirmed || (needsNew && !start)}
                      onClick={() =>
                        void run(async () => {
                          const decisions = preview.users.map((u) => {
                            const choice = choices[u.device_user_id] ?? "skip";
                            return {
                              device_user_id: u.device_user_id,
                              action:
                                choice === "create"
                                  ? "create"
                                  : choice === "skip"
                                    ? "skip"
                                    : "link",
                              ...(choice !== "create" && choice !== "skip"
                                ? { employee_id: choice }
                                : {}),
                            };
                          });
                          await send("confirm", {
                            request_id: requestId,
                            preview_token: preview.preview_token,
                            ...(start ? { start_date: start } : {}),
                            confirmed: true,
                            decisions,
                          });
                          await load(preview.id);
                          router.refresh();
                          setMessage(
                            "Import completed. Historical attendance was linked without changing its timestamps.",
                          );
                        })
                      }
                    >
                      {busy ? "Importing…" : "Confirm import and map history"}
                    </button>
                  </>
                )}
                {preview.results && (
                  <div className="alert" role="status">
                    Created: {preview.results.created}. Linked:{" "}
                    {preview.results.linked}. Skipped: {preview.results.skipped}
                    . New mappings: {preview.results.mappings_created}.
                    Historical events mapped: {preview.results.history_mapped}.
                    Still unmapped: {preview.results.unmapped_remaining}.
                  </div>
                )}
              </>
            )}
            {message && (
              <div role="status" className="alert">
                {message}
              </div>
            )}
          </dialog>,
          document.body,
        )}
    </>
  );
}
