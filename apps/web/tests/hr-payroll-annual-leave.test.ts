import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCompletedWorkdays,
  calculatePayableDays,
  splitAnnualLeaveByQuota,
  summarizeLeaveDays,
} from "../app/(protected)/hr/payroll-day-math";

test("payroll payable days include annual leave inside the period", () => {
  const leaves = summarizeLeaveDays(
    [
      {
        employeeId: 1,
        startDate: "2026-06-12",
        endDate: "2026-06-13",
        leaveType: "annual",
      },
    ],
    "2026-06-01",
    "2026-06-30",
  );

  const summary = leaves.get(1);
  assert.equal(summary?.paidLeaveDays, 2);
  assert.equal(summary?.unpaidLeaveDays, 0);
  assert.equal(
    calculatePayableDays({
      workingDays: 24,
      paidLeaveDays: summary?.paidLeaveDays ?? 0,
      standardDays: 26,
    }),
    26,
  );
});

test("unpaid leave does not increase payable days", () => {
  const leaves = summarizeLeaveDays(
    [
      {
        employeeId: 1,
        startDate: "2026-06-12",
        endDate: "2026-06-13",
        leaveType: "unpaid",
      },
    ],
    "2026-06-01",
    "2026-06-30",
  );

  const summary = leaves.get(1);
  assert.equal(summary?.paidLeaveDays, 0);
  assert.equal(summary?.unpaidLeaveDays, 2);
  assert.equal(
    calculatePayableDays({
      workingDays: 24,
      paidLeaveDays: summary?.paidLeaveDays ?? 0,
      standardDays: 26,
    }),
    24,
  );
});

test("annual leave quota overflow becomes unpaid leave days", () => {
  const split = splitAnnualLeaveByQuota({
    entitlementDays: 12,
    usedBeforePeriodDays: 11,
    annualLeaveDaysInPeriod: 3,
  });

  assert.equal(split.paidLeaveDays, 1);
  assert.equal(split.overflowLeaveDays, 2);
  assert.equal(
    calculatePayableDays({
      workingDays: 24,
      paidLeaveDays: split.paidLeaveDays,
      standardDays: 26,
    }),
    25,
  );
});

test("annual leave inside quota can complete full base salary days", () => {
  const split = splitAnnualLeaveByQuota({
    entitlementDays: 12,
    usedBeforePeriodDays: 4,
    annualLeaveDaysInPeriod: 2,
  });

  assert.equal(split.paidLeaveDays, 2);
  assert.equal(split.overflowLeaveDays, 0);
  assert.equal(
    calculatePayableDays({
      workingDays: 24,
      paidLeaveDays: split.paidLeaveDays,
      standardDays: 26,
    }),
    26,
  );
});

test("open attendance shifts do not count as workdays", () => {
  const workdays = buildCompletedWorkdays([
    { employeeId: 1, date: "2026-06-10", checkOut: "2026-06-10T04:00:00Z" },
    { employeeId: 1, date: "2026-06-10", checkOut: "2026-06-10T12:00:00Z" },
    { employeeId: 1, date: "2026-06-11", checkOut: null },
  ]);

  assert.equal(workdays.get(1), 1);
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
