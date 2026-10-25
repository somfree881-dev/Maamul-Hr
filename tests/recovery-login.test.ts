import { it, expect, vi, beforeEach } from "vitest";
const mock = vi.hoisted(() => ({
  signIn: vi.fn(),
  resolve: vi.fn(),
  exchange: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  supabase: async () => ({
    auth: {
      signInWithPassword: mock.signIn,
      exchangeCodeForSession: mock.exchange,
      verifyOtp: mock.verify,
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  admin: () => ({ rpc: mock.resolve }),
}));
import { POST } from "../app/api/auth/login/route";
import { GET } from "../app/auth/callback/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "https://maamul.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-server-only");
  mock.signIn.mockResolvedValue({ error: null });
  mock.exchange.mockResolvedValue({ error: null });
});
const request = (identifier: string) =>
  new Request("https://maamul.test/api/auth/login", {
    method: "POST",
    headers: { origin: "https://maamul.test" },
    body: JSON.stringify({ identifier, password: "fixture-password-123" }),
  });
it("email login returns no session tokens or password", async () => {
  const r = await POST(request("fixture@maamul.invalid"));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ signed_in: true });
  expect(mock.resolve).not.toHaveBeenCalled();
});
it("resolves a username only on the server", async () => {
  mock.resolve.mockResolvedValue({
    data: "private@maamul.invalid",
    error: null,
  });
  const r = await POST(request(" Zakaria "));
  expect(mock.resolve).toHaveBeenCalledWith("resolve_login_email", {
    p_login: "zakaria",
  });
  expect(mock.signIn).toHaveBeenCalledWith({
    email: "private@maamul.invalid",
    password: "fixture-password-123",
  });
  expect(await r.text()).not.toContain("private@maamul.invalid");
});
it("unknown username has the same generic authentication failure", async () => {
  mock.resolve.mockResolvedValue({ data: null, error: null });
  mock.signIn.mockResolvedValue({ error: Error("Invalid credentials") });
  const r = await POST(request("unknown-user"));
  expect(r.status).toBe(401);
  expect(await r.json()).toEqual({ error: "Invalid sign-in details." });
});
it("denies cross-origin login", async () => {
  const r = await POST(
    new Request("https://maamul.test/api/auth/login", {
      method: "POST",
      headers: { origin: "https://evil.test" },
    }),
  );
  expect(r.status).toBe(403);
  expect(mock.signIn).not.toHaveBeenCalled();
});
it("recovery callback cannot redirect to an external destination", async () => {
  const r = await GET(
    new Request(
      "https://maamul.test/auth/callback?code=fixture&next=https://evil.test",
    ),
  );
  expect(r.headers.get("location")).toBe("https://maamul.test/reset-password");
  expect(mock.exchange).toHaveBeenCalledWith("fixture");
});
it("invalid callback returns no token or backend details", async () => {
  mock.exchange.mockResolvedValue({ error: Error("private backend detail") });
  const r = await GET(
    new Request("https://maamul.test/auth/callback?code=private-fixture"),
  );
  expect(r.headers.get("location")).toBe(
    "https://maamul.test/forgot-password?error=invalid",
  );
  expect(await r.text()).not.toContain("private");
});
