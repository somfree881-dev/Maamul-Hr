"use client";
import { useState } from "react";
import type { DashboardPeriod } from "@/lib/dashboard-period";
export function DashboardFilters({ period }: { period: DashboardPeriod }) {
  const [range, setRange] = useState(period.range);
  return (
    <form className="panel dashboard-range-filter" method="get" action="/">
      <label>
        Reporting period
        <select
          name="range"
          value={range}
          onChange={(event) =>
            setRange(event.target.value as DashboardPeriod["range"])
          }
        >
          <option value="all">All time</option>
          <option value="month">This month</option>
          <option value="today">Today</option>
          <option value="custom">Custom date</option>
        </select>
      </label>
      {range === "custom" && (
        <>
          <label>
            From
            <input
              type="date"
              name="from"
              defaultValue={period.from ?? ""}
              required
            />
          </label>
          <label>
            To
            <input type="date" name="to" defaultValue={period.to} required />
          </label>
        </>
      )}
      <button className="button button-primary">Apply filter</button>
      <span>{period.label}</span>
    </form>
  );
}
