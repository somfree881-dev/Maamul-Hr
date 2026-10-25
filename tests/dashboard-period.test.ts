import { it, expect } from "vitest";
import { DateTime } from "luxon";
import { dashboardPeriod, attendanceTotals } from "../lib/dashboard-period";
const clock = DateTime.fromISO("2026-10-20T00:15:00+03:00");
it("resolves today, month and all-time in company time zone", () => {
  expect(
    dashboardPeriod({ range: "today" }, "Africa/Mogadishu", clock).from,
  ).toBe("2026-10-20");
  expect(
    dashboardPeriod({ range: "month" }, "Africa/Mogadishu", clock).from,
  ).toBe("2026-10-01");
  expect(
    dashboardPeriod({ range: "all" }, "Africa/Mogadishu", clock).from,
  ).toBeNull();
});
it("validates custom dates rather than silently reversing them", () => {
  expect(() =>
    dashboardPeriod(
      { range: "custom", from: "2026-10-25", to: "2026-10-01" },
      "Africa/Mogadishu",
      clock,
    ),
  ).toThrow();
  expect(() =>
    dashboardPeriod(
      { range: "custom", from: "2026-02-30" },
      "Africa/Mogadishu",
      clock,
    ),
  ).toThrow();
  expect(
    dashboardPeriod(
      { range: "custom", from: "2026-09-01", to: "2026-09-30" },
      "Africa/Mogadishu",
      clock,
    ).to,
  ).toBe("2026-09-30");
});
it("keeps uncertain absence separate from confirmed absence across the selected records", () => {
  const result = attendanceTotals([
    {
      work_date: "2026-10-01",
      status: "present",
      late_minutes: 10,
      worked_minutes: 480,
    },
    { work_date: "2026-10-02", status: "absent", reviewed: false },
    { work_date: "2026-10-03", status: "absent", reviewed: true },
    { work_date: "2026-10-04", status: "leave" },
  ]);
  expect(result.metrics).toMatchObject({
    attendance_records: 4,
    present: 1,
    absent: 1,
    needs_review: 1,
    late: 1,
    on_leave: 1,
    worked_hours: 8,
  });
  expect(result.attendance[1].absent).toBe(0);
});
