import { it, expect } from "vitest";
import { employeeSchema, ingestionSchema } from "../lib/validation";
import { canWrite } from "../lib/modules";
const employee = {
  company_id: "11111111-1111-4111-8111-111111111111",
  branch_id: "22222222-2222-4222-8222-222222222222",
  first_name: "Asha",
  last_name: "Test",
  start_date: "2026-10-01",
  basic_salary: 300,
  currency: "USD",
};
it("validates employee create and edit payloads", () => {
  expect(employeeSchema.parse(employee).status).toBe("active");
  expect(
    employeeSchema.safeParse({ ...employee, basic_salary: -1 }).success,
  ).toBe(false);
  expect(
    employeeSchema.safeParse({ ...employee, end_date: "2026-09-01" }).success,
  ).toBe(false);
});
it("strips arbitrary injected fields", () => {
  expect(
    employeeSchema.parse({ ...employee, role: "super_admin" }),
  ).not.toHaveProperty("role");
});
it("does not permit employees or supervisors to write payroll", () => {
  expect(canWrite("employee", "finance")).toBe(false);
  expect(canWrite("supervisor", "finance")).toBe(false);
  expect(canWrite("accountant", "finance")).toBe(true);
  expect(canWrite("hr_manager", "finance")).toBe(false);
});
it("rejects naive device timestamps and oversized batches", () => {
  const event = {
    device_user_id: "7",
    occurred_at: "2026-10-01T08:00:00",
    punch: 0,
    source_key: "a".repeat(64),
  };
  expect(
    ingestionSchema.safeParse({
      device_id: employee.company_id,
      events: [event],
    }).success,
  ).toBe(false);
  expect(
    ingestionSchema.safeParse({
      device_id: employee.company_id,
      events: Array(501).fill({
        ...event,
        occurred_at: "2026-10-01T08:00:00Z",
      }),
    }).success,
  ).toBe(false);
});
