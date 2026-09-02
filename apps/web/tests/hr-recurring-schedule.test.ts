import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";

import {
  getShiftDurationMinutes,
  isUnusualShiftDuration,
} from "@lib/hr/shift-duration";

const migration = readSql(process.cwd(), "supabase/migrations/20260802122213_employee_recurring_shift_schedules.sql");
const actionSource = readFileSync(
  new URL("../lib/hr/roster/actions.ts", import.meta.url),
  "utf8",
);
const dialogSource = readFileSync(
  new URL("../lib/hr/roster/weekly-schedule-dialog.tsx", import.meta.url),
  "utf8",
);

test("fixed weekly schedules materialize without replacing manual day overrides", () => {
  assertSqlMatch(migration, /CREATE TABLE public\.employee_weekly_schedules/);
  assertSqlMatch(migration, /source IN \('manual', 'recurring'\)/);
  assertSqlMatch(migration, /source = 'day_off'/);
  assertSqlMatch(migration, /WHERE existing_assignment\.source = 'recurring'/);
  assertSqlMatch(migration, /public\.auth_tenant_id\(\)/);
  assertSqlMatch(migration, /hr:assign_shift/);
  assertSqlMatch(migration, /materialize-employee-weekly-schedules/);
});

test("recurring materialize ON CONFLICT matches multi-shift unique index", () => {
  const followUp = readSql(process.cwd(), "supabase/migrations/20260813000701_hrm_materialize_shift_assignments_on_conflict.sql");
  assertSqlMatch(followUp,
    /ON CONFLICT \(tenant_id, employee_id, work_date, shift_id\)/,
  );
  assertSqlMatch(followUp,
    /attendance\.shift_id IS NOT DISTINCT FROM planned\.shift_id/,
  );
  assertSqlNotMatch(followUp,
    /ON CONFLICT \(tenant_id, employee_id, work_date\)\s/,
  );
});

test("roster exposes presets and uses the atomic schedule RPC", () => {
  assert.match(actionSource, /STAFF_ROLES/);
  assert.match(actionSource, /save_employee_weekly_schedule/);
  assert.match(dialogSource, /applyPreset\(5\)/);
  assert.match(dialogSource, /applyPreset\(6\)/);
  assert.match(dialogSource, /applyPreset\(7\)/);
});

test("shift duration handles normal and overnight frames", () => {
  assert.equal(getShiftDurationMinutes("08:30", "16:30"), 480);
  assert.equal(getShiftDurationMinutes("17:30", "01:30"), 480);
  assert.equal(getShiftDurationMinutes("05:30", "06:00"), 30);
  assert.equal(getShiftDurationMinutes("12:30", "06:30"), 1080);
  assert.equal(isUnusualShiftDuration(480), false);
  assert.equal(isUnusualShiftDuration(30), true);
  assert.equal(isUnusualShiftDuration(1080), true);
});
