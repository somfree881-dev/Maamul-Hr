import Link from "next/link";
import { context } from "@/lib/context";
import { SettingsForms } from "@/components/settings";
export default async function Settings() {
  const s = await context();
  const schedule =
    s?.membership &&
    ["super_admin", "company_admin"].includes(s.membership.role)
      ? await s.db
          .from("application_settings")
          .select("value")
          .eq("company_id", s.membership.company_id)
          .eq("key", "payroll_schedule")
          .maybeSingle()
      : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE ADMINISTRATION</div>
          <h1>
            Settings<span className="heading-dot">.</span>
          </h1>
          <p>Connect your backend and build your organization.</p>
        </div>
      </div>
      {!s && (
        <section className="panel settings-card">
          <h2>Connect Supabase</h2>
          <ol>
            <li>Create a Supabase project or choose an existing project.</li>
            <li>
              Apply the SQL migrations in <code>supabase/migrations</code> in
              filename order after review.
            </li>
            <li>
              Copy <code>.env.example</code> to <code>.env.local</code> and fill
              in the project URL and publishable key.
            </li>
            <li>
              Restart the application and create your initial user through
              Supabase Auth.
            </li>
            <li>Sign in and create your company below.</li>
          </ol>
          <p>
            See README.md for deployment, storage and verification instructions.
            No live backend connection has been tested.
          </p>
          <Link className="button button-primary" href="/login">
            Sign in
          </Link>
        </section>
      )}
      <SettingsForms
        payrollSchedule={
          schedule?.data?.value as
            { enabled?: boolean; period_mode?: string } | undefined
        }
        company={s?.membership?.company_id}
        admin={["super_admin", "company_admin"].includes(
          s?.membership?.role ?? "",
        )}
      />
    </>
  );
}
