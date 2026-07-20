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
  assert.match(client, /setSalaryStatus\(MISSING_SALARY_STATUS\)/);
});

test("preview order is deterministic before the route renders it", () => {
  assert.match(actions, /function comparePayrollPreviewEntries/);
  assert.match(actions, /salarySource === "missing"/);
  assert.match(actions, /\.sort\(comparePayrollPreviewEntries\)/);
});
