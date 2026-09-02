import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { readSql } from "./_lib/active-sql.ts";


function readWeb(path: string): string {
  return readSql(process.cwd(), path);
}

function readRepo(path: string): string {
  return readSql(join(process.cwd(), "../.."), path);
}

const taskKindMigration = readRepo(
  "supabase/migrations/20260619042223_employee_consumption_task_kind.sql",
);
const attendanceShiftIntegrityMigration = readRepo(
  "supabase/migrations/20260709094314_attendance_shift_integrity.sql",
);
const todayWorkStateSource = readWeb("lib/staff-runtime/_lib/today-work-state.ts");
const checkoutActionSource = readWeb("lib/staff-runtime/clock/actions.ts");
const checkoutApprovalsPageSource = readWeb(
  "lib/staff-runtime/checkout-approvals/page.tsx",
);
const checkoutApprovalsClientSource = readWeb(
  "lib/staff-runtime/checkout-approvals/checkout-approvals-client.tsx",
);

test("consumption task kind remains stable but no longer drives Employee tasks", () => {
  assert.match(
    taskKindMigration,
    /task_kind IN \('standard', 'consumption_report'\)/,
  );

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
    positionTasksActionsSource,
    /await ctx\.supabase\.rpc\(\s*"upsert_position_shift_tasks"/,
    "HR position-task save must preserve the authenticated owner's JWT for the permission-checking RPC",
  );
  assert.doesNotMatch(
    positionTasksActionsSource,
    /await service\.rpc\(\s*"upsert_position_shift_tasks"/,
    "HR position-task save must not call its permission-checking RPC as service role",
  );
  assert.match(
    positionTasksActionsSource,
    /ingredientIds: task\.ingredientIds/,
    "HR position-task save should pass consumption ingredients into the RPC payload",
  );
  assert.doesNotMatch(
    positionTasksActionsSource,
    /\.from\("shift_checklist_consumption_default_items"\)[\s\S]{0,300}\.(?:update|insert)\(/,
    "HR position-task save should not write consumption defaults outside the RPC transaction",
  );
  assert.match(
    attendanceShiftIntegrityMigration,
    /CREATE OR REPLACE FUNCTION public\.upsert_position_shift_tasks/,
    "active migration should replace upsert_position_shift_tasks",
  );
  assert.match(
    attendanceShiftIntegrityMigration,
    /jsonb_array_elements_text\(v_ingredient_ids\)/,
    "upsert_position_shift_tasks should read consumption ingredient ids from the RPC payload",
  );
  assert.match(
    attendanceShiftIntegrityMigration,
    /INSERT INTO public\.shift_checklist_consumption_default_items/,
    "upsert_position_shift_tasks should persist consumption defaults inside the same RPC",
  );
  assert.match(
    positionTasksClientSource,
    /watchedKind === "consumption_report"/,
    "HR position-task editor should reveal ingredients for consumption rows",
  );
  assert.match(
    positionTasksClientSource,
    /<DataTable[\s\S]*<FormDialog/,
    "HR position-task setup should stay list-first and edit one position template in the shared form dialog",
  );
  assert.doesNotMatch(
    positionTasksClientSource,
    /position-task-position/,
    "HR position-task setup should not hide templates behind a position dropdown",
  );
  assert.match(
    positionTasksActionsSource,
    /\.from\("employees"\)[\s\S]*profiles!inner\(full_name, position_id, branch_id/,
    "HR position-task list should expose the active staff assigned to each position",
  );
  assert.match(
    positionTasksActionsSource,
    /\.from\("positions"\)[\s\S]*\.eq\("is_active", true\)/,
    "HR position-task editor should load active assignable positions",
  );
  assert.match(
    positionTasksActionsSource,
    /isOwnerPositionCode\(position\.code\) \|\|[\s\S]*position\.code === "archived_staff"/,
    "HR position-task editor should exclude Owner and archived positions",
  );
  assert.doesNotMatch(
    positionTasksActionsSource,
    /bucket === "unassigned"/,
    "HR position-task editor should keep zero-module company positions assignable",
  );
  assert.doesNotMatch(positionTasksActionsSource, /position\.code === "waiter"/);
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
