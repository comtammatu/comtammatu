import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCompletedWorkdays } from "../lib/hr/payroll-day-math";

test("buildCompletedWorkdays uses hour-ratio and strict 0 without frozen window", () => {
  const workdays = buildCompletedWorkdays([
    {
      employeeId: 1,
      date: "2026-08-01",
      checkIn: "2026-08-01T01:00:00.000Z",
      checkOut: "2026-08-01T05:00:00.000Z",
      scheduledStart: "2026-08-01T01:00:00.000Z",
      scheduledEnd: "2026-08-01T09:00:00.000Z",
    },
    {
      employeeId: 1,
      date: "2026-08-02",
      checkIn: "2026-08-02T01:00:00.000Z",
      checkOut: "2026-08-02T09:00:00.000Z",
      scheduledStart: null,
      scheduledEnd: null,
    },
  ]);

  assert.equal(workdays.get(1), 0.5);
});
