import Link from "next/link";
import { deviceConnectionLabel } from "@/lib/device-status";
import { DateTime } from "luxon";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { displayValue } from "@/lib/display-records";
import { AttendanceRunner } from "./attendance-runner";

export async function AttendanceOverview({
  db,
  company,
  role,
  branchId,
  timezone,
  query,
}: {
  db: SupabaseClient;
  company: string;
  role: string;
  branchId: string | null;
  timezone: string;
  query: Record<string, string | undefined>;
}) {
  const date = z.iso
    .date()
    .parse(query.date || DateTime.now().setZone(timezone).toISODate());
  const restricted = ["branch_manager", "supervisor"].includes(role);
  const selected = restricted
    ? branchId
    : query.branch
      ? z.uuid().parse(query.branch)
      : null;
  const [branchResult, deviceResult, directory] = await Promise.all([
    db
      .from("branches")
      .select("id,name")
      .eq("company_id", company)
      .order("name"),
    db
      .from("attendance_devices")
      .select("id,branch_id,name,status,last_sync_at,connection_type")
      .eq("company_id", company)
      .order("name"),
    db.rpc("employee_directory", { p_company: company }),
  ]);
  for (const result of [branchResult, deviceResult, directory])
    if (result.error) throw new Error(result.error.message);
  const branches = (branchResult.data ?? [])
    .filter((b) => !restricted || b.id === branchId)
    .filter((b) => !selected || b.id === selected);
  const employees = (directory.data ?? []) as {
    id: string;
    employee_number: string;
    first_name: string;
    last_name: string;
  }[];
  const names = new Map(
    employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
  );
  const numbers = new Map(employees.map((e) => [e.id, e.employee_number]));
  const records: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    let request = db
      .from("attendance_summaries")
      .select(
        "id,branch_id,employee_id,first_in,last_out,worked_minutes,late_minutes,early_minutes,status,reviewed",
      )
      .eq("company_id", company)
      .eq("work_date", date)
      .order("id")
      .range(offset, offset + 999);
    if (selected) request = request.eq("branch_id", selected);
    const { data, error } = await request;
    if (error) throw new Error(error.message);
    records.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
    if (offset === 49000)
      throw new Error("Attendance exceeds 50,000 records. Select one branch.");
  }
  const deviceRows = deviceResult.data ?? [];
  const time = (input: unknown) =>
    input
      ? DateTime.fromISO(String(input)).setZone(timezone).toFormat("HH:mm")
      : "—";
  const exportUrl = `/api/export?module=attendance&company=${company}&from=${date}&to=${date}${selected ? `&branch=${selected}` : ""}`;
  const groups = [
    ...branches.map((b) => ({ id: b.id, name: b.name })),
    ...(records.some((r) => !r.branch_id)
      ? [{ id: null, name: "Unassigned branch" }]
      : []),
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ALL BRANCHES · ONE WORKSPACE</div>
          <h1>Branch attendance</h1>
          <p>
            Device attendance from your authorized branches, grouped by branch.
            Times shown in {timezone}.
          </p>
        </div>
        <Link className="button button-primary" href="/manage/devices">
          Connect branch devices
        </Link>
      </div>
      <form className="panel toolbar" method="get">
        <label>
          Work date
          <input type="date" name="date" defaultValue={date} required />
        </label>
        {!restricted && (
          <label>
            Branch
            <select name="branch" defaultValue={selected ?? ""}>
              <option value="">All branches</option>
              {(branchResult.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="button button-primary">Show attendance</button>
        <a className="button button-outline" href={`${exportUrl}&format=pdf`}>
          Download PDF
        </a>
        <a className="button button-outline" href={`${exportUrl}&format=xlsx`}>
          Download Excel
        </a>
        <Link className="button button-outline" href="/manage/mappings">
          Map device users
        </Link>
        <Link className="button button-outline" href="/manage/punches">
          Raw punches
        </Link>
      </form>
      <div className="attendance-branches">
        {groups.map((branch) => {
          const attendance = records.filter((r) => r.branch_id === branch.id);
          const devices = deviceRows.filter((d) => d.branch_id === branch.id);
          return (
            <section className="panel" key={branch.id ?? "unassigned"}>
              <div className="branch-attendance-heading">
                <div>
                  <h2>{branch.name}</h2>
                  <p>
                    {attendance.length} processed records ·{" "}
                    {attendance.filter((r) => r.status === "present").length}{" "}
                    present ·{" "}
                    {
                      attendance.filter((r) => Number(r.late_minutes) > 0)
                        .length
                    }{" "}
                    late ·{" "}
                    {
                      attendance.filter(
                        (r) => r.status === "absent" && r.reviewed,
                      ).length
                    }{" "}
                    confirmed absent
                  </p>
                </div>
                <span className="badge">{devices.length} devices</span>
              </div>
              <div className="branch-device-list">
                {devices.length ? (
                  devices.map((device) => (
                    <div key={device.id}>
                      <strong>{device.name}</strong> ·{" "}
                      {deviceConnectionLabel(device.last_sync_at)} · Last sync:{" "}
                      {device.last_sync_at
                        ? displayValue(device.last_sync_at)
                        : "Not synchronized"}
                    </div>
                  ))
                ) : (
                  <p>No authorized device registered for this branch.</p>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Employee Number",
                        "Full Name",
                        "Check-in",
                        "Check-out",
                        "Worked Hours",
                        "Late Minutes",
                        "Early Minutes",
                        "Status",
                      ].map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((record) => (
                      <tr key={String(record.id)}>
                        <td>
                          {numbers.get(String(record.employee_id)) ?? "—"}
                        </td>
                        <td>
                          {names.get(String(record.employee_id)) ??
                            "Unavailable"}
                        </td>
                        <td>{time(record.first_in)}</td>
                        <td>{time(record.last_out)}</td>
                        <td>
                          {(Number(record.worked_minutes) / 60).toFixed(2)}
                        </td>
                        <td>{String(record.late_minutes)}</td>
                        <td>{String(record.early_minutes ?? 0)}</td>
                        <td>
                          {record.status === "absent" && !record.reviewed
                            ? "Absence needs review"
                            : displayValue(record.status).replaceAll("_", " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!attendance.length && (
                <div className="empty">
                  <strong>No processed attendance for this date.</strong>
                  <p>
                    Check device synchronization, map device users and process
                    attendance. Missing synchronization does not confirm
                    absence.
                  </p>
                </div>
              )}
            </section>
          );
        })}
        {!groups.length && (
          <section className="panel empty">
            <p>No branches available for your account.</p>
          </section>
        )}
      </div>
      {[
        "super_admin",
        "company_admin",
        "hr_manager",
        "branch_manager",
        "supervisor",
      ].includes(role) && (
        <AttendanceRunner
          company={company}
          employees={employees.map((e) => ({
            id: e.id,
            label: `${e.employee_number} · ${e.first_name} ${e.last_name}`,
          }))}
        />
      )}
    </>
  );
}
