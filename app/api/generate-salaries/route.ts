import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { session, requireRole } from "@/lib/auth";
import { admin } from "@/lib/supabase/admin";
import { checkOrigin, failure } from "@/lib/http";
import { processDay } from "@/lib/attendance-service";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    await session();
    checkOrigin(request);
    const input = z
      .object({
        company: z.uuid(),
        month: z.string().regex(/^\d{4}-\d{2}$/),
        late: z.boolean(),
      })
      .parse(await request.json());
    const { db, membership } = await session(input.company);
    requireRole(membership?.role, [
      "super_admin",
      "company_admin",
      "accountant",
    ]);
    // Check deployment before any attendance writes.
    const readiness = await db.rpc("generate_monthly_salaries", {
      p_company: input.company,
      p_month: null,
      p_late: false,
    });
    if (readiness.error?.message !== "Payroll workflow ready")
      throw Error(
        "Install the manual monthly salaries migration before using this button.",
      );
    const service = admin();
    const { data: company, error: ce } = await service
      .from("companies")
      .select("timezone,currency")
      .eq("id", input.company)
      .single();
    if (ce || !company) throw Error("Company configuration unavailable");
    const start = DateTime.fromISO(input.month + "-01", {
      zone: company.timezone,
    });
    if (!start.isValid) throw Error("Invalid month");
    const end = start.endOf("month");
    const { data: period } = await db
      .from("payroll_periods")
      .select("id")
      .eq("company_id", input.company)
      .eq("currency", company.currency)
      .eq("start_date", start.toISODate())
      .eq("end_date", end.toISODate())
      .maybeSingle();
    const { data: existing } = period
      ? await db
          .from("payroll_runs")
          .select("id")
          .eq("period_id", period.id)
          .maybeSingle()
      : { data: null };
    if (existing)
      return NextResponse.json({ run: existing.id, existing: true });
    if (end >= DateTime.now().setZone(company.timezone).startOf("day"))
      throw Error(
        "Select a completed month; future attendance cannot be assumed.",
      );
    const { data: employees, error: ee } = await service
      .from("employees")
      .select("id,employee_number,start_date,end_date")
      .eq("company_id", input.company)
      .eq("currency", company.currency)
      .lte("start_date", end.toISODate())
      .or(`end_date.is.null,end_date.gte.${start.toISODate()}`)
      .limit(1001);
    if (ee) throw Error("Unable to load employees");
    if (!employees?.length) throw Error("No employees in this month");
    if (employees.length > 1000)
      throw Error(
        "More than 1,000 employees requires a background payroll job.",
      );
    const tasks: { employee: (typeof employees)[number]; date: string }[] = [];
    for (const employee of employees)
      for (let d = start; d <= end; d = d.plus({ days: 1 })) {
        const date = d.toISODate()!;
        if (
          date >= employee.start_date &&
          (!employee.end_date || date <= employee.end_date)
        )
          tasks.push({ employee, date });
      }
    const issues: string[] = [];
    for (let offset = 0; offset < tasks.length; offset += 6) {
      await Promise.all(
        tasks.slice(offset, offset + 6).map(async ({ employee, date }) => {
          try {
            const { data: old, error } = await service
              .from("attendance_summaries")
              .select("status,reviewed")
              .eq("employee_id", employee.id)
              .eq("work_date", date)
              .maybeSingle();
            if (error) throw Error("Attendance lookup failed");
            const summary = old?.reviewed
              ? old
              : await processDay(
                  service,
                  { company_id: input.company, employee_id: employee.id, date },
                  true,
                );
            if (
              ["uncertain", "missing_in", "missing_out"].includes(
                summary.status,
              ) ||
              (summary.status === "absent" && !summary.reviewed)
            )
              issues.push(
                `${employee.employee_number}: ${date} — attendance needs review`,
              );
          } catch (e) {
            issues.push(
              `${employee.employee_number}: ${date} — ${e instanceof Error ? e.message : "processing failed"}`,
            );
          }
        }),
      );
      if (issues.length) break;
    }
    if (issues.length)
      return NextResponse.json(
        {
          error:
            "Salary was not generated. Review the listed attendance, then click Generate all salaries again.",
          issues: issues.slice(0, 10),
        },
        { status: 422 },
      );
    const { data: run, error } = await db.rpc("generate_monthly_salaries", {
      p_company: input.company,
      p_month: start.toISODate(),
      p_late: input.late,
    });
    if (error) throw Error(error.message);
    return NextResponse.json({ run });
  } catch (e) {
    return failure(e);
  }
}
