import Link from "next/link";
import { notFound } from "next/navigation";
import { context } from "@/lib/context";
import { modules, canWrite, canView } from "@/lib/modules";
import { RecordManager } from "@/components/record-manager";
import { AttendanceRunner } from "@/components/attendance-runner";
import { AttendanceOverview } from "@/components/attendance-overview";
export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { module } = await params,
    m = modules[module];
  if (!m) notFound();
  const s = await context();
  if (!s?.membership)
    return (
      <div className="panel empty">
        <h1>Set up your workspace</h1>
        <p>
          Connect Supabase and create a company to manage{" "}
          {m.title.toLowerCase()}.
        </p>
        <Link className="button button-primary" href="/settings">
          Open setup
        </Link>
      </div>
    );
  if (!canView(s.membership.role, m.area))
    return (
      <div className="alert error">
        Your role does not have access to this module.
      </div>
    );
  const query = await searchParams;
  if (module === "attendance")
    return (
      <AttendanceOverview
        db={s.db}
        company={s.membership.company_id}
        role={s.membership.role}
        branchId={s.membership.branch_id}
        timezone={
          (s.membership.companies as unknown as { timezone?: string })
            ?.timezone ?? "Africa/Mogadishu"
        }
        query={query}
      />
    );
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const company = s.membership.company_id;
  let request = s.db
    .from(m.table)
    .select("*", { count: "exact" })
    .eq("company_id", company)
    .order("created_at", { ascending: false })
    .range((page - 1) * 25, page * 25 - 1);
  if (query.status) request = request.eq("status", query.status);
  if (query.employee) request = request.eq("employee_id", query.employee);
  if (query.q) {
    const key =
      module === "employees"
        ? "first_name"
        : m.fields.find((f) => f.key === "name" || f.key === "reason")?.key;
    if (key)
      request = request.ilike(
        key,
        `%${query.q.replaceAll("%", "").slice(0, 100)}%`,
      );
  }
  const choices: Record<string, { id: string; label: string }[]> = {};
  const relations = [
    ...new Set([
      ...m.fields.map((f) => f.relation).filter(Boolean),
      ...(module === "attendance" ? ["employees"] : []),
    ]),
  ] as string[];
  const [{ data, error, count }, results] = await Promise.all([
    request,
    Promise.all(
      relations.map(async (table) => {
        const result =
          table === "employee_incidents"
            ? await s.db.rpc("recovery_incidents", { p_company: company })
            : table === "employees"
              ? await s.db.rpc("employee_directory", { p_company: company })
              : await s.db
                  .from(table)
                  .select("id,name")
                  .eq("company_id", company)
                  .limit(1000);
        if (result.error) throw new Error(result.error.message);
        return {
          table,
          rows: (result.data ?? []) as Record<string, unknown>[],
        };
      }),
    ),
  ]);
  if (error) return <div className="alert error">{error.message}</div>;
  for (const r of results)
    choices[r.table] = r.rows.map((row) => ({
      id: String(row.id),
      label:
        String(
          row.name ??
            row.title ??
            row.employee_number ??
            row.device_user_id ??
            row.description ??
            "Record",
        ) + (row.first_name ? ` · ${row.first_name} ${row.last_name}` : ""),
    }));
  return (
    <>
      {module === "attendance" && canWrite(s.membership.role, "attendance") && (
        <AttendanceRunner
          company={company}
          employees={choices.employees ?? []}
        />
      )}
      <RecordManager
        module={module}
        rows={data ?? []}
        count={count ?? 0}
        company={company}
        write={
          canWrite(s.membership.role, m.area) ||
          (["leave", "corrections", "advances"].includes(module) &&
            s.membership.role === "employee")
        }
        choices={choices}
        createOnly={s.membership.role === "employee"}
      />
    </>
  );
}
