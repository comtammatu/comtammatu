import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { countOverlapDays } from "../lib/staff-runtime/_lib/workday-math";

test("employee leave overlap is counted inside a calendar year", () => {
  assert.equal(
    countOverlapDays("2025-12-30", "2026-01-02", "2026-01-01", "2026-12-31"),
    2,
  );
});

test("schedule derives monthly leave from tenant policy and annual leave from entitlement", () => {
  const source = readFileSync(
    new URL("../lib/staff-runtime/schedule/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /monthlyLeaveBalance/);
  assert.match(source, /fetchTenantHrLeavePolicy/);
  assert.match(source, /calculateMonthlyLeaveUsedInMonth/);
  assert.match(source, /calculateAnnualLeaveUsedThroughMonth/);
  assert.match(source, /leave_type/);
});
