import { it, expect } from "vitest";
import { loginNameSchema, newPasswordSchema } from "../lib/account-validation";
import { publicPath } from "../lib/access-policy";
it("normalizes a login name without allowing email syntax or path characters", () => {
  expect(loginNameSchema.parse(" Zakaria.HR ")).toBe("zakaria.hr");
  for (const name of ["ab", "../admin", "user@company.com", "with spaces"])
    expect(loginNameSchema.safeParse(name).success).toBe(false);
});
it("requires strong new passwords without trimming their characters", () => {
  expect(newPasswordSchema.safeParse("short").success).toBe(false);
  expect(newPasswordSchema.parse("  pass word 1234  ")).toBe(
    "  pass word 1234  ",
  );
});
it("allows only exact recovery endpoints without exposing account settings", () => {
  for (const path of [
    "/forgot-password",
    "/reset-password",
    "/auth/callback",
    "/api/auth/login",
  ])
    expect(publicPath(path)).toBe(true);
  for (const path of [
    "/account",
    "/api/account",
    "/api/auth/login/private",
    "/reset-password/private",
  ])
    expect(publicPath(path)).toBe(false);
});
