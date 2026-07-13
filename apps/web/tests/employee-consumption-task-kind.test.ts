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

const taskKindBackfill = readRepo(
  "supabase/migration-archive/20260619042223_employee_consumption_task_kind.sql",
);
const baseline = readRepo(
  "supabase/migrations/00000000000000_baseline.sql",
);

function pgDumpBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing pg_dump block: ${marker}`);
  const next = source.indexOf("\n\n--\n-- Name:", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const attendanceChecklistTable = pgDumpBlock(
  baseline,
  "-- Name: attendance_checklist_items; Type: TABLE;",
);
const checklistTemplateItemsTable = pgDumpBlock(
  baseline,
  "-- Name: shift_checklist_template_items; Type: TABLE;",
);
const approveConsumptionFunction = pgDumpBlock(
  baseline,
  "-- Name: branch_manager_approve_consumption_report(bigint, bigint); Type: FUNCTION;",
);
const requestConsumptionAdjustmentFunction = pgDumpBlock(
  baseline,
  "-- Name: branch_manager_request_consumption_adjustment(bigint, bigint, text); Type: FUNCTION;",
);
const submitConsumptionFunction = pgDumpBlock(
  baseline,
  "-- Name: employee_submit_consumption_report(bigint, bigint, jsonb, text, boolean); Type: FUNCTION;",
);
const upsertPositionTasksFunction = pgDumpBlock(
  baseline,
  "-- Name: upsert_position_shift_tasks(bigint, jsonb); Type: FUNCTION;",
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
    taskKindBackfill,
    /UPDATE public\.shift_checklist_template_items\s+SET task_kind = 'consumption_report'\s+WHERE title = 'Tiêu hao bếp trong ngày'/,
    "the archived data migration must preserve how historical titled rows acquired their stable task kind",
  );
  assert.match(
    taskKindBackfill,
    /UPDATE public\.attendance_checklist_items\s+SET task_kind = 'consumption_report'\s+WHERE title = 'Tiêu hao bếp trong ngày'/,
  );
  assert.match(
    checklistTemplateItemsTable,
    /task_kind text DEFAULT 'standard'::text NOT NULL/,
  );
  assert.match(
    checklistTemplateItemsTable,
    /shift_checklist_template_items_task_kind_valid CHECK \(\(task_kind = ANY \(ARRAY\['standard'::text, 'consumption_report'::text\]\)\)\)/,
  );
  assert.match(
    attendanceChecklistTable,
    /attendance_checklist_items_task_kind_valid CHECK \(\(task_kind = ANY \(ARRAY\['standard'::text, 'consumption_report'::text, 'inventory_count'::text\]\)\)\)/,
    "the current attendance snapshot must retain inventory_count as a first-class task kind",
  );
  assert.match(submitConsumptionFunction, /ci\.task_kind = 'consumption_report'/);
  assert.match(
    requestConsumptionAdjustmentFunction,
    /AND task_kind = 'consumption_report'/,
  );
  assert.match(
    approveConsumptionFunction,
    /FROM public\.attendance_consumption_reports r[\s\S]*v_report\.status <> 'submitted'/,
    "approval must operate on the already-classified submitted report, not rediscover it by display title",
  );

  for (const functionSource of [
    submitConsumptionFunction,
    requestConsumptionAdjustmentFunction,
    approveConsumptionFunction,
  ]) {
    assert.doesNotMatch(
      functionSource,
      /(?:ci\.)?title = 'Tiêu hao bếp trong ngày'/,
      "current consumption RPCs must validate workflow rows by task_kind, not display title",
    );
  }
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
    upsertPositionTasksFunction,
    /CREATE FUNCTION public\.upsert_position_shift_tasks/,
    "the current baseline must define upsert_position_shift_tasks",
  );
  assert.match(
    upsertPositionTasksFunction,
    /jsonb_array_elements_text\(v_ingredient_ids\)/,
    "upsert_position_shift_tasks should read consumption ingredient ids from the RPC payload",
  );
  assert.match(
    upsertPositionTasksFunction,
    /INSERT INTO public\.shift_checklist_consumption_default_items/,
    "upsert_position_shift_tasks should persist consumption defaults inside the same RPC",
  );
  assert.match(
    positionTasksClientSource,
    /watchedKind === "consumption_report"/,
    "HR position-task editor should reveal ingredients for consumption rows",
  );
  assert.match(
    positionTasksActionsSource,
    /\.from\("profiles"\)[\s\S]*\.select\("position_id"\)/,
    "HR position-task editor should keep the position list scoped to active staff positions",
  );
  assert.match(
    positionTasksActionsSource,
    /activeProfilePositionIds\.has\(position\.id\)[\s\S]*taskPositionIds\.has\(position\.id\)/,
    "HR position-task editor should keep positions that have staff or existing tasks",
  );
  assert.match(
    positionTasksActionsSource,
    /bucket === "owner"[\s\S]*position\.code === "waiter"/,
    "HR position-task editor should exclude owner and inactive waiter positions",
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
