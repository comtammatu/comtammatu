import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCompletedWorkdays,
  calculateAnnualLeaveUsedThroughMonth,
  calculatePayableDays,
  countAnnualLeaveAccruedThroughMonth,
  splitAnnualLeaveByQuota,
} from "../lib/hr/payroll-day-math";

test("annual leave accrues one day per month from the start month", () => {
  assert.equal(countAnnualLeaveAccruedThroughMonth("2026-03-15", 2026, 5), 3);
  assert.equal(countAnnualLeaveAccruedThroughMonth("2025-11-01", 2026, 7), 7);
  assert.equal(countAnnualLeaveAccruedThroughMonth("2026-08-01", 2026, 7), 0);
});

test("monthly annual leave pays at most three days", () => {
  const split = splitAnnualLeaveByQuota({
    entitlementDays: 6,
    usedBeforePeriodDays: 5,
    annualLeaveDaysInPeriod: 4,
  });

  assert.equal(split.paidLeaveDays, 3);
  assert.equal(split.annualLeaveUsedDays, 1);
  assert.equal(split.overflowLeaveDays, 1);
  assert.equal(
    calculatePayableDays({
      workingDays: 23,
      paidLeaveDays: split.paidLeaveDays,
      standardDays: 26,
    }),
    26,
  );
});

test("unused monthly leave does not consume annual carryover", () => {
  const split = splitAnnualLeaveByQuota({
    entitlementDays: 6,
    usedBeforePeriodDays: 2,
    annualLeaveDaysInPeriod: 2,
  });

  assert.equal(split.paidLeaveDays, 2);
  assert.equal(split.annualLeaveUsedDays, 0);
  assert.equal(split.overflowLeaveDays, 0);
});

test("annual carryover is spent only after monthly leave days", () => {
  const used = calculateAnnualLeaveUsedThroughMonth({
    employeeStartDate: "2026-01-05",
    year: 2026,
    throughMonth: 3,
    leaves: [
      {
        employeeId: 1,
        startDate: "2026-02-10",
        endDate: "2026-02-12",
        leaveType: "annual",
      },
      {
        employeeId: 1,
        startDate: "2026-03-10",
        endDate: "2026-03-12",
        leaveType: "annual",
      },
    ],
  });

  assert.equal(used, 2);
});

test("open attendance shifts do not count as workdays", () => {
  const workdays = buildCompletedWorkdays([
    { employeeId: 1, date: "2026-06-10", checkOut: "2026-06-10T04:00:00Z" },
    { employeeId: 1, date: "2026-06-10", checkOut: "2026-06-10T12:00:00Z" },
    { employeeId: 1, date: "2026-06-11", checkOut: null },
  ]);

  assert.equal(workdays.get(1), 1);
});

test("completed workdays do not cap multiple shifts on the same day", () => {
  const workdays = buildCompletedWorkdays([
    { employeeId: 1, date: "2026-06-10", checkOut: "2026-06-10T04:00:00Z" },
    { employeeId: 1, date: "2026-06-10", checkOut: "2026-06-10T10:00:00Z" },
    { employeeId: 1, date: "2026-06-10", checkOut: "2026-06-10T15:00:00Z" },
  ]);

  assert.equal(workdays.get(1), 1.5);
});

test("payable days are capped at standard days", () => {
  assert.equal(
    calculatePayableDays({
      workingDays: 28,
      paidLeaveDays: 2,
      standardDays: 26,
    }),
    26,
  );
});
