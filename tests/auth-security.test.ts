import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/auth", () => ({
  session: mocks.session,
  requireRole: (role: string, allowed: string[]) => {
    if (!allowed.includes(role)) throw Error("Forbidden");
  },
}));
vi.mock("server-only", () => ({}));
import { proxy } from "../proxy";
import { canViewModule } from "../lib/modules";
import { POST as attendance } from "../app/api/attendance/route";
import { POST as workflow } from "../app/api/workflows/route";
import { POST as records } from "../app/api/records/[module]/route";
import { GET as exportReport } from "../app/api/export/route";
import { POST as documents } from "../app/api/documents/route";
import { POST as generate } from "../app/api/generate-salaries/route";
import { publicPath, machinePath } from "../lib/access-policy";
const company = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture");
  vi.stubEnv("APP_URL", "https://maamul.test");
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.session.mockRejectedValue(Error("Authentication required"));
});
afterEach(() => vi.unstubAllEnvs());
describe("public boundary", () => {
  for (const path of [
    "/",
    "/manage/employees",
    "/manage/payroll",
    "/reports",
    "/settings",
    "/employees/" + company,
  ])
    it(`redirects anonymous ${path}`, async () => {
      const r = await proxy(new NextRequest("https://maamul.test" + path));
      expect(r.status).toBe(307);
      expect(r.headers.get("location")).toBe("https://maamul.test/login");
      expect(r.headers.get("cache-control")).toContain("no-store");
    });
  it("keeps login public without calling business authentication", async () => {
    expect(
      (await proxy(new NextRequest("https://maamul.test/login"))).status,
    ).toBe(200);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("rejects expired or forged sessions on direct refresh", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: Error("JWT expired"),
    });
    expect(
      (
        await proxy(
          new NextRequest("https://maamul.test/reports", {
            headers: { cookie: "forged=expired" },
          }),
        )
      ).status,
    ).toBe(307);
  });
  it("allows only a server-confirmed user", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: company } },
      error: null,
    });
    expect(
      (await proxy(new NextRequest("https://maamul.test/reports"))).status,
    ).toBe(200);
  });
  it("fails closed when authentication is unavailable", async () => {
    mocks.getUser.mockRejectedValue(Error("offline"));
    expect(
      (await proxy(new NextRequest("https://maamul.test/api/export"))).status,
    ).toBe(401);
  });
  it("does not exempt public-looking prefixes", () => {
    expect(publicPath("/login/private")).toBe(false);
    expect(machinePath("/api/connector-keys")).toBe(false);
    expect(machinePath("/api/jobs-anything")).toBe(false);
  });
});
describe("API authentication before origin or body parsing", () => {
  const req = () =>
    new Request("https://maamul.test/api/test", {
      method: "POST",
      body: "invalid-json",
    });
  for (const [name, handler] of Object.entries({
    attendance,
    workflow,
    documents,
    generate,
  }))
    it(`${name} returns 401 without a session`, async () =>
      expect((await handler(req())).status).toBe(401));
  it("record writes return 401 without leaking validation details", async () =>
    expect(
      (
        await records(req(), {
          params: Promise.resolve({ module: "employees" }),
        })
      ).status,
    ).toBe(401));
  it("exports require login even with invalid parameters", async () =>
    expect(
      (await exportReport(new Request("https://maamul.test/api/export")))
        .status,
    ).toBe(401));
});
describe("role and tenant authorization", () => {
  it("employee cannot export payroll administration", async () => {
    mocks.session.mockResolvedValue({
      db: {},
      membership: { role: "employee", company_id: company },
    });
    expect(
      (
        await exportReport(
          new Request(
            `https://maamul.test/api/export?company=${company}&module=payroll`,
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("employee cannot process attendance through a direct API call", async () => {
    mocks.session.mockResolvedValue({
      db: {},
      membership: { role: "employee" },
    });
    expect(
      (
        await attendance(
          new Request("https://maamul.test/api/attendance", {
            method: "POST",
            headers: {
              origin: "https://maamul.test",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              company_id: company,
              employee_id: company,
              date: "2026-10-20",
            }),
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("cross-company membership denial returns 403", async () => {
    mocks.session.mockImplementation(async (c?: string) => {
      if (c) throw Error("Forbidden");
      return { db: {}, membership: { role: "company_admin" } };
    });
    expect(
      (
        await exportReport(
          new Request(
            `https://maamul.test/api/export?company=${company}&module=employees`,
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("an employee cannot generate or approve a payroll through workflows", async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: { company_id: company }, error: null }),
    };
    mocks.session.mockResolvedValue({
      db: { from: () => chain, rpc: mocks.rpc },
      membership: { role: "employee" },
    });
    const r = await workflow(
      new Request("https://maamul.test/api/workflows", {
        method: "POST",
        headers: { origin: "https://maamul.test" },
        body: JSON.stringify({
          action: "generate",
          params: { p_period: company },
        }),
      }),
    );
    expect(r.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps own salary views while denying payroll administration", () => {
    expect(canViewModule("employee", "balances")).toBe(true);
    expect(canViewModule("employee", "payroll")).toBe(false);
    expect(canViewModule("branch_manager", "payroll")).toBe(false);
    expect(canViewModule("hr_manager", "payroll")).toBe(false);
    expect(canViewModule("accountant", "payroll")).toBe(true);
    expect(canViewModule("company_admin", "payroll")).toBe(true);
    expect(canViewModule("unknown", "attendance")).toBe(false);
  });
});
