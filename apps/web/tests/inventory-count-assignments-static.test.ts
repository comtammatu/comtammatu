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
  "../../supabase/migration-archive/20260708064356_inventory_count_assignment_shift_scope.sql",
);
const countAssignmentKitchenMigrationSource = readWeb(
  "../../supabase/migration-archive/20260708191713_count_slips_branch_kitchen.sql",
);
const countAssignmentWarehouseRepairMigrationSource = readWeb(
  "../../supabase/migration-archive/20260711125604_repair_count_assignment_warehouse_rpcs.sql",
);

test("count assignment checklist uses one labeled hit target", () => {
  assert.match(
    countAssignmentsClientSource,
    /<Item[\s\S]*asChild[\s\S]*<Label[\s\S]*htmlFor=\{checkboxId\}[\s\S]*<Checkbox[\s\S]*id=\{checkboxId\}[\s\S]*onCheckedChange=\{\(\)\s*=>\s*toggleIngredient\(\s*ingredient\.id,?\s*\)\s*\}/,
    "Ingredient checkbox should keep one DS item and labeled hit target",
  );
  assert.doesNotMatch(
    countAssignmentsClientSource,
    /<div[\s\S]*onClick=\{\(\) => toggleIngredient\(ingredient\.id\)\}/,
    "The checklist must not keep a second row click handler that double-toggles the checkbox",
  );
});

test("count assignment UI reseeds from server props and refreshes after save", () => {
  assert.match(
    countAssignmentsClientSource,
    /function seedSelections[\s\S]*assignmentsByEmployee\[String\(employee\.id\)\][\s\S]*\?\? \[\]/,
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
  assert.match(
    countAssignmentsPageSource,
    /rosterClient\s*\.from\("profiles"\)/,
  );
  assert.match(
    countAssignmentsPageSource,
    /rosterClient\s*\.from\("employees"\)/,
  );
  assert.match(countAssignmentsPageSource, /\.from\("profiles"\)/);
  assert.match(
    countAssignmentsPageSource,
    /\.eq\("branch_id", selectedBranchId\)/,
  );
  assert.match(
    countAssignmentsPageSource,
    /\.in\("profile_id", lookupProfileIds\)/,
  );
  assert.doesNotMatch(
    countAssignmentsPageSource,
    /profilesRes = await supabase/,
  );
  assert.doesNotMatch(
    countAssignmentsPageSource,
    /employeesRes = await supabase/,
  );
  assert.doesNotMatch(countAssignmentsPageSource, /profiles!inner/);
  assert.doesNotMatch(
    countAssignmentsPageSource,
    /\.eq\("profiles\.branch_id"/,
  );
});

test("count assignment scope defaults to the current shift unless all-shifts is explicit", () => {
  assert.match(
    countAssignmentsPageSource,
    /shiftId\?: string \| string\[\]/,
    "count assignments page should accept a shiftId URL scope",
  );
  assert.match(
    countAssignmentsPageSource,
    /import \{ resolveDefaultShiftId \} from "@lib\/staff-runtime\/_lib\/default-shift"/,
    "count assignments should reuse the shared current-shift resolver",
  );
  assert.match(
    countAssignmentsPageSource,
    /\.from\("shifts"\)[\s\S]*\.or\(`branch_id\.is\.null,branch_id\.eq\.\$\{selectedBranchId\}`\)[\s\S]*\.eq\("is_active", true\)/,
    "count assignments should load active global-or-branch shifts",
  );
  assert.match(
    countAssignmentsPageSource,
    /const requestedAllShifts = rawShiftId === ALL_SHIFTS_PARAM/,
    "the URL should have an explicit all-shifts sentinel",
  );
  assert.match(
    countAssignmentsPageSource,
    /const defaultShiftId = resolveDefaultShiftId\([\s\S]*start_time: shift\.startTime[\s\S]*end_time: shift\.endTime[\s\S]*\)/,
    "missing shiftId should resolve to the current or nearest shift",
  );
  assert.match(
    countAssignmentsPageSource,
    /const selectedShiftId = requestedAllShifts[\s\S]*\? null[\s\S]*: requestedShiftId != null[\s\S]*: defaultShiftId/,
    "all-shifts should only be selected when shiftId=all is present",
  );
  assert.match(
    countAssignmentsPageSource,
    /selectedShiftId === null[\s\S]*assignmentsQuery\.is\("shift_id", null\)[\s\S]*assignmentsQuery\.eq\("shift_id", selectedShiftId\)/,
    "count assignment prefill should use the selected shift scope, with null reserved for explicit all-shifts",
  );
  assert.match(
    countAssignmentsClientSource,
    /<Label htmlFor="count-assignment-shift">Ca đếm tồn<\/Label>/,
    "shift scope picker should be labeled as count assignment scope, not shift setup",
  );
  assert.match(
    countAssignmentsClientSource,
    /<SelectItem value=\{ALL_SHIFTS_VALUE\}>[\s\S]*Áp dụng mọi ca[\s\S]*<\/SelectItem>/,
    "shift scope picker should still allow an intentional every-shift assignment",
  );
  assert.doesNotMatch(
    countAssignmentsClientSource,
    /\/hr\?tab=setup|Thiết lập ca|canManageShiftSetup/,
    "count assignments should not send operators to HR shift setup",
  );
  assert.match(
    countAssignmentsClientSource,
    /value === ALL_SHIFTS_VALUE[\s\S]*\? ALL_SHIFTS_VALUE[\s\S]*: parsedShiftId/,
    "choosing every shift should keep shiftId=all in the URL instead of clearing the default scope",
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

test("count assignment location picker is warehouse-only (D078)", () => {
  assert.match(
    countAssignmentsPageSource,
    /\.in\("location_kind", \["warehouse"\]\)/,
    "count assignments should load the branch warehouse only",
  );
  assert.doesNotMatch(
    countAssignmentsPageSource,
    /\.in\("location_kind", \["warehouse", "kitchen"\]\)/,
    "count assignments must not offer retired branch kitchen locations",
  );
  assert.match(
    countAssignmentsPageSource,
    /label: countLocationLabel\(/,
    "server page should format operator-facing warehouse labels",
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
  assert.match(
    countAssignmentsPageSource,
    /locations\.find\(\(l\) => l\.kind === "warehouse"\)\?\.id/,
    "count assignments should default branch counting to Kho when no locationId is provided",
  );
});

test("Branch stays touch-native while Office uses a management table and dialog", () => {
  const branchClientSource = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  );

  assert.match(
    branchClientSource,
    /<ItemGroup className="grid gap-2 md:grid-cols-2">/,
    "Branch count assignment rows should keep a touch grid instead of a desktop table",
  );
  assert.match(
    branchClientSource,
    /className="min-h-20 touch-manipulation"/,
    "Branch count assignment rows should keep touch-height targets",
  );
  const touchButtons = branchClientSource.match(/size="touch"/g) ?? [];
  assert.ok(
    touchButtons.length >= 3,
    "Branch count assignment actions and drawer footer should use touch-size buttons",
  );
  assert.match(countAssignmentsClientSource, /<DataTable/);
  assert.match(countAssignmentsClientSource, /<AppDialog/);
  assert.doesNotMatch(
    countAssignmentsClientSource,
    /useSwipeReveal|useLongPress|<Drawer/,
    "Office count assignment must not carry hidden touch gestures or a mobile drawer",
  );
});

test("count assignment RPCs normalize branch count slips to kitchen", () => {
  assert.match(
    countAssignmentKitchenMigrationSource,
    /CREATE OR REPLACE FUNCTION public\.set_inventory_count_assignments/,
    "manager assignment writer should be redefined in the kitchen-location migration",
  );
  assert.match(
    countAssignmentKitchenMigrationSource,
    /CREATE OR REPLACE FUNCTION public\.submit_inventory_count_slip/,
    "employee count-slip submitter should be redefined in the kitchen-location migration",
  );
  assert.match(
    countAssignmentKitchenMigrationSource,
    /v_branch_kind = 'branch' AND v_location_kind <> 'kitchen'[\s\S]*l\.location_kind = 'kitchen'/,
    "branch count writers should remap non-kitchen location inputs to Bếp CN",
  );
  assert.match(
    countAssignmentKitchenMigrationSource,
    /INSERT INTO public\.inventory_count_assignments[\s\S]*bk\.kitchen_location_id[\s\S]*UPDATE public\.inventory_count_assignments a[\s\S]*old_loc\.location_kind = 'warehouse'/,
    "active branch count assignments should be moved off Kho CN and old warehouse rows deactivated",
  );
  assert.match(
    countAssignmentKitchenMigrationSource,
    /UPDATE public\.inventory_count_slips s[\s\S]*s\.status IN \('submitted', 'needs_changes'\)[\s\S]*SET system_quantity = COALESCE/,
    "open branch count slips should move to Bếp CN and resnapshot system quantity there",
  );
});

test("count assignment RPC repair targets both writers and fails closed", () => {
  for (const signature of [
    "public.set_inventory_count_assignments(bigint,bigint,bigint,bigint[],bigint)",
    "public.submit_inventory_count_slip(bigint,bigint,jsonb,bigint)",
  ]) {
    assert.ok(
      countAssignmentWarehouseRepairMigrationSource.includes(signature),
      `warehouse repair must target ${signature}`,
    );
  }

  assert.match(
    countAssignmentWarehouseRepairMigrationSource,
    /unexpected_count_rpc_definition/,
    "warehouse repair must stop when a source RPC has drifted",
  );
  assert.match(
    countAssignmentWarehouseRepairMigrationSource,
    /location_kind <> ''warehouse''/,
    "branch count writers should normalize to Kho CN",
  );
  assert.match(
    countAssignmentWarehouseRepairMigrationSource,
    /location_kind = ''warehouse''/,
    "branch count writers should select the branch warehouse",
  );
  assert.match(
    countAssignmentWarehouseRepairMigrationSource,
    /branch_warehouse_location_missing/,
    "warehouse-missing errors should describe the active model",
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
    /\.in\("location_kind", \["warehouse"\]\)[\s\S]*\.in\("item_kind", \["raw_material", "finished_good"\]\)/,
    "Assignments should target the branch warehouse and list active countable goods",
  );
});
