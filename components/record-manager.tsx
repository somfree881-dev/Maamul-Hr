"use client";
import Link from "next/link";
import { GenerateSalaries } from "./generate-salaries";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Plus, Search, Download, X, FolderOpen } from "lucide-react";
import { Button } from "./ui/button";
import { modules } from "@/lib/modules";
import {
  technicalField,
  displayLabel,
  displayValue,
} from "@/lib/display-records";
type Row = Record<string, unknown>;
export function RecordManager({
  module,
  rows,
  count,
  company,
  write,
  choices,
  createOnly = false,
}: {
  module: string;
  rows: Row[];
  count: number;
  company: string;
  write: boolean;
  choices: Record<string, { id: string; label: string }[]>;
  createOnly?: boolean;
}) {
  const m = modules[module],
    router = useRouter(),
    search = useSearchParams();
  if (module === "employees")
    rows = rows.map((row) => ({
      ...row,
      full_name: [row.first_name, row.middle_name, row.last_name]
        .filter(Boolean)
        .join(" "),
    }));
  const [editing, setEditing] = useState<Row | null>(
      search.get("new") && write ? {} : null,
    ),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const columns = (
    module === "employees"
      ? [
          "employee_number",
          "full_name",
          "phone",
          "district",
          "branch_id",
          "department_id",
          "position_id",
          "father_name",
        ]
      : m.fields.length
        ? [
            "employee_number",
            ...(m.employee ? ["employee_id"] : []),
            ...m.fields
              .filter(
                (f) =>
                  module !== "employees" ||
                  !["middle_name", "last_name"].includes(f.key),
              )
              .map((f) =>
                module === "employees" && f.key === "first_name"
                  ? "full_name"
                  : f.key,
              ),
          ]
        : Object.keys(rows[0] ?? {})
  )
    .filter(
      (key, i, a) =>
        a.indexOf(key) === i &&
        (!technicalField(key) ||
          !!m.fields.find((f) => f.key === key && f.relation)),
    )
    .filter((k) => module === "employees" || rows.some((r) => r[k] != null))
    .slice(0, 8);
  const format = (key: string, value: unknown) => {
    const field = m.fields.find((f) => f.key === key);
    if (field?.relation)
      return (
        choices[field.relation]?.find((c) => c.id === value)?.label ??
        "Unavailable"
      );
    return displayValue(value);
  };
  async function action(action: string, params: Row) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, params }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage("Completed successfully.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PEOPLE & OPERATIONS</div>
          <h1>
            {m.title}
            <span className="heading-dot">.</span>
          </h1>
          <p>{m.description}</p>
        </div>
        {write && !m.readonly && (
          <Button onClick={() => setEditing({})}>
            <Plus size={16} /> Add{" "}
            {module === "employees" ? "employee" : "record"}
          </Button>
        )}
        {write && module === "payroll" && (
          <Link className="button button-primary" href="/manage/periods?new=1">
            <Plus size={16} /> Custom salary period
          </Link>
        )}
      </div>
      {write && ["payroll", "periods"].includes(module) && (
        <GenerateSalaries company={company} />
      )}
      <div className="module-tabs module-navigation">
        {Object.entries(modules)
          .filter(
            ([key, v]) =>
              v.area === m.area &&
              (key === module ||
                (m.area === "finance"
                  ? ["advances", "payroll", "payments"]
                  : m.area === "attendance"
                    ? ["attendance", "leave", "shifts"]
                    : ["employees", "branches", "departments"]
                ).includes(key)),
          )
          .map(([k, v]) => (
            <Link
              key={k}
              href={`/manage/${k}`}
              prefetch={false}
              className={k === module ? "selected" : ""}
            >
              {v.title}
            </Link>
          ))}
        <label className="module-picker">
          <span>More sections</span>
          <select
            aria-label="Open another section"
            value={module}
            onChange={(event) => router.push(`/manage/${event.target.value}`)}
          >
            {Object.entries(modules)
              .filter(([, entry]) => entry.area === m.area)
              .map(([key, entry]) => (
                <option key={key} value={key}>
                  {entry.title}
                </option>
              ))}
          </select>
        </label>
      </div>
      {message && (
        <div role="status" className="alert">
          {message}
        </div>
      )}
      {["payroll", "periods", "advances", "deductions", "overtime"].includes(
        module,
      ) && (
        <div className="module-tabs" aria-label="Payroll entries">
          <Link href="/manage/advances?new=1">+ Salary advance</Link>
          <Link href="/manage/deductions?new=1">+ Authorized deduction</Link>
          <Link href="/manage/overtime?new=1">+ Overtime</Link>
        </div>
      )}
      <section className="panel">
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            router.push(
              `/manage/${module}?q=${encodeURIComponent(String(f.get("q") ?? ""))}&status=${encodeURIComponent(String(f.get("status") ?? ""))}`,
            );
          }}
        >
          <Search size={16} className="muted" />
          <input
            aria-label="Search records"
            name="q"
            placeholder="Search records…"
            defaultValue={search.get("q") ?? ""}
          />
          <select
            aria-label="Filter by status"
            name="status"
            defaultValue={search.get("status") ?? ""}
          >
            <option value="">All statuses</option>
            {[
              "active",
              "inactive",
              "pending",
              "approved",
              "present",
              "absent",
              "uncertain",
              "draft",
              "verified",
              "partially_paid",
              "paid",
              "locked",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <Button variant="outline" size="sm">
            Apply
          </Button>
          <div className="right">
            {["csv", "xlsx", "pdf"].map((format) => (
              <a
                className="button button-outline button-sm"
                href={`/api/export?module=${module}&company=${company}&format=${format}`}
                key={format}
              >
                <Download size={13} />
                {format.toUpperCase()}
              </a>
            ))}
          </div>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((k) => (
                  <th key={k}>{displayLabel(k)}</th>
                ))}
                {write && !createOnly && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)}>
                  {columns.map((k) => (
                    <td key={k}>
                      {k === "full_name" ||
                      k === "first_name" ||
                      k === "employee_number" ? (
                        <Link
                          className="text-link"
                          href={`/employees/${row.id}`}
                        >
                          {format(k, row[k])}
                        </Link>
                      ) : ["status", "employment_type"].includes(k) ? (
                        <span className="badge">{format(k, row[k])}</span>
                      ) : (
                        format(k, row[k])
                      )}
                    </td>
                  ))}
                  {write && !createOnly && (
                    <td>
                      <div className="row-actions">
                        {!m.readonly &&
                          !["leave", "overtime"].includes(module) && (
                            <button onClick={() => setEditing(row)}>
                              Edit
                            </button>
                          )}
                        {!m.readonly &&
                          m.area !== "finance" &&
                          !["leave", "overtime"].includes(module) && (
                            <button
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    "Delete this record? Related records may prevent deletion.",
                                  )
                                )
                                  return;
                                const r = await fetch(
                                  `/api/records/${module}`,
                                  {
                                    method: "DELETE",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      company_id: company,
                                      id: row.id,
                                    }),
                                  },
                                );
                                const body = await r.json();
                                setMessage(
                                  r.ok ? "Record deleted." : body.error,
                                );
                                router.refresh();
                              }}
                            >
                              Delete
                            </button>
                          )}
                        {module === "periods" && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              action("generate", { p_period: row.id })
                            }
                          >
                            Generate draft
                          </button>
                        )}
                        {module === "payroll" &&
                          ["draft", "verified", "paid"].includes(
                            String(row.status),
                          ) && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                action("transition", {
                                  p_run: row.id,
                                  p_status:
                                    row.status === "draft"
                                      ? "verified"
                                      : row.status === "verified"
                                        ? "approved"
                                        : "locked",
                                })
                              }
                            >
                              {row.status === "draft"
                                ? "Verify"
                                : row.status === "verified"
                                  ? "Approve"
                                  : "Lock"}
                            </button>
                          )}
                        {module === "payroll-items" && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              const amount = prompt("Payment amount");
                              if (!amount) return;
                              const reference = prompt(
                                "Unique payment reference",
                              );
                              if (!reference) return;
                              action("payment", {
                                p_item: row.id,
                                p_amount: amount,
                                p_reference: reference,
                                p_method: "bank",
                              });
                            }}
                          >
                            Record payment
                          </button>
                        )}
                        {module === "payments" && !row.reversal_of && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              const ref = prompt("Unique reversal reference");
                              if (ref)
                                action("reversal", {
                                  p_payment: row.id,
                                  p_reference: ref,
                                });
                            }}
                          >
                            Reverse
                          </button>
                        )}
                        {["leave", "overtime"].includes(module) &&
                          row.status === "pending" && (
                            <>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  action("review", {
                                    p_kind: module,
                                    p_id: row.id,
                                    p_approve: true,
                                    p_notes: "Reviewed",
                                  })
                                }
                              >
                                Approve
                              </button>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  action("review", {
                                    p_kind: module,
                                    p_id: row.id,
                                    p_approve: false,
                                    p_notes: "Rejected",
                                  })
                                }
                              >
                                Reject
                              </button>
                            </>
                          )}
                        {module === "corrections" &&
                          row.status === "pending" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                action("correction", {
                                  p_id: row.id,
                                  p_approve: true,
                                  p_notes: "Reviewed correction",
                                })
                              }
                            >
                              Approve correction
                            </button>
                          )}
                        {module === "devices" && (
                          <label
                            className="button button-outline"
                            style={{ cursor: busy ? "wait" : "pointer" }}
                          >
                            Install / rotate connector key
                            <input
                              type="file"
                              accept="application/json,.json"
                              disabled={busy}
                              style={{ display: "none" }}
                              onChange={async (event) => {
                                const file = event.currentTarget.files?.[0];
                                event.currentTarget.value = "";
                                if (!file) return;
                                setBusy(true);
                                setMessage("");
                                try {
                                  if (file.size > 2048)
                                    throw new Error(
                                      "Choose the hash-only enrollment JSON file.",
                                    );
                                  const enrollment = JSON.parse(
                                    await file.text(),
                                  );
                                  if (
                                    !/^[a-f0-9]{64}$/.test(
                                      enrollment.connector_key_hash ?? "",
                                    ) ||
                                    Object.keys(enrollment).some(
                                      (key) =>
                                        ![
                                          "token_env",
                                          "connector_key_hash",
                                        ].includes(key),
                                    )
                                  )
                                    throw new Error(
                                      "Invalid enrollment file. Never upload the connector .env file.",
                                    );
                                  const response = await fetch(
                                    "/api/connector-keys",
                                    {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        company_id: company,
                                        device_id: row.id,
                                        key_hash: enrollment.connector_key_hash,
                                      }),
                                    },
                                  );
                                  if (!response.ok)
                                    throw new Error(
                                      "Key installation failed. Check your company permissions.",
                                    );
                                  setMessage(
                                    "Connector hash installed. Previous key revoked. Restart the connector and run --test-api.",
                                  );
                                  router.refresh();
                                } catch {
                                  setMessage(
                                    "Unable to install key. Select the generated hash-only enrollment JSON; never upload .env.",
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            />
                          </label>
                        )}
                        {module === "devices" && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              action("backfill", { p_device: row.id })
                            }
                          >
                            Map historical events
                          </button>
                        )}
                        {module === "attendance" &&
                          row.status === "absent" &&
                          !row.reviewed && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                action("absence", { p_id: row.id })
                              }
                            >
                              Confirm absence
                            </button>
                          )}
                        {["advances", "recoveries"].includes(module) && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              const date = prompt(
                                "Installment due date (YYYY-MM-DD)",
                              );
                              const amount = prompt("Installment amount");
                              if (date && amount)
                                action("schedule", {
                                  p_kind:
                                    module === "advances"
                                      ? "advance"
                                      : "damage",
                                  p_parent: row.id,
                                  p_dates: [date],
                                  p_amounts: [amount],
                                });
                            }}
                          >
                            Schedule installment
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="empty">
              <FolderOpen size={32} />
              <strong>No {m.title.toLowerCase()} yet</strong>
              <p>
                {module === "payroll" && write
                  ? "Choose the salary period, then generate a draft. No payments are issued automatically."
                  : write && !m.readonly
                    ? "Create a record to get started."
                    : "Records will appear here when available and authorized."}
              </p>
              {module === "payroll" && write && (
                <Link
                  className="button button-primary"
                  href="/manage/periods?new=1"
                >
                  Start payroll
                </Link>
              )}
            </div>
          )}
        </div>
        <div className="pagination">
          <span>
            {count} records · Page {Number(search.get("page") ?? 1)}
          </span>
          <div>
            {Number(search.get("page") ?? 1) > 1 && (
              <Link href={`?page=${Number(search.get("page") ?? 1) - 1}`}>
                Previous
              </Link>
            )}
            {Number(search.get("page") ?? 1) * 25 < count && (
              <Link href={`?page=${Number(search.get("page") ?? 1) + 1}`}>
                Next
              </Link>
            )}
          </div>
        </div>
      </section>
      {editing && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={editing.id ? "Edit record" : "New record"}
          >
            <div className="modal-head">
              <h2>
                {editing.id ? "Edit" : "New"} {m.title.toLowerCase()}
              </h2>
              <button onClick={() => setEditing(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setMessage("");
                const f = new FormData(e.currentTarget);
                const data: Row = { company_id: company, id: editing.id };
                for (const field of m.fields) {
                  const value = f.get(field.key);
                  data[field.key] = value === "" ? null : value;
                }
                try {
                  const r = await fetch(`/api/records/${module}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                  });
                  const result = await r.json();
                  if (!r.ok) throw new Error(result.error);
                  setEditing(null);
                  setMessage("Record saved.");
                  router.refresh();
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : "Save failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="form-grid">
                {m.fields
                  .filter(
                    (field) =>
                      !createOnly ||
                      module !== "advances" ||
                      ["employee_id", "requested_amount", "reason"].includes(
                        field.key,
                      ),
                  )
                  .map((field) => (
                    <label key={field.key}>
                      {field.label}
                      {field.required ? " *" : ""}
                      {field.relation ? (
                        <select
                          name={field.key}
                          required={field.required}
                          defaultValue={
                            typeof editing[field.key] === "object" &&
                            editing[field.key] !== null
                              ? JSON.stringify(editing[field.key])
                              : String(editing[field.key] ?? "")
                          }
                        >
                          <option value="">Select…</option>
                          {choices[field.relation]?.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      ) : field.options ? (
                        <select
                          name={field.key}
                          defaultValue={String(
                            editing[field.key] ?? field.options[0],
                          )}
                        >
                          {field.options.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : field.type === "textarea" ? (
                        <textarea
                          name={field.key}
                          required={field.required}
                          defaultValue={
                            typeof editing[field.key] === "object" &&
                            editing[field.key] !== null
                              ? JSON.stringify(editing[field.key])
                              : String(editing[field.key] ?? "")
                          }
                        />
                      ) : (
                        <input
                          name={field.key}
                          required={field.required}
                          type={field.type ?? "text"}
                          step={field.type === "number" ? "0.01" : undefined}
                          min={field.type === "number" ? 0 : undefined}
                          defaultValue={String(
                            (typeof editing[field.key] === "object" &&
                            editing[field.key] !== null
                              ? JSON.stringify(editing[field.key])
                              : editing[field.key]) ??
                              (field.key === "currency"
                                ? "USD"
                                : field.key === "timezone"
                                  ? "Africa/Mogadishu"
                                  : field.key === "port"
                                    ? 4370
                                    : field.key === "divisor"
                                      ? 26
                                      : ""),
                          )}
                        />
                      )}
                    </label>
                  ))}
              </div>
              {message && (
                <p role="alert" className="alert error">
                  {message}
                </p>
              )}
              <div className="modal-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button disabled={busy}>
                  {busy ? "Saving…" : "Save record"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
