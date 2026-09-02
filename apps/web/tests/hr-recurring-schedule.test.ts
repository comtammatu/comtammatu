import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getShiftDurationMinutes,
  isUnusualShiftDuration,
} from "@lib/hr/shift-duration";

const migration = readFileSync(
  new URL(
    "../../../supabase/migration-archive/20260802122213_employee_recurring_shift_schedules.sql",
    import.meta.url,
  ),
  "utf8",
);
const actionSource = readFileSync(
  new URL("../lib/hr/roster/actions.ts", import.meta.url),
  "utf8",
);
const dialogSource = readFileSync(
  new URL("../lib/hr/roster/weekly-schedule-dialog.tsx", import.meta.url),
  "utf8",
);

test("fixed weekly schedules materialize without replacing manual day overrides", () => {
  assert.match(migration, /'hr_standard_workdays', '26'/);
  assert.match(migration, /'hr_monthly_leave_days', '2'/);
  assert.match(migration, /CREATE TABLE public\.employee_weekly_schedules/);
  assert.match(migration, /source IN \('manual', 'recurring'\)/);
  assert.match(migration, /source = 'day_off'/);
  assert.match(migration, /WHERE existing_assignment\.source = 'recurring'/);
  assert.match(migration, /public\.auth_tenant_id\(\)/);
  assert.match(migration, /hr:assign_shift/);
  assert.match(migration, /materialize-employee-weekly-schedules/);
});

test("recurring materialize ON CONFLICT matches multi-shift unique index", () => {
  const followUp = readFileSync(
    new URL(
      "../../../supabase/migration-archive/20260813000701_hrm_materialize_shift_assignments_on_conflict.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    followUp,
    /ON CONFLICT \(tenant_id, employee_id, work_date, shift_id\)/,
  );
  assert.match(
    followUp,
    /attendance\.shift_id IS NOT DISTINCT FROM planned\.shift_id/,
  );
  assert.doesNotMatch(
    followUp,
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
