import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/auth";
import { checkOrigin, failure } from "@/lib/http";
import { processDay } from "@/lib/attendance-service";
const schema = z.object({
  company_id: z.uuid(),
  employee_id: z.uuid(),
  date: z.iso.date(),
});
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = schema.parse(await request.json());
    const { db } = await session(input.company_id);
    return NextResponse.json(await processDay(db, input));
  } catch (e) {
    return failure(e);
  }
}
