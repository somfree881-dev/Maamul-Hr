import { NextResponse } from "next/server";
import { ZodError } from "zod";
export function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  return NextResponse.json(
    { error: message },
    {
      status:
        error instanceof ZodError
          ? 422
          : message === "Authentication required"
            ? 401
            : message === "Forbidden"
              ? 403
              : 400,
    },
  );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL ?? new URL(request.url).origin;
  if (origin !== expected) throw new Error("Forbidden");
}
