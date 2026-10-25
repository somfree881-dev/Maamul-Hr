"use client";
import { useState } from "react";
type Row = Record<string, string | number>;
export type AnalyticsData = {
  attendance: Row[];
  payroll: Row[];
  branches: Row[];
};
const charts = [
  {
    title: "Attendance trends",
    group: "attendance",
    label: "work_date",
    value: "present",
    unit: "employees",
  },
  {
    title: "Late arrival trends",
    group: "attendance",
    label: "work_date",
    value: "late",
    unit: "employees",
  },
  {
    title: "Absence trends",
    group: "attendance",
    label: "work_date",
    value: "absent",
    unit: "employees",
  },
  {
    title: "Payroll trends",
    group: "payroll",
    label: "month",
    value: "net",
    unit: "currency",
  },
  {
    title: "Overtime costs",
    group: "payroll",
    label: "month",
    value: "overtime_cost",
    unit: "currency",
  },
  {
    title: "Branch comparisons",
    group: "branches",
    label: "branch",
    value: "net",
    unit: "currency",
  },
] as const;
export function Analytics({
  data,
  currency,
}: {
  data: AnalyticsData;
  currency: string;
}) {
  const [selected, setSelected] = useState(0);
  const chart = charts[selected],
    rows = data[chart.group];
  const max = Math.max(1, ...rows.map((r) => Number(r[chart.value])));
  return (
    <section className="panel analytics-panel">
      <div className="panel-head">
        <div>
          <h2>Organization analytics</h2>
          <p>
            Authorized records · {currency} payroll · selected reporting dates
          </p>
        </div>
        <select
          aria-label="Choose chart"
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {charts.map((c, i) => (
            <option key={c.title} value={i}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      <div className="analytics-bars" role="img" aria-label={chart.title}>
        {rows.length ? (
          rows.map((r, i) => (
            <div
              className="analytics-column"
              key={i}
              title={`${r[chart.label]}: ${r[chart.value]} ${chart.unit === "currency" ? currency : chart.unit}`}
            >
              <span>
                {Number(r[chart.value]).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
              <div
                style={{
                  height: `${(Number(r[chart.value]) / max) * 150}px`,
                  minHeight: Number(r[chart.value]) > 0 ? 3 : 0,
                }}
              />
              <small>{String(r[chart.label])}</small>
            </div>
          ))
        ) : (
          <div className="empty">
            <strong>No data for this chart</strong>
            <p>Processed attendance and payroll will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}
