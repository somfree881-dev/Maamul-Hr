import { NextResponse } from "next/server";
import { z } from "zod";
import { session, requireRole } from "@/lib/auth";
import { checkOrigin, failure } from "@/lib/http";
const actions: Record<string, { rpc: string; schema: z.ZodType }> = {
  payroll_schedule: {
    rpc: "configure_payroll_schedule",
    schema: z.object({
      p_company: z.uuid(),
      p_enabled: z.boolean(),
      p_mode: z.enum(["cycle_29_28", "previous_month", "calendar_month"]),
    }),
  },
  backfill: {
    rpc: "backfill_device_mappings",
    schema: z.object({ p_device: z.uuid() }),
  },
  review: {
    rpc: "review_request",
    schema: z.object({
      p_kind: z.enum(["leave", "overtime"]),
      p_id: z.uuid(),
      p_approve: z.boolean(),
      p_notes: z.string().max(2000).nullable().optional(),
    }),
  },
  absence: { rpc: "review_absence", schema: z.object({ p_id: z.uuid() }) },
  company: {
    rpc: "create_company",
    schema: z.object({
      p_name: z.string().min(2).max(200),
      p_currency: z.string().regex(/^[A-Z]{3}$/),
      p_timezone: z.string().min(1),
    }),
  },
  membership: {
    rpc: "set_membership",
    schema: z.object({
      p_company: z.uuid(),
      p_user: z.uuid(),
      p_role: z.enum([
        "super_admin",
        "company_admin",
        "hr_manager",
        "branch_manager",
        "accountant",
        "supervisor",
        "employee",
      ]),
      p_branch: z.uuid().nullable(),
    }),
  },
  generate: {
    rpc: "generate_payroll",
    schema: z.object({ p_period: z.uuid() }),
  },
  transition: {
    rpc: "transition_payroll",
    schema: z.object({
      p_run: z.uuid(),
      p_status: z.enum(["verified", "approved", "locked"]),
      p_notes: z.string().max(2000).nullable().optional(),
    }),
  },
  payment: {
    rpc: "record_payment",
    schema: z.object({
      p_item: z.uuid(),
      p_amount: z.coerce.number().positive(),
      p_reference: z.string().min(1).max(200),
      p_method: z.string().min(1).max(100),
    }),
  },
  reversal: {
    rpc: "reverse_payment",
    schema: z.object({
      p_payment: z.uuid(),
      p_reference: z.string().min(1).max(200),
    }),
  },
  correction: {
    rpc: "review_correction",
    schema: z.object({
      p_id: z.uuid(),
      p_approve: z.boolean(),
      p_notes: z.string().min(1).max(2000),
    }),
  },
  schedule: {
    rpc: "schedule_recovery",
    schema: z.object({
      p_kind: z.enum(["advance", "damage"]),
      p_parent: z.uuid(),
      p_dates: z.array(z.iso.date()).min(1).max(120),
      p_amounts: z.array(z.coerce.number().positive()).min(1).max(120),
    }),
  },
};
export async function POST(request: Request) {
  try {
    await session();
    checkOrigin(request);
    const body = await request.json();
    const action = actions[body.action];
    if (!action) throw new Error("Unknown workflow");
    const validated = action.schema.parse(body.params) as Record<
      string,
      unknown
    >;
    let company = validated.p_company as string | undefined;
    const current = await session();
    const target: Record<string, [string, string]> = {
      generate: ["payroll_periods", "p_period"],
      transition: ["payroll_runs", "p_run"],
      payment: ["payroll_items", "p_item"],
      reversal: ["salary_payments", "p_payment"],
      correction: ["attendance_corrections", "p_id"],
      backfill: ["attendance_devices", "p_device"],
      review: [
        validated.p_kind === "leave" ? "leave_requests" : "overtime_records",
        "p_id",
      ],
      schedule: [
        validated.p_kind === "advance"
          ? "salary_advances"
          : "damage_recovery_plans",
        "p_parent",
      ],
    };
    if (target[body.action]) {
      const [table, key] = target[body.action];
      const result = await current.db
        .from(table)
        .select("company_id")
        .eq("id", validated[key])
        .maybeSingle();
      if (result.error || !result.data) throw new Error("Forbidden");
      company = result.data.company_id;
    }
    const { db, membership } = await session(company);
    const roles: Record<string, string[]> = {
      generate: ["super_admin", "company_admin", "accountant"],
      payment: ["super_admin", "company_admin", "accountant"],
      reversal: ["super_admin", "company_admin", "accountant"],
      schedule: ["super_admin", "company_admin", "accountant"],
      membership: ["super_admin", "company_admin"],
      payroll_schedule: ["super_admin", "company_admin"],
      transition:
        validated.p_status === "verified"
          ? ["super_admin", "company_admin", "accountant"]
          : ["super_admin", "company_admin"],
      backfill: ["super_admin", "company_admin", "hr_manager"],
      correction: [
        "super_admin",
        "company_admin",
        "hr_manager",
        "branch_manager",
        "supervisor",
      ],
      review: [
        "super_admin",
        "company_admin",
        "hr_manager",
        "branch_manager",
        "supervisor",
      ],
    };
    if (body.action !== "company")
      requireRole(membership?.role, roles[body.action] ?? []);
    const { data, error } = await db.rpc(action.rpc, validated);
    if (error) throw new Error(error.message);
    return NextResponse.json({ data });
  } catch (e) {
    return failure(e);
  }
}
