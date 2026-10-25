"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function Documents({
  company,
  employee,
  documents,
  write,
}: {
  company: string;
  employee: string;
  documents: Record<string, unknown>[];
  write: boolean;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  const [replacing, setReplacing] = useState<Record<string, unknown> | null>(
    null,
  );
  return (
    <section className="panel profile-section">
      <h2>Private documents</h2>
      {message && (
        <p className="alert" role="status">
          {message}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Expiration</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={String(d.id)}>
              <td>{String(d.title)}</td>
              <td>{String(d.document_type)}</td>
              <td>{String(d.expiration_date ?? "—")}</td>
              <td>
                <div className="row-actions">
                  <a
                    href={`/api/documents?company=${company}&id=${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview
                  </a>
                  <a
                    href={`/api/documents?company=${company}&id=${d.id}&download=1`}
                  >
                    Download
                  </a>
                  {write && (
                    <button disabled={busy} onClick={() => setReplacing(d)}>
                      Replace
                    </button>
                  )}
                  {write && (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm("Delete this private document?")) return;
                        setBusy(true);
                        const r = await fetch("/api/documents", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            company_id: company,
                            id: d.id,
                          }),
                        });
                        const b = await r.json();
                        setMessage(r.ok ? "Document deleted." : b.error);
                        setBusy(false);
                        router.refresh();
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!documents.length && (
        <p className="empty compact">No authorized documents.</p>
      )}
      {write && (
        <form
          key={String(replacing?.id ?? "new")}
          className="file-upload"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            f.set("company_id", company);
            f.set("employee_id", employee);
            if (replacing) f.set("replace_id", String(replacing.id));
            setBusy(true);
            try {
              const r = await fetch("/api/documents", {
                method: "POST",
                body: f,
              });
              const b = await r.json();
              if (!r.ok) throw new Error(b.error);
              setMessage(
                b.warning ??
                  (replacing ? "Document replaced." : "Document uploaded."),
              );
              setReplacing(null);
              form.reset();
              router.refresh();
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Upload failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <label>
              Document title
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={String(replacing?.title ?? "")}
              />
            </label>
            <label>
              Document type
              <select
                name="document_type"
                defaultValue={String(
                  replacing?.document_type ?? "employment_contract",
                )}
              >
                {[
                  "employment_contract",
                  "national_id_front",
                  "national_id_back",
                  "passport",
                  "work_permit",
                  "certificate",
                  "guarantor",
                  "appointment_letter",
                  "warning_letter",
                  "photo",
                  "leave_evidence",
                  "other",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Issue date
              <input
                name="issue_date"
                type="date"
                defaultValue={String(replacing?.issue_date ?? "")}
              />
            </label>
            <label>
              Expiration date
              <input
                name="expiration_date"
                type="date"
                defaultValue={String(replacing?.expiration_date ?? "")}
              />
            </label>
            <label>
              File (PDF/JPEG/PNG, max 10 MB)
              <input
                name="file"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required
              />
            </label>
            <label>
              Notes
              <textarea name="notes" />
            </label>
          </div>
          <Button disabled={busy}>
            {busy
              ? "Uploading…"
              : replacing
                ? "Replace document"
                : "Upload private document"}
          </Button>
          {replacing && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setReplacing(null)}
            >
              Cancel replacement
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
