import { z } from "zod";
const uuid = z.uuid();
const optionalUuid = uuid.nullable().optional();
const optionalText = z.string().max(2000).nullable().optional();
export const employeeSchema = z
  .object({
    company_id: uuid,
    branch_id: uuid,
    department_id: optionalUuid,
    position_id: optionalUuid,
    first_name: z.string().trim().min(1).max(100),
    middle_name: optionalText,
    last_name: z.string().trim().min(1).max(100),
    father_name: optionalText,
    mother_name: optionalText,
    date_of_birth: z.iso.date().nullable().optional(),
    gender: optionalText,
    nationality: optionalText,
    phone: optionalText,
    alternative_phone: optionalText,
    district: optionalText,
    address: optionalText,
    emergency_name: optionalText,
    emergency_phone: optionalText,
    emergency_relationship: optionalText,
    start_date: z.iso.date(),
    end_date: z.iso.date().nullable().optional(),
    employment_type: z
      .enum(["full_time", "part_time", "contract"])
      .default("full_time"),
    status: z
      .enum(["active", "inactive", "terminated", "on_leave"])
      .default("active"),
    basic_salary: z.coerce.number().min(0).max(1e12),
    currency: z.string().regex(/^[A-Z]{3}$/),
    payment_method: optionalText,
    reporting_manager_id: optionalUuid,
    user_id: optionalUuid,
  })
  .refine((e) => !e.end_date || e.end_date >= e.start_date, {
    message: "End date precedes start date",
  });
export const ingestionSchema = z.object({
  device_id: uuid,
  events: z
    .array(
      z.object({
        device_user_id: z.string().min(1).max(100),
        occurred_at: z.iso.datetime({ offset: true }),
        punch: z.number().int().min(0).max(255).nullable(),
        source_key: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(500),
});
