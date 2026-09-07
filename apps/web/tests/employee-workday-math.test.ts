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

test("quarter-day công uses completed 2-hour quarters from September 2026", () => {
  const scheduledStart = "2026-09-10T08:00:00+07:00";
  const scheduledEnd = "2026-09-10T16:00:00+07:00";

  for (const [checkOut, expected] of [
    ["2026-09-10T10:00:00+07:00", 0.25],
    ["2026-09-10T12:00:00+07:00", 0.5],
    ["2026-09-10T14:00:00+07:00", 0.75],
    ["2026-09-10T16:00:00+07:00", 1],
  ] as const) {
    assert.equal(
      countShiftWorkdaysFromOverlap({
        checkIn: scheduledStart,
        checkOut,
        scheduledStart,
        scheduledEnd,
      }),
      expected,
    );
  }
});

test("quarter-day công floors partial quarters instead of rounding", () => {
  const scheduledStart = "2026-09-10T08:00:00+07:00";
  const scheduledEnd = "2026-09-10T16:00:00+07:00";

  assert.equal(
    countShiftWorkdaysFromOverlap({
      checkIn: scheduledStart,
      checkOut: "2026-09-10T15:00:00+07:00",
      scheduledStart,
      scheduledEnd,
    }),
    0.75,
  );
  assert.equal(
    countShiftWorkdaysFromOverlap({
      checkIn: scheduledStart,
      checkOut: "2026-09-10T09:59:00+07:00",
      scheduledStart,
      scheduledEnd,
    }),
    0,
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

test("split shift công yields 1.0 when working full 4h + 4h across 2 windows", () => {
  assert.equal(
    shiftWorkdaysFromAttendanceRecord({
      checkIn: "2026-09-10T10:00:00+07:00",
      window1OutAt: "2026-09-10T14:00:00+07:00",
      checkIn2: "2026-09-10T18:00:00+07:00",
      checkOut: "2026-09-10T22:00:00+07:00",
      scheduledStart: "2026-09-10T10:00:00+07:00",
      scheduledEnd: "2026-09-10T14:00:00+07:00",
      scheduledStart2: "2026-09-10T18:00:00+07:00",
      scheduledEnd2: "2026-09-10T22:00:00+07:00",
    }),
    1.0,
  );
});

test("split shift công yields 0.5 when early ending after window 1 (4h/8h)", () => {
  assert.equal(
    shiftWorkdaysFromAttendanceRecord({
      checkIn: "2026-09-10T10:00:00+07:00",
      checkOut: "2026-09-10T14:00:00+07:00",
      scheduledStart: "2026-09-10T10:00:00+07:00",
      scheduledEnd: "2026-09-10T14:00:00+07:00",
      scheduledStart2: "2026-09-10T18:00:00+07:00",
      scheduledEnd2: "2026-09-10T22:00:00+07:00",
    }),
    0.5,
  );
});

test("split shift công excludes break period between 14:00 and 18:00", () => {
  assert.equal(
    shiftWorkdaysFromAttendanceRecord({
      checkIn: "2026-09-10T10:00:00+07:00",
      window1OutAt: "2026-09-10T14:00:00+07:00",
      checkIn2: "2026-09-10T18:00:00+07:00",
      checkOut: "2026-09-10T20:00:00+07:00", // 4h w1 + 2h w2 = 6h / 8h
      scheduledStart: "2026-09-10T10:00:00+07:00",
      scheduledEnd: "2026-09-10T14:00:00+07:00",
      scheduledStart2: "2026-09-10T18:00:00+07:00",
      scheduledEnd2: "2026-09-10T22:00:00+07:00",
    }),
    0.75,
  );
});

test("split shift công yields 0.5 when employee only works window 2 (4h/8h)", () => {
  assert.equal(
    shiftWorkdaysFromAttendanceRecord({
      checkIn: "2026-09-10T18:00:00+07:00",
      checkOut: "2026-09-10T22:00:00+07:00",
      scheduledStart: "2026-09-10T10:00:00+07:00",
      scheduledEnd: "2026-09-10T14:00:00+07:00",
      scheduledStart2: "2026-09-10T18:00:00+07:00",
      scheduledEnd2: "2026-09-10T22:00:00+07:00",
    }),
    0.5,
  );
});

test("split shift công yields 1.0 on 2-touch flow (checkIn at 10:00, checkOut at 22:00, no pause/resume)", () => {
  assert.equal(
    shiftWorkdaysFromAttendanceRecord({
      checkIn: "2026-09-10T10:00:00+07:00",
      checkOut: "2026-09-10T22:00:00+07:00",
      scheduledStart: "2026-09-10T10:00:00+07:00",
      scheduledEnd: "2026-09-10T14:00:00+07:00",
      scheduledStart2: "2026-09-10T18:00:00+07:00",
      scheduledEnd2: "2026-09-10T22:00:00+07:00",
    }),
    1.0,
  );
});

test("split shift công yields 0.5 when paused after window 1 and employee never returned for window 2", () => {
  assert.equal(
    shiftWorkdaysFromAttendanceRecord({
      checkIn: "2026-09-10T10:00:00+07:00",
      window1OutAt: "2026-09-10T14:00:00+07:00",
      checkOut: "2026-09-10T22:00:00+07:00",
      scheduledStart: "2026-09-10T10:00:00+07:00",
      scheduledEnd: "2026-09-10T14:00:00+07:00",
      scheduledStart2: "2026-09-10T18:00:00+07:00",
      scheduledEnd2: "2026-09-10T22:00:00+07:00",
    }),
    0.5,
  );
});


