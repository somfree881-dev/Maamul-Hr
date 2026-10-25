import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { session } from "./auth";
import { configured } from "./supabase/server";
export async function context() {
  if (!configured()) redirect("/login");
  let s;
  try {
    s = await session();
  } catch (e) {
    if (e instanceof Error && e.message === "Authentication required")
      redirect("/login");
    throw e;
  }
  const id = (await cookies()).get("company_id")?.value;
  const m = s.memberships.find((x) => x.company_id === id) ?? s.membership;
  return { ...s, membership: m };
}
