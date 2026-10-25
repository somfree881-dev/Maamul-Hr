import "server-only";
import { cache } from "react";
import { supabase } from "./supabase/server";
// React cache is scoped to one server render, never shared across users.
const loadSession = cache(async () => {
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("Authentication required");
  const query = db
    .from("company_memberships")
    .select("company_id,role,branch_id,companies(name,currency,timezone)");
  const { data: memberships, error: membershipError } = await query.eq(
    "user_id",
    user.id,
  );
  if (membershipError) throw new Error(membershipError.message);
  return { db, user, memberships: memberships ?? [] };
});
export async function session(company?: string) {
  const { db, user, memberships } = await loadSession();
  const membership = company
    ? memberships.find((x) => x.company_id === company)
    : memberships[0];
  if (company && !membership) throw new Error("Forbidden");
  return { db, user, membership, memberships: memberships ?? [] };
}
export function requireRole(role: string | undefined, allowed: string[]) {
  if (!role || !allowed.includes(role)) throw new Error("Forbidden");
}
