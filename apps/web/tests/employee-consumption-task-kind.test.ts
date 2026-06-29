import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

const taskKindMigration = readRepo(
  "supabase/migrations/_archive/20260619042223_employee_consumption_task_kind.sql",
);
const todayWorkStateSource = readWeb(
  "app/(protected)/employee/_lib/today-work-state.ts",
);
const employeeTasksPageSource = readWeb(
  "app/(protected)/employee/tasks/page.tsx",
);
const checkoutActionSource = readWeb(
  "app/(protected)/employee/clock/actions.ts",
);
const checkoutApprovalsPageSource = readWeb(
  "app/(protected)/employee/checkout-approvals/page.tsx",
);
const checkoutApprovalsClientSource = readWeb(
  "app/(protected)/employee/checkout-approvals/checkout-approvals-client.tsx",
);

test("consumption checklist workflow uses task_kind instead of the display title", () => {
  for (const expected of [
    "ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'standard'",
    "CHECK (task_kind IN ('standard', 'consumption_report'))",
    "SET task_kind = 'consumption_report'",
    "i.task_kind",
    "ci.task_kind = 'consumption_report'",
    "AND task_kind = 'consumption_report'",
  ]) {
    assert.ok(taskKindMigration.includes(expected), `expected ${expected}`);
  }

  assert.doesNotMatch(
    taskKindMigration,
    /ci\.title = 'Tiêu hao bếp trong ngày'/,
    "replacement RPCs must validate consumption checklist rows by task_kind",
  );
  assert.match(
    todayWorkStateSource,
    /taskKind: TodayChecklistTaskKind/,
    "TodayChecklistItem should expose the stable marker to Employee routes",
  );
  assert.match(
    todayWorkStateSource,
    /select\([\s\S]*task_kind/,
    "Today work state should select task_kind from attendance checklist rows",
  );
  assert.match(
    employeeTasksPageSource,
    /item\.taskKind === "consumption_report"/,
    "Employee tasks should detect the consumption report workflow by taskKind",
  );
  assert.doesNotMatch(
    employeeTasksPageSource,
    /item\.title === "Tiêu hao bếp trong ngày"/,
    "Employee tasks must not use the display title as a workflow key",
  );
});

test("HR per-position editor exposes the consumption task kind", () => {
  const positionTasksClientSource = readWeb(
    "app/(protected)/hr/position-tasks-client.tsx",
  );
  const positionTasksActionsSource = readWeb(
    "app/(protected)/hr/position-tasks-actions.ts",
  );

  assert.match(
    positionTasksActionsSource,
    /kind: z\.enum\(POSITION_TASK_KINDS\)/,
    "HR position-task actions should validate the task kind via Zod",
  );
  assert.match(
    positionTasksActionsSource,
    /upsert_position_shift_tasks/,
    "HR position-task save should call the upsert RPC",
  );
  assert.match(
    positionTasksClientSource,
    /watchedKind === "consumption_report"/,
    "HR position-task editor should reveal ingredients for consumption rows",
  );
});

test("checkout approval requires approved or applied consumption report when assigned", () => {
  assert.match(
    checkoutApprovalsPageSource,
    /loadConsumptionRequiredAttendanceIds/,
    "checkout approvals page should load which attendance rows require consumption review",
  );
  assert.match(
    checkoutApprovalsPageSource,
    /\.eq\("task_kind", "consumption_report"\)/,
    "checkout approvals page should detect required consumption reports by task_kind",
  );
  assert.match(
    checkoutApprovalsPageSource,
    /requiresConsumptionReport: consumptionRequiredAttendanceIds\.has\([\s\S]*record\.id[\s\S]*\)/,
    "checkout approval items should carry whether consumption review is required",
  );
  assert.match(
    checkoutApprovalsClientSource,
    /requiresConsumptionReport: boolean/,
    "checkout approval client item type should include requiresConsumptionReport",
  );
  assert.match(
    checkoutApprovalsClientSource,
    /status === "approved" \|\| status === "applied"/,
    "checkout approval client should allow checkout only for approved/applied reports",
  );
  assert.match(
    checkoutApprovalsClientSource,
    /item\.requiresConsumptionReport \? \(/,
    "checkout approval client should only render consumption review for required attendance rows",
  );
  assert.match(
    checkoutActionSource,
    /\.from\("attendance_checklist_items"\)[\s\S]*\.eq\("task_kind", "consumption_report"\)/,
    "server approval action should check the attendance checklist marker",
  );
  assert.match(
    checkoutActionSource,
    /consumptionReport\?\.status !== "approved"[\s\S]*consumptionReport\?\.status !== "applied"/,
    "server approval action should block missing/draft/submitted/needs_changes/cancelled reports",
  );
  assert.doesNotMatch(
    checkoutActionSource,
    /consumptionReport\?\.status === "submitted"/,
    "server approval action should not use a partial pending-status denylist",
  );
});
