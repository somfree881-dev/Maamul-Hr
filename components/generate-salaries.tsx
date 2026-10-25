"use client";
import { useState } from "react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function GenerateSalaries({ company }: { company: string }) {
  const router = useRouter();
  const lastMonth = DateTime.now()
    .setZone("Africa/Mogadishu")
    .minus({ months: 1 })
    .toFormat("yyyy-MM");
  const [month, setMonth] = useState(lastMonth);
  const [late, setLate] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="panel settings-card salary-generator">
      <h2>Generate all salaries</h2>
      <p>
        Choose a completed month. Attendance is processed for all employees,
        then one salary draft is created. Existing salary drafts are reused.
      </p>
      <form
        className="salary-generator-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch("/api/generate-salaries", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ company, month, late }),
            });
            const result = await r.json();
            if (!r.ok)
              throw Error([result.error, ...(result.issues ?? [])].join("\n"));
            setMessage(
              result.existing
                ? "This month's salary draft already exists. Open Payroll ledger to see the amounts."
                : "All salaries generated. Open Payroll ledger to see gross pay, deductions and net salary.",
            );
            router.refresh();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Generation failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Salary month
          <input
            type="month"
            required
            max={lastMonth}
            disabled={busy}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <label className="salary-late-option">
          <input
            type="checkbox"
            disabled={busy}
            checked={late}
            onChange={(e) => setLate(e.target.checked)}
          />
          <span>Apply late deductions</span>
        </label>
        <Button disabled={busy}>
          {busy ? "Preparing salaries…" : "Generate all salaries"}
        </Button>
      </form>
      <details className="salary-calculation-details">
        <summary>How salary is calculated</summary>
        <p>
          Late deduction = basic salary ? pay divisor ? daily hours ? 60 ? late
          minutes after grace. Existing authorized late deductions take
          priority.
        </p>
        <p>
          Disbursed advances, scheduled installments, confirmed unpaid absence
          and authorized deductions are deducted; approved overtime is added.
          Existing installment schedules are preserved.
        </p>
        <p>
          Attendance needing review must be resolved before generation. A draft
          is created for review; approval and payments are separate.
        </p>
      </details>
      {message && (
        <div role="status" className="alert" style={{ whiteSpace: "pre-wrap" }}>
          {message}
        </div>
      )}
    </section>
  );
}
