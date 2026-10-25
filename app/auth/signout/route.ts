import { NextResponse } from "next/server";
import { session } from "@/lib/auth";
import { checkOrigin, failure } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const { db } = await session();
    checkOrigin(request);
    await db.auth.signOut();
    return NextResponse.redirect(new URL("/login", request.url), 303);
  } catch (e) {
    return failure(e);
  }
}
