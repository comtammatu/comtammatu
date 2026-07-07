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

test.skip("count assignment UI reseeds from server props and refreshes after save", () => {
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
    /\.eq\("location_kind", "warehouse"\)[\s\S]*\.eq\("item_kind", "finished_good"\)/,
    "Assignments should auto-target the branch warehouse and list active finished goods",
  );
});
