import assert from "node:assert/strict";
import { test } from "node:test";
import { readSql } from "./_lib/active-sql.ts";

const repoRoot = process.cwd().replace(/apps[\\/]web$/, "");
const webRoot = process.cwd();

function readWeb(path: string): string {
  return readSql(webRoot, path);
}

function readRepo(path: string): string {
  return readSql(repoRoot, path);
}

test("Migration defines task assignment notifications and audit events", () => {
  const migration = readRepo(
    "supabase/migrations/20260905140000_work_task_notifications_and_events.sql",
  );

  assert.match(migration, /create or replace function private\.notify_work_task_participant/i);
  assert.match(migration, /create or replace function private\.notify_work_task_assigned/i);
  assert.match(migration, /format\('\/work\?task=%s', p_task_id\)/i);
  assert.match(migration, /create or replace function public\.set_work_task_participants/i);
  assert.match(migration, /'task\.participants_updated'/i);
  assert.match(migration, /insert into public\.work_task_events/i);
  assert.match(migration, /notify_work_task_participant\(\s*v_tenant,\s*p_task_id,\s*v_new_assignee,\s*v_task\.title,\s*'assignee'\s*\)/i);
  assert.match(migration, /notify_work_task_participant\(\s*v_tenant,\s*p_task_id,\s*v_new_supporter,\s*v_task\.title,\s*'collaborator'\s*\)/i);
});

test("Entity href and notification action URL route work tasks to /work?task=<id>", () => {
  const entityHref = readWeb("lib/entity-href.ts");
  assert.match(entityHref, /case "work_task":\s*return `\/work\?task=\$\{entityId\}`;/);

  const actionUrl = readWeb("lib/notifications/action-url.ts");
  assert.match(actionUrl, /function rewriteWorkTaskPath/);
  assert.match(actionUrl, /`\/work\?task=\$\{match\[1\]\}`/);
});

test("Work copy defines tab switcher and event action descriptions", () => {
  const copy = readWeb("lib/messages/work.ts");
  assert.match(copy, /tabDetail:\s*"Nội dung việc"/);
  assert.match(copy, /tabActivity:\s*"Lịch sử hoạt động"/);
  assert.match(copy, /activityTitle:\s*"Lịch sử hoạt động"/);
  assert.match(copy, /activityEmpty:\s*"Chưa có ghi nhận hoạt động\."/);
  assert.match(copy, /eventCreated:\s*"đã tạo công việc"/);
  assert.match(copy, /eventStatusChanged:\s*"đã đổi trạng thái"/);
  assert.match(copy, /eventParticipantsUpdated:\s*"đã cập nhật người tham gia"/);
  assert.match(copy, /eventChecklistUpdated:\s*"đã cập nhật việc cần làm"/);
  assert.match(copy, /eventCommented:\s*"đã thêm bình luận"/);
  assert.match(copy, /eventUpdated:\s*"đã cập nhật công việc"/);
  assert.match(copy, /eventSystem:\s*"Hệ thống"/);
});

test("loadWorkTaskDetail queries work_task_events and returns mapped events", () => {
  const loader = readWeb("app/(protected)/work/_lib/load-work-task-detail.ts");
  assert.match(loader, /from\("work_task_events"\)/);
  assert.match(loader, /profiles\(full_name\)/);
  assert.match(loader, /order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(loader, /events:\s*WorkTaskEventRow\[\]/);
  assert.match(loader, /actorName:\s*profile\?\.full_name \?\? null/);
  assert.match(loader, /data:\s*\{[\s\S]*events[\s\S]*\}/);
});

test("Work task detail components support activity timeline and tab switcher", () => {
  const dialogHost = readWeb(
    "app/(protected)/work/_components/work-task-detail-dialog-host.tsx",
  );
  assert.match(dialogHost, /events\?:\s*WorkTaskEventRow\[\];/);
  assert.match(dialogHost, /initialEvents:\s*detail\.events/);

  const panel = readWeb(
    "app/(protected)/work/_components/work-task-detail-panel.tsx",
  );
  assert.match(panel, /initialEvents\?:\s*WorkTaskEventRow\[\];/);
  assert.match(panel, /activeTab/);
  assert.match(panel, /AppSegmentedControl/);
  assert.match(panel, /workCopy\.tabDetail/);
  assert.match(panel, /workCopy\.tabActivity/);
  assert.match(panel, /workCopy\.activityTitle/);
  assert.match(panel, /workCopy\.activityEmpty/);
  assert.match(panel, /event\.eventKind === "task\.created"/);
  assert.match(panel, /event\.eventKind === "task\.status_changed"/);
  assert.match(panel, /event\.eventKind === "task\.participants_updated"/);
  assert.match(panel, /event\.eventKind === "task\.checklist_updated"/);
  assert.match(panel, /event\.eventKind === "task\.commented"/);
  assert.match(panel, /StatusBadge/);
  assert.match(panel, /formatVNDate\(event\.createdAt\)/);
});
