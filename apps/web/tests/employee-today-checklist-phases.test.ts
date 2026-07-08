import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const todayWorkStateSource = readWeb("lib/staff-runtime/_lib/today-work-state.ts");
const employeeTasksClientSource = readWeb(
  "lib/staff-runtime/tasks/tasks-client.tsx",
);
const employeeTasksPageSource = readWeb("lib/staff-runtime/tasks/page.tsx");
const employeeCountPageSource = readWeb("lib/staff-runtime/count/page.tsx");
const employeeCountActionsSource = readWeb("lib/staff-runtime/count/actions.ts");
const employeeCountClientSource = readWeb("lib/staff-runtime/count/count-client.tsx");
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
    /\.from\("inventory_count_assignments"\)[\s\S]*\.select\("location_id, ingredient_id, shift_id"\)[\s\S]*\.eq\("employee_id", employeeId\)[\s\S]*\.eq\("is_active", true\)/,
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

test("employee inventory count is scoped to the current shift", () => {
  assert.match(
    todayWorkStateSource,
    /countAssignmentsQuery[\s\S]*shift_id\.is\.null,shift_id\.eq\.\$\{currentShiftId\}/,
    "today work state should include every-shift assignments and current-shift assignments",
  );
  assert.match(
    todayWorkStateSource,
    /shiftSpecificCells[\s\S]*assignmentCellKey[\s\S]*row\.shift_id !== null \|\| !shiftSpecificCells\.has\(assignmentCellKey\(row\)\)/,
    "today work state should let a current-shift assignment override the every-shift assignment for the same cell",
  );
  assert.match(
    todayWorkStateSource,
    /countSlipsQuery[\s\S]*countSlipsQuery\.eq\("shift_id", currentShiftId\)/,
    "today work state should mark the count task done only from the current-shift slip",
  );
  assert.match(
    employeeCountPageSource,
    /resolveCurrentCountShiftId[\s\S]*resolveDefaultShiftId/,
    "employee count page should derive the current count shift from active shift windows",
  );
  assert.match(
    employeeCountPageSource,
    /assignmentQuery[\s\S]*shift_id\.is\.null,shift_id\.eq\.\$\{currentShiftId\}/,
    "employee count page should load every-shift and current-shift assignments",
  );
  assert.match(
    employeeCountPageSource,
    /shiftSpecificCells[\s\S]*assignmentCellKey[\s\S]*row\.shift_id !== null \|\| !shiftSpecificCells\.has\(assignmentCellKey\(row\)\)/,
    "employee count page should hide every-shift rows for cells overridden by a current-shift assignment",
  );
  assert.match(
    employeeCountPageSource,
    /<CountSlipClient[\s\S]*shiftId=\{currentShiftId\}/,
    "employee count page should pass the current shift to the count client",
  );
  assert.match(
    employeeCountClientSource,
    /shiftId,[\s\S]*submitCountSlip\(\{[\s\S]*shiftId,/,
    "employee count client should submit the current shift id",
  );
  assert.match(
    employeeCountActionsSource,
    /\.\.\.\(data\.shiftId == null \? \{\} : \{ p_shift_id: data\.shiftId \}\)/,
    "employee count action should pass concrete shift id and omit the default every-shift scope",
  );
});

test("employee inventory count keeps in-progress input across same-data refreshes", () => {
  assert.match(
    employeeCountClientSource,
    /const draftSeedKeyRef = useRef<string \| null>\(null\)/,
    "employee count draft should remember the last server seed",
  );
  assert.match(
    employeeCountClientSource,
    /JSON\.stringify\(\[activeGroup\.locationId, seedRows\]\)/,
    "employee count draft seed should be based on location, assignments, and prefill values",
  );
  assert.match(
    employeeCountClientSource,
    /if \(draftSeedKeyRef\.current === nextSeedKey\) return;[\s\S]*setDraft\(next\);/,
    "same-data RSC refreshes must not wipe local count input before submit",
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
    /\{isCountTask && !item\.done \? \(\s*<Button[\s\S]*?<Link href=\{countHref\}>[\s\S]*?\) : null\}/,
    "Count task should render the count link CTA only while it still needs action",
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
    employeeTasksPageSource,
    /hideCountTask=\{hasCountTask\}/,
    "Inline count panel should replace the duplicate count task card",
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
    /!item\.done && item\.doneDefinition/,
    "Checked items should show only the title, not the done definition",
  );
  assert.match(
    employeeTasksClientSource,
    /className="flex w-full flex-wrap items-center gap-1\.5"[\s\S]*data-shift-task-meta/,
    "Task badges should wrap under the task copy",
  );
  assert.match(
    employeeTasksClientSource,
    /!item\.done \? \([\s\S]*data-shift-task-meta/,
    "Checked items should hide the metadata badges",
  );
});

test("employee inventory count uses a compact grid and per-ingredient sheet", () => {
  assert.match(
    employeeCountClientSource,
    /@comtammatu\/ui\/components\/sheet/,
    "Count entry should use the Sheet drawer primitive",
  );
  assert.match(
    employeeCountClientSource,
    /<ItemGroup className="grid grid-cols-2 gap-2">/,
    "Count assignments should render as a compact two-column grid",
  );
  assert.match(
    employeeCountClientSource,
    /setSelectedIngredientId\(assignment\.ingredientId\)/,
    "Tapping an ingredient should open its entry sheet",
  );
  assert.match(
    employeeCountClientSource,
    /<Sheet[\s\S]*open=\{assignment !== null\}/,
    "Ingredient entry should be isolated in a drawer",
  );
  assert.match(
    employeeCountClientSource,
    /<SheetContent side="right" className="w-full overflow-hidden sm:max-w-md">/,
    "The drawer should constrain overflow on mobile and desktop",
  );
});
