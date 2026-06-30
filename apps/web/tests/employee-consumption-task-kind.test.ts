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

test("consumption task kind remains stable but no longer drives Employee tasks", () => {
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
  assert.doesNotMatch(
    employeeTasksPageSource,
    /item\.taskKind === "consumption_report"|fetchConsumptionReportForAttendance|fetchConsumptionIngredients/,
    "Employee tasks should not load or branch into the consumption report workflow",
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

test("checkout approval no longer requires a consumption report", () => {
  assert.doesNotMatch(
    checkoutApprovalsPageSource,
    /loadConsumptionRequiredAttendanceIds|\.eq\("task_kind", "consumption_report"\)|requiresConsumptionReport/,
    "checkout approvals page should not load consumption review gates",
  );
  assert.doesNotMatch(
    checkoutApprovalsClientSource,
    /requiresConsumptionReport|status === "approved" \|\| status === "applied"|item\.requiresConsumptionReport|approveConsumptionReport|requestConsumptionAdjustment/,
    "checkout approval client should not render or block on consumption review",
  );
  assert.doesNotMatch(
    checkoutActionSource,
    /\.from\("attendance_checklist_items"\)[\s\S]*\.eq\("task_kind", "consumption_report"\)|consumptionReport\?\.status !== "approved"|consumptionReport\?\.status !== "applied"/,
    "server approval action should not block checkout approval on consumption reports",
  );
});
