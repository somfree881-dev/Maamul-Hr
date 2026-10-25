/** No migrations or record writes. --probe performs only GET requests. */
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
nextEnv.loadEnvConfig(process.cwd(), true, {
  info() {},
  error() {
    console.error("Environment loading failed (values hidden).");
  },
});
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const placeholder = (v) =>
  !v || /YOUR_PROJECT|YOUR_PUBLISHABLE|^YOUR_|^<.+>$/.test(v);
let privileged = key?.startsWith("sb_secret_");
if (key?.split(".").length === 3) {
  try {
    privileged ||=
      JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
        .role === "service_role";
  } catch {
    /* invalid key is rejected by the project */
  }
}
const rows = {
  project_url: placeholder(url) ? "missing or placeholder" : "set (hidden)",
  publishable_key: placeholder(key)
    ? "missing or placeholder"
    : privileged
      ? "UNSAFE privileged key"
      : "set (hidden)",
  server_key: process.env.SUPABASE_SERVICE_ROLE_KEY
    ? "set (hidden; not used by this check)"
    : "not set (optional for initial setup)",
  app_origin:
    process.env.APP_URL === "http://localhost:3000"
      ? "localhost:3000"
      : process.env.APP_URL
        ? "custom origin (hidden)"
        : "missing",
};
console.log(JSON.stringify(rows, null, 2));
if (placeholder(url) || placeholder(key) || privileged) {
  console.log(
    "NOT CONNECTED: fill .env.local with the project URL and publishable key. No network or database changes performed.",
  );
  process.exitCode = 1;
} else {
  let valid = false;
  try {
    const parsed = new URL(url);
    valid =
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      (parsed.protocol === "https:" ||
        (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
          parsed.protocol === "http:"));
  } catch {}
  if (!valid) {
    console.error("Invalid project origin (value hidden).");
    process.exitCode = 1;
  } else if (!process.argv.includes("--probe"))
    console.log(
      "Configuration present. Connection NOT verified. Use --probe for read-only Auth/REST reachability checks.",
    );
  else {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    });
    try {
      const auth = await fetch(new URL("/auth/v1/settings", url), {
        headers: { apikey: key },
        signal: AbortSignal.timeout(15000),
      });
      console.log(
        `Auth settings reachability: HTTP ${auth.status} (not an authenticated user operation).`,
      );
      const { error } = await db
        .from("company_memberships")
        .select("company_id", { head: true })
        .limit(1);
      console.log(
        error
          ? `Anonymous REST probe: ${error.code ?? "request_failed"} (response content hidden).`
          : "Anonymous REST probe succeeded; this does NOT verify authenticated access or RLS isolation.",
      );
      console.log(
        "Connection NOT verified until a signed-in user successfully reads the database. No migrations or records were written.",
      );
    } catch {
      console.error(
        "Reachability check failed (URL, headers and response body hidden). Check project status, network and key.",
      );
      process.exitCode = 1;
    }
  }
}
