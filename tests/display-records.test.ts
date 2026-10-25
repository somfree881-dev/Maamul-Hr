import { it, expect } from "vitest";
it("combines name parts into one Full Name field", () => {
  expect(
    cleanRecord({
      first_name: "Zakaria",
      middle_name: "Hassan",
      last_name: "Ismail",
    }),
  ).toEqual({ full_name: "Zakaria Hassan Ismail" });
  expect(
    cleanRecord({ first_name: "Asha", middle_name: null, last_name: "Ali" }),
  ).toEqual({ full_name: "Asha Ali" });
});
import {
  cleanRecord,
  displayValue,
  displayLabel,
} from "../lib/display-records";
it("hides internal references and creation timestamps while retaining employee numbers", () => {
  expect(
    cleanRecord({
      id: "c5381c17-02d6-4664-8a54-b418cb0c1953",
      branch_id: "private",
      created_at: "2026-10-19T17:35:50Z",
      employee_number: "EMP-8A6F054A",
      branch: "Main branch",
    }),
  ).toEqual({ employee_number: "EMP-8A6F054A", branch: "Main branch" });
});
it("uses readable dates, labels and redacts UUID values", () => {
  expect(displayValue("2026-10-19")).toBe("19 Oct 2026");
  expect(displayLabel("reporting_manager_id")).toBe("Reporting Manager");
  expect(displayValue("c5381c17-02d6-4664-8a54-b418cb0c1953")).not.toContain(
    "c5381c17",
  );
});
