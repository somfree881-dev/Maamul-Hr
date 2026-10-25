import { describe, it, expect } from "vitest";
import { processAttendance, type Shift } from "../lib/attendance";
const shift: Shift = {
  start_time: "08:00",
  end_time: "17:00",
  break_minutes: 60,
  grace_minutes: 10,
  working_days: [1, 2, 3, 4, 5, 6],
};
const common = {
  date: "2026-10-01",
  timezone: "Africa/Nairobi",
  shift,
  syncComplete: true,
  now: "2026-10-03T00:00:00Z",
};
const p = (t: string, punch?: number) => ({
  occurred_at: `2026-10-01T${t}:00+03:00`,
  punch,
});
describe("attendance calculation", () => {
  it("calculates ordered split shifts without counting the gap as work", () => {
    const result = processAttendance({
      ...common,
      shift: {
        ...shift,
        break_minutes: 0,
        segments: [
          { start: "08:00", end: "12:00" },
          { start: "16:00", end: "20:00" },
        ],
      },
      punches: [p("08:00", 0), p("12:00", 1), p("16:00", 0), p("20:00", 1)],
    });
    expect(result.worked_minutes).toBe(480);
    expect(result.scheduled_minutes).toBe(480);
    expect(result.status).toBe("present");
  });
  it("holds a split shift with a missing segment for review", () => {
    expect(
      processAttendance({
        ...common,
        shift: {
          ...shift,
          segments: [
            { start: "08:00", end: "12:00" },
            { start: "16:00", end: "20:00" },
          ],
        },
        punches: [p("08:00", 0), p("12:00", 1)],
      }).status,
    ).toBe("uncertain");
  });
  it("pairs a complete work day and removes scheduled break", () => {
    const r = processAttendance({
      ...common,
      punches: [p("08:00", 0), p("17:00", 1)],
    });
    expect(r.status).toBe("present");
    expect(r.worked_minutes).toBe(480);
  });
  it("removes duplicate punch timestamps", () => {
    expect(
      processAttendance({
        ...common,
        punches: [p("08:00", 0), p("08:00", 0), p("17:00", 1)],
      }).worked_minutes,
    ).toBe(480);
  });
  it("does not mark absence when synchronization is missing", () => {
    expect(
      processAttendance({ ...common, punches: [], syncComplete: false }).status,
    ).toBe("uncertain");
  });
  it("does not mark absence before shift and sync window close", () => {
    expect(
      processAttendance({
        ...common,
        punches: [],
        now: "2026-10-01T09:00:00+03:00",
      }).status,
    ).toBe("uncertain");
  });
  it("flags missing checkout", () => {
    expect(
      processAttendance({ ...common, punches: [p("08:00", 0)] }).status,
    ).toBe("missing_out");
  });
  it("flags missing checkin", () => {
    const r = processAttendance({ ...common, punches: [p("17:00", 1)] });
    expect(r.status).toBe("missing_in");
    expect(r.first_in).toBeNull();
  });
  it("calculates late minutes after grace", () => {
    expect(
      processAttendance({ ...common, punches: [p("08:30", 0), p("17:00", 1)] })
        .late_minutes,
    ).toBe(20);
  });
  it("handles multiple punch pairs without subtracting a break twice", () => {
    expect(
      processAttendance({
        ...common,
        punches: [p("08:00", 0), p("12:00", 1), p("13:00", 0), p("17:00", 1)],
      }).worked_minutes,
    ).toBe(480);
  });
  it("flags invalid explicit punch order", () => {
    expect(
      processAttendance({
        ...common,
        punches: [p("08:00", 0), p("09:00", 0), p("17:00", 1)],
      }).status,
    ).toBe("uncertain");
  });
  it("handles overnight shifts across dates", () => {
    const r = processAttendance({
      ...common,
      shift: {
        ...shift,
        start_time: "22:00",
        end_time: "06:00",
        break_minutes: 0,
      },
      punches: [
        { occurred_at: "2026-10-01T22:00:00+03:00", punch: 0 },
        { occurred_at: "2026-10-02T06:00:00+03:00", punch: 1 },
      ],
    });
    expect(r.worked_minutes).toBe(480);
    expect(r.status).toBe("present");
  });
  it("keeps approved paid leave payable", () => {
    expect(
      processAttendance({ ...common, punches: [], leave: { paid: true } }),
    ).toMatchObject({ status: "leave", paid_leave: true });
  });
  it("tracks unpaid leave separately", () => {
    expect(
      processAttendance({ ...common, punches: [], leave: { paid: false } }),
    ).toMatchObject({ status: "leave", paid_leave: false });
  });
  it("detects rest days", () => {
    expect(
      processAttendance({ ...common, date: "2026-10-04", punches: [] }).status,
    ).toBe("rest");
  });
  it("detects holidays", () => {
    expect(
      processAttendance({ ...common, punches: [], holiday: true }).status,
    ).toBe("holiday");
  });
  it("calculates overtime but does not authorize earnings", () => {
    expect(
      processAttendance({ ...common, punches: [p("08:00", 0), p("18:00", 1)] })
        .overtime_minutes,
    ).toBe(60);
  });
  it("rejects invalid zones", () => {
    expect(() =>
      processAttendance({ ...common, timezone: "Not/AZone", punches: [] }),
    ).toThrow();
  });
});

it("retains lateness and early departure when duplicate IN punches need review", () => {
  const r = processAttendance({
    ...common,
    punches: [p("08:30", 0), p("08:31", 0), p("16:00", 1)],
  });
  expect(r.status).toBe("uncertain");
  expect(r.late_minutes).toBe(20);
  expect(r.early_minutes).toBe(60);
  expect(r.worked_minutes).toBe(0);
});
it("shows lateness for an unmatched check-in", () => {
  const r = processAttendance({ ...common, punches: [p("08:30", 0)] });
  expect(r.late_minutes).toBe(20);
  expect(r.last_out).toBeNull();
});
