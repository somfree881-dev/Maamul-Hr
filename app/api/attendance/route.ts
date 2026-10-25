import { NextResponse } from "next/server";
import { z } from "zod";
import { session, requireRole } from "@/lib/auth";
import { checkOrigin, failure } from "@/lib/http";
import { processDay } from "@/lib/attendance-service";
const schema = z.object({
  company_id: z.uuid(),
  employee_id: z.uuid(),
  date: z.iso.date(),
});
export async function POST(request: Request) {
  try {
    await session();
    checkOrigin(request);
    const input = schema.parse(await request.json());
    const { db, membership } = await session(input.company_id);
    requireRole(membership?.role, [
      "super_admin",
      "company_admin",
      "hr_manager",
      "branch_manager",
      "supervisor",
    ]);
    return NextResponse.json(await processDay(db, input));
  } catch (e) {
    return failure(e);
  }
}
