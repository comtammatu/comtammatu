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
const countAssignmentBaselineSource = readWeb(
  "../../supabase/migrations/00000000000000_baseline.sql",
);
const countAssignmentWarehouseRepairMigrationSource = readWeb(
  "../../supabase/migration-archive/20260711125604_repair_count_assignment_warehouse_rpcs.sql",
);

test("count assignment checklist uses one labeled hit target", () => {
  assert.match(
    countAssignmentsClientSource,
    /<Label[\s\S]*htmlFor=\{checkboxId\}[\s\S]*<Checkbox[\s\S]*id=\{checkboxId\}[\s\S]*onCheckedChange=\{\(\) => toggleIngredient\(ingredient\.id\)\}/,
    "Ingredient checkbox and row label should share one accessible hit target",
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

test("Branch stays touch-native while Admin Dashboard uses a management table and dialog", () => {
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
    "Admin Dashboard count assignment must not carry hidden touch gestures or a mobile drawer",
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
  assert.match(
    countAssignmentBaselineSource,
    /CREATE FUNCTION public\.set_inventory_count_assignments[\s\S]*v_branch_kind = 'branch' AND v_location_kind <> 'warehouse'[\s\S]*branch_warehouse_location_missing/,
  );
  assert.match(
    countAssignmentBaselineSource,
    /CREATE FUNCTION public\.submit_inventory_count_slip[\s\S]*v_branch_kind = 'branch' AND v_location_kind <> 'warehouse'[\s\S]*branch_warehouse_location_missing/,
  );
});

test("count assignment baseline stores assignment and slip shift scope", () => {
  assert.match(
    countAssignmentBaselineSource,
    /CREATE TABLE public\.inventory_count_assignments \([\s\S]*shift_id bigint[\s\S]*\);/,
    "assignment table should carry nullable shift_id",
  );
  assert.match(
    countAssignmentBaselineSource,
    /CREATE TABLE public\.inventory_count_slips \([\s\S]*shift_id bigint[\s\S]*\);/,
    "count slips should record the actual submitted shift",
  );
  assert.match(
    countAssignmentBaselineSource,
    /CREATE UNIQUE INDEX uq_count_assignment_scope[\s\S]*COALESCE\(shift_id, \(0\)::bigint\)/,
    "assignment identity should include null-safe shift scope",
  );
  assert.match(
    countAssignmentBaselineSource,
    /a\.shift_id IS NOT DISTINCT FROM v_shift_id/,
    "assignment writer should only replace rows inside the selected scope",
  );
  assert.match(
    countAssignmentBaselineSource,
    /p_shift_id bigint DEFAULT NULL::bigint[\s\S]*NOT EXISTS \([\s\S]*specific\.shift_id = v_shift_id[\s\S]*specific\.is_active/,
    "count submit RPC should let current-shift assignments override every-shift assignments for the same cell",
  );
});
