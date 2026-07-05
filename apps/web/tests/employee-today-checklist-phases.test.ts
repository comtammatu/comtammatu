import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const todayWorkStateSource = readWeb("lib/employee/_lib/today-work-state.ts");
const employeeTasksClientSource = readWeb(
  "lib/employee/tasks/tasks-client.tsx",
);
const employeeTasksPageSource = readWeb("lib/employee/tasks/page.tsx");
const employeeCountPageSource = readWeb("lib/employee/count/page.tsx");
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
    /countHref = "\/br"/,
    "Inventory count task should default to Branch Hub when no route override is supplied",
  );
  assert.match(
    employeeTasksClientSource,
    /<Link href=\{countHref\}>[\s\S]*homeCopy\.countCta/,
    "Inventory count task should link through countHref",
  );

  assert.match(
    employeeTasksClientSource,
    /\{isCountTask \? \(\s*<ItemMedia[\s\S]*?<IconCount \/>[\s\S]*?\) : \(\s*<div className="flex shrink-0 pt-0\.5">[\s\S]*<Checkbox/,
    "Count task should render count media while normal tasks keep a left-side checkbox",
  );
  assert.match(
    employeeTasksClientSource,
    /\{isCountTask \? \(\s*<Button[\s\S]*?<Link href=\{countHref\}>[\s\S]*?\) : null\}/,
    "Count task should render the count link CTA without replacing normal-task checkboxes",
  );
  assert.match(
    employeeTasksPageSource,
    /EmployeeCountPanelContent/,
    "Employee tasks should reuse the blind count panel in the same screen",
  );
  assert.match(
    employeeTasksPageSource,
    /id=\{countPanelId\}/,
    "Employee tasks should expose an anchor for the inline count panel",
  );
  assert.match(
    employeeTasksPageSource,
    /countHref=\{hasCountTask \? `#\$\{countPanelId\}` : countHref\}/,
    "The count CTA should jump to the inline panel when the count task is present",
  );
  assert.match(
    employeeCountPageSource,
    /ingredient_units!ingredient_units_ingredient_tenant_fkey/,
    "Employee count assignment query must disambiguate the ingredient_units relationship",
  );
  assert.match(
    employeeCountPageSource,
    /units!ingredient_units_unit_tenant_fkey/,
    "Employee count assignment query must disambiguate the units relationship",
  );
  assert.match(
    employeeCountPageSource,
    /const countReadClient = createServiceClient\(\);[\s\S]*countReadClient\s*\.from\("inventory_count_assignments"\)[\s\S]*\.eq\("employee_id", employeeId\)/,
    "Employee count assignment details should be read through the scoped service client so catalog RLS does not hide names",
  );
});

test("employee task checklist stays single-column and wraps long task copy", () => {
  assert.match(
    employeeTasksClientSource,
    /<ItemGroup className="gap-2">/,
    "Checklist should stay a simple one-column task list",
  );
  assert.doesNotMatch(
    employeeTasksClientSource,
    /grid-cols-\d|sm:grid-cols-\d|md:grid-cols-\d|lg:grid-cols-\d/,
    "Checklist rows must not force task copy into fixed columns",
  );
  assert.match(
    employeeTasksClientSource,
    /<ItemContent className="min-w-0 gap-2">/,
    "Task copy should render inside the flexible content column",
  );
  assert.match(
    employeeTasksClientSource,
    /className="block min-w-0 max-w-full cursor-pointer whitespace-normal break-words font-normal text-sm leading-5"/,
    "Standard task labels must wrap instead of overflowing the card",
  );
  assert.match(
    employeeTasksClientSource,
    /<ItemDescription className="line-clamp-none max-w-full whitespace-normal break-words text-xs leading-5">/,
    "Long done definitions must wrap without clamping",
  );
  assert.match(
    employeeTasksClientSource,
    /className="flex w-full flex-wrap items-center gap-1\.5"[\s\S]*data-shift-task-meta/,
    "Task badges should wrap under the task copy",
  );
});
