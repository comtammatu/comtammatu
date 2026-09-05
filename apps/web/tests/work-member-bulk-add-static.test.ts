import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql } from "./_lib/active-sql.ts";

const webRoot = process.cwd();

function readWeb(path: string): string {
  return readSql(webRoot, path);
}

function existsWeb(path: string): boolean {
  return existsSync(resolve(webRoot, path));
}

test("WorkAddMembersDialog component exists and supports bulk selection, search, and branch filtering", () => {
  assert.ok(
    existsWeb("app/(protected)/work/_components/work-add-members-dialog.tsx"),
    "work-add-members-dialog.tsx must exist",
  );

  const dialog = readWeb("app/(protected)/work/_components/work-add-members-dialog.tsx");

  // Branch filter
  assert.match(dialog, /workCopy\.teamAddBranchFilter/);
  assert.match(dialog, /workCopy\.teamAddAllBranches/);
  assert.match(dialog, /workCopy\.teamAddOfficeBranch/);
  assert.match(dialog, /selectedBranch/);

  // Search input and matchesSearch
  assert.match(dialog, /workCopy\.teamAddSearchPlaceholder/);
  assert.match(dialog, /matchesSearch/);
  assert.match(dialog, /searchQuery/);

  // Select all / deselect all
  assert.match(dialog, /workCopy\.teamAddSelectAll/);
  assert.match(dialog, /workCopy\.teamAddDeselectAll/);
  assert.match(dialog, /allFilteredSelected/);
  assert.match(dialog, /toggleSelectAll/);

  // Selection tracking and count
  assert.match(dialog, /selectedIds/);
  assert.match(dialog, /workCopy\.teamAddSelectedCount/);

  // Mutation call
  assert.match(dialog, /upsertWorkDepartmentMembers/);
  assert.match(dialog, /userIds:\s*Array\.from\(selectedIds\)/);
});

test("Work actions support candidate branch data and batch member upsert", () => {
  const actions = readWeb("app/(protected)/work/actions.ts");

  // Candidate profiles with branch
  assert.match(actions, /export type WorkProfileOption\s*=\s*\{[\s\S]*?branchId\?:/);
  assert.match(actions, /listWorkCandidateProfiles/);
  assert.match(actions, /from\("branches"\)/);
  assert.match(actions, /branchNameById/);

  // Batch member upsert
  assert.match(actions, /export const upsertWorkDepartmentMembers = withAction/);
  assert.match(actions, /userIds:\s*z\.array\(z\.string\(\)\.uuid\(\)\)\.min\(1\)/);
  assert.match(actions, /upsert_work_department_member/);
  assert.match(actions, /revalidatePath\("\/work"\)/);
  assert.match(actions, /revalidatePath\("\/work\/team"\)/);
});

test("WorkSettingsDialog retains selected department and integrates WorkAddMembersDialog", () => {
  const settings = readWeb("app/(protected)/work/_components/work-settings-dialog.tsx");

  // Department dropdown retains selection without resetting to default on render
  assert.match(settings, /current != null && departments\.some\(\(d\) => d\.id === current\)/);

  // Integrates WorkAddMembersDialog
  assert.match(settings, /WorkAddMembersDialog/);
  assert.match(settings, /candidates=\{candidates\}/);
  assert.match(settings, /departmentId=\{memberDepartmentId\}/);
});

test("WorkTeamClient integrates WorkAddMembersDialog for department member management", () => {
  const teamClient = readWeb("app/(protected)/work/_components/work-team-client.tsx");

  assert.match(teamClient, /WorkAddMembersDialog/);
  assert.match(teamClient, /activeDepartmentId/);
  assert.match(teamClient, /candidates=\{candidates\}/);
});
