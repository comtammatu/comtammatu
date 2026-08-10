import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  matchesHrBranchScope,
  resolveHrBranchScope,
  withHrBranchScope,
} from "../app/lib/hr-scope";

const hrRoot = join(import.meta.dirname, "../app/(protected)/hr");
const read = (path: string) => readFileSync(join(hrRoot, path), "utf8");

test("HR branch scope normalizes invalid values and keeps office separate", () => {
  const branches = [{ id: 1 }, { id: 2 }];
  assert.equal(resolveHrBranchScope(undefined, branches), "all");
  assert.equal(resolveHrBranchScope("office", branches), "office");
  assert.equal(resolveHrBranchScope("2", branches), "2");
  assert.equal(resolveHrBranchScope("999", branches), "all");
  assert.equal(resolveHrBranchScope("invalid", branches), "all");
  assert.equal(matchesHrBranchScope(null, "office"), true);
  assert.equal(matchesHrBranchScope(2, "office"), false);
  assert.equal(
    withHrBranchScope("/hr/attendance?tab=approvals", "2"),
    "/hr/attendance?tab=approvals&branch=2",
  );
});

test("Company HR uses one URL-owned branch scope across every workspace", () => {
  const employeeTable = read("employee-table.tsx");
  const staffFilters = read("staff/staff-filters.tsx");
  const attendancePage = read("attendance/page.tsx");
  const attendanceTable = read("attendance/attendance-table.tsx");
  const leaveRequests = read("leave-requests-table.tsx");
  const payroll = read("payroll/payroll-list-client.tsx");
  const setupTasks = read("position-tasks-client.tsx");
  const setupPage = read("setup/page.tsx");
  const people = read("hr-client.tsx");
  const actions = read("actions.ts");

  assert.doesNotMatch(employeeTable, /branchFilter|setBranchFilter/);
  assert.doesNotMatch(staffFilters, /updateFilter\("branch"/);
  assert.doesNotMatch(attendancePage, /branches\[0\]\?\.id/);
  assert.doesNotMatch(attendanceTable, /setSelectedBranch/);
  assert.doesNotMatch(leaveRequests, /setSelectedBranchId/);
  assert.doesNotMatch(payroll, /branchScope:\s*value/);
  assert.doesNotMatch(setupTasks, /key:\s*"branch"/);
  assert.doesNotMatch(setupPage, /HrScopeSelector/);
  assert.doesNotMatch(people, /HrScopeSelector/);
  assert.match(people, /queryKeysByValue/);
  assert.match(attendancePage, /queryKeysByValue/);
  assert.match(
    attendancePage,
    /canLoadCheckoutApprovals\s*=\s*branchScope === "all" \|\| branchId != null/,
  );
  assert.match(actions, /if \(!branch\) return \{ success: true, data: \[\] \}/);
});

test("HR navigation preserves the canonical branch scope", () => {
  const shell = readFileSync(
    join(import.meta.dirname, "../app/components/control-surface-shell.tsx"),
    "utf8",
  );
  const attendancePage = read("attendance/page.tsx");

  assert.match(shell, /withHrBranchScope/);
  assert.match(shell, /ControlSurfaceScopeControl/);
  assert.match(shell, /\["all", "office"\]/);
  assert.match(attendancePage, /resolveHrBranchScope/);
  assert.match(attendancePage, /return "today"/);
  assert.doesNotMatch(attendancePage, /pendingApprovals > 0 \? "approvals"/);
  assert.doesNotMatch(attendancePage, /HrScopeSelector/);
});

test("Company roster never maps a central site to the office scope", () => {
  const ownerRosterLoader = readFileSync(
    join(
      import.meta.dirname,
      "../lib/hr/roster/load-owner-roster-data.ts",
    ),
    "utf8",
  );

  assert.doesNotMatch(ownerRosterLoader, /storeBranches/);
  assert.match(
    ownerRosterLoader,
    /resolveOwnerRosterBranchId\(requestedBranch, branches\)/,
  );
});
