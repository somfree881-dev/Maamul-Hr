import { NextResponse } from "next/server";
import { z } from "zod";
import { session, requireRole } from "@/lib/auth";
import { checkOrigin, failure } from "@/lib/http";
const schema = z
  .object({
    company: z.uuid(),
    device: z.uuid(),
    action: z.enum(["latest", "request", "preview", "confirm", "cancel"]),
    request_id: z.uuid().optional(),
    preview_token: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    start_date: z.iso.date().optional(),
    confirmed: z.literal(true).optional(),
    decisions: z
      .array(
        z
          .object({
            device_user_id: z.string().min(1).max(100),
            action: z.enum(["create", "link", "skip"]),
            employee_id: z.uuid().optional(),
          })
          .strict(),
      )
      .max(20000)
      .optional(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    await session();
    checkOrigin(request);
    const input = schema.parse(await request.json());
    const { db, membership } = await session(input.company);
    requireRole(membership?.role, [
      "super_admin",
      "company_admin",
      "hr_manager",
    ]);
    const { data: device, error } = await db
      .from("attendance_devices")
      .select("id")
      .eq("id", input.device)
      .eq("company_id", input.company)
      .maybeSingle();
    if (error || !device) throw Error("Forbidden");
    if (input.action === "latest") {
      const last = await db
        .from("device_employee_imports")
        .select("id")
        .eq("device_id", device.id)
        .eq("company_id", input.company)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last.error)
        throw Error("Install the device employee import migration first.");
      return NextResponse.json({ request_id: last.data?.id ?? null });
    }
    if (input.action === "request") {
      const r = await db.rpc("request_device_employee_import", {
        p_device: device.id,
      });
      if (r.error)
        throw Error(
          r.error.code === "PGRST202"
            ? "Install the device employee import migration first."
            : r.error.message,
        );
      return NextResponse.json({ request_id: r.data });
    }
    if (!input.request_id) throw Error("Select an import request");
    const { data: batch, error: be } = await db
      .from("device_employee_imports")
      .select("id")
      .eq("id", input.request_id)
      .eq("device_id", device.id)
      .eq("company_id", input.company)
      .maybeSingle();
    if (be || !batch) throw Error("Forbidden");
    const r =
      input.action === "preview"
        ? await db.rpc("preview_device_employee_import", {
            p_request: batch.id,
          })
        : input.action === "cancel"
          ? await db.rpc("cancel_device_employee_import", {
              p_request: batch.id,
            })
          : await db.rpc("confirm_device_employee_import", {
              p_request: batch.id,
              p_token: z.string().parse(input.preview_token),
              p_start: input.start_date ?? null,
              p_decisions: z
                .array(z.unknown())
                .parse(input.confirmed ? input.decisions : undefined),
            });
    if (r.error) throw Error(r.error.message);
    return NextResponse.json(
      { data: r.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
