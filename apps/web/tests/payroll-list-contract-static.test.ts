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

test("payroll list separates work and leave values into stable columns", () => {
  assert.match(client, /key: "working-days"/);
  assert.match(client, /key: "paid-leave-days"/);
  assert.match(client, /key: "unpaid-leave-days"/);
  assert.match(client, /key: "status"/);
  assert.match(client, /pageSize=\{25\}/);
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
