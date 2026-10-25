import { it, expect, vi, beforeEach } from "vitest";
import { rosterMessageSchema } from "../lib/device-import";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  session: mocks.session,
  requireRole: (role: string, roles: string[]) => {
    if (!roles.includes(role)) throw Error("Forbidden");
  },
}));
import { POST } from "../app/api/device-import/route";
const device = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "https://maamul.test");
});
it("accepts only whitelisted non-biometric metadata", () => {
  const base = {
    device_id: device,
    request_id: device,
    mode: "users_batch",
    offset: 0,
    final: true,
    users: [
      { device_user_id: "003", name: "Fixture Person", device_group: "1" },
    ],
  };
  expect(rosterMessageSchema.safeParse(base).success).toBe(true);
  for (const field of ["password", "card", "fingerprints", "face", "privilege"])
    expect(
      rosterMessageSchema.safeParse({
        ...base,
        users: [{ ...base.users[0], [field]: "must-not-be-uploaded" }],
      }).success,
    ).toBe(false);
  expect(
    rosterMessageSchema.safeParse({
      ...base,
      users: Array(501).fill(base.users[0]),
    }).success,
  ).toBe(false);
});
it("requires authentication before import validation", async () => {
  mocks.session.mockRejectedValue(Error("Authentication required"));
  const r = await POST(
    new Request("https://maamul.test/api/device-import", {
      method: "POST",
      body: "invalid",
    }),
  );
  expect(r.status).toBe(401);
});
it("denies branch supervisors and employees before accessing device data", async () => {
  for (const role of [
    "employee",
    "branch_manager",
    "supervisor",
    "accountant",
  ]) {
    mocks.session.mockResolvedValue({ db: {}, membership: { role } });
    const r = await POST(
      new Request("https://maamul.test/api/device-import", {
        method: "POST",
        headers: { origin: "https://maamul.test" },
        body: JSON.stringify({ company: device, device, action: "request" }),
      }),
    );
    expect(r.status).toBe(403);
  }
});
it("does not accept confirmation without explicit administrator acknowledgement", async () => {
  mocks.session.mockResolvedValue({
    db: {},
    membership: { role: "company_admin" },
  });
  const r = await POST(
    new Request("https://maamul.test/api/device-import", {
      method: "POST",
      headers: { origin: "https://maamul.test" },
      body: JSON.stringify({
        company: device,
        device,
        action: "confirm",
        confirmed: false,
      }),
    }),
  );
  expect(r.status).toBe(422);
});
