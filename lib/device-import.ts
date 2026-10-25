import { z } from "zod";
export const deviceUserSchema = z
  .object({
    device_user_id: z.string().min(1).max(100),
    name: z.string().trim().max(200),
    device_group: z.string().trim().max(40).optional(),
  })
  .strict();
export const rosterMessageSchema = z.discriminatedUnion("mode", [
  z.object({ device_id: z.uuid(), mode: z.literal("users_poll") }).strict(),
  z
    .object({
      device_id: z.uuid(),
      mode: z.literal("users_batch"),
      request_id: z.uuid(),
      offset: z.number().int().min(0).max(20000),
      users: z.array(deviceUserSchema).max(500),
      final: z.boolean(),
    })
    .strict(),
  z
    .object({
      device_id: z.uuid(),
      mode: z.literal("users_error"),
      request_id: z.uuid(),
      error: z.enum(["device_unreachable", "read_failed"]),
    })
    .strict(),
]);
export type ImportPreview = {
  id: string;
  status: string;
  error?: string;
  device_name: string;
  timezone: string;
  preview_token: string;
  new_users: number;
  existing_matches: number;
  conflicts: number;
  historical_records: number;
  unmapped_attendance: number;
  results?: Record<string, number>;
  employees: { id: string; label: string }[];
  users: {
    device_user_id: string;
    name: string;
    kind: "new" | "match" | "mapped" | "conflict";
    employee_id: string | null;
    reason?: string;
  }[];
};
