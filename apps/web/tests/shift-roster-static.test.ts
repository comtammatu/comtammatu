import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

test("shift roster resolves before generic branch shift module", () => {
  const routeMap = read("packages/shared/src/auth/route-map.ts");
  const resolution = read("packages/shared/src/auth/route-resolution.ts");

  assert.match(
    routeMap,
    /id: "branch-shift-roster"[\s\S]*?entryPath: "\/br\/\[branchId\]\/team\/roster"/,
  );
  assert.match(routeMap, /moduleKeys: \["branch_shift_roster"\]/);

  const rosterGate = resolution.indexOf("(?:team|shift)\\/roster");
  const shiftGate = resolution.indexOf("\\/shift(?:\\/|$)");
  assert.ok(rosterGate >= 0, "roster route gate must exist");
  assert.ok(shiftGate > rosterGate, "roster must resolve before generic shift");
  assert.match(resolution, /return "branch_shift_roster"/);
});

test("branch roster route uses leave-approvals auth gating pattern", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/roster/page.tsx",
  );
  const loader = read("apps/web/lib/hr/roster/load-branch-roster-data.ts");

  assert.match(page, /loadBranchRosterData/);
  assert.match(page, /BranchRosterClient/);
  assert.doesNotMatch(page, /team\/_tabs|RosterTab/);
  assert.match(loader, /branch\.branch_kind !== "branch"/);
  assert.match(loader, /PERMISSION_KEYS\.HR_ASSIGN_SHIFT/);
});

test("owner attendance exposes roster tab with shared week client", () => {
  const page = read("apps/web/app/(protected)/hr/attendance/page.tsx");

  assert.match(page, /tab === "roster"/);
  assert.match(page, /attendanceTabs\.roster/);
  assert.match(page, /RosterWeekClient/);
  assert.match(page, /loadOwnerRosterPanelData/);
});

test("roster week grid renders through the design-system DataTable", () => {
  const weekClient = read("apps/web/lib/hr/roster/roster-week-client.tsx");

  assert.match(
    weekClient,
    /from "@\/components\/data-table\/data-table"/,
  );
  assert.match(weekClient, /<DataTable/);
  assert.match(weekClient, /mobileCardRender/);
  assert.doesNotMatch(weekClient, /<table/);
  assert.doesNotMatch(weekClient, /min-w-\[/);
  assert.doesNotMatch(weekClient, /@comtammatu\/ui\/components\/table/);
});

test("roster week grid keeps multi-shift cell editor", () => {
  const weekClient = read("apps/web/lib/hr/roster/roster-week-client.tsx");
  const editor = read("apps/web/lib/hr/roster/use-roster-week-editor.ts");
  const dayCell = read("apps/web/lib/hr/roster/roster-day-cell.tsx");
  const model = read("apps/web/lib/hr/roster/roster-model.ts");

  assert.match(editor, /function handleAddShift\(/);
  assert.match(editor, /function handleRemoveShift\(/);
  assert.match(weekClient, /RosterDayCell/);
  assert.match(dayCell, /IconStar/);
  assert.match(model, /rosterAssignmentKey\([\s\S]*shiftId/);
  assert.match(weekClient, /sticky bottom-0/);
});

test("Branch roster uses week cards without Owner DataTable", () => {
  const rosterClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/roster/roster-client.tsx",
  );
  const branchWeek = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/roster/branch-roster-week-client.tsx",
  );

  assert.match(rosterClient, /BranchRosterWeekClient/);
  assert.doesNotMatch(rosterClient, /(?<!Branch)RosterWeekClient|DataTable/);
  assert.match(branchWeek, /ItemGroup/);
  assert.match(branchWeek, /assignSheetShiftId/);
  assert.match(branchWeek, /useRosterWeekEditor/);
  assert.match(branchWeek, /sticky bottom-0/);
  assert.match(branchWeek, /from "\.\/weekly-schedule-sheet"/);
  assert.match(branchWeek, /WeeklyScheduleSheet/);
  assert.doesNotMatch(branchWeek, /RosterDayCell/);
  assert.doesNotMatch(branchWeek, /WeeklyScheduleDialog/);
  assert.doesNotMatch(
    branchWeek,
    /from "@lib\/hr\/roster\/weekly-schedule-sheet"/,
  );
  assert.doesNotMatch(
    branchWeek,
    /DataTable|from "@lib\/hr\/roster\/roster-week-client"/,
  );
});

test("Branch roster is day-first and exposes adjacent people operations", () => {
  const rosterClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/roster/roster-client.tsx",
  );
  const branchWeek = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/roster/branch-roster-week-client.tsx",
  );

  assert.match(branchWeek, /getVNDateString/);
  assert.match(branchWeek, /assignSheetShiftId/);
  assert.match(branchWeek, /schedulePickerOpen/);
  assert.doesNotMatch(
    branchWeek,
    /RosterViewMode|viewMode|selectedDay === "all"/,
  );
  assert.match(rosterClient, /team\/attendance/);
  assert.match(rosterClient, /team\/checkout-approvals/);
});

test("Branch roster protects unsaved work and reports load failures", () => {
  const rosterClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/roster/roster-client.tsx",
  );
  const branchWeek = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/roster/branch-roster-week-client.tsx",
  );
  const editor = read("apps/web/lib/hr/roster/use-roster-week-editor.ts");
  const actions = read("apps/web/lib/hr/roster/actions.ts");

  assert.match(rosterClient, /unsavedExitTitle/);
  assert.match(branchWeek, /beforeunload/);
  assert.match(branchWeek, /document\.addEventListener\("click"/);
  assert.match(branchWeek, /window\.addEventListener\("popstate"/);
  assert.match(branchWeek, /history\.pushState/);
  assert.match(branchWeek, /confirmDiscardChanges/);
  assert.match(branchWeek, /copyPreviousWeekTitle/);
  assert.match(branchWeek, /copyRequiresSaved/);
  assert.match(editor, /discardChanges/);
  assert.match(actions, /throw new Error\("roster_week_load_failed"\)/);
});

test("ADR 0019 Phase B migration enables multi-shift roster constraints", () => {
  const migration = read(
    "supabase/migrations/20260812220000_hrm_multi_shift_roster_and_clock_in.sql",
  );

  assert.match(migration, /shift_assignments_one_per_employee_day/);
  assert.match(migration, /NULLS NOT DISTINCT/);
  assert.match(migration, /shift_assignments_one_day_off_per_day/);
  assert.match(migration, /desired\.shift_id IS NOT DISTINCT FROM assignment\.shift_id/);
  assert.doesNotMatch(
    migration,
    /OR sa\.work_date = v_vn_date/,
  );
  assert.match(migration, /multiple_shift_candidates/);
  assert.match(migration, /scheduled_start_at, scheduled_end_at/);
});

test("recurring materialize conflict target includes shift_id", () => {
  const followUp = read(
    "supabase/migrations/20260813000701_hrm_materialize_shift_assignments_on_conflict.sql",
  );
  assert.match(
    followUp,
    /ON CONFLICT \(tenant_id, employee_id, work_date, shift_id\)/,
  );
});

test("standardize shifts migration defines 3 operations shifts and 2 guard shifts", () => {
  const migration = read(
    "supabase/migrations/20260829140000_standardize_branch_shifts_catalog.sql",
  );

  assert.match(migration, /'Ca Sáng', '06:00:00', '14:00:00'/);
  assert.match(migration, /'Ca Chiều', '14:00:00', '22:00:00'/);
  assert.match(migration, /'Ca Tối', '22:00:00', '02:00:00'/);
  assert.match(migration, /'Ca Bảo vệ Ngày', '06:00:00', '18:00:00'/);
  assert.match(migration, /'Ca Bảo vệ Đêm', '18:00:00', '06:00:00'/);
  assert.match(migration, /is_active = false/);
  assert.match(migration, /ILIKE '%gãy%'/);
});

test("guard shift repair maps legacy assignments and restores recurring schedules", () => {
  const migration = read(
    "supabase/migrations/20260829201214_repair_guard_shift_assignments.sql",
  );

  assert.match(migration, /WHEN 'Bảo vệ Ca sáng' THEN 'Ca Bảo vệ Ngày'/);
  assert.match(migration, /WHEN 'Bảo vệ Ca chiều' THEN 'Ca Bảo vệ Đêm'/);
  assert.match(migration, /guard_shift_repair_assignment_conflict/);
  assert.match(migration, /guard_shift_repair_ambiguous_weekly_pattern/);
  assert.match(migration, /INSERT INTO public\.employee_weekly_schedules/);
  assert.match(migration, /UPDATE public\.shift_assignments assignment/);
  assert.match(migration, /UPDATE public\.attendance_records attendance/);
  assert.match(migration, /guard_shift_repair_incomplete/);
});

test("branch roster exposes shift group filter and guard candidate categorization", () => {
  const branchWeek = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/roster/branch-roster-week-client.tsx",
  );
  const model = read("apps/web/lib/hr/roster/roster-model.ts");
  const cell = read("apps/web/lib/hr/roster/roster-day-cell.tsx");

  assert.match(branchWeek, /shiftGroupFilter/);
  assert.match(branchWeek, /setShiftGroupFilter/);
  assert.match(branchWeek, /displayShifts/);
  assert.match(branchWeek, /isGuardShiftName/);
  assert.match(branchWeek, /guardStaffCategory/);
  assert.match(model, /getShiftGroup/);
  assert.match(model, /isGuardPosition/);
  assert.match(cell, /operationsShifts/);
  assert.match(cell, /guardShifts/);
});
