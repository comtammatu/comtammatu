import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql } from "./_lib/active-sql.ts";

const webRoot = process.cwd();

function readWeb(path: string): string {
  return readSql(webRoot, path);
}

test("Work copy contains personnel filter copy labels", () => {
  const copy = readWeb("lib/messages/work.ts");
  assert.match(copy, /filterMember:\s*"Nhân sự"/);
  assert.match(copy, /filterAllMembers:\s*"Tất cả nhân sự"/);
});

test("Work params parser and builder handle member search param", () => {
  const params = readWeb("app/(protected)/work/_lib/params.ts");
  assert.match(params, /member\?: string \| string\[\]/);
  assert.match(params, /memberId: string \| null/);
  assert.match(params, /parseMemberId/);
  assert.match(params, /qs\.set\("member",\s*next\.memberId\)/);
});

test("Work task actions define checklist progress and enrich queries", () => {
  const actions = readWeb("app/(protected)/work/actions.ts");
  assert.match(actions, /checklistTotal\?: number/);
  assert.match(actions, /checklistDone\?: number/);
  assert.match(actions, /participantIds\?: string\[\]/);
  assert.match(actions, /enrichWorkTasks/);
  assert.match(actions, /work_task_checklist_items/);
  assert.match(actions, /work_task_participants/);

  // Used in task listings
  assert.match(actions, /await enrichWorkTasks\(mapped, ctx\)/);
});

test("WorkBoard filters by member and renders checklist progress indicator", () => {
  const board = readWeb("app/(protected)/work/_components/work-board.tsx");
  assert.match(board, /params\.memberId/);
  assert.match(board, /t\.assigneeId === memberId/);
  assert.match(board, /t\.participantIds\?\.includes\(memberId\)/);
  assert.match(board, /IconCheckSquare/);
  assert.match(board, /task\.checklistTotal/);
  assert.match(board, /task\.checklistDone/);
});

test("WorkInbox renders checklist progress indicator on list cards", () => {
  const inbox = readWeb("app/(protected)/work/_components/work-inbox.tsx");
  assert.match(inbox, /task\.checklistTotal/);
  assert.match(inbox, /task\.checklistDone/);
  assert.match(inbox, /IconCheckSquare/);
});

test("Work views (filtered inbox, calendar, timeline) filter by memberId", () => {
  const filteredInbox = readWeb(
    "app/(protected)/work/_components/work-inbox-filtered.tsx",
  );
  assert.match(filteredInbox, /params\.memberId/);
  assert.match(filteredInbox, /task\.assigneeId === memberId/);

  const calendar = readWeb(
    "app/(protected)/work/_components/work-calendar.tsx",
  );
  assert.match(calendar, /params\.memberId/);
  assert.match(calendar, /t\.assigneeId === memberId/);

  const timeline = readWeb(
    "app/(protected)/work/_components/work-timeline.tsx",
  );
  assert.match(timeline, /params\.memberId/);
  assert.match(timeline, /t\.assigneeId === memberId/);
});

test("Work toolbar and page shell wire member filter", () => {
  const toolbar = readWeb(
    "app/(protected)/work/_components/work-list-toolbar.tsx",
  );
  assert.match(toolbar, /members\s*=\s*\[\]/);
  assert.match(toolbar, /memberFilter/);
  assert.match(toolbar, /filterAllMembers/);
  assert.match(toolbar, /workHref\(params,\s*\{\s*memberId:/);

  const shell = readWeb(
    "app/(protected)/work/_components/work-page-shell.tsx",
  );
  assert.match(shell, /members\s*=\s*\[\]/);
  assert.match(shell, /members=\{members\}/);

  const page = readWeb("app/(protected)/work/page.tsx");
  assert.match(page, /allMembers/);
  assert.match(page, /members=\{allMembers\}/);
});
