import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/auth";
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
    checkOrigin(request);
    const body = await request.json();
    const action = actions[body.action];
    if (!action) throw new Error("Unknown workflow");
    const { db } = await session();
    const { data, error } = await db.rpc(
      action.rpc,
      action.schema.parse(body.params),
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ data });
  } catch (e) {
    return failure(e);
  }
}
