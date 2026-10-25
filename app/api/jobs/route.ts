import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { processDay } from "@/lib/attendance-service";
export async function POST(request: Request) {
  const expected = process.env.JOB_SECRET ?? "",
    supplied =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    expected.length < 32 ||
    Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = z
      .discriminatedUnion("task", [
        z.object({ task: z.literal("maintenance") }),
        z.object({ task: z.literal("payroll") }),
        z.object({
          task: z.literal("attendance"),
          company_id: z.uuid(),
          date: z.iso.date(),
          offset: z.number().int().min(0).default(0),
        }),
      ])
      .parse(await request.json());
    const db = admin();
    if (body.task === "payroll") {
      const { data, error } = await db.rpc("run_scheduled_payroll");
      if (error) throw error;
      return NextResponse.json(
        { results: data },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (body.task === "maintenance") {
      const { data, error } = await db.rpc("run_maintenance");
      if (error) throw error;
      return NextResponse.json({ notifications_created: data });
    }
    const { data, error } = await db
      .from("employees")
      .select("id")
      .eq("company_id", body.company_id)
      .lte("start_date", body.date)
      .or(`end_date.is.null,end_date.gte.${body.date}`)
      .order("id")
      .range(body.offset, body.offset + 49);
    if (error) throw error;
    const results = [];
    for (const employee of data ?? []) {
      try {
        const summary = await processDay(
          db,
          {
            company_id: body.company_id,
            employee_id: employee.id,
            date: body.date,
          },
          true,
        );
        results.push({ employee_id: employee.id, status: summary.status });
      } catch (e) {
        results.push({
          employee_id: employee.id,
          error: e instanceof Error ? e.message : "Processing failed",
        });
      }
    }
    return NextResponse.json(
      { results, next_offset: data?.length === 50 ? body.offset + 50 : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Job failed. Check configuration and validated parameters." },
      { status: 400 },
    );
  }
}
