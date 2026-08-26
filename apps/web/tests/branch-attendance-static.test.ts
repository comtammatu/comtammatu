import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readAttendanceTableModules } from "./helpers/read-attendance-table-modules";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Branch attendance owns a fixed-scope touch presenter", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/attendance/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/attendance/branch-attendance-client.tsx",
  );
  const data = read("apps/web/lib/hr/branch-attendance-data.ts");

  assert.match(route, /loadBranchAttendanceData/);
  assert.match(route, /BranchAttendanceClient/);
  assert.doesNotMatch(route, /team\/_tabs|AttendanceTab|AttendanceTable/);

  assert.match(data, /import "server-only"/);
  assert.match(data, /resolveBranchContext/);
  assert.match(data, /branch\.branchId !== routeBranchId/);
  assert.match(data, /branch\.branch\.branch_kind !== ["']branch["']/);
  assert.match(data, /PERMISSION_KEYS\.HR_VIEW_EMPLOYEE/);
  assert.match(data, /PERMISSION_KEYS\.HR_FORCE_CLOSE_ATTENDANCE/);
  assert.match(data, /fetchAttendance/);

  assert.match(client, /BranchOperatorPage/);
  assert.match(client, /<AppSheet[\s\S]*side="bottom"/);
  assert.match(client, /TabsList[\s\S]*?size="touch"/);
  assert.match(client, /TabsTrigger[\s\S]*?value="clock"/);
  assert.match(client, /TabsTrigger[\s\S]*?value="summary"/);
  assert.doesNotMatch(client, /ToggleGroup/);
  assert.match(client, /sticky bottom-0/);
  assert.doesNotMatch(
    client,
    /DataTable|AttendanceTable|AttendanceCalendar|correctAttendanceRecord/,
  );
});

test("Branch attendance summary drills into employee month days via URL", () => {
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/attendance/branch-attendance-client.tsx",
  );
  const model = read("apps/web/lib/hr/branch-attendance-model.ts");
  const copy = read("apps/web/lib/messages/employee.ts");

  assert.match(client, /buildBranchAttendanceMonthSummary/);
  assert.match(client, /filterAttendanceByEmployee/);
  assert.match(client, /fetchAttendance\(\{\s*branchId,\s*month: targetMonth/);
  assert.doesNotMatch(client, /fetchAttendanceSummary/);
  assert.match(client, /params\.set\("employeeId"/);
  assert.match(client, /params\.delete\("employeeId"\)/);
  assert.match(client, /employeeMonthOpen/);
  assert.match(
    client,
    /overscroll-contain px-4 pb-2/,
  );
  assert.doesNotMatch(client, /ScrollArea/);

  assert.match(model, /export function buildBranchAttendanceMonthSummary/);
  assert.match(model, /closedShifts/);
  assert.match(model, /openShifts/);

  assert.match(copy, /summaryRowHint:/);
  assert.match(copy, /employeeMonthTitle:/);
  assert.match(copy, /employeeMonthEmptyTitle:/);
});

test("Owner attendance table keeps its desktop presenter", () => {
  const ownerTable = read(
    "apps/web/app/(protected)/hr/attendance/attendance-table.tsx",
  );
  const attendanceModules = readAttendanceTableModules(
    resolve(repoRoot, "apps/web"),
  );
  assert.match(ownerTable, /export function AttendanceTable/);
  assert.match(attendanceModules, /DataTable/);
  assert.match(ownerTable, /isStaleOpenAttendanceRecord/);
  assert.match(
    ownerTable,
    /from "@lib\/hr\/branch-attendance-model"/,
  );
});
