import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { inspectPublicSupabaseConfig } from "./config";
export function configured() {
  return inspectPublicSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ).valid;
}
export async function supabase() {
  if (!configured())
    throw new Error("Supabase is not configured. Follow README.md.");
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll(items) {
          try {
            items.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server components cannot write cookies; proxy refreshes sessions. */
          }
        },
      },
    },
  );
}
