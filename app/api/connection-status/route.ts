import { NextResponse } from "next/server";
import { configured, supabase } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
/** Authenticated GET proof only: never creates users, schema, companies or employee records. */
export async function GET() {
  if (!configured())
    return NextResponse.json(
      { state: "not_configured", authenticated_database_operation: false },
      { status: 503, headers },
    );
  try {
    const db = await supabase();
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user)
      return NextResponse.json(
        {
          state: "authentication_required",
          authenticated_database_operation: false,
        },
        { status: 401, headers },
      );
    const { error: databaseError, count } = await db
      .from("company_memberships")
      .select("company_id", { head: true, count: "exact" })
      .eq("user_id", user.id);
    if (databaseError)
      return NextResponse.json(
        {
          state: "database_read_failed",
          authenticated_database_operation: false,
          code: databaseError.code ?? null,
          hint:
            databaseError.code === "42501"
              ? "Review explicit table grants and RLS."
              : "Review approved migrations and API schema exposure.",
        },
        { status: 503, headers },
      );
    return NextResponse.json(
      {
        state: "authenticated_database_verified",
        authenticated_database_operation: true,
        membership_count: count ?? 0,
        checked_at: new Date().toISOString(),
        note: "This verifies one authenticated read, not employee writes, Storage, RLS isolation or all modules.",
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { state: "verification_failed", authenticated_database_operation: false },
      { status: 503, headers },
    );
  }
}
