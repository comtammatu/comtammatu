import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const countAssignmentsClientSource = readWeb(
  "app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
);
const countAssignmentsPageSource = readWeb(
  "app/(protected)/inventory/count-assignments/page.tsx",
);
const countAssignmentsActionsSource = readWeb(
  "app/(protected)/inventory/count-assignments/actions.ts",
);
const countAssignmentShiftMigrationSource = readWeb(
  "../../supabase/migrations/20260708064356_inventory_count_assignment_shift_scope.sql",
);

test("count assignment checkbox click does not toggle the row twice", () => {
  assert.match(
    countAssignmentsClientSource,
    /<Checkbox[\s\S]*onClick=\{\(event\) => event\.stopPropagation\(\)\}[\s\S]*onCheckedChange=\{\(\) => toggleIngredient\(ingredient\.id\)\}/,
    "Ingredient checkbox clicks must not bubble to the row onClick and undo the checked state before save",
  );
});

test("count assignment UI reseeds from server props and refreshes after save", () => {
  assert.match(
    countAssignmentsClientSource,
    /function seedSelections[\s\S]*assignmentsByEmployee\[String\(emp\.id\)\] \?\? \[\]/,
    "Count assignment state should be seeded from server assignments for the current scope",
  );
  assert.match(
    countAssignmentsClientSource,
    /useEffect\(\(\) => \{[\s\S]*setSelectionByEmployee\(seedSelections\(employees, assignmentsByEmployee\)\);[\s\S]*\}, \[employees, assignmentsByEmployee\]\)/,
    "Changing branch/location or refreshing server props should reset the local assignment chips",
  );
  assert.match(
    countAssignmentsClientSource,
    /await setCountAssignments\([\s\S]*toast\.success[\s\S]*router\.refresh\(\);/,
    "Saving assignments should refresh the server page so reassigned ingredients disappear from other employees",
  );
});

test("count assignments uses the branch profile roster before employee ids", () => {
  assert.match(countAssignmentsPageSource, /createServiceClient/);
  assert.match(
    countAssignmentsPageSource,
    /const rosterClient = createServiceClient\(\)/,
  );
  assert.match(countAssignmentsPageSource, /rosterClient\s*\.from\("profiles"\)/);
  assert.match(
    countAssignmentsPageSource,
    /rosterClient\s*\.from\("employees"\)/,
  );
  assert.match(countAssignmentsPageSource, /\.from\("profiles"\)/);
  assert.match(countAssignmentsPageSource, /\.eq\("branch_id", selectedBranchId\)/);
  assert.match(countAssignmentsPageSource, /\.in\("profile_id", lookupProfileIds\)/);
  assert.doesNotMatch(countAssignmentsPageSource, /profilesRes = await supabase/);
  assert.doesNotMatch(countAssignmentsPageSource, /employeesRes = await supabase/);
  assert.doesNotMatch(countAssignmentsPageSource, /profiles!inner/);
  assert.doesNotMatch(countAssignmentsPageSource, /\.eq\("profiles\.branch_id"/);
});

test("count assignment scope can target every shift or one active shift", () => {
  assert.match(
    countAssignmentsPageSource,
    /shiftId\?: string \| string\[\]/,
    "count assignments page should accept a shiftId URL scope",
  );
  assert.match(
    countAssignmentsPageSource,
    /\.from\("shifts"\)[\s\S]*\.or\(`branch_id\.is\.null,branch_id\.eq\.\$\{selectedBranchId\}`\)[\s\S]*\.eq\("is_active", true\)/,
    "count assignments should load active global-or-branch shifts",
  );
  assert.match(
    countAssignmentsPageSource,
    /selectedShiftId === null[\s\S]*assignmentsQuery\.is\("shift_id", null\)[\s\S]*assignmentsQuery\.eq\("shift_id", selectedShiftId\)/,
    "count assignment prefill should use the selected shift scope, with null meaning every shift",
  );
  assert.match(
    countAssignmentsClientSource,
    /<SelectItem value=\{ALL_SHIFTS_VALUE\}>Mỗi ca<\/SelectItem>/,
    "shift scope picker should default to every shift",
  );
  assert.match(
    countAssignmentsClientSource,
    /shiftId: selectedShiftId/,
    "saving assignments should send the selected shift scope to the action",
  );
  assert.match(
    countAssignmentsActionsSource,
    /shiftId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.nullable\(\)\.optional\(\)/,
    "server action should validate optional shift scope",
  );
  assert.match(
    countAssignmentsActionsSource,
    /\.\.\.\(data\.shiftId == null \? \{\} : \{ p_shift_id: data\.shiftId \}\)/,
    "server action should pass concrete shift scope to the RPC and omit the default every-shift scope",
  );
});

test("count assignment location picker includes branch warehouse and kitchen", () => {
  assert.match(
    countAssignmentsPageSource,
    /\.in\("location_kind", \["warehouse", "kitchen"\]\)/,
    "count assignments should load both branch warehouse and branch kitchen locations",
  );
  assert.doesNotMatch(
    countAssignmentsPageSource,
    /\.eq\("location_kind", "warehouse"\)/,
    "count assignments must not hardcode the location picker to warehouse only",
  );
  assert.match(
    countAssignmentsPageSource,
    /label: countLocationLabel\(/,
    "server page should format operator-facing labels such as Phước Hải - Kho/Bếp",
  );
  assert.match(
    countAssignmentsClientSource,
    /locationOptions: LocationOption\[\]/,
    "client should receive concrete inventory locations for the dropdown",
  );
  assert.match(
    countAssignmentsClientSource,
    /function changeLocationScope/,
    "changing location should keep scope in the URL",
  );
  assert.match(
    countAssignmentsClientSource,
    /locationOptions\.map\(\(location\) =>/,
    "location Select should render every branch location option",
  );
});

test("count assignment migration stores assignment and slip shift scope", () => {
  assert.match(
    countAssignmentShiftMigrationSource,
    /ALTER TABLE public\.inventory_count_assignments[\s\S]*ADD COLUMN IF NOT EXISTS shift_id bigint/,
    "assignment table should carry nullable shift_id",
  );
  assert.match(
    countAssignmentShiftMigrationSource,
    /ALTER TABLE public\.inventory_count_slips[\s\S]*ADD COLUMN IF NOT EXISTS shift_id bigint/,
    "count slips should record the actual submitted shift",
  );
  assert.match(
    countAssignmentShiftMigrationSource,
    /CREATE UNIQUE INDEX uq_count_assignment_scope[\s\S]*COALESCE\(shift_id, 0::bigint\)/,
    "assignment identity should include null-safe shift scope",
  );
  assert.match(
    countAssignmentShiftMigrationSource,
    /a\.shift_id IS NOT DISTINCT FROM v_shift_id/,
    "assignment writer should only replace rows inside the selected scope",
  );
  assert.match(
    countAssignmentShiftMigrationSource,
    /p_shift_id bigint DEFAULT NULL[\s\S]*NOT EXISTS \([\s\S]*specific\.shift_id = v_shift_id[\s\S]*specific\.is_active/,
    "count submit RPC should let current-shift assignments override every-shift assignments for the same cell",
  );
});

test.skip("count assignment UI uses the branch warehouse checklist layout", () => {
  assert.doesNotMatch(
    countAssignmentsClientSource,
    /MultiSelectCombobox|Chọn chi nhánh|Chọn kho/,
    "Managers should not have to pick branch or warehouse on the count assignment page",
  );
  assert.match(
    countAssignmentsClientSource,
    /const assignedEmployees = useMemo\([\s\S]*\.length > 0/,
    "The page should only show employees who already have count assignments",
  );
  assert.match(
    countAssignmentsClientSource,
    /\{assignedEmployees\.map\(\(emp\) =>/,
    "The assignment card grid should render assigned employees, not the full branch staff list",
  );
  assert.match(
    countAssignmentsClientSource,
    /className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"/,
    "Employee assignment cards should use the responsive three-column grid",
  );
  assert.doesNotMatch(
    countAssignmentsClientSource,
    /title="Người kiểm kê"|headerHint=\{`\$\{selectedIds\.length\} thành phẩm`\}/,
    "Employee cards should not render a separate count card header",
  );
  assert.match(
    countAssignmentsClientSource,
    /<AppSection size="sm">/,
    "Employee cards should use a compact app section without a header",
  );
  assert.doesNotMatch(
    countAssignmentsClientSource,
    /contentClassName="pt-4"/,
    "Employee cards should not reserve extra top padding after removing the card header",
  );
  // Copy moved to the message catalog (i18n sweep) — pin the ref in the
  // component and the value in the catalog.
  assert.match(
    countAssignmentsClientSource,
    /INVENTORY_VI\.countAssignAssignedBadge\(selectedIds\.length\)/,
    "The assigned finished-good count should live in the assigned-ingredients label",
  );
  assert.match(
    readWeb("../../packages/shared/src/messages/inventory.ts"),
    /Nguyên liệu được giao \(/,
  );
  assert.match(
    countAssignmentsClientSource,
    /INVENTORY_VI\.countAssignAddAction[\s\S]*<NewAssignmentDialog[\s\S]*employees=\{unassignedEmployees\}/,
    "Managers should add new assignments from a header action using unassigned employees",
  );
  assert.match(
    countAssignmentsClientSource,
    /<AppDialog[\s\S]*title=\{INVENTORY_VI\.countAssignAddAction\}[\s\S]*<SelectValue placeholder=\{INVENTORY_VI\.selectEmployeePlaceholder\} \/>/,
    "New assignments should open a titled dialog and choose an employee before selecting finished goods",
  );
  assert.match(
    countAssignmentsClientSource,
    /<AssignmentChecklist[\s\S]*INVENTORY_VI\.countAssignRemoveAction[\s\S]*ACTIONS_VI\.save/,
    "Editing an employee assignment should use a dialog checklist with delete/save actions",
  );
  assert.match(
    countAssignmentsClientSource,
    /const selectedCount = draftSet\.size;[\s\S]*INVENTORY_VI\.countAssignChecklistTitle[\s\S]*INVENTORY_VI\.selectedRatio\(selectedCount, ingredients\.length\)/,
    "The checklist should show a compact selected-count summary instead of a dry bare list",
  );
  assert.match(
    countAssignmentsClientSource,
    /checked[\s\S]*border-primary\/30 bg-primary\/5[\s\S]*border-transparent bg-card hover:bg-muted/,
    "Selected checklist rows should have a visible selected state",
  );
  assert.match(
      countAssignmentsPageSource,
      /\.in\("location_kind", \["warehouse", "kitchen"\]\)[\s\S]*\.in\("item_kind", \["raw_material", "finished_good"\]\)/,
      "Assignments should target branch warehouse/kitchen locations and list active countable goods",
    );
  });
