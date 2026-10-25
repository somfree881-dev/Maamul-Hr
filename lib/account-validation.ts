import { z } from "zod";
export const loginNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9_.-]{2,31}$/,
    "Use 3–32 letters, numbers, dots, underscores or hyphens.",
  );
export const newPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128);
