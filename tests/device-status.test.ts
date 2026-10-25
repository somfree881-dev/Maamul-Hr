import { expect, it } from "vitest";
import { deviceConnectionLabel } from "../lib/device-status";
const now = Date.parse("2026-10-25T10:00:00Z");
it("shows no heartbeat rather than claiming connection", () =>
  expect(deviceConnectionLabel(null, now)).toContain("Awaiting"));
it("expires old connection status without a maintenance job", () =>
  expect(deviceConnectionLabel("2026-10-25T09:00:00Z", now)).toContain(
    "No recent sync",
  ));
it("shows a fresh completed synchronization", () =>
  expect(deviceConnectionLabel("2026-10-25T09:59:00Z", now)).toContain(
    "Connected",
  ));
