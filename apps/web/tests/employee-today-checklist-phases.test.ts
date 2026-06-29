import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const todayWorkStateSource = readWeb(
  "app/(protected)/employee/_lib/today-work-state.ts",
);
const employeeTasksClientSource = readWeb(
  "app/(protected)/employee/tasks/tasks-client.tsx",
);
const employeeMessagesSource = readWeb("lib/messages/employee.ts");

test("today work state preserves inventory count and groups start/end phases", () => {
  assert.match(
    todayWorkStateSource,
    /TodayChecklistTaskKind[\s\S]*"inventory_count"/,
    "TodayChecklistTaskKind must include inventory_count",
  );
  assert.match(
    todayWorkStateSource,
    /function normalizeTaskKind[\s\S]*value === "inventory_count"/,
    "normalizeTaskKind must preserve inventory_count",
  );
  assert.match(
    todayWorkStateSource,
    /export function groupChecklistByPhase/,
    "today work state should expose the phase grouping helper",
  );
  assert.match(
    todayWorkStateSource,
    /start_of_shift: items\.filter[\s\S]*end_of_shift: items\.filter/,
    "groupChecklistByPhase must return start and end buckets",
  );
  assert.doesNotMatch(
    todayWorkStateSource,
    /phase: "start_of_shift" \| "during_shift" \| "end_of_shift"/,
    "Employee checklist items should no longer expose a during_shift runtime phase",
  );
});

test("inventory count task status comes from today's submitted or approved slips", () => {
  assert.match(
    todayWorkStateSource,
    /\.from\("inventory_count_assignments"\)[\s\S]*\.select\("location_id"\)[\s\S]*\.eq\("employee_id", employeeId\)[\s\S]*\.eq\("is_active", true\)/,
    "today work state should load the employee's active count locations",
  );
  assert.match(
    todayWorkStateSource,
    /\.from\("inventory_count_slips"\)[\s\S]*\.select\("location_id, status"\)[\s\S]*\.eq\("count_date", today\)[\s\S]*\.in\("location_id", countLocationIds\)/,
    "today work state should load today's count slips for assigned locations",
  );
  assert.match(
    todayWorkStateSource,
    /row\.status === "submitted" \|\| row\.status === "approved"/,
    "submitted and approved count slips should satisfy the count task",
  );
  assert.match(
    todayWorkStateSource,
    /item\.taskKind === "inventory_count"[\s\S]*done: countTaskDone/,
    "inventory_count checklist rows should display the derived count status",
  );
  assert.match(
    todayWorkStateSource,
    /id: -1[\s\S]*taskKind: "inventory_count"[\s\S]*phase: "end_of_shift"[\s\S]*isRequired: true/,
    "the fallback count task should land at end of shift and block checkout until submitted",
  );
});

test("employee task UI renders inventory count as a count link, not a checkbox", () => {
  assert.match(
    employeeTasksClientSource,
    /const CHECKLIST_PHASES = \["start_of_shift", "end_of_shift"\] as const/,
    "Employee task client should render the two runtime phases only",
  );

  const phaseLabels =
    employeeMessagesSource.match(/phaseLabels: \{[\s\S]*?\n\s{4}\},/)?.[0] ??
    "";
  assert.doesNotMatch(
    phaseLabels,
    /during_shift/,
    "Employee task phase labels should not expose during_shift",
  );

  assert.match(
    employeeTasksClientSource,
    /item\.taskKind === "inventory_count"/,
    "Employee task client should branch on inventory_count",
  );
  assert.match(
    employeeTasksClientSource,
    /<Link href="\/employee\/count">[\s\S]*homeCopy\.countCta/,
    "Inventory count task should link to the blind count route",
  );

  assert.match(
    employeeTasksClientSource,
    /\{isCountTask \? \(\s*<Button[\s\S]*?<Link href="\/employee\/count">[\s\S]*?\) : \(\s*<Checkbox/,
    "Count task should render the link CTA in the true branch and leave Checkbox in the normal-task branch",
  );
});
