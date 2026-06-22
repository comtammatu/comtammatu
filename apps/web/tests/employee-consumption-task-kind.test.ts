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
const hrPageSource = readWeb("app/(protected)/hr/page.tsx");
const hrChecklistActionsSource = readWeb(
  "app/(protected)/hr/checklist-actions.ts",
);
const hrChecklistTemplatesSource = readWeb(
  "app/(protected)/hr/checklist-templates-table.tsx",
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

test("HR setup exposes task_kind while preserving it through template saves", () => {
  assert.match(
    hrPageSource,
    /item\.taskKind === "consumption_report"/,
    "HR page should find consumption checklist items by taskKind",
  );
  assert.match(
    hrChecklistActionsSource,
    /taskKind: z\.enum\(CHECKLIST_TASK_KINDS\)\.default\("standard"\)/,
    "HR actions should accept the hidden taskKind marker in template payloads",
  );
  assert.match(
    hrChecklistActionsSource,
    /select\([\s\S]*task_kind/,
    "HR actions should fetch task_kind from checklist template items",
  );
  assert.match(
    hrChecklistActionsSource,
    /checklistItem\.task_kind !== "consumption_report"/,
    "HR consumption default validation should use task_kind",
  );
  assert.match(
    hrChecklistTemplatesSource,
    /taskKind: item\.taskKind/,
    "HR template drafts should preserve taskKind",
  );
  assert.match(
    hrChecklistTemplatesSource,
    /CHECKLIST_TASK_KIND_LABELS/,
    "HR template builder should show human labels for task kinds",
  );
  assert.match(
    hrChecklistTemplatesSource,
    /<Label>Loại việc<\/Label>[\s\S]*value=\{item\.taskKind\}[\s\S]*CHECKLIST_TASK_KINDS\.map/,
    "HR template builder should let managers choose the consumption report task kind",
  );
  assert.match(
    hrChecklistTemplatesSource,
    /Có tiêu hao bếp/,
    "HR template list should mark templates that include the consumption report workflow",
  );
  assert.doesNotMatch(
    hrChecklistActionsSource,
    /item\.title !== "Tiêu hao bếp trong ngày"/,
    "HR consumption validation must not branch on the display title",
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
