import { z } from "zod";
import { DateTime } from "luxon";
import { session } from "@/lib/auth";
import { modules } from "@/lib/modules";
import { csv, pdf, xlsx } from "@/lib/exports";
import { failure } from "@/lib/http";
import { reportRecords } from "@/lib/report-records";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      company = z.uuid().parse(p.get("company")),
      module = p.get("module") ?? "employees",
      m = modules[module];
    if (!m) throw new Error("Invalid report");
    const { db } = await session(company);
    const { data: organization, error: companyError } = await db
      .from("companies")
      .select("timezone")
      .eq("id", company)
      .single();
    if (companyError) throw new Error(companyError.message);
    const table = m.table === "payroll_items" ? "payroll_balances" : m.table;
    const from = p.get("from"),
      to = p.get("to");
    const dateColumn =
      m.fields.find((f) =>
        ["work_date", "start_date", "incident_date", "review_date"].includes(
          f.key,
        ),
      )?.key ??
      (module === "attendance"
        ? "work_date"
        : module === "payments"
          ? "paid_at"
          : "created_at");
    if (from && to && from > to)
      throw new Error("Start date must precede end date");
    const boundary = (date: string, end = false) => {
      z.iso.date().parse(date);
      const local = DateTime.fromISO(date, { zone: organization.timezone });
      return (end ? local.endOf("day") : local.startOf("day")).toUTC().toISO()!;
    };
    const rows: Record<string, unknown>[] = [];
    for (let page = 0; page < 50; page++) {
      let q = db
        .from(table)
        .select("*")
        .eq("company_id", company)
        .order("id")
        .range(page * 1000, page * 1000 + 999);
      if (table === "payroll_balances") {
        if (from) q = q.gte("period_end", z.iso.date().parse(from));
        if (to) q = q.lte("period_start", z.iso.date().parse(to));
      } else {
        if (from)
          q = q.gte(
            dateColumn,
            ["created_at", "paid_at"].includes(dateColumn)
              ? boundary(from)
              : z.iso.date().parse(from),
          );
        if (to)
          q = q.lte(
            dateColumn,
            ["created_at", "paid_at"].includes(dateColumn)
              ? boundary(to, true)
              : z.iso.date().parse(to),
          );
      }
      if (p.get("employee") && (m.employee || m.table === "employees"))
        q = q.eq(
          m.table === "employees" ? "id" : "employee_id",
          z.uuid().parse(p.get("employee")),
        );
      if (p.get("branch") && m.table !== "branches")
        q = q.eq("branch_id", z.uuid().parse(p.get("branch")));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
      if (page === 49)
        throw new Error("Export exceeds 50,000 rows; narrow the date range");
    }
    for (const row of rows)
      for (const key of [
        "connector_key_hash",
        "storage_path",
        "company_id",
        "user_id",
      ])
        delete row[key];
    const format = z
      .enum(["csv", "xlsx", "pdf"])
      .parse(p.get("format") ?? "csv");
    const readableRows = await reportRecords(db, company, rows);
    const body =
      format === "csv"
        ? csv(readableRows)
        : format === "pdf"
          ? await pdf(m.title, readableRows)
          : await xlsx(readableRows);
    return new Response(typeof body === "string" ? body : Buffer.from(body), {
      headers: {
        "Content-Type":
          format === "csv"
            ? "text/csv; charset=utf-8"
            : format === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="maamul-${module}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
