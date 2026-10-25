import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { z } from "zod";
import { context } from "@/lib/context";
import { canWrite, canViewModule } from "@/lib/modules";
import { Documents } from "@/components/documents";
import { DateTime } from "luxon";
import { reportRecords } from "@/lib/report-records";
import { displayLabel } from "@/lib/display-records";
const tabs = [
  "overview",
  "attendance",
  "leave",
  "payroll",
  "financial",
  "documents",
  "performance",
];
export default async function Profile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const s = await context();
  if (!s?.membership)
    return <div className="alert">Connect your workspace first.</div>;
  if (!canViewModule(s.membership.role, "employees")) forbidden();
  const company = s.membership.company_id;
  const { data: e, error } = await s.db
    .from("employees")
    .select("*")
    .eq("id", id)
    .eq("company_id", company)
    .single();
  if (error || !e) notFound();
  let photoUrl: string | undefined;
  const { data: photo } = await s.db
    .from("employee_documents")
    .select("storage_path,mime_type")
    .eq("company_id", company)
    .eq("employee_id", id)
    .eq("document_type", "photo")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (photo && photo.mime_type.startsWith("image/")) {
    const { data } = await s.db.storage
      .from("employee-documents")
      .createSignedUrl(photo.storage_path, 60);
    photoUrl = data?.signedUrl;
  }
  const p = await searchParams,
    tab = tabs.includes(p.tab ?? "") ? p.tab! : "overview";
  let rows: Record<string, unknown>[] = [];
  let docs: Record<string, unknown>[] = [];
  if (tab === "documents") {
    const result = await s.db
      .from("employee_documents")
      .select("*")
      .eq("company_id", company)
      .eq("employee_id", id)
      .order("created_at", { ascending: false });
    if (result.error) throw new Error(result.error.message);
    docs = result.data ?? [];
  }
  const table = (
    {
      attendance: "attendance_summaries",
      leave: "leave_requests",
      payroll: "payroll_balances",
      financial: "salary_payments",
      performance: "employee_performance_reviews",
    } as Record<string, string>
  )[tab];
  if (table) {
    const result = await s.db
      .from(table)
      .select("*")
      .eq("company_id", company)
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) throw new Error(result.error.message);
    rows = result.data ?? [];
  }
  const [overview] = await reportRecords(s.db, company, [e]);
  rows = await reportRecords(s.db, company, rows);
  return (
    <>
      <section className="panel profile-hero">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`${e.first_name} ${e.last_name}`}
            className="avatar"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span className="avatar">
            {e.first_name[0]}
            {e.last_name[0]}
          </span>
        )}
        <div>
          <div className="eyebrow">EMPLOYEE PROFILE</div>
          <h1>
            {e.first_name} {e.middle_name} {e.last_name}
          </h1>
          <p>
            {e.employee_number} · {e.employment_type.replaceAll("_", " ")} ·{" "}
            <span className="badge">{e.status}</span>
          </p>
        </div>
        <div className="heading-actions" style={{ marginLeft: "auto" }}>
          <a
            className="button button-outline"
            href={`/api/export?module=employees&company=${company}&employee=${id}&format=pdf`}
          >
            Profile PDF
          </a>
          <a
            className="button button-primary"
            href={`/api/archive?company=${company}&employee=${id}`}
          >
            Complete archive ZIP
          </a>
        </div>
      </section>
      <form className="filters-form" action="/api/monthly-report" method="get">
        <input type="hidden" name="company" value={company} />
        <input type="hidden" name="employee" value={id} />
        <label>
          Monthly report
          <input
            type="month"
            name="month"
            defaultValue={
              p.month ??
              DateTime.now().setZone("Africa/Mogadishu").toFormat("yyyy-MM")
            }
            required
          />
        </label>
        <label>
          Format
          <select name="format">
            <option value="pdf">PDF</option>
            <option value="xlsx">Excel</option>
            <option value="csv">CSV</option>
          </select>
        </label>
        <button className="button button-outline">
          Download employee report
        </button>
      </form>
      <div className="module-tabs profile-tabs">
        {tabs.map((t) => (
          <Link
            className={tab === t ? "selected" : ""}
            key={t}
            href={`?tab=${t}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </div>
      {tab === "overview" && (
        <section className="panel">
          <dl className="profile-grid">
            {Object.entries(overview)
              .filter(
                ([k]) =>
                  !["id", "company_id", "photo_path", "user_id"].includes(k),
              )
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{displayLabel(k)}</dt>
                  <dd>{String(v ?? "—")}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}
      {tab === "documents" && (
        <Documents
          company={company}
          employee={id}
          documents={docs}
          write={canWrite(s.membership.role, "private")}
        />
      )}
      {table && (
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {Object.keys(rows[0] ?? {})
                    .filter(
                      (k) =>
                        ![
                          "company_id",
                          "id",
                          "employee_id",
                          "branch_id",
                        ].includes(k),
                    )
                    .map((k) => (
                      <th key={k}>{displayLabel(k)}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {Object.entries(r)
                      .filter(
                        ([k]) =>
                          ![
                            "company_id",
                            "id",
                            "employee_id",
                            "branch_id",
                          ].includes(k),
                      )
                      .map(([k, v]) => (
                        <td key={k}>{String(v ?? "—")}</td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="empty">No authorized {tab} records.</div>
            )}
          </div>
        </section>
      )}
      <div className="module-tabs" style={{ marginTop: 24 }}>
        {[
          "contacts",
          "guarantors",
          "contracts",
          "advances",
          "recoveries",
          "advance-balances",
          "damage-balances",
          "incidents",
          "performance",
        ].map((m) => (
          <Link key={m} href={`/manage/${m}?employee=${id}`}>
            {m}
          </Link>
        ))}
      </div>
    </>
  );
}
