import { context } from "@/lib/context";
import { AccountProfile } from "@/components/account-profile";
export default async function Account() {
  const { db, user } = await context();
  const { data } = await db
    .from("account_login_names")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();
  return (
    <AccountProfile
      email={user.email ?? ""}
      username={data?.username ?? ""}
      displayName={String(user.user_metadata?.display_name ?? "")}
    />
  );
}
