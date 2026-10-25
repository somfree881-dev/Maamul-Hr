import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanRecord } from "./display-records";
/** Resolve names with the caller's tenant-scoped RLS client; never use admin credentials. */
export async function reportRecords(
  db: SupabaseClient,
  company: string,
  rows: Record<string, unknown>[],
) {
  const lookups: Record<string, Map<string, string>> = {};
  await Promise.all(
    [
      ["branch_id", "branches"],
      ["department_id", "departments"],
      ["position_id", "positions"],
      ["shift_id", "work_shifts"],
      ["leave_type_id", "leave_types"],
      ["device_id", "attendance_devices"],
      ["period_id", "payroll_periods"],
    ].map(async ([field, table]) => {
      const ids = [
        ...new Set(
          rows
            .map((row) => row[field])
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      if (!ids.length) return;
      const names = new Map<string, string>();
      for (let offset = 0; offset < ids.length; offset += 500) {
        const { data, error } = await db
          .from(table)
          .select("id,name")
          .eq("company_id", company)
          .in("id", ids.slice(offset, offset + 500));
        if (error) throw new Error(error.message);
        for (const row of data ?? []) names.set(row.id, row.name);
      }
      lookups[field] = names;
    }),
  );
  if (rows.some((row) => row.employee_id || row.reporting_manager_id)) {
    const { data, error } = await db.rpc("employee_directory", {
      p_company: company,
    });
    if (error) throw new Error(error.message);
    const names = new Map<string, string>(
      (data ?? []).map(
        (row: {
          id: string;
          first_name: string;
          last_name: string;
          employee_number: string;
        }) => [
          row.id,
          `${row.first_name} ${row.last_name} (${row.employee_number})`,
        ],
      ),
    );
    lookups.employee_id = names;
    lookups.reporting_manager_id = names;
  }
  return rows.map((row) => {
    const result = cleanRecord(row);
    for (const [field, names] of Object.entries(lookups))
      if (row[field])
        result[field.replace(/_id$/, "")] =
          names.get(String(row[field])) ?? "Unavailable";
    return result;
  });
}
