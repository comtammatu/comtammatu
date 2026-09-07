import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  extractSqlFunction,
  readActiveMigrationSql,
} from "./_lib/active-sql.ts";

const sql = readActiveMigrationSql(resolve(process.cwd(), "../.."));
const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

test("default inbox includes Owner's unassigned work without widening staff scope", () => {
  const fn = extractSqlFunction(sql, "list_my_work_tasks");
  assert.match(fn, /auth_is_owner\(auth\.uid\(\)\)/);
  assert.match(fn, /task\.tenant_id = public\.auth_tenant_id\(\)/);
  assert.match(fn, /can_read_work_task\(task\.id\)/);
  assert.match(fn, /p_include_done/);
});

test("staff creator grants and authorship do not confer read access", () => {
  for (const name of [
    "can_read_work_task",
    "can_read_work_department",
    "can_read_work_project",
  ]) {
    const fn = extractSqlFunction(sql, name);
    assert.doesNotMatch(
      fn,
      /can_create_work_task|created_by|work:manage/,
      name,
    );
    assert.match(fn, /auth_is_owner/, name);
    assert.match(fn, /auth_tenant_id/, name);
  }
});

test("staff can filter the inbox by department with role-specific scope copy", () => {
  const toolbar = source(
    "app/(protected)/work/_components/work-list-toolbar.tsx",
  );
  assert.doesNotMatch(toolbar, /params\.view === "mine" && canManage/);
  assert.match(
    toolbar,
    /isOwner\s*\? workCopy\.allDepartments\s*: workCopy\.filterAllDepartments/,
  );
});

test("creation persists participants in the same RPC and checks detail access", () => {
  const action = source("app/(protected)/work/actions.ts")
    .split("export const createWorkTask =")[1]!
    .split("const updateWorkTaskSchema")[0]!;
  assert.match(action, /p_assignee_ids: resolvedAssignees/);
  assert.match(action, /p_supporter_ids: data\.supporterIds/);
  assert.doesNotMatch(action, /rpc\("set_work_task_participants"/);
  assert.match(action, /can_read_work_task/);
  const fn = extractSqlFunction(sql, "create_work_task");
  assert.match(fn, /p_assignee_ids uuid\[\], p_supporter_ids uuid\[\]/);
  assert.match(fn, /can_read_work_department\(p_department_id\)/);
  assert.match(fn, /profile\.tenant_id = v_tenant/);
  assert.match(fn, /INSERT INTO public\.work_task_participants/);
  assert.match(fn, /notify_work_task_participant/);
  assert.doesNotMatch(fn, /WHEN OTHERS/);
});

test("control home keeps its personal attention scope when Owner inbox expands", () => {
  assert.match(source("app/_lib/control-home-attention.ts"), /personalOnly: true/);
  const action = source("app/(protected)/work/actions.ts");
  assert.match(action, /personalOnly: z\.boolean\(\)/);
  assert.match(action, /task\.assigneeId === ctx\.userId/);
  assert.match(action, /task\.participantIds\?\.includes\(ctx\.userId\)/);
});
