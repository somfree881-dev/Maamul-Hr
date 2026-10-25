"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function AttendanceRunner({
  company,
  employees,
}: {
  company: string;
  employees: { id: string; label: string }[];
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState("all"),
    router = useRouter();
  return (
    <section className="panel settings-card" style={{ marginBottom: 24 }}>
      <h2>Process attendance</h2>
      <p>
        Uses the assigned shift, approved leave, holidays and device
        synchronization coverage. Overnight shifts belong to their starting work
        date. All employees processes everyone available to your account; branch
        permissions still apply.
      </p>
      <form
        className="filters-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setMessage("");
          const targets =
            selected === "all"
              ? employees
              : employees.filter((e) => e.id === selected);
          let processed = 0;
          let review = 0;
          const errors: string[] = [];
          try {
            // Reuse the authenticated endpoint: company/branch permissions and payroll locks
            // are checked separately for every employee. Limit parallel requests.
            for (let offset = 0; offset < targets.length; offset += 4) {
              await Promise.all(
                targets.slice(offset, offset + 4).map(async (employee) => {
                  try {
                    const r = await fetch("/api/attendance", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        company_id: company,
                        employee_id: employee.id,
                        date: f.get("date"),
                      }),
                    });
                    const result = await r.json();
                    if (!r.ok)
                      throw new Error(result.error || "Processing failed");
                    processed++;
                    if (
                      ["uncertain", "missing_in", "missing_out"].includes(
                        result.status,
                      ) ||
                      (result.status === "absent" && !result.reviewed)
                    )
                      review++;
                    if (selected !== "all")
                      setMessage(
                        `Processed: ${result.status}. Late: ${result.late_minutes} minutes. Early: ${result.early_minutes} minutes. Worked: ${result.worked_minutes} minutes.`,
                      );
                  } catch (e) {
                    errors.push(
                      `${employee.label}: ${e instanceof Error ? e.message : "Processing failed"}`,
                    );
                  }
                }),
              );
              if (selected === "all")
                setMessage(
                  `Processed ${processed} of ${targets.length}. Needs review: ${review}. Failed: ${errors.length}.`,
                );
            }
            if (errors.length)
              setMessage(
                `Processed ${processed} of ${targets.length}. Needs review: ${review}. Failed: ${errors.length}.\n${errors.join("\n")}`,
              );
            if (!targets.length)
              setMessage("No employees available to process.");
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Employee
          <select
            name="employee"
            required
            value={selected}
            disabled={busy}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="all">All employees ({employees.length})</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Work date
          <input type="date" name="date" required disabled={busy} />
        </label>
        <Button disabled={busy}>{busy ? "Processing…" : "Process day"}</Button>
      </form>
      {message && (
        <div role="status" className="alert" style={{ whiteSpace: "pre-wrap" }}>
          {message}
        </div>
      )}
    </section>
  );
}
