import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/auth";
import { checkOrigin, failure } from "@/lib/http";
import { loginNameSchema } from "@/lib/account-validation";
export async function POST(request: Request) {
  try {
    const { db } = await session();
    checkOrigin(request);
    const input = z
      .object({
        username: loginNameSchema,
        display_name: z.string().trim().min(1).max(100),
      })
      .parse(await request.json());
    const { error } = await db.rpc("set_login_name", {
      p_username: input.username,
    });
    if (error) {
      if (error.code === "23505") throw Error("Choose another login name.");
      throw Error(
        "Login names need the account migration installed in Supabase.",
      );
    }
    const result = await db.auth.updateUser({
      data: { display_name: input.display_name },
    });
    if (result.error)
      throw Error(
        "Login name saved; display name could not be updated. Retry to save it.",
      );
    return NextResponse.json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
