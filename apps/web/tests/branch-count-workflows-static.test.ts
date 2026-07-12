import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Branch Team owns count assignment with a keyboard and touch native presenter", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  );
  const data = read("apps/web/lib/inventory/branch-count-assignment-data.ts");
  const team = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/assignments/assignments-content.tsx",
  );
  const officeClient = read(
    "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  );

  assert.match(route, /new URLSearchParams\(\{ tab: "assignments" \}\)/);
  assert.doesNotMatch(
    route,
    /loadBranchCountAssignmentData|BranchCountAssignmentsClient/,
  );
  assert.match(data, /import "server-only"/);
  assert.match(data, /PERMISSION_KEYS\.INVENTORY_COUNT_ASSIGN/);
  assert.match(data, /scope\.selectedBranchId !== routeBranchId/);
  assert.match(client, /<button type="button" onClick=\{\(\) => openEmployee/);
  assert.match(client, /<SheetContent[\s\S]*side="bottom"/);
  assert.match(client, /size="touch"/);
  assert.match(client, /md:grid-cols-2/);
  assert.doesNotMatch(
    client,
    /DataTable|Drawer|buildBranchCountHref|openCountScreen/,
  );
  assert.match(team, /BranchCountAssignmentsClient/);
  assert.match(team, /loadBranchCountAssignmentData/);
  assert.match(team, /locationParam/);
  assert.match(team, /shiftParam/);
  assert.match(
    client,
    /embeddedInTeam[\s\S]*?`\/br\/\$\{data\.branchId\}\/team`/,
  );
  assert.doesNotMatch(team, /CountAssignmentsPageContent/);
  assert.doesNotMatch(officeClient, /buildBranchCountHref|openCountScreen/);
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
  assert.match(client, /<SheetContent[\s\S]*side="bottom"/);
  assert.match(client, /<SheetDescription className="sr-only">/);
  assert.match(client, /selectedChangedLines/);
  assert.match(client, /showAllLines/);
  assert.match(client, /approveCountSlip/);
  assert.match(client, /requestCountRecount/);
  assert.match(client, /md:grid-cols-2/);
  assert.doesNotMatch(
    client,
    /DataTable|DocumentFormFrame|BranchOperatorPanel|embedded/,
  );
  assert.doesNotMatch(client, /stock\/count-assignments/);
  assert.doesNotMatch(client, /label: INVENTORY_VI\.varianceShort/);
  assert.match(
    actions,
    /revalidatePath\(`\/br\/\$\{slip\.branch_id\}\/stock\/count-slips`\)/,
  );
});

test("Office count management keeps desktop-responsive presenters", () => {
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
