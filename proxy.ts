import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { inspectPublicSupabaseConfig } from "./lib/supabase/config";
import { publicPath, machinePath } from "./lib/access-policy";
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  let response = NextResponse.next({ request });
  const privateHeaders = (r: NextResponse) => {
    r.headers.set("Cache-Control", "private, no-store, max-age=0");
    r.headers.set("Vary", "Cookie");
    return r;
  };
  if (publicPath(path)) return privateHeaders(response);
  // Device and job endpoints use their own server-validated machine credentials.
  if (machinePath(path)) return privateHeaders(response);
  let authenticated = false;
  if (
    inspectPublicSupabaseConfig(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ).valid
  ) {
    try {
      const client = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          cookies: {
            getAll: () => request.cookies.getAll(),
            setAll(items) {
              items.forEach(({ name, value }) =>
                request.cookies.set(name, value),
              );
              response = NextResponse.next({ request });
              items.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options),
              );
            },
          },
        },
      );
      const { data, error } = await client.auth.getUser();
      authenticated = !error && !!data.user;
    } catch {
      authenticated = false;
    }
  }
  if (!authenticated) {
    const denied =
      path.startsWith("/api/") || path === "/auth/signout"
        ? NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
          )
        : NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    return privateHeaders(denied);
  }
  return privateHeaders(response);
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
