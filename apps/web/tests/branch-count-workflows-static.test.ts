import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Branch count assignment owns a keyboard and touch native presenter", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  );
  const data = read("apps/web/lib/inventory/branch-count-assignment-data.ts");
  const ownerClient = read(
    "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  );

  assert.match(route, /loadBranchCountAssignmentData/);
  assert.match(route, /BranchCountAssignmentsClient/);
  assert.doesNotMatch(route, /CountAssignmentsPageContent|embedded/);
  assert.match(data, /import "server-only"/);
  assert.match(data, /PERMISSION_KEYS\.INVENTORY_COUNT_ASSIGN/);
  assert.match(data, /scope\.selectedBranchId !== routeBranchId/);
  assert.match(
    client,
    /render=\{\s*<button\s+type="button"\s+onClick=\{\(\) => openEmployee/,
  );
  assert.match(client, /<AppSheet[\s\S]*side="bottom"/);
  assert.match(client, /size="touch"/);
  assert.match(client, /lg:grid-cols-2/);
  assert.doesNotMatch(
    client,
    /DataTable|Drawer|buildBranchCountHref|openCountScreen/,
  );
  assert.doesNotMatch(ownerClient, /buildBranchCountHref|openCountScreen/);
});

test("Branch count slip review owns a touch queue and Branch revalidation", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  );
  const data = read("apps/web/lib/inventory/branch-count-slip-data.ts");
  const actions = read(
    "apps/web/app/(protected)/inventory/count-slips/actions.ts",
  );

  assert.match(route, /loadBranchCountSlipData/);
  assert.match(route, /BranchCountSlipsClient/);
  assert.match(route, /searchParams/);
  assert.match(route, /loadBranchCountSlipData\(branchId, employeeId\)/);
  assert.match(route, /focusFirstPending=\{employeeId !== undefined\}/);
  assert.doesNotMatch(route, /CountSlipsPageContent|embedded/);
  assert.match(data, /import "server-only"/);
  assert.match(data, /PERMISSION_KEYS\.INVENTORY_COUNT_APPROVE/);
  assert.match(data, /\.eq\("branch_id", routeBranchId\)/);
  assert.match(
    data,
    /slipsQuery = slipsQuery\.eq\("employee_id", focusEmployeeId\)/,
  );
  assert.match(client, /<button type="button" onClick=\{\(\) => setSelectedId/);
  assert.match(client, /focusFirstPending[\s\S]*row\.status === "submitted"/);
  assert.match(client, /<AppSheet[\s\S]*side="bottom"/);
  assert.match(client, /approveCountSlip/);
  assert.match(client, /requestCountRecount/);
  assert.match(client, /lg:grid-cols-2/);
  assert.doesNotMatch(
    client,
    /DataTable|DocumentFormFrame|BranchOperatorPanel|embedded/,
  );
  assert.doesNotMatch(client, /stock\/count-assignments/);
  assert.match(
    actions,
    /revalidatePath\(`\/br\/\$\{slip\.branch_id\}\/stock\/count-slips`\)/,
  );
});

test("Owner surface count management keeps desktop-responsive presenters", () => {
  const assignments = read(
    "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  );
  const slips = read(
    "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx",
  );

  for (const officeClient of [assignments, slips]) {
    assert.match(officeClient, /<DataTable/);
    assert.match(officeClient, /<AppDialog/);
    assert.doesNotMatch(
      officeClient,
      /useSwipeReveal|useLongPress|<Drawer|<SheetContent/,
    );
  }
  assert.match(assignments, /width="xwide"/);
  assert.match(slips, /width="xwide"/);
});
