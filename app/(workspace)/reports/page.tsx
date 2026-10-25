import Link from "next/link";
import { FileChartColumn } from "lucide-react";
import { context } from "@/lib/context";
import { modules, canViewModule } from "@/lib/modules";
import { DateTime } from "luxon";
import { Analytics, type AnalyticsData } from "@/components/analytics";
import { reportRecords } from "@/lib/report-records";
import { displayLabel, displayValue } from "@/lib/display-records";
import { z } from "zod";
import "./reports.css";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const s = await context(),
    p = await searchParams;
  let branches: { id: string; name: string }[] = [],
    employees: {
      id: string;
      first_name: string;
      last_name: string;
      employee_number: string;
    }[] = [];
  const company = s?.membership?.company_id;
  const available = [
    "employees",
    "attendance",
    "payroll-items",
    "payments",
    "deductions",
    "advance-balances",
    "damage-balances",
    "balances",
    "repayments",
    "installments",
    "leave-balances",
    "overtime",
    "leave",
    "performance",
    "incidents",
    "sync",
  ].filter((key) => !s?.membership || canViewModule(s.membership.role, key));
  const selected = available.includes(p.report ?? "")
    ? p.report!
    : (available[0] ?? "employees");
  const selectedModule = modules[selected];
  const page = Math.max(1, Math.min(2000, Number(p.page) || 1));
  let preview: Record<string, unknown>[] = [];
  let recordCount = 0;
  let analytics: AnalyticsData = { attendance: [], payroll: [], branches: [] };
  let currency = "USD";
  if (company && s) {
    const c = s.membership?.companies as unknown as {
      currency?: string;
      timezone?: string;
    } | null;
    currency = c?.currency ?? currency;
    const now = DateTime.now().setZone(c?.timezone ?? "Africa/Mogadishu");
    if (p.range && p.range !== "custom" && p.range !== "all") {
      const lower =
        p.range === "today"
          ? now
          : p.range === "week"
            ? now.startOf("week")
            : p.range === "month"
              ? now.startOf("month")
              : now.startOf("year");
      p.from = lower.toISODate()!;
      p.to = now.toISODate()!;
    } else if (p.range === "all") {
      delete p.from;
      delete p.to;
    }
    const table =
      selectedModule.table === "payroll_items"
        ? "payroll_balances"
        : selectedModule.table;
    let previewQuery = s.db
      .from(table)
      .select("*", { count: "exact" })
      .eq("company_id", company)
      .order("created_at", { ascending: false })
      .range((page - 1) * 25, page * 25 - 1);
    if (p.branch && table !== "branches")
      previewQuery = previewQuery.eq("branch_id", z.uuid().parse(p.branch));
    if (p.employee && (selectedModule.employee || table === "employees"))
      previewQuery = previewQuery.eq(
        table === "employees" ? "id" : "employee_id",
        z.uuid().parse(p.employee),
      );
    const dateColumn =
      selectedModule.fields.find((f) =>
        ["work_date", "start_date", "incident_date", "review_date"].includes(
          f.key,
        ),
      )?.key ??
      (selected === "attendance"
        ? "work_date"
        : selected === "payments"
          ? "paid_at"
          : "created_at");
    if (p.from && p.to && p.from > p.to)
      throw new Error("Start date must precede end date");
    if (table === "payroll_balances") {
      if (p.from)
        previewQuery = previewQuery.gte(
          "period_end",
          z.iso.date().parse(p.from),
        );
      if (p.to)
        previewQuery = previewQuery.lte(
          "period_start",
          z.iso.date().parse(p.to),
        );
    } else {
      const boundary = (value: string, end = false) => {
        z.iso.date().parse(value);
        const local = DateTime.fromISO(value, {
          zone: c?.timezone ?? "Africa/Mogadishu",
        });
        return (end ? local.endOf("day") : local.startOf("day"))
          .toUTC()
          .toISO()!;
      };
      if (p.from)
        previewQuery = previewQuery.gte(
          dateColumn,
          ["created_at", "paid_at"].includes(dateColumn)
            ? boundary(p.from)
            : z.iso.date().parse(p.from),
        );
      if (p.to)
        previewQuery = previewQuery.lte(
          dateColumn,
          ["created_at", "paid_at"].includes(dateColumn)
            ? boundary(p.to, true)
            : z.iso.date().parse(p.to),
        );
    }
    const [previewResult, b, e, series] = await Promise.all([
      previewQuery,
      s.db.from("branches").select("id,name").eq("company_id", company),
      s.db.rpc("employee_directory", { p_company: company }),
      s.db.rpc("analytics_series", {
        p_company: company,
        p_from:
          p.from ??
          (p.range === "all" ? "0001-01-01" : now.startOf("year").toISODate()),
        p_to: p.to ?? now.toISODate(),
        p_currency: currency,
      }),
    ]);
    for (const result of [previewResult, b, e, series])
      if (result.error) throw new Error(result.error.message);
    branches = b.data ?? [];
    employees = e.data ?? [];
    analytics = series.data ?? analytics;
    preview = await reportRecords(s.db, company, previewResult.data ?? []);
    recordCount = previewResult.count ?? 0;
  }
  const exportFilters = Object.fromEntries(
    Object.entries(p).filter(
      (entry): entry is [string, string] =>
        ["from", "to", "branch", "employee"].includes(entry[0]) && !!entry[1],
    ),
  );
  const columns = [...new Set(preview.flatMap((row) => Object.keys(row)))];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INSIGHTS THAT MATTER</div>
          <h1>
            Reports & analytics<span className="heading-dot">.</span>
          </h1>
          <p>Export authorized company, branch and employee records.</p>
        </div>
      </div>
      <div className="reports-summary">
        <section>
          <span>Selected report</span>
          <strong>{selectedModule.title}</strong>
          <small>Authorized company data</small>
        </section>
        <section>
          <span>Matching records</span>
          <strong>{company ? recordCount.toLocaleString() : "—"}</strong>
          <small>For the selected filters</small>
        </section>
        <section>
          <span>Report library</span>
          <strong>{available.length} reports</strong>
          <small>People, attendance & finance</small>
        </section>
        <section>
          <span>Download formats</span>
          <strong>PDF · Excel · CSV</strong>
          <small>Private exports with readable names</small>
        </section>
      </div>
      <form className="filters-form panel reports-filters">
        <label>
          Report
          <select name="report" defaultValue={selected}>
            {available.map((key) => (
              <option key={key} value={key}>
                {modules[key].title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reporting period
          <select name="range" defaultValue={p.range ?? "custom"}>
            <option value="custom">Custom dates</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="all">All time</option>
          </select>
        </label>
        <label>
          From
          <input type="date" name="from" defaultValue={p.from} />
        </label>
        <label>
          To
          <input type="date" name="to" defaultValue={p.to} />
        </label>
        <label>
          Branch
          <select name="branch" defaultValue={p.branch ?? ""}>
            <option value="">All authorized branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Employee
          <select
            name="employee"
            defaultValue={p.employee ?? ""}
            disabled={
              !selectedModule.employee && selectedModule.table !== "employees"
            }
          >
            <option value="">All authorized employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name} · {e.employee_number}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-primary">Apply filters</button>
      </form>
      {!company && (
        <div className="setup-banner">
          Connect Supabase and select a company to download reports.{" "}
          <Link href="/settings">Open setup →</Link>
        </div>
      )}
      <section className="panel reports-preview">
        <div className="reports-preview-heading">
          <div>
            <span className="eyebrow">REPORT PREVIEW</span>
            <h2>{selectedModule.title}</h2>
            <p>
              {recordCount} matching records · Page {page} · 25 records per page
            </p>
          </div>
          <div className="report-actions">
            {company &&
              ["pdf", "xlsx", "csv"].map((format) => (
                <a
                  className="button button-outline"
                  key={format}
                  href={`/api/export?${new URLSearchParams({ module: selected, company, format, ...exportFilters })}`}
                >
                  {format.toUpperCase()}
                </a>
              ))}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((key) => (
                  <th key={key}>{displayLabel(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, index) => (
                <tr key={index}>
                  {columns.map((key) => (
                    <td key={key}>{displayValue(row[key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!preview.length && (
          <div className="empty">
            <FileChartColumn size={32} />
            <strong>No records for these filters</strong>
            <p>
              Select another report or date range. Records appear here once they
              have been saved and authorized.
            </p>
          </div>
        )}
        <div className="pagination">
          <span>
            Showing {preview.length} of {recordCount}
          </span>
          <div>
            {page > 1 && (
              <Link
                href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(p).filter((entry): entry is [string, string] => !!entry[1])), page: String(page - 1) })}`}
              >
                Previous
              </Link>
            )}
            {page * 25 < recordCount && (
              <Link
                href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(p).filter((entry): entry is [string, string] => !!entry[1])), page: String(page + 1) })}`}
              >
                Next
              </Link>
            )}
          </div>
        </div>
      </section>
      <div className="reports-library-heading">
        <h2>Report library</h2>
        <p>
          Choose a report to preview its records or download a formatted copy.
        </p>
      </div>
      <div className="report-grid">
        {available.map((key) => {
          const m = modules[key];
          return (
            <section className="panel report-card" key={key}>
              <span className="stat-icon purple">
                <FileChartColumn size={20} />
              </span>
              <h2>{m.title}</h2>
              <p>{m.description}</p>
              <Link
                className="report-preview-link"
                href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(p).filter((entry): entry is [string, string] => !!entry[1])), report: key, page: "1" })}`}
              >
                View report →
              </Link>
              <div className="report-actions">
                {company ? (
                  ["pdf", "xlsx", "csv"].map((format) => (
                    <a
                      key={format}
                      href={`/api/export?${new URLSearchParams({ module: key, company, format, ...exportFilters })}`}
                    >
                      {format.toUpperCase()} ↓
                    </a>
                  ))
                ) : (
                  <span className="muted">Available after setup</span>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div className="reports-library-heading">
        <h2>Company-wide trends</h2>
        <p>
          These charts use the selected reporting dates across your authorized
          company records. Branch and employee filters apply to the preview and
          downloads above.
        </p>
      </div>
      <Analytics data={analytics} currency={currency} />
    </>
  );
}
