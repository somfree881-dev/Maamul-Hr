import { context } from "@/lib/context";
import { DashboardView } from "@/components/dashboard-view";
import { dashboardPeriod, attendanceTotals } from "@/lib/dashboard-period";
import Decimal from "decimal.js";
import { DateTime } from "luxon";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const input = await searchParams;
  const s = await context();
  const companyId = s?.membership?.company_id;
  const db = s?.db;
  let employees: Record<string, unknown>[] = [];
  let attendance: Record<string, unknown>[] = [];
  let metrics: Record<string, number> = {};
  let currency = "USD";
  let timezone = "Africa/Mogadishu";
  let error = "";
  const company = s?.membership?.companies as unknown as {
    timezone?: string;
    currency?: string;
  } | null;
  timezone = company?.timezone ?? timezone;
  currency = company?.currency ?? currency;
  let period = dashboardPeriod({}, timezone);
  try {
    period = dashboardPeriod(input, timezone);
  } catch (e) {
    error = e instanceof Error ? e.message : "Invalid date range";
  }

  if (companyId && db) {
    async function ledger(table: string, columns: string, dateField: string) {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; offset < 50000; offset += 1000) {
        let query = db!
          .from(table)
          .select(columns)
          .eq("company_id", companyId!)
          .order("id")
          .range(offset, offset + 999);
        if (table === "payroll_balances") {
          query = query.eq("currency", currency).lte("period_start", period.to);
          if (period.from) query = query.gte("period_end", period.from);
        } else {
          query = query.lte(dateField, period.to);
          if (period.from) query = query.gte(dateField, period.from);
        }
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
        if ((data?.length ?? 0) < 1000) return rows;
      }
      throw new Error("More than 50,000 records. Select a shorter date range.");
    }
    try {
      const results = await Promise.all([
        db
          .from("employees")
          .select("id,first_name,last_name,employee_number,status,start_date")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(4),
        db.rpc("employee_counts", { p_company: companyId }),
        ledger(
          "attendance_summaries",
          "id,work_date,status,reviewed,worked_minutes,overtime_minutes,late_minutes",
          "work_date",
        ),
        ledger(
          "payroll_balances",
          "id,gross,deductions,net,total_paid,remaining_payable",
          "period_start",
        ),
        db
          .from("employee_documents")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .lte(
            "expiration_date",
            DateTime.now().setZone(timezone).plus({ days: 30 }).toISODate()!,
          ),
      ]);
      for (const result of [results[0], results[1], results[4]])
        if (result.error) error = result.error.message;
      employees = results[0].data ?? [];
      const summary = attendanceTotals(results[2]);
      attendance = summary.attendance;
      metrics = {
        ...summary.metrics,
        total_employees: Number(results[1].data?.total ?? 0),
        active_employees: Number(results[1].data?.active ?? 0),
        document_alerts: results[4].count ?? 0,
      };
      for (const [target, source] of Object.entries({
        gross_payroll: "gross",
        deductions: "deductions",
        net_payroll: "net",
        salary_paid: "total_paid",
        outstanding: "remaining_payable",
      }))
        metrics[target] = results[3]
          .reduce(
            (sum, row) => sum.plus(String(row[source] ?? 0)),
            new Decimal(0),
          )
          .toNumber();
    } catch (e) {
      error = e instanceof Error ? e.message : "Dashboard data unavailable";
    }
  }

  return (
    <DashboardView
      employees={employees}
      attendance={attendance}
      metrics={metrics}
      currency={currency}
      timezone={timezone}
      error={error}
      connected={!!companyId}
      period={period}
    />
  );
}
