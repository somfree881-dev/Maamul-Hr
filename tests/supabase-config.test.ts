import { expect, it } from "vitest";
import { inspectPublicSupabaseConfig as inspect } from "../lib/supabase/config";
it("treats template values as unconfigured without contacting Supabase", () => {
  expect(
    inspect("https://YOUR_PROJECT.supabase.co", "YOUR_PUBLISHABLE_OR_ANON_KEY")
      .valid,
  ).toBe(false);
});
it("accepts publishable keys for hosted and local project origins", () => {
  expect(
    inspect("https://example.supabase.co", "sb_publishable_example").valid,
  ).toBe(true);
  expect(
    inspect("http://127.0.0.1:54321", "sb_publishable_example").valid,
  ).toBe(true);
});
it("rejects privileged secret keys and legacy service-role keys", () => {
  expect(
    inspect("https://example.supabase.co", "sb_secret_private").unsafePublicKey,
  ).toBe(true);
  const token = `e30.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;
  expect(inspect("https://example.supabase.co", token).unsafePublicKey).toBe(
    true,
  );
});
it("accepts a legacy anon key and rejects user session tokens", () => {
  const token = (role: string) =>
    `e30.${btoa(JSON.stringify({ role }))}.signature`;
  expect(inspect("https://example.supabase.co", token("anon")).valid).toBe(
    true,
  );
  expect(
    inspect("https://example.supabase.co", token("authenticated")).valid,
  ).toBe(false);
});
it("rejects credentials, paths and insecure hosted origins without disclosing key values", () => {
  for (const url of [
    "http://example.supabase.co",
    "https://user:password@example.supabase.co",
    "https://example.supabase.co/rest/v1",
  ])
    expect(inspect(url, "sb_publishable_example").valid).toBe(false);
  expect(JSON.stringify(inspect("invalid", "sb_secret_private"))).not.toContain(
    "sb_secret_private",
  );
});
