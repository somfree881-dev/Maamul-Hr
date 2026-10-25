import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/auth";
import { modules, canWrite } from "@/lib/modules";
import { employeeSchema } from "@/lib/validation";
import { latePolicySchema, payrollPolicySchema } from "@/lib/late-policy";
import { checkOrigin, failure } from "@/lib/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ module: string }> },
) {
  try {
    checkOrigin(request);
    const { module } = await params;
    const m = modules[module];
    if (!m || m.readonly) throw new Error("Forbidden");
    const body = await request.json();
    const company = z.uuid().parse(body.company_id);
    const { db, membership } = await session(company);
    const employeeLeave =
      ["leave", "corrections", "advances"].includes(module) &&
      membership?.role === "employee";
    if (!canWrite(membership?.role, m.area) && !employeeLeave)
      throw new Error("Forbidden");
    if (employeeLeave && body.id) throw new Error("Forbidden");
    if (employeeLeave && module === "advances") {
      const input = z
        .object({
          employee_id: z.uuid(),
          requested_amount: z.coerce.number().positive().max(1e12),
          reason: z.string().min(1).max(2000),
        })
        .parse(body);
      const { data, error } = await db.rpc("request_advance", {
        p_company: company,
        p_employee: input.employee_id,
        p_amount: input.requested_amount,
        p_reason: input.reason,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ id: data });
    }
    let schema: z.ZodType;
    if (module === "employees") schema = employeeSchema;
    else {
      const fields: Record<string, z.ZodType> = { company_id: z.uuid() };
      for (const field of m.fields) {
        let s: z.ZodType = field.relation
          ? z.uuid()
          : field.type === "number"
            ? z.coerce.number().finite().min(0).max(1e12)
            : field.type === "date"
              ? z.iso.date()
              : z.string().trim().min(1).max(10000);
        if (field.options) s = z.enum(field.options as [string, ...string[]]);
        if (!field.required) s = s.nullable().optional();
        fields[field.key] = s;
      }
      schema = z.object(fields);
    }
    const data = schema.parse(body) as Record<string, unknown>;
    if (module === "policies") {
      data.value = JSON.parse(String(data.value));
      if (data.key === "late_policy")
        data.value = latePolicySchema.parse(data.value);
      if (data.key === "payroll_policy")
        data.value = payrollPolicySchema.parse(data.value);
    }
    if (module === "shifts") {
      if (data.working_days)
        data.working_days = z
          .array(z.number().int().min(1).max(7))
          .min(1)
          .max(7)
          .parse(JSON.parse(String(data.working_days)));
      else delete data.working_days;
      if (data.segments)
        data.segments = z
          .array(
            z.object({
              start: z.string().regex(/^\d{2}:\d{2}$/),
              end: z.string().regex(/^\d{2}:\d{2}$/),
            }),
          )
          .max(4)
          .parse(JSON.parse(String(data.segments)));
      else delete data.segments;
    }
    for (const k of ["paid", "requires_document"])
      if (k in data) data[k] = data[k] === "true";
    if (
      membership?.branch_id &&
      ["branch_manager", "supervisor"].includes(membership.role)
    )
      data.branch_id = membership.branch_id;
    if (module === "leave") {
      if (body.id) throw new Error("Use the approval workflow");
      const { data: result, error } = await db.rpc("request_leave", {
        p_company: company,
        p_employee: data.employee_id,
        p_type: data.leave_type_id,
        p_start: data.start_date,
        p_end: data.end_date,
        p_days: data.total_days,
        p_reason: data.reason,
        p_description: data.description ?? null,
      });
      if (error) throw error;
      return NextResponse.json({ id: result });
    }
    if (module === "corrections") {
      const { data: result, error } = await db.rpc("request_correction", {
        p_company: company,
        p_employee: data.employee_id,
        p_date: data.work_date,
        p_in: data.check_in,
        p_out: data.check_out,
        p_reason: data.reason,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ id: result });
    }
    const query = body.id
      ? db
          .from(m.table)
          .update(data)
          .eq("id", z.uuid().parse(body.id))
          .eq("company_id", company)
      : db.from(m.table).insert(data);
    const { data: result, error } = await query.select("id").single();
    if (error) throw new Error(error.message);
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ module: string }> },
) {
  try {
    checkOrigin(request);
    const { module } = await params;
    const m = modules[module];
    if (!m || m.area === "finance" || m.readonly) throw new Error("Forbidden");
    const body = await request.json();
    const { db, membership } = await session(z.uuid().parse(body.company_id));
    if (
      !["super_admin", "company_admin", "hr_manager"].includes(
        membership?.role ?? "",
      )
    )
      throw new Error("Forbidden");
    const { data, error } = await db
      .from(m.table)
      .delete()
      .eq("company_id", body.company_id)
      .eq("id", z.uuid().parse(body.id))
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return failure(e);
  }
}
