import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/server";
import { checkOrigin, failure } from "@/lib/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const db = await supabase();
    await db.auth.signOut();
    return NextResponse.redirect(new URL("/login", request.url), 303);
  } catch (e) {
    return failure(e);
  }
}
