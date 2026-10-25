"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "./ui/button";
export function SettingsForms({
  company,
  admin,
  payrollSchedule,
}: {
  company?: string;
  admin: boolean;
  payrollSchedule?: { enabled?: boolean; period_mode?: string };
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function send(action: string, params: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, params }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      if (action === "company") {
        document.cookie = `company_id=${result.data};path=/;SameSite=Lax`;
        window.location.assign("/");
      }
      setMessage("Saved successfully.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {message && (
        <div className="alert" role="status">
          {message}
        </div>
      )}
      <div className="settings-grid">
        {admin && company && (
          <section className="panel settings-card">
            <h2>Automatic payroll · 28th each month</h2>
            <p>
              Generate drafts using reviewed attendance, approved overtime,
              authorized deductions and scheduled advance recoveries. A
              scheduler must be configured in Supabase. Payments require
              separate approval.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                send("payroll_schedule", {
                  p_company: company,
                  p_enabled: data.get("enabled") === "true",
                  p_mode: data.get("mode"),
                });
              }}
            >
              <label>
                Salary period
                <select
                  name="mode"
                  required
                  defaultValue={payrollSchedule?.period_mode ?? ""}
                >
                  <option value="" disabled>
                    Choose salary dates
                  </option>
                  <option value="cycle_29_28">
                    Previous month 29th – current month 28th
                  </option>
                  <option value="previous_month">
                    Previous calendar month
                  </option>
                  <option value="calendar_month">
                    Current calendar month (draft waits for complete attendance)
                  </option>
                </select>
              </label>
              <label>
                Schedule
                <select
                  name="enabled"
                  defaultValue={String(payrollSchedule?.enabled ?? false)}
                >
                  <option value="false">Disabled</option>
                  <option value="true">
                    Enabled · 28th, company time zone
                  </option>
                </select>
              </label>
              <Button disabled={busy}>Save payroll schedule</Button>
            </form>
            <div className="module-tabs">
              <Link href="/manage/advances?new=1">Record advance</Link>
              <Link href="/manage/deductions?new=1">Record deduction</Link>
              <Link href="/manage/overtime?new=1">Record overtime</Link>
            </div>
          </section>
        )}
        <section className="panel settings-card">
          <h2>Create a company</h2>
          <p>
            Each company has its own private workspace, currency and payroll
            policies.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              send("company", {
                p_name: f.get("name"),
                p_currency: f.get("currency"),
                p_timezone: f.get("timezone"),
              });
            }}
          >
            <label>
              Company name
              <input name="name" required minLength={2} />
            </label>
            <label>
              Currency
              <input
                name="currency"
                defaultValue="USD"
                required
                pattern="[A-Z]{3}"
              />
            </label>
            <label>
              IANA time zone
              <input name="timezone" defaultValue="Africa/Mogadishu" required />
            </label>
            <Button disabled={busy}>Create company</Button>
          </form>
        </section>
        {admin && company && (
          <section className="panel settings-card">
            <h2>Manage access</h2>
            <p>
              Invite a user in Supabase Auth first. Use their user UUID to
              authorize access to this company.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                send("membership", {
                  p_company: company,
                  p_user: f.get("user"),
                  p_role: f.get("role"),
                  p_branch: f.get("branch") || null,
                });
              }}
            >
              <label>
                Auth user UUID
                <input name="user" required />
              </label>
              <label>
                Role
                <select name="role">
                  {[
                    "company_admin",
                    "hr_manager",
                    "branch_manager",
                    "accountant",
                    "supervisor",
                    "employee",
                  ].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Branch UUID (required for branch manager/supervisor)
                <input name="branch" />
              </label>
              <Button disabled={busy}>Assign membership</Button>
            </form>
          </section>
        )}
        <section className="panel settings-card">
          <h2>Workspace modules</h2>
          <p>Configure organizational structure and payroll prerequisites.</p>
          <div className="module-tabs">
            {[
              "branches",
              "departments",
              "positions",
              "shifts",
              "assignments",
              "holidays",
              "leave-types",
              "mappings",
              "salaries",
              "deductions",
              "periods",
              "advances",
              "recoveries",
              "incidents",
              "performance",
              "sync",
              "audit",
            ].map((m) => (
              <Link href={`/manage/${m}`} key={m}>
                {m.replaceAll("-", " ")}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
