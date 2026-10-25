import { NextResponse } from "next/server";
import { ZodError } from "zod";
export function failure(error: unknown) {
  const raw = error instanceof Error ? error.message : "Request failed";
  const forbidden =
    /^(Forbidden|Independent .*required|Company administrator required|Independent reviewer required|Invalid transition or independent approver required)$/.test(
      raw,
    ) ||
    /row.level security|permission denied|Cannot coerce.*single/i.test(raw);
  const status =
    raw === "Authentication required"
      ? 401
      : forbidden
        ? 403
        : error instanceof ZodError
          ? 422
          : 400;
  const message =
    status === 403
      ? "Forbidden"
      : error instanceof ZodError
        ? "Invalid request parameters"
        : raw;
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL ?? new URL(request.url).origin;
  if (origin !== expected) throw new Error("Forbidden");
}
