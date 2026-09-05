import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql } from "./_lib/active-sql.ts";

const repoRoot = resolve(process.cwd(), "../..");
const webRoot = process.cwd();

function readRepo(path: string): string {
  return readSql(repoRoot, path);
}

function readWeb(path: string): string {
  return readSql(webRoot, path);
}

function existsRepo(path: string): boolean {
  return existsSync(resolve(repoRoot, path));
}

test("set_work_task_participants migration exists and manages multi-assignee and supporter sync", () => {
  const migrationPath =
    "supabase/migrations/20260905113500_work_task_participants_sync.sql";
  assert.ok(existsRepo(migrationPath), `${migrationPath} must exist`);

  const sql = readRepo(migrationPath);
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.set_work_task_participants\(/,
  );
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path TO 'pg_catalog', 'public'/);
  assert.match(sql, /can_write_work_task\(p_task_id\)/);
  assert.match(sql, /DELETE FROM public\.work_task_participants/);
  assert.match(
    sql,
    /kind = ANY \(ARRAY\['assignee'::text, 'collaborator'::text\]\)/,
  );
  assert.match(sql, /'assignee'/);
  assert.match(sql, /'collaborator'/);
  assert.match(sql, /UPDATE public\.work_tasks[\s\S]*?SET assignee_id = v_primary_assignee/);
});

test("Work task actions support multi-assignee and supporter sync", () => {
  const actions = readWeb("app/(protected)/work/actions.ts");

  // createWorkTask supports assigneeIds and supporterIds
  assert.match(actions, /assigneeIds:\s*z\.array\(z\.string\(\)\.uuid\(\)\)\.optional\(\)/);
  assert.match(actions, /supporterIds:\s*z\.array\(z\.string\(\)\.uuid\(\)\)\.optional\(\)/);
  assert.match(actions, /set_work_task_participants/);

  // updateWorkTask supports assigneeIds and supporterIds
  assert.match(actions, /export const updateWorkTask = withAction/);
  assert.match(actions, /resolvedAssignees/);

  // setWorkTaskParticipants exported action
  assert.match(
    actions,
    /export const setWorkTaskParticipants = withAction/,
  );
});

test("loadWorkTaskDetail queries participants and returns initialAssigneeIds and initialSupporterIds", () => {
  const loader = readWeb("app/(protected)/work/_lib/load-work-task-detail.ts");

  assert.match(loader, /from\("work_task_participants"\)/);
  assert.match(loader, /initialAssigneeIds/);
  assert.match(loader, /initialSupporterIds/);
});

test("WorkCreateDialog supports multi-assignees and multi-supporters with mutual exclusion", () => {
  const dialog = readWeb(
    "app/(protected)/work/_components/work-create-dialog.tsx",
  );

  assert.match(dialog, /assigneeIds/);
  assert.match(dialog, /supporterIds/);
  assert.match(dialog, /workCopy\.assignees/);
  assert.match(dialog, /workCopy\.supporterLabel/);
  assert.match(dialog, /MultiSelectCombobox/);
  assert.match(dialog, /!supporterSet\.has\(/);
  assert.match(dialog, /!assigneeSet\.has\(/);
});

test("WorkTaskDetailPanel supports multi-assignees and multi-supporters", () => {
  const panel = readWeb(
    "app/(protected)/work/_components/work-task-detail-panel.tsx",
  );

  assert.match(panel, /assigneeIds/);
  assert.match(panel, /supporterIds/);
  assert.match(panel, /workCopy\.assignees/);
  assert.match(panel, /workCopy\.supporterLabel/);
  assert.match(panel, /MultiSelectCombobox/);
});
