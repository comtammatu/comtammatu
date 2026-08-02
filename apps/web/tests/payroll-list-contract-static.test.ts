import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const client = readFileSync(
  join(
    import.meta.dirname,
    "../app/(protected)/hr/payroll/payroll-list-client.tsx",
  ),
  "utf8",
);
const page = readFileSync(
  join(import.meta.dirname, "../app/(protected)/hr/payroll/page.tsx"),
  "utf8",
);
const actions = readFileSync(
  join(import.meta.dirname, "../app/(protected)/hr/payroll-actions.ts"),
  "utf8",
);
const messages = readFileSync(
  join(import.meta.dirname, "../lib/messages/hr.ts"),
  "utf8",
);

test("payroll list shows the requested payroll review columns", () => {
  for (const key of [
    "row-number",
    "employee",
    "working-days",
    "leave-days",
    "bonus",
    "bhxh",
    "net",
    "actions",
  ]) {
    assert.match(client, new RegExp(`key: "${key}"`));
  }
  assert.match(client, /function totalLeaveDays/);
  assert.match(client, /workHours/);
  assert.match(client, /copy\.table\.workHours/);
  assert.match(client, /paidLeaveDays/);
  assert.match(client, /unpaidLeaveDays/);
  assert.match(client, /render: \(_, index\) => String\(index \+ 1\)/);
  assert.match(client, /colSpan: 6/);
  assert.doesNotMatch(client, /key: "unpaid-leave-days"/);
  assert.doesNotMatch(client, /key: "adjustments"/);
  assert.doesNotMatch(client, /key: "gross"/);
  assert.doesNotMatch(client, /key: "deductions"/);
  assert.doesNotMatch(client, /key: "status"/);
  assert.match(client, /pageSize=\{25\}/);
  for (const header of [
    'index: "#"',
    'employee: "Họ tên"',
    'workingDays: "Công"',
    'leaveDays: "Nghỉ phép"',
    'bonus: "Thưởng"',
    'bhxh: "BHXH"',
    'net: "Lương dự kiến"',
    'edit: "Chỉnh sửa"',
  ]) {
    assert.match(messages, new RegExp(header));
  }
});

test("missing salary is a blocking data state, not a zero-value calculation", () => {
  assert.match(client, /function canCalculate/);
  assert.match(client, /function moneyCell/);
  assert.match(client, /copy\.table\.missingSalary/);
  assert.match(
    client,
    /withHrBranchScope\("\/hr\?view=profile&salary=missing", branchScope\)/,
  );
});

test("payroll filters keep the selected salary state in the URL", () => {
  assert.match(page, /salaryStatus\?: string/);
  assert.match(client, /selectedSalaryStatus: string \| undefined/);
  assert.match(client, /function normalizeSalaryStatus/);
  assert.match(client, /params\.set\("salaryStatus", nextSalaryStatus\)/);
  assert.match(page, /selectedSalaryStatus=\{params\.salaryStatus\}/);
});

test("payroll calendar keeps the selected employee in the URL and reuses the attendance calendar", () => {
  assert.match(page, /calendar\?: string/);
  assert.match(page, /function parseCalendarTarget/);
  assert.match(client, /calendarTarget: "all" \| number \| null/);
  assert.match(client, /params\.set\("calendar", String\(nextCalendarTarget\)\)/);
  assert.match(client, /onRowClick=\{openCalendar\}/);
  assert.match(client, /AttendanceCalendar/);
  assert.match(client, /copy\.compactPosition\(entry\.positionLabel\)/);
  assert.match(actions, /workHoursByEmployee/);
  assert.match(actions, /monthlyLeaveBalance/);
  assert.match(actions, /annualLeaveBalance/);
  assert.match(actions, /const calendar = \{/);
});

test("payroll calendar exposes read-only detail for a selected day", () => {
  assert.match(client, /const calendarDayEntries =/);
  assert.match(client, /formatVNBusinessDate\(selectedCalendarDate\)/);
  assert.match(client, /formatVNTime\(record\.check_in\)/);
  assert.match(client, /calendarDetailRef\.current\?\.scrollIntoView/);
  assert.match(client, /attendanceCopy\.calendarDetailTitle/);
});

test("snapshot remains the period action rather than a competing toolbar action", () => {
  assert.match(client, /const snapshotAction = !isLocked/);
  assert.match(client, /action=\{snapshotAction\}/);
  assert.match(client, /payrollCopy\.server\.snapshotUnavailable/);
});

test("payroll preflight exposes blockers before the snapshot action", () => {
  assert.match(client, /preview\.preflight\.blockers/);
  assert.match(client, /openPreflightBlocker/);
  assert.match(client, /filter: "attention"/);
  assert.match(client, /\/hr\/attendance\?tab=approvals/);
  assert.match(actions, /preflight\.blockers\.length === 0/);
  assert.match(actions, /preview\.preflight\.blockers\.length > 0/);
});

test("preview order is deterministic before the route renders it", () => {
  assert.match(actions, /function comparePayrollPreviewEntries/);
  assert.match(actions, /salarySource === "missing"/);
  assert.match(actions, /\.sort\(comparePayrollPreviewEntries\)/);
});
