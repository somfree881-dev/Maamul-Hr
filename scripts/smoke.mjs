import assert from "node:assert/strict";
const base = process.env.SMOKE_URL ?? "http://localhost:3000";
let checks = 0;
for (const path of [
  "/",
  "/login",
  "/settings",
  "/reports",
  "/manage/employees",
  "/manage/attendance",
  "/manage/payroll",
]) {
  const response = await fetch(base + path);
  assert.equal(
    response.status,
    200,
    `${path} should render or redirect to login`,
  );
  const html = await response.text();
  assert.ok(html.includes("Maamul"), "Brand missing");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  checks++;
  console.log(`PASS ${path} returns HTML with security headers`);
}
let response = await fetch(`${base}/api/jobs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ task: "maintenance" }),
});
assert.equal(response.status, 401);
checks++;
console.log("PASS job endpoint rejects missing credentials");
response = await fetch(`${base}/api/workflows`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://untrusted.example",
  },
  body: JSON.stringify({
    action: "company",
    params: { p_name: "Unauthorized" },
  }),
});
assert.equal(response.status, 403);
checks++;
console.log("PASS workflow rejects cross-origin mutation");
response = await fetch(`${base}/api/connector`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    device_id: "11111111-1111-4111-8111-111111111111",
    events: [],
  }),
});
assert.equal(response.status, 401);
checks++;
console.log("PASS connector rejects missing credentials");
console.log(
  `${checks} HTTP smoke checks passed. Authenticated browser interactions were not tested.`,
);
