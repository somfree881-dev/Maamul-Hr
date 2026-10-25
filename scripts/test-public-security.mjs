/** Read-only HTTP regression checks. Does not sign in or modify remote records. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import nextEnv from "@next/env";
const origin = process.env.MAAMUL_TEST_ORIGIN ?? "http://localhost:3000";
for (const path of [
  "/",
  "/manage/employees",
  "/manage/attendance",
  "/manage/payroll",
  "/reports",
  "/settings",
  "/employees/11111111-1111-4111-8111-111111111111",
]) {
  for (const cookie of ["", "sb-invalid-auth-token=invalid-expired-session"]) {
    const r = await fetch(origin + path, {
      redirect: "manual",
      headers: cookie ? { cookie } : {},
    });
    assert.equal(r.status, 307, path);
    assert.equal(new URL(r.headers.get("location"), origin).pathname, "/login");
    assert.match(r.headers.get("cache-control"), /no-store/);
  }
  console.log("PASS anonymous/invalid-session direct URL and refresh: " + path);
}
const login = await fetch(origin + "/login");
const html = await login.text();
assert.equal(login.status, 200);
assert.ok(html.includes("Sign in to your workspace"));
for (const marker of [
  'class="sidebar',
  'class="app-shell',
  'class="mobile-bottom-nav',
  "Select company",
])
  assert.ok(
    !html.includes(marker),
    "Login must not include protected navigation",
  );
console.log(
  "PASS public login has no workspace shell or organization navigation",
);
for (const [method, path] of [
  ["GET", "/api/export"],
  ["GET", "/api/documents"],
  ["GET", "/api/archive"],
  ["GET", "/api/monthly-report"],
  ["GET", "/api/connection-status"],
  ["POST", "/api/attendance"],
  ["POST", "/api/records/employees"],
  ["DELETE", "/api/records/employees"],
  ["POST", "/api/workflows"],
  ["POST", "/api/generate-salaries"],
  ["POST", "/api/connector-keys"],
  ["POST", "/api/connector"],
  ["POST", "/api/jobs"],
  ["POST", "/auth/signout"],
]) {
  const r = await fetch(origin + path, {
    method,
    redirect: "manual",
    headers: { origin },
    ...(method !== "GET" ? { body: "invalid-json" } : {}),
  });
  assert.equal(r.status, 401, `${method} ${path}`);
  console.log(`PASS anonymous ${method} ${path}: 401`);
}
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const secrets = ["SUPABASE_SERVICE_ROLE_KEY", "JOB_SECRET"]
  .map((k) => process.env[k])
  .filter((v) => v && v.length >= 16);
async function scan(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (/\.(js|json|map|html)$/.test(file)) {
      const content = await readFile(file, "utf8");
      assert.ok(
        secrets.every((s) => !content.includes(s)),
        "Server credential found in browser build artifact",
      );
    }
  }
}
await scan(".next/static");
assert.ok(
  secrets.every((s) => !html.includes(s)),
  "Server credential found in login HTML",
);
console.log(
  "PASS configured server credentials absent from browser build and login HTML",
);
