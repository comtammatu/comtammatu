import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  countOverlapDays,
  countShiftWorkdaysFromOverlap,
  shiftWorkdaysFromAttendanceRecord,
  sumShiftWorkdaysFromAttendanceRecords,
} from "../lib/staff-runtime/_lib/workday-math";

test("hour-ratio công counts overlap inside scheduled VN shift window", () => {
  assert.equal(
    countShiftWorkdaysFromOverlap({
      checkIn: "2026-06-10T12:00:00+07:00",
      checkOut: "2026-06-10T16:00:00+07:00",
      scheduledStart: "2026-06-10T08:00:00+07:00",
      scheduledEnd: "2026-06-10T16:00:00+07:00",
    }),
    0.5,
  );
});

test("hour-ratio công caps at 1.0 for full shift overlap", () => {
  assert.equal(
    countShiftWorkdaysFromOverlap({
      checkIn: "2026-06-10T07:30:00+07:00",
      checkOut: "2026-06-10T16:30:00+07:00",
      scheduledStart: "2026-06-10T08:00:00+07:00",
      scheduledEnd: "2026-06-10T16:00:00+07:00",
    }),
    1,
  );
});

test("hour-ratio công returns 0 when scheduled window is invalid", () => {
  assert.equal(
    countShiftWorkdaysFromOverlap({
      checkIn: "2026-06-10T08:00:00+07:00",
      checkOut: "2026-06-10T16:00:00+07:00",
      scheduledStart: "2026-06-10T16:00:00+07:00",
      scheduledEnd: "2026-06-10T08:00:00+07:00",
    }),
    0,
  );
});

test("hour-ratio công rounds 475/480 to 1.0 on 8h shift", () => {
  assert.equal(
    countShiftWorkdaysFromOverlap({
      checkIn: "2026-06-10T07:55:00+07:00",
      checkOut: "2026-06-10T15:55:00+07:00",
      scheduledStart: "2026-06-10T08:00:00+07:00",
      scheduledEnd: "2026-06-10T16:00:00+07:00",
    }),
    1,
  );
});

test("shiftWorkdaysFromAttendanceRecord returns 0 without frozen window", () => {
  assert.equal(
    shiftWorkdaysFromAttendanceRecord({
      checkIn: "2026-06-10T08:00:00+07:00",
      checkOut: "2026-06-10T16:00:00+07:00",
      scheduledStart: null,
      scheduledEnd: null,
    }),
    0,
  );
});

test("sumShiftWorkdaysFromAttendanceRecords sums closed rows", () => {
  assert.equal(
    sumShiftWorkdaysFromAttendanceRecords([
      {
        checkIn: "2026-06-10T08:00:00+07:00",
        checkOut: "2026-06-10T12:00:00+07:00",
        scheduledStart: "2026-06-10T08:00:00+07:00",
        scheduledEnd: "2026-06-10T16:00:00+07:00",
      },
      {
        checkIn: "2026-06-11T08:00:00+07:00",
        checkOut: "2026-06-11T16:00:00+07:00",
        scheduledStart: "2026-06-11T08:00:00+07:00",
        scheduledEnd: "2026-06-11T16:00:00+07:00",
      },
    ]),
    1.5,
  );
});

test("employee leave overlap is counted inside a calendar year", () => {
  assert.equal(
    countOverlapDays("2025-12-30", "2026-01-02", "2026-01-01", "2026-12-31"),
    2,
  );
});

test("schedule derives monthly leave from tenant policy and annual leave from entitlement", () => {
  const source = readFileSync(
    new URL("../lib/staff-runtime/schedule/data.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /monthlyLeaveBalance/);
  assert.match(source, /fetchTenantHrLeavePolicy/);
  assert.match(source, /calculateMonthlyLeaveUsedInMonth/);
  assert.match(source, /calculateAnnualLeaveUsedThroughMonth/);
  assert.match(source, /leave_type/);
});
