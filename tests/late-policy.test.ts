import { it, expect } from "vitest";
import { latePenalty } from "../lib/late-policy";
const base = {
  rate: 2,
  maximum: 10,
  legal_basis: "Reviewed contractual basis",
  authorization_reference: "Signed authorization",
};
it("requires authorization before proposing any late deduction", () => {
  expect(latePenalty(30, { ...base, mode: "per_minute" }, false)).toBe("0.00");
});
it("supports fixed, per-minute, per-hour and warning policies with a cap", () => {
  expect(latePenalty(30, { ...base, mode: "fixed" }, true)).toBe("2.00");
  expect(latePenalty(30, { ...base, mode: "per_minute" }, true)).toBe("10.00");
  expect(latePenalty(30, { ...base, mode: "per_hour" }, true)).toBe("1.00");
  expect(latePenalty(30, { ...base, mode: "warning" }, true)).toBe("0.00");
});
