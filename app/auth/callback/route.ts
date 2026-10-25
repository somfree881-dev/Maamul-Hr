import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/server";
/** Only the fixed reset destination is allowed; URL tokens never appear in errors. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await supabase();
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  let valid = false;
  try {
    if (code && code.length < 4096) {
      const { error } = await db.auth.exchangeCodeForSession(code);
      valid = !error;
    } else if (
      token_hash &&
      token_hash.length < 4096 &&
      url.searchParams.get("type") === "recovery"
    ) {
      const { error } = await db.auth.verifyOtp({
        token_hash,
        type: "recovery",
      });
      valid = !error;
    }
  } catch {
    valid = false;
  }
  const response = NextResponse.redirect(
    new URL(
      valid ? "/reset-password" : "/forgot-password?error=invalid",
      url.origin,
    ),
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
