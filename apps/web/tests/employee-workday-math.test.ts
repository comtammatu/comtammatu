import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  countOverlapDays,
  suggestAnnualLeaveEntitlement,
} from "../lib/staff-runtime/_lib/workday-math";

test("employee leave overlap is counted inside a calendar year", () => {
  assert.equal(
    countOverlapDays("2025-12-30", "2026-01-02", "2026-01-01", "2026-12-31"),
    2,
  );
});

test("employee annual leave entitlement follows hire month", () => {
  assert.equal(suggestAnnualLeaveEntitlement("2026-04-15", 2026), 9);
});

test("schedule monthly leave summary counts approved annual leave only", () => {
  const source = readFileSync(
    new URL("../lib/staff-runtime/schedule/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /monthlyAnnualLeaveDays/);
  assert.match(source, /leave_type/);
  assert.match(
    source,
    /leave\.status !== "approved" \|\| leave\.leave_type !== "annual"/,
  );
});
