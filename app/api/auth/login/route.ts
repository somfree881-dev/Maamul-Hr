import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
import { checkOrigin, failure } from "@/lib/http";
import { loginNameSchema } from "@/lib/account-validation";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = z
      .object({
        identifier: z.string().trim().min(1).max(254),
        password: z.string().min(1).max(1024),
      })
      .parse(await request.json());
    let email = body.identifier;
    if (!email.includes("@")) {
      const parsed = loginNameSchema.safeParse(email);
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid sign-in details." },
          { status: 401 },
        );
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
        return NextResponse.json(
          {
            error:
              "Use your email address to sign in until login names are configured.",
          },
          { status: 400 },
        );
      const lookup = await admin().rpc("resolve_login_email", {
        p_login: parsed.data,
      });
      if (lookup.error)
        return NextResponse.json(
          {
            error:
              "Use your email address to sign in until login names are configured.",
          },
          { status: 400 },
        );
      // Never return the resolved email, session or tokens to the caller.
      email = lookup.data ?? "invalid-login@maamul.invalid";
    }
    const db = await supabase();
    const { error } = await db.auth.signInWithPassword({
      email,
      password: body.password,
    });
    if (error)
      return NextResponse.json(
        { error: "Invalid sign-in details." },
        { status: 401 },
      );
    return NextResponse.json(
      { signed_in: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
