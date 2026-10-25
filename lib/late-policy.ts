import Decimal from "decimal.js";
import { z } from "zod";
export const latePolicySchema = z.object({
  mode: z.enum(["warning", "fixed", "per_minute", "per_hour"]),
  rate: z.coerce.number().nonnegative(),
  maximum: z.coerce.number().nonnegative(),
  legal_basis: z.string().min(1),
  authorization_reference: z.string().min(1),
});
export const payrollPolicySchema = z.object({
  daily_hours: z.number().positive().max(24),
  rounding_mode: z.enum(["half_up", "half_even", "down", "up"]),
});
/** A preview never creates a deduction. Grace is already excluded from recorded late minutes. */
export function latePenalty(
  minutes: number,
  policy: z.infer<typeof latePolicySchema>,
  authorized: boolean,
) {
  if (!Number.isFinite(minutes) || minutes < 0)
    throw new Error("Invalid late minutes");
  latePolicySchema.parse(policy);
  if (!authorized || minutes === 0 || policy.mode === "warning") return "0.00";
  const calculated =
    policy.mode === "fixed"
      ? new Decimal(policy.rate)
      : new Decimal(minutes)
          .mul(policy.rate)
          .div(policy.mode === "per_hour" ? 60 : 1);
  return Decimal.min(calculated, policy.maximum)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}
