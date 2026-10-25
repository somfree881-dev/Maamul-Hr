import Link from "next/link";
import { DateTime } from "luxon";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  Fingerprint,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "./ui/button";
import type { DashboardPeriod } from "@/lib/dashboard-period";
import { DashboardFilters } from "./dashboard-filters";

type Props = {
  employees: Record<string, unknown>[];
  attendance: Record<string, unknown>[];
  metrics: Record<string, number>;
  currency: string;
  timezone: string;
  error: string;
  connected: boolean;
  period: DashboardPeriod;
};

export function DashboardView({
  employees,
  attendance,
  metrics,
  currency,
  timezone,
  error,
  connected,
  period,
}: Props) {
  const now = DateTime.now().setZone(timezone);
  const metric = (key: string) =>
    connected && !error
      ? Number(metrics[key] ?? 0).toLocaleString("en", {
          maximumFractionDigits: 2,
        })
      : "—";
  const money = (key: string) =>
    connected && !error
      ? new Intl.NumberFormat("en", {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(Number(metrics[key] ?? 0))
      : "—";
  const total = Number(metrics.attendance_records ?? 0);
  const present = Number(metrics.present ?? 0);
  const rate = total ? Math.round((present / total) * 100) : null;
  const stats = [
    {
      label: "Total employees",
      value: metric("total_employees"),
      icon: Users,
      tone: "blue",
      detail: connected
        ? `${metric("active_employees")} active team members`
        : "Your team, all in one place",
      href: "/manage/employees",
    },
    {
      label: period.range === "today" ? "Present today" : "Present records",
      value: metric("present"),
      icon: UserCheck,
      tone: "green",
      detail: connected
        ? `${metric("on_leave")} on approved leave`
        : "A clear picture of every workday",
      href: "/manage/attendance",
    },
    {
      label: "Late arrivals",
      value: metric("late"),
      icon: Clock3,
      tone: "amber",
      detail: connected
        ? "In the selected attendance period"
        : "Stay on top of time & attendance",
      href: "/manage/attendance",
    },
    {
      label: "Net payroll",
      value: money("net_payroll"),
      icon: Wallet,
      tone: "violet",
      detail: `${period.label} · ${currency}`,
      href: "/manage/payroll",
    },
  ];
  const statuses = [
    { label: "Present", key: "present", color: "#24a380" },
    { label: "On leave", key: "on_leave", color: "#7296e0" },
    { label: "Confirmed absent", key: "absent", color: "#e9ac5b" },
    { label: "Needs review", key: "needs_review", color: "#c3cbd8" },
  ];
  const monthly =
    attendance.length > 1 &&
    DateTime.fromISO(String(attendance.at(-1)?.work_date)).diff(
      DateTime.fromISO(String(attendance[0].work_date)),
      "days",
    ).days > 62;
  const yearly =
    monthly &&
    DateTime.fromISO(String(attendance.at(-1)?.work_date)).diff(
      DateTime.fromISO(String(attendance[0].work_date)),
      "months",
    ).months > 62;
  const grouped = new Map<
    string,
    {
      label: string;
      total: number;
      present: number;
      late: number;
      absent: number;
    }
  >();
  for (const row of attendance) {
    const date = DateTime.fromISO(String(row.work_date)),
      key = date.toFormat(yearly ? "yyyy" : monthly ? "yyyy-MM" : "yyyy-MM-dd");
    const bucket = grouped.get(key) ?? {
      label: date.toFormat(yearly ? "yyyy" : monthly ? "LLL yy" : "dd LLL"),
      total: 0,
      present: 0,
      late: 0,
      absent: 0,
    };
    for (const metric of ["total", "present", "late", "absent"] as const)
      bucket[metric] += Number(row[metric] ?? 0);
    grouped.set(key, bucket);
  }
  const chartRows = [...grouped.values()];

  return (
    <div className="hr-dashboard">
      <div className="dashboard-date">
        <CalendarDays size={19} />
        <time dateTime={now.toISODate()!}>
          {now.toFormat("cccc, dd LLLL yyyy")}
        </time>
        <span>{timezone}</span>
      </div>
      <div className="hr-page-heading">
        <div>
          <div className="hr-overline">
            <span /> YOUR PEOPLE, YOUR PROGRESS
          </div>
          <h1>Dashboard overview</h1>
          <p>A little clarity for your everyday people decisions.</p>
        </div>
        <div className="hr-heading-actions">
          <Button asChild variant="outline">
            <Link href="/reports">
              <Download size={15} /> Export report
            </Link>
          </Button>
          <Button asChild>
            <Link href="/manage/employees?new=1">
              <Plus size={16} /> Add employee
            </Link>
          </Button>
        </div>
      </div>
      <DashboardFilters
        key={`${period.range}:${period.from}:${period.to}`}
        period={period}
      />
      <p className="dashboard-range-note">
        Attendance and payroll follow the selected dates. Employee totals show
        the current workforce. Payroll totals include overlapping salary periods
        and their current payment allocations.
      </p>

      {!connected && (
        <div className="hr-setup-notice">
          <span className="hr-setup-icon">
            <ShieldCheck size={18} />
          </span>
          <p>
            <strong>Let’s make this workspace yours.</strong> Connect your
            company to bring your people, attendance and payroll together.
          </p>
          <Link href="/settings">
            Complete setup
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
      {error && (
        <div className="alert error" role="alert">
          We couldn’t load the latest dashboard data: {error}
        </div>
      )}

      <div className="hr-stats">
        {stats.map(({ label, value, icon: Icon, tone, detail, href }) => (
          <Link href={href} className={`hr-stat hr-stat-${tone}`} key={label}>
            <div className="hr-stat-heading">
              <span className={`hr-icon hr-icon-${tone}`}>
                <Icon size={20} strokeWidth={1.7} />
              </span>
              <ArrowUpRight size={16} />
            </div>
            <div className="hr-stat-label">{label}</div>
            <strong className="hr-stat-value">{value}</strong>
            <div className="hr-stat-detail">
              <i />
              {detail}
            </div>
          </Link>
        ))}
      </div>

      <div className="hr-main-grid">
        <section className="hr-card hr-attendance-card">
          <div className="hr-card-heading">
            <div>
              <h2>
                Attendance overview{" "}
                <span className="hr-heading-tag">
                  {connected ? "LIVE DATA" : "OVERVIEW"}
                </span>
              </h2>
              <p>
                {period.label} ·{" "}
                {yearly ? "Yearly" : monthly ? "Monthly" : "Daily"} attendance
                totals
              </p>
            </div>
            <span className="hr-today-tag">{period.label}</span>
          </div>
          <div className="hr-chart-legend">
            <span>
              <i style={{ background: "#24a380" }} />
              Present
            </span>
            <span>
              <i style={{ background: "#e9ac5b" }} />
              Late
            </span>
            <span>
              <i style={{ background: "#c9d3e4" }} />
              Absent
            </span>
            <span className="hr-chart-period">{period.label}</span>
          </div>
          <div
            className="hr-chart"
            role={attendance.length ? "img" : undefined}
            aria-label={`Attendance percentages: ${period.label}${attendance.length ? "" : ": no data available"}`}
          >
            <div className="hr-chart-y">
              {[100, 75, 50, 25, 0].map((n) => (
                <span key={n}>{n}%</span>
              ))}
            </div>
            <div className="hr-plot">
              <div className="hr-grid-lines">
                {[1, 2, 3, 4, 5].map((n) => (
                  <i key={n} />
                ))}
              </div>
              <div
                className={`hr-bars ${chartRows.length > 10 ? "hr-bars-month" : ""}`}
              >
                {chartRows.map((row, i) => {
                  const count = Math.max(1, row.total);
                  return (
                    <div className="hr-bar-day" key={i}>
                      <div className="hr-bar-group">
                        {(["present", "late", "absent"] as const).map((key) => (
                          <div
                            className={`hr-bar hr-bar-${key}`}
                            key={key}
                            style={{
                              height: `${Math.min(100, (Number(row?.[key] ?? 0) / count) * 100)}%`,
                            }}
                            title={`${row.label}: ${row[key as "present" | "late" | "absent"] ?? 0} ${key}`}
                          />
                        ))}
                      </div>
                      <span>
                        {chartRows.length <= 10 ||
                        i % Math.ceil(chartRows.length / 10) === 0
                          ? row.label
                          : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              {!attendance.length && (
                <div className="hr-chart-empty">
                  <span>
                    <Activity size={24} strokeWidth={1.5} />
                  </span>
                  <strong>Your next chapter starts with a check-in.</strong>
                  <p>Attendance trends will appear as your team clocks in.</p>
                  <Link href="/manage/devices">
                    Connect attendance <ArrowUpRight size={13} />
                  </Link>
                </div>
              )}
            </div>
          </div>
          <div className="hr-card-footer">
            <span>
              <ShieldCheck size={13} />
              Uncertain records are kept for review
            </span>
            <Link href="/manage/attendance">
              View attendance
              <ArrowRight size={14} />
            </Link>
          </div>
        </section>

        <section className="hr-card hr-snapshot">
          <div className="hr-card-heading">
            <div>
              <div className="attendance-card-kicker">
                <UserCheck size={14} /> AT A GLANCE
              </div>
              <h2>Attendance snapshot</h2>
              <p>A clear picture of your team.</p>
            </div>
            <span className="hr-today-tag">{period.label}</span>
          </div>
          <div className="hr-ring-wrap">
            <svg
              viewBox="0 0 180 180"
              className="hr-ring"
              role="img"
              aria-label={
                rate === null
                  ? "No attendance percentage available"
                  : `${rate}% of selected attendance records are present`
              }
            >
              <circle
                cx="90"
                cy="90"
                r="72"
                fill="none"
                className="attendance-ring-track"
                stroke="#315365"
                strokeWidth="14"
              />
              <circle
                cx="90"
                cy="90"
                r="72"
                fill="none"
                stroke="#24a380"
                strokeWidth="14"
                strokeLinecap="round"
                opacity={rate === null ? 0 : 1}
                strokeDasharray={`${((rate ?? 0) / 100) * 452.39} 452.39`}
                transform="rotate(-90 90 90)"
              />
            </svg>
            <div className="hr-ring-label">
              <strong>{rate === null ? "—" : `${rate}%`}</strong>
              <span>present records</span>
              <small>
                {connected
                  ? `${total} attendance records`
                  : "Awaiting your first check-in"}
              </small>
            </div>
          </div>
          <div className="hr-status-list">
            {statuses.map(({ label, key, color }) => (
              <div key={key}>
                <span>
                  <i style={{ background: color }} />
                  {label}
                </span>
                <strong>{metric(key)}</strong>
              </div>
            ))}
          </div>
          <Link href="/manage/attendance" className="hr-snapshot-link">
            See attendance
            <ArrowUpRight size={14} />
          </Link>
        </section>
      </div>

      <section className="hr-quick-actions">
        <div>
          <span className="hr-section-kicker">A LITTLE LESS CLICKING</span>
          <h2>Make your next move.</h2>
        </div>
        {[
          {
            icon: Users,
            title: "Grow your team",
            caption: "Add a new employee",
            href: "/manage/employees?new=1",
            tone: "blue",
          },
          {
            icon: CalendarDays,
            title: "Plan time away",
            caption: "Review leave requests",
            href: "/manage/leave",
            tone: "green",
          },
          {
            icon: Wallet,
            title: "Pay with confidence",
            caption: "Prepare your payroll",
            href: "/manage/periods",
            tone: "violet",
          },
          {
            icon: Fingerprint,
            title: "Stay in sync",
            caption: "Manage attendance devices",
            href: "/manage/devices",
            tone: "amber",
          },
        ].map(({ icon: Icon, title, caption, href, tone }) => (
          <Link key={href} href={href}>
            <span className={`hr-icon hr-icon-${tone}`}>
              <Icon size={19} strokeWidth={1.7} />
            </span>
            <div>
              <strong>{title}</strong>
              <span>{caption}</span>
            </div>
            <ArrowUpRight size={15} />
          </Link>
        ))}
      </section>

      <div className="hr-bottom-grid">
        <section className="hr-card hr-people">
          <div className="hr-card-heading">
            <div>
              <h2>The people behind the progress</h2>
              <p>Your newest team members, right here.</p>
            </div>
            <Link href="/manage/employees" className="hr-subtle-link">
              All employees
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="hr-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>EMPLOYEE</th>
                  <th>EMPLOYEE ID</th>
                  <th>DATE JOINED</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={String(e.id)}>
                    <td>
                      <Link href={`/employees/${e.id}`} className="hr-person">
                        <span>
                          {String(e.first_name).slice(0, 1)}
                          {String(e.last_name).slice(0, 1)}
                        </span>
                        <strong>
                          {String(e.first_name)} {String(e.last_name)}
                        </strong>
                      </Link>
                    </td>
                    <td>{String(e.employee_number)}</td>
                    <td>
                      {DateTime.fromISO(String(e.start_date)).toFormat(
                        "dd LLL yyyy",
                      )}
                    </td>
                    <td>
                      <span
                        className={`hr-employee-status ${e.status === "active" ? "is-active" : ""}`}
                      >
                        <i />
                        {String(e.status).replaceAll("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!employees.length && (
              <div className="hr-people-empty">
                <div className="hr-empty-people" aria-hidden="true">
                  <span>
                    <Users size={27} strokeWidth={1.3} />
                  </span>
                  <i>
                    <Plus size={13} />
                  </i>
                </div>
                <strong>Great teams start with the first person.</strong>
                <p>Give every employee a place to belong.</p>
                <Link
                  href={connected ? "/manage/employees?new=1" : "/settings"}
                >
                  {connected ? "Add your first employee" : "Set up your team"}
                  <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>
        </section>
        <section className="hr-card hr-payroll">
          <div className="hr-card-heading">
            <div>
              <h2>Payroll at a glance</h2>
              <p>
                {period.label} · {currency}
              </p>
            </div>
            <span className="hr-icon hr-icon-violet">
              <Wallet size={19} />
            </span>
          </div>
          <div className="hr-payroll-total">
            <span>NET PAYROLL</span>
            <strong>{money("net_payroll")}</strong>
            <span className="hr-payroll-note">
              <ShieldCheck size={12} />
              Calculated from your payroll records
            </span>
          </div>
          <div className="hr-payroll-lines">
            <div>
              <span>Gross earnings</span>
              <strong>{money("gross_payroll")}</strong>
            </div>
            <div>
              <span>Total deductions</span>
              <strong>{money("deductions")}</strong>
            </div>
            <div>
              <span>
                <i />
                Already paid
              </span>
              <strong>{money("salary_paid")}</strong>
            </div>
            <div className="hr-payroll-outstanding">
              <span>Remaining payable</span>
              <strong>{money("outstanding")}</strong>
            </div>
          </div>
          <Link href="/manage/balances" className="hr-payroll-button">
            View payroll breakdown
            <ArrowRight size={15} />
          </Link>
        </section>
      </div>

      <details className="hr-more-metrics">
        <summary>
          <span>
            <Activity size={15} />A closer look at your workspace
          </span>
          <ChevronDown size={15} />
        </summary>
        <div>
          {[
            ["Worked hours", "worked_hours"],
            ["Overtime hours", "overtime_hours"],
            ["Active employees", "active_employees"],
            ["Expiring documents", "document_alerts"],
          ].map(([label, key]) => (
            <div key={key}>
              <span>{label}</span>
              <strong>{metric(key)}</strong>
            </div>
          ))}
        </div>
      </details>
      <div className="hr-dashboard-note">
        <span>
          <ShieldCheck size={13} />
          Private by design. Built around your people.
        </span>
        <Link href="/settings">
          <CircleHelp size={13} />
          Workspace settings
        </Link>
      </div>
    </div>
  );
}
