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

test("WorkAddCreatorsDialog supports bulk selection, search, and branch filtering", () => {
  assert.ok(
    existsWeb("app/(protected)/work/_components/work-add-creators-dialog.tsx"),
    "work-add-creators-dialog.tsx must exist",
  );
  assert.ok(
    !existsWeb("app/(protected)/work/_components/work-add-members-dialog.tsx"),
    "work-add-members-dialog.tsx must be removed",
  );

  const dialog = readWeb(
    "app/(protected)/work/_components/work-add-creators-dialog.tsx",
  );

  assert.match(dialog, /workCopy\.teamAddBranchFilter/);
  assert.match(dialog, /workCopy\.teamAddAllBranches/);
  assert.match(dialog, /workCopy\.teamAddOfficeBranch/);
  assert.match(dialog, /selectedBranch/);
  assert.match(dialog, /workCopy\.teamAddSearchPlaceholder/);
  assert.match(dialog, /matchesSearch/);
  assert.match(dialog, /searchQuery/);
  assert.match(dialog, /workCopy\.teamAddSelectAll/);
  assert.match(dialog, /workCopy\.teamAddDeselectAll/);
  assert.match(dialog, /allFilteredSelected/);
  assert.match(dialog, /toggleSelectAll/);
  assert.match(dialog, /selectedIds/);
  assert.match(dialog, /workCopy\.teamAddSelectedCount/);
  assert.match(dialog, /setWorkTaskCreators/);
  assert.match(dialog, /userIds:\s*Array\.from\(selectedIds\)/);
});

test("Work actions list company actors and grant work:create", () => {
  const actions = readWeb("app/(protected)/work/actions.ts");

  assert.match(actions, /export type WorkProfileOption\s*=\s*\{[\s\S]*?branchId\?:/);
  assert.match(actions, /listWorkActorProfiles/);
  assert.match(actions, /list_work_actor_profiles/);
  assert.match(actions, /listWorkCandidateProfiles/);
  assert.match(actions, /resolveWorkCreateContext/);
  assert.match(actions, /listWorkTaskCreators/);
  assert.match(actions, /list_work_task_creators/);
  assert.match(actions, /export const setWorkTaskCreator = withAction/);
  assert.match(actions, /export const setWorkTaskCreators = withAction/);
  assert.match(actions, /set_work_task_creator/);
  assert.match(actions, /userIds:\s*z\.array\(z\.string\(\)\.uuid\(\)\)\.min\(1\)/);
  assert.match(actions, /resolveWorkManageContext/);
  assert.match(actions, /revalidatePath\("\/work"\)/);
  assert.doesNotMatch(actions, /upsert_work_department_member/);
  assert.doesNotMatch(actions, /export const upsertWorkDepartmentMembers/);
});

test("WorkSettingsDialog grants creators from the company picker", () => {
  const settings = readWeb(
    "app/(protected)/work/_components/work-settings-dialog.tsx",
  );

  assert.match(settings, /WorkAddCreatorsDialog/);
  assert.match(settings, /candidates=\{candidates\}/);
  assert.match(settings, /listWorkTaskCreators/);
  assert.match(settings, /listWorkCandidateProfiles/);
  assert.match(settings, /setWorkTaskCreator/);
  assert.doesNotMatch(settings, /WorkAddMembersDialog/);
  assert.doesNotMatch(settings, /setWorkDepartmentMemberRole/);
  assert.doesNotMatch(settings, /deactivateWorkDepartmentMember/);
});

test("WorkCreateDialog uses the company picker and keeps assignees on department change", () => {
  const dialog = readWeb(
    "app/(protected)/work/_components/work-create-dialog.tsx",
  );

  assert.match(dialog, /members: WorkProfileOption\[\]/);
  assert.match(dialog, /members\.filter/);
  assert.doesNotMatch(dialog, /membersByDepartment/);
  assert.doesNotMatch(dialog, /handleDepartmentChange/);
});
