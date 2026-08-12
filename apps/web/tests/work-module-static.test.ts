import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const webRoot = process.cwd();

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readWeb(path: string): string {
  return readFileSync(join(webRoot, path), "utf8");
}

function existsRepo(path: string): boolean {
  return existsSync(resolve(repoRoot, path));
}

test("Work module ACL path is /work", () => {
  const moduleAcl = readRepo("packages/shared/src/auth/module-acl.ts");
  assert.match(moduleAcl, /work:\s*\{[\s\S]*?path:\s*"\/work"/);
});

test("Work pages and compose census exist", () => {
  assert.ok(
    existsRepo("apps/web/app/(protected)/work/page.tsx"),
    "work page must exist",
  );
  assert.ok(
    existsRepo("apps/web/app/(protected)/work/tasks/[id]/page.tsx"),
    "work task detail page must exist",
  );
  assert.ok(
    existsRepo("apps/web/app/(protected)/work/team/page.tsx"),
    "work team page must exist",
  );

  const archetypes = readRepo("scripts/page-archetypes.mjs");
  assert.match(
    archetypes,
    /"apps\/web\/app\/\(protected\)\/work\/page\.tsx": "LIST"/,
  );
  assert.match(
    archetypes,
    /"apps\/web\/app\/\(protected\)\/work\/tasks\/\[id\]\/page\.tsx": "DETAIL"/,
  );
  assert.match(
    archetypes,
    /"apps\/web\/app\/\(protected\)\/work\/team\/page\.tsx": "LIST"/,
  );
});

test("Control home attention includes work:mine-due bucket", () => {
  const attention = readWeb("app/_lib/control-home-attention.ts");
  const controlSurface = readWeb("lib/messages/control-surface.ts");

  assert.match(attention, /id:\s*"work:mine-due"/);
  assert.match(attention, /loadWorkAttention/);
  assert.match(controlSurface, /workMineDue:\s*"Việc đến hạn \/ quá hạn"/);
});

test("Staff runtime exposes /work CTA when can_access_workspace", () => {
  const staffPage = readWeb("lib/staff-runtime/page.tsx");
  assert.match(staffPage, /can_access_workspace/);
  assert.match(staffPage, /href="\/work"/);
  assert.match(staffPage, /openWorkCta/);
});

test("Work board uses HTML5 drag-and-drop handlers", () => {
  const board = readWeb("app/(protected)/work/_components/work-board.tsx");
  assert.match(board, /onDragStart=/);
  assert.match(board, /onDrop=/);
  assert.match(board, /WORK_KANBAN_COLUMN/);
});

test("Work calendar and timeline use compose shell archetypes", () => {
  const shell = readWeb(
    "app/(protected)/work/_components/compose/work-compose-shell.tsx",
  );
  const styles = readWeb("app/(protected)/work/_lib/compose-styles.ts");
  assert.match(shell, /data-page-archetype=\{archetype\}/);
  assert.match(styles, /WORK_LIST_ITEM_INSET/);
  assert.match(styles, /WORK_KANBAN_COLUMN/);
  assert.match(styles, /WORK_MONTH_CELL/);
});

test("Work timeline shows scope picker dialog instead of full page", () => {
  const page = readWeb("app/(protected)/work/page.tsx");
  assert.match(page, /needsTimelineScope/);
  assert.match(page, /WorkPageShell/);
  assert.doesNotMatch(page, /WorkScopePicker/);
  const shell = readWeb("app/(protected)/work/_components/work-page-shell.tsx");
  assert.match(shell, /WorkScopeDialog/);
});

test("Work settings dialog covers department and member admin", () => {
  const settings = readWeb(
    "app/(protected)/work/_components/work-settings-dialog.tsx",
  );
  assert.match(settings, /WorkSettingsDialog/);
  assert.match(settings, /deactivateWorkDepartment/);
  assert.match(settings, /ensurePilotDepartment/);
  const header = readWeb(
    "app/(protected)/work/_components/work-page-header-actions.tsx",
  );
  assert.match(header, /settingsOpen/);
});

test("Work compose blocks are registered", () => {
  const registry = readRepo("scripts/ui-component-registry.mjs");
  assert.match(registry, /"work-task-inbox"/);
  assert.match(registry, /"work-task-board"/);
  assert.match(registry, /"work-task-calendar"/);
});

test("Work create dialog and list toolbar exist", () => {
  assert.ok(
    existsRepo(
      "apps/web/app/(protected)/work/_components/work-create-dialog.tsx",
    ),
  );
  const page = readWeb("app/(protected)/work/page.tsx");
  assert.match(page, /WorkCreateDialog/);
  assert.match(page, /WorkPageShell/);
  const toolbar = readWeb(
    "app/(protected)/work/_components/work-list-toolbar.tsx",
  );
  assert.match(toolbar, /variant="inline"/);
  assert.match(toolbar, /useFormControlSize/);
  assert.doesNotMatch(toolbar, /size="default"/);
  assert.doesNotMatch(toolbar, /size="sm"/);
});

test("Work DETAIL uses StatusBadge work-task domain", () => {
  const detail = readWeb(
    "app/(protected)/work/_components/work-task-detail.tsx",
  );
  assert.match(detail, /domain="work-task"/);
  const statusBadge = readWeb("app/components/status-badge.tsx");
  assert.match(statusBadge, /"work-task"/);
});

test("Work membership admin RPCs are in migration", () => {
  const membershipMigration = readRepo(
    "supabase/migrations/20260812140000_work_department_membership_admin.sql",
  );
  assert.match(membershipMigration, /upsert_work_department_member/);
  assert.match(membershipMigration, /set_work_department_member_role/);
  assert.match(membershipMigration, /deactivate_work_department_member/);
  assert.match(membershipMigration, /can_manage_work_membership/);

  const departmentMigration = readRepo(
    "supabase/migrations/20260812160000_work_department_admin.sql",
  );
  assert.match(departmentMigration, /upsert_work_department/);
  assert.match(departmentMigration, /deactivate_work_department/);
});

test("Work permission key is registered", () => {
  const permissions = readRepo("packages/shared/src/auth/permissions.ts");
  assert.match(permissions, /WORK_MANAGE: "work:manage"/);
});

test("Work deep nav exposes department team section for manage", () => {
  const nav = readWeb("app/lib/control-surface-nav.ts");
  assert.match(nav, /teamNavSection/);
  assert.match(nav, /\/work\/team/);
  const teamClient = readWeb("app/(protected)/work/_components/work-team-client.tsx");
  assert.match(teamClient, /upsertWorkDepartment/);
  assert.match(teamClient, /departmentAdd/);
});
