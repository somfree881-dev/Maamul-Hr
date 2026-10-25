/** Only public settings belong here; this module can be imported by browser code. */
export function inspectPublicSupabaseConfig(url?: string, key?: string) {
  const issues: string[] = [];
  const placeholder = (value: string) =>
    /YOUR_PROJECT|YOUR_PUBLISHABLE|^YOUR_|^<.+>$/.test(value);
  if (!url || placeholder(url))
    issues.push("Set NEXT_PUBLIC_SUPABASE_URL in .env.local.");
  else {
    try {
      const parsed = new URL(url);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(
        parsed.hostname,
      );
      if (
        (parsed.protocol !== "https:" &&
          !(local && parsed.protocol === "http:")) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        parsed.pathname !== "/"
      )
        issues.push(
          "Supabase URL must be an HTTPS project origin (HTTP is allowed for local Supabase).",
        );
    } catch {
      issues.push("Supabase URL is not a valid project origin.");
    }
  }
  let unsafePublicKey = !!key?.startsWith("sb_secret_");
  if (key?.split(".").length === 3) {
    try {
      const payload = JSON.parse(
        atob(key.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
      );
      unsafePublicKey ||= payload.role === "service_role";
      if (payload.role !== "anon" && payload.role !== "service_role")
        issues.push(
          "Use a publishable or legacy anon API key, not a user access token.",
        );
    } catch {
      issues.push("The legacy anon key is malformed.");
    }
  } else if (
    key &&
    !placeholder(key) &&
    !key.startsWith("sb_publishable_") &&
    !unsafePublicKey
  )
    issues.push("Use a Supabase publishable key or a legacy anon key.");
  if (!key || placeholder(key))
    issues.push("Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.");
  if (unsafePublicKey)
    issues.push(
      "A privileged key is configured as public. Remove it and rotate it in Supabase before continuing.",
    );
  return { valid: issues.length === 0, unsafePublicKey, issues };
}
