import { DateTime } from "luxon";
import Decimal from "decimal.js";
import { z } from "zod";
import { session } from "@/lib/auth";
import { pdf, xlsx, csv } from "@/lib/exports";
import { failure } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      company = z.uuid().parse(p.get("company")),
      id = z.uuid().parse(p.get("employee")),
      month = z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .parse(p.get("month"));
    const start = DateTime.fromISO(`${month}-01`);
    if (!start.isValid) throw new Error("Invalid month");
    const from = start.toISODate()!,
      to = start.endOf("month").toISODate()!;
    const { db } = await session(company);
    const { data: e, error } = await db
      .from("employees")
      .select("*")
      .eq("company_id", company)
      .eq("id", id)
      .single();
    if (error) throw new Error("Employee unavailable");
    const results = await Promise.all([
      db
        .from("attendance_summaries")
        .select("*")
        .eq("company_id", company)
        .eq("employee_id", id)
        .gte("work_date", from)
        .lte("work_date", to),
      db
        .from("leave_requests")
        .select("*,leave_types(name,paid,annual_entitlement)")
        .eq("company_id", company)
        .eq("employee_id", id)
        .gte("end_date", from)
        .lte("start_date", to),
      db
        .from("payroll_balances")
        .select("*")
        .eq("company_id", company)
        .eq("employee_id", id)
        .gte("period_end", from)
        .lte("period_start", to),
      db
        .from("employee_performance_reviews")
        .select("*")
        .eq("company_id", company)
        .eq("employee_id", id)
        .gte("review_date", from)
        .lte("review_date", to),
      db
        .from("branches")
        .select("name")
        .eq("company_id", company)
        .eq("id", e.branch_id)
        .single(),
      db
        .from("positions")
        .select("name")
        .eq("company_id", company)
        .eq("id", e.position_id ?? "00000000-0000-4000-8000-000000000000")
        .maybeSingle(),
      db.from("leave_types").select("*").eq("company_id", company),
      db
        .from("leave_requests")
        .select("leave_type_id,total_days,status")
        .eq("company_id", company)
        .eq("employee_id", id)
        .eq("status", "approved")
        .gte("start_date", start.startOf("year").toISODate()!)
        .lte("start_date", to),
    ]);
    for (const r of results) if (r.error) throw new Error(r.error.message);
    const attendance = results[0].data ?? [],
      leave = results[1].data ?? [],
      balances = results[2].data ?? [],
      reviews = results[3].data ?? [];
    const sum = (rows: Record<string, unknown>[], key: string) =>
      rows
        .reduce((s, r) => s.plus(String(r[key] ?? 0)), new Decimal(0))
        .toFixed(2);
    const scheduled = attendance.filter(
        (a) => !["rest", "holiday"].includes(a.status),
      ).length,
      worked = attendance.filter((a) => a.status === "present").length,
      late = attendance.filter((a) => a.late_minutes > 0).length;
    const annual = results[6].data?.find((t) => /annual/i.test(t.name));
    let entitlement = Number(annual?.annual_entitlement ?? 0);
    if (annual) {
      const { data: policy, error: policyError } = await db
        .from("leave_policies")
        .select("annual_entitlement")
        .eq("company_id", company)
        .eq("employee_id", id)
        .eq("leave_type_id", annual.id)
        .lte("effective_from", to)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (policyError) throw new Error(policyError.message);
      entitlement = Number(policy?.annual_entitlement ?? entitlement);
    }
    const used = annual
      ? (results[7].data ?? [])
          .filter((l) => l.leave_type_id === annual.id)
          .reduce((s, l) => s + Number(l.total_days), 0)
      : 0;
    const summary = {
      employee_name: `${e.first_name} ${e.last_name}`,
      employee_id: e.employee_number,
      position: results[5].data?.name ?? "",
      branch: results[4].data?.name ?? "",
      report_month: month,
      currency: e.currency,
      basic_salary: e.basic_salary,
      scheduled_days: scheduled,
      worked_days: worked,
      worked_hours: new Decimal(sum(attendance, "worked_minutes"))
        .div(60)
        .toFixed(2),
      absent_days: attendance.filter((a) => a.status === "absent" && a.reviewed)
        .length,
      uncertain_days: attendance.filter((a) =>
        ["uncertain", "missing_in", "missing_out"].includes(a.status),
      ).length,
      late_arrivals: late,
      late_minutes: sum(attendance, "late_minutes"),
      overtime_hours: new Decimal(sum(attendance, "overtime_minutes"))
        .div(60)
        .toFixed(2),
      approved_leave: leave
        .filter((l) => l.status === "approved")
        .map(
          (l) =>
            `${l.leave_types?.name} ${l.start_date} – ${l.end_date} (${l.leave_types?.paid ? "paid" : "unpaid"})`,
        )
        .join("; "),
      remaining_annual_leave: annual
        ? Math.max(0, entitlement - used)
        : "No annual policy configured",
      basic_earnings: sum(balances, "basic_earnings"),
      overtime_pay: sum(balances, "overtime"),
      bonuses: sum(balances, "bonuses"),
      allowances: sum(balances, "allowances"),
      unpaid_absence: sum(balances, "unpaid_absence"),
      late_deductions: sum(balances, "late_deductions"),
      damage_recovery: sum(balances, "damage_recovery"),
      salary_advance_recovery: sum(balances, "advance_recovery"),
      total_deductions: sum(balances, "deductions"),
      net_salary: sum(balances, "net"),
      already_paid: sum(balances, "total_paid"),
      remaining_salary: sum(balances, "remaining_payable"),
      attendance_rate: scheduled
        ? `${((worked / scheduled) * 100).toFixed(1)}%`
        : "Not available",
      punctuality_rate: worked
        ? `${((Math.max(0, worked - late) / worked) * 100).toFixed(1)}%`
        : "Not available",
      manager_comments: reviews.map((r) => r.manager_comments).join("; "),
    };
    const format = z
      .enum(["pdf", "xlsx", "csv", "json"])
      .parse(p.get("format") ?? "pdf");
    const rows: Record<string, unknown>[] = [
      summary,
      ...leave.map((l) => ({
        section: "Leave",
        reason: l.reason,
        start_date: l.start_date,
        end_date: l.end_date,
        paid: l.leave_types?.paid,
        status: l.status,
      })),
    ];
    if (format === "json")
      return Response.json(
        { summary, leave },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const data =
      format === "pdf"
        ? await pdf(`Employee report | ${month}`, rows)
        : format === "xlsx"
          ? await xlsx(rows, [...new Set(rows.flatMap((r) => Object.keys(r)))])
          : csv(rows, [...new Set(rows.flatMap((r) => Object.keys(r)))]);
    return new Response(typeof data === "string" ? data : Buffer.from(data), {
      headers: {
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : format === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="employee-report-${month}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
