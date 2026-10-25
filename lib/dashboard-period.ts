import { DateTime } from "luxon";
export type DashboardPeriod = {
  range: "today" | "month" | "all" | "custom";
  from: string | null;
  to: string;
  label: string;
};
export function dashboardPeriod(
  input: { range?: string; from?: string; to?: string },
  timezone: string,
  clock: DateTime = DateTime.now(),
): DashboardPeriod {
  const now = clock.setZone(timezone),
    today = now.toISODate()!;
  const range = ["today", "month", "all", "custom"].includes(input.range ?? "")
    ? (input.range as DashboardPeriod["range"])
    : "month";
  if (range === "all")
    return { range, from: null, to: today, label: "All time" };
  if (range === "today")
    return { range, from: today, to: today, label: "Today" };
  if (range === "month")
    return {
      range,
      from: now.startOf("month").toISODate()!,
      to: today,
      label: "This month",
    };
  const from = input.from || now.startOf("month").toISODate()!,
    to = input.to || today;
  if (
    ![from, to].every(
      (date) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) && DateTime.fromISO(date).isValid,
    ) ||
    from > to
  )
    throw new Error("Choose valid dates; From must be on or before To.");
  return {
    range,
    from,
    to,
    label: `${DateTime.fromISO(from).toFormat("dd LLL yyyy")} – ${DateTime.fromISO(to).toFormat("dd LLL yyyy")}`,
  };
}
export function attendanceTotals(rows: Record<string, unknown>[]) {
  const metrics: Record<string, number> = {
    attendance_records: rows.length,
    present: 0,
    absent: 0,
    late: 0,
    on_leave: 0,
    needs_review: 0,
    worked_hours: 0,
    overtime_hours: 0,
  };
  const daily = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (row.status === "present") metrics.present++;
    if (row.status === "absent" && row.reviewed) metrics.absent++;
    if (Number(row.late_minutes) > 0) metrics.late++;
    if (row.status === "leave") metrics.on_leave++;
    if (
      ["uncertain", "missing_in", "missing_out"].includes(String(row.status)) ||
      (row.status === "absent" && !row.reviewed)
    )
      metrics.needs_review++;
    metrics.worked_hours += Number(row.worked_minutes ?? 0) / 60;
    metrics.overtime_hours += Number(row.overtime_minutes ?? 0) / 60;
    const date = String(row.work_date),
      day = daily.get(date) ?? {
        work_date: date,
        total: 0,
        present: 0,
        late: 0,
        absent: 0,
      };
    day.total = Number(day.total) + 1;
    if (row.status === "present") day.present = Number(day.present) + 1;
    if (Number(row.late_minutes) > 0) day.late = Number(day.late) + 1;
    if (row.status === "absent" && row.reviewed)
      day.absent = Number(day.absent) + 1;
    daily.set(date, day);
  }
  return {
    metrics,
    attendance: [...daily.values()].sort((a, b) =>
      String(a.work_date).localeCompare(String(b.work_date)),
    ),
  };
}
