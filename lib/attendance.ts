import { DateTime } from "luxon";

export type Punch = { occurred_at: string; punch?: number | null };
export type Shift = {
  start_time: string;
  end_time: string;
  grace_minutes: number;
  break_minutes: number;
  working_days: number[];
  segments?: { start: string; end: string }[];
};
export type Attendance = {
  first_in: string | null;
  last_out: string | null;
  scheduled_minutes: number;
  worked_minutes: number;
  late_minutes: number;
  early_minutes: number;
  overtime_minutes: number;
  status:
    | "present"
    | "absent"
    | "leave"
    | "rest"
    | "holiday"
    | "missing_in"
    | "missing_out"
    | "uncertain";
  paid_leave: boolean;
  reviewed: boolean;
};

/** Explicit work-date and IANA zone avoid host-timezone and overnight-date bugs. */
export function processAttendance(input: {
  date: string;
  timezone: string;
  shift: Shift;
  punches: Punch[];
  syncComplete: boolean;
  leave?: { paid: boolean };
  holiday?: boolean;
  now?: string;
}): Attendance {
  const { date, timezone, shift } = input;
  const day = DateTime.fromISO(date, { zone: timezone });
  if (!day.isValid) throw new Error("Invalid work date or timezone");
  const start = DateTime.fromISO(`${date}T${shift.start_time}`, {
    zone: timezone,
  });
  let end = DateTime.fromISO(`${date}T${shift.end_time}`, { zone: timezone });
  if (!start.isValid || !end.isValid) throw new Error("Invalid shift");
  if (end <= start) end = end.plus({ days: 1 });
  const result: Attendance = {
    first_in: null,
    last_out: null,
    scheduled_minutes: Math.max(
      0,
      Math.round(end.diff(start, "minutes").minutes) - shift.break_minutes,
    ),
    worked_minutes: 0,
    late_minutes: 0,
    early_minutes: 0,
    overtime_minutes: 0,
    status: "uncertain",
    paid_leave: false,
    reviewed: false,
  };
  if (input.holiday)
    return { ...result, status: "holiday", scheduled_minutes: 0 };
  if (!shift.working_days.includes(day.weekday))
    return { ...result, status: "rest", scheduled_minutes: 0 };
  if (input.leave)
    return { ...result, status: "leave", paid_leave: input.leave.paid };
  if (shift.segments?.length) {
    const windows = shift.segments.map((s) => ({
      start: DateTime.fromISO(`${date}T${s.start}`, { zone: timezone }),
      end: DateTime.fromISO(`${date}T${s.end}`, { zone: timezone }),
    }));
    if (
      windows.some(
        (w, i) =>
          !w.start.isValid ||
          !w.end.isValid ||
          w.end <= w.start ||
          (i > 0 && w.start <= windows[i - 1].end),
      )
    )
      throw new Error(
        "Split segments must be ordered and non-overlapping within one work date",
      );
    const summaries = windows.map((w, index) => {
      const lower =
        index === 0
          ? w.start.minus({ hours: 4 })
          : windows[index - 1].end.plus({
              milliseconds:
                (w.start.toMillis() - windows[index - 1].end.toMillis()) / 2,
            });
      const upper =
        index === windows.length - 1
          ? w.end.plus({ hours: 4 })
          : w.end.plus({
              milliseconds:
                (windows[index + 1].start.toMillis() - w.end.toMillis()) / 2,
            });
      return processAttendance({
        ...input,
        shift: {
          ...shift,
          segments: [],
          start_time: w.start.toFormat("HH:mm"),
          end_time: w.end.toFormat("HH:mm"),
          break_minutes: 0,
        },
        punches: input.punches.filter((p) => {
          const t = DateTime.fromISO(p.occurred_at);
          return t >= lower && t < upper;
        }),
      });
    });
    const total = {
      ...result,
      first_in: summaries[0].first_in,
      last_out: summaries.at(-1)!.last_out,
    };
    for (const key of [
      "scheduled_minutes",
      "worked_minutes",
      "late_minutes",
      "early_minutes",
      "overtime_minutes",
    ] as const)
      total[key] = summaries.reduce((sum, s) => sum + s[key], 0);
    total.worked_minutes = Math.max(
      0,
      total.worked_minutes - shift.break_minutes,
    );
    total.scheduled_minutes = Math.max(
      0,
      total.scheduled_minutes - shift.break_minutes,
    );
    total.status = summaries.every((s) => s.status === "present")
      ? "present"
      : summaries.every((s) => s.status === "absent")
        ? "absent"
        : "uncertain";
    return total;
  }
  const now = input.now ? DateTime.fromISO(input.now) : DateTime.now();
  const closed = input.syncComplete && now >= end.plus({ hours: 4 });
  // Bound assignment window; orchestration rejects overlapping shift windows.
  const points = [
    ...new Map(
      input.punches.map((p) => [DateTime.fromISO(p.occurred_at).toMillis(), p]),
    ).values(),
  ]
    .map((p) => ({
      ...p,
      t: DateTime.fromISO(p.occurred_at).setZone(timezone),
    }))
    .filter(
      (p) =>
        p.t.isValid &&
        p.t >= start.minus({ hours: 4 }) &&
        p.t <= end.plus({ hours: 4 }),
    )
    .sort((a, b) => a.t.toMillis() - b.t.toMillis());
  if (!points.length)
    return { ...result, status: closed ? "absent" : "uncertain" };
  const explicit = points.every((p) => p.punch === 0 || p.punch === 1);
  const firstIn = explicit ? points.find((p) => p.punch === 0) : points[0];
  const lastOut = explicit
    ? points.findLast((p) => p.punch === 1)
    : points.length > 1
      ? points.at(-1)
      : undefined;
  result.first_in = firstIn?.t.toUTC().toISO() ?? null;
  result.last_out = lastOut?.t.toUTC().toISO() ?? null;
  // Known arrival/departure times remain useful even when pairing needs review.
  result.late_minutes = firstIn
    ? Math.max(
        0,
        Math.floor(firstIn.t.diff(start, "minutes").minutes) -
          shift.grace_minutes,
      )
    : 0;
  result.early_minutes = lastOut
    ? Math.max(0, Math.floor(end.diff(lastOut.t, "minutes").minutes))
    : 0;
  if (points.length === 1)
    return {
      ...result,
      status: closed
        ? points[0].punch === 1
          ? "missing_in"
          : "missing_out"
        : "uncertain",
    };
  let minutes = 0;
  if (explicit) {
    let opening: DateTime | null = null;
    for (const p of points) {
      if (p.punch === 0) {
        if (opening) return { ...result, status: "uncertain" };
        opening = p.t;
      } else {
        if (!opening) return { ...result, status: "missing_in" };
        minutes += p.t.diff(opening, "minutes").minutes;
        opening = null;
      }
    }
    if (opening) return { ...result, status: "missing_out" };
  } else {
    if (points.length % 2 !== 0) return { ...result, status: "uncertain" };
    for (let i = 0; i < points.length; i += 2)
      minutes += points[i + 1].t.diff(points[i].t, "minutes").minutes;
  }
  result.worked_minutes = Math.max(
    0,
    Math.floor(minutes) - (points.length === 2 ? shift.break_minutes : 0),
  );
  result.late_minutes = Math.max(
    0,
    Math.floor(points[0].t.diff(start, "minutes").minutes) -
      shift.grace_minutes,
  );
  result.early_minutes = Math.max(
    0,
    Math.floor(end.diff(points.at(-1)!.t, "minutes").minutes),
  );
  result.overtime_minutes = Math.max(
    0,
    result.worked_minutes - result.scheduled_minutes,
  );
  result.status = closed ? "present" : "uncertain";
  return result;
}
