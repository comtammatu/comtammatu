import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCompletedWorkdays,
  calculateAnnualLeaveUsedThroughMonth,
  calculateMonthlyLeaveUsedInMonth,
  calculatePayableDays,
  splitAnnualLeaveByQuota,
  summarizeLeaveDays,
} from "../lib/hr/payroll-day-math";

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

test("configured monthly leave is allocated before annual leave", () => {
  const split = splitAnnualLeaveByQuota({
    entitlementDays: 7,
    usedBeforePeriodDays: 0,
    monthlyLeaveDays: 2,
    annualLeaveDaysInPeriod: 3,
  });

  assert.equal(split.paidLeaveDays, 3);
  assert.equal(split.annualLeaveUsedDays, 1);
  assert.equal(split.monthlyLeaveUsedDays, 2);
  assert.equal(split.overflowLeaveDays, 0);
  assert.equal(
    calculatePayableDays({
      workingDays: 24,
      paidLeaveDays: split.paidLeaveDays,
      standardDays: 27,
    }),
    27,
  );
});

test("monthly quota can be zero without reducing annual quota allocation", () => {
  const split = splitAnnualLeaveByQuota({
    entitlementDays: 6,
    usedBeforePeriodDays: 2,
    monthlyLeaveDays: 0,
    annualLeaveDaysInPeriod: 2,
  });

  assert.equal(split.paidLeaveDays, 2);
  assert.equal(split.annualLeaveUsedDays, 2);
  assert.equal(split.monthlyLeaveUsedDays, 0);
  assert.equal(split.overflowLeaveDays, 0);
});

test("monthly quota resets each month while annual quota carries through the year", () => {
  const leaves = [
    {
      employeeId: 1,
      startDate: "2026-02-10",
      endDate: "2026-02-12",
      leaveType: "annual" as const,
    },
    {
      employeeId: 1,
      startDate: "2026-03-10",
      endDate: "2026-03-12",
      leaveType: "annual" as const,
    },
  ];
  const used = calculateAnnualLeaveUsedThroughMonth({
    entitlementDays: 7,
    monthlyLeaveDays: 2,
    year: 2026,
    throughMonth: 3,
    leaves,
  });

  assert.equal(used, 2);
  assert.equal(
    calculateMonthlyLeaveUsedInMonth({
      leaves,
      year: 2026,
      month: 3,
      monthlyLeaveDays: 2,
    }),
    2,
  );
});

test("completed workdays use hour-ratio when scheduled window is present", () => {
  const workdays = buildCompletedWorkdays([
    {
      employeeId: 1,
      date: "2026-06-10",
      checkIn: "2026-06-10T12:00:00+07:00",
      checkOut: "2026-06-10T16:00:00+07:00",
      scheduledStart: "2026-06-10T08:00:00+07:00",
      scheduledEnd: "2026-06-10T16:00:00+07:00",
    },
  ]);

  assert.equal(workdays.get(1), 0.5);
});

test("open attendance shifts do not count as workdays", () => {
  const workdays = buildCompletedWorkdays([
    {
      employeeId: 1,
      date: "2026-06-10",
      checkIn: "2026-06-10T00:00:00Z",
      checkOut: "2026-06-10T04:00:00Z",
      scheduledStart: "2026-06-10T00:00:00Z",
      scheduledEnd: "2026-06-10T08:00:00Z",
    },
    {
      employeeId: 1,
      date: "2026-06-10",
      checkIn: "2026-06-10T08:00:00Z",
      checkOut: "2026-06-10T12:00:00Z",
      scheduledStart: "2026-06-10T08:00:00Z",
      scheduledEnd: "2026-06-10T16:00:00Z",
    },
    { employeeId: 1, date: "2026-06-11", checkOut: null },
  ]);

  assert.equal(workdays.get(1), 1);
});

test("completed workdays do not cap multiple shifts on the same day", () => {
  const workdays = buildCompletedWorkdays([
    {
      employeeId: 1,
      date: "2026-06-10",
      checkIn: "2026-06-10T00:00:00Z",
      checkOut: "2026-06-10T04:00:00Z",
      scheduledStart: "2026-06-10T00:00:00Z",
      scheduledEnd: "2026-06-10T08:00:00Z",
    },
    {
      employeeId: 1,
      date: "2026-06-10",
      checkIn: "2026-06-10T08:00:00Z",
      checkOut: "2026-06-10T12:00:00Z",
      scheduledStart: "2026-06-10T08:00:00Z",
      scheduledEnd: "2026-06-10T16:00:00Z",
    },
    {
      employeeId: 1,
      date: "2026-06-10",
      checkIn: "2026-06-10T16:00:00Z",
      checkOut: "2026-06-10T20:00:00Z",
      scheduledStart: "2026-06-10T16:00:00Z",
      scheduledEnd: "2026-06-11T00:00:00Z",
    },
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
