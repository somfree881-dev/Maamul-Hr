import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";
import { processAttendance } from "./attendance";
export async function processDay(
  db: SupabaseClient,
  input: { company_id: string; employee_id: string; date: string },
  service = false,
) {
  const { data: e, error } = service
    ? await db
        .from("employees")
        .select("*")
        .eq("company_id", input.company_id)
        .eq("id", input.employee_id)
        .single()
    : await db
        .rpc("attendance_employee", {
          p_company: input.company_id,
          p_employee: input.employee_id,
        })
        .single();
  if (error || !e) throw new Error(error?.message ?? "Forbidden");
  if (input.date < e.start_date || (e.end_date && input.date > e.end_date))
    throw new Error("Date outside employment");
  const { data: company, error: ce } = await db
    .from("companies")
    .select("timezone")
    .eq("id", input.company_id)
    .single();
  if (ce) throw new Error(ce.message);
  const { data: branch, error: be } = await db
    .from("branches")
    .select("timezone")
    .eq("company_id", input.company_id)
    .eq("id", e.branch_id)
    .single();
  if (be) throw new Error(be.message);
  const timezone = branch?.timezone ?? company.timezone;
  const { data: assignments, error: ae } = await db
    .from("shift_assignments")
    .select("*,work_shifts(*)")
    .eq("company_id", input.company_id)
    .lte("starts_on", input.date)
    .or(`ends_on.is.null,ends_on.gte.${input.date}`);
  if (ae) throw new Error(ae.message);
  const ranked = (assignments ?? [])
    .filter(
      (a) =>
        a.employee_id === e.id ||
        (!a.employee_id &&
          a.department_id &&
          a.department_id === e.department_id) ||
        (!a.employee_id && !a.department_id && a.branch_id === e.branch_id),
    )
    .sort(
      (a, b) =>
        (a.employee_id ? 0 : a.department_id ? 1 : 2) -
        (b.employee_id ? 0 : b.department_id ? 1 : 2),
    );
  const assignment = ranked[0];
  if (!assignment) throw new Error("No assigned shift for this date");
  if (
    ranked[1] &&
    !!ranked[1].employee_id === !!assignment.employee_id &&
    !!ranked[1].department_id === !!assignment.department_id
  )
    throw new Error("Overlapping assignments require review");
  const shift = assignment.work_shifts;
  let end = DateTime.fromISO(`${input.date}T${shift.end_time}`, {
    zone: timezone,
  });
  const start = DateTime.fromISO(`${input.date}T${shift.start_time}`, {
    zone: timezone,
  });
  if (end <= start) end = end.plus({ days: 1 });
  if (end.diff(start, "hours").hours > 16)
    throw new Error("Shifts over 16 hours require manual review");
  const results = await Promise.all([
    db
      .from("raw_attendance_events")
      .select("occurred_at,punch")
      .eq("employee_id", e.id)
      .gte("occurred_at", start.minus({ hours: 4 }).toUTC().toISO()!)
      .lte("occurred_at", end.plus({ hours: 4 }).toUTC().toISO()!)
      .limit(1000),
    db
      .from("leave_requests")
      .select("*,leave_types(paid)")
      .eq("employee_id", e.id)
      .eq("status", "approved")
      .lte("start_date", input.date)
      .gte("end_date", input.date),
    db
      .from("holidays")
      .select("id")
      .eq("company_id", input.company_id)
      .eq("holiday_date", input.date),
    db
      .from("attendance_devices")
      .select("last_sync_at")
      .eq("company_id", input.company_id)
      .eq("branch_id", e.branch_id),
  ]);
  for (const r of results) if (r.error) throw new Error(r.error.message);
  const [punches, leaves, holidays, devices] = results;
  if (punches.data?.length === 1000)
    throw new Error("Excessive punch count requires review");
  const syncComplete =
    !!devices.data?.length &&
    devices.data.every(
      (d) =>
        d.last_sync_at &&
        DateTime.fromISO(d.last_sync_at) >= end.plus({ hours: 4 }),
    );
  const summary = processAttendance({
    date: input.date,
    timezone,
    shift,
    punches: punches.data ?? [],
    syncComplete,
    leave: leaves.data?.[0]
      ? { paid: leaves.data[0].leave_types.paid }
      : undefined,
    holiday: !!holidays.data?.length,
  });
  const { error: save } = await db.rpc(
    service ? "service_save_attendance" : "save_attendance",
    {
      p_company: input.company_id,
      p_employee: e.id,
      p_date: input.date,
      p_summary: summary,
      p_shift: assignment.shift_id,
    },
  );
  if (save) throw new Error(save.message);
  return summary;
}
