import { z } from "zod";
import { session, requireRole } from "@/lib/auth";
import { checkOrigin, failure } from "@/lib/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = z
      .object({
        company_id: z.uuid(),
        device_id: z.uuid(),
        key_hash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(await request.json());
    const { db, membership } = await session(input.company_id);
    requireRole(membership?.role, [
      "super_admin",
      "company_admin",
      "hr_manager",
    ]);
    const { error } = await db
      .from("attendance_devices")
      .update({ connector_key_hash: input.key_hash })
      .eq("company_id", input.company_id)
      .eq("id", input.device_id)
      .select("id")
      .single();
    if (error) throw new Error("Device key update failed");
    return Response.json(
      { updated: true, previous_key_revoked: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
