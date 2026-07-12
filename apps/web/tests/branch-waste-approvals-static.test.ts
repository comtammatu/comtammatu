import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Branch waste approvals preserve touch review and Office isolation", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/branch-waste-approvals-client.tsx",
  );
  const data = read("apps/web/lib/inventory/waste-approvals-data.ts");
  const model = read("apps/web/lib/inventory/waste-approval-model.ts");
  const officePage = read(
    "apps/web/app/(protected)/inventory/waste/approvals/page.tsx",
  );
  const officeClient = read(
    "apps/web/app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  );

  assert.match(route, /loadBranchWasteApprovalsData\(branchId\)/);
  assert.match(route, /<BranchWasteApprovalsClient/);
  assert.doesNotMatch(route, /WasteApprovalsPageContent|embedded/);

  assert.match(data, /import "server-only"/);
  assert.match(data, /resolveInventoryListScope/);
  assert.match(data, /STAFF_ROLES/);
  assert.match(data, /currentUserHasPermission/);
  assert.match(data, /PERMISSION_KEYS\.INVENTORY_WASTE_APPROVE/);
  assert.match(data, /approval_status", "pending"/);
  assert.match(model, /export type PendingWasteRow/);

  assert.match(client, /BranchOperatorPage/);
  assert.match(client, /BranchOperatorPanel/);
  assert.match(client, /<SheetContent[\s\S]*side="bottom"/);
  assert.match(client, /overscroll-contain/);
  assert.match(client, /beforeunload/);
  assert.match(client, /await confirm/);
  assert.match(client, /approveWaste/);
  assert.match(client, /isSelfCreated/);
  assert.doesNotMatch(
    client,
    /\bWasteApprovalsClient\b|DocumentFormFrame|DataTable|embedded/,
  );

  assert.match(officePage, /loadWasteApprovalsData/);
  assert.match(officeClient, /<AppPage/);
  assert.doesNotMatch(officePage, /routeBranchId|embedded/);
  assert.doesNotMatch(officeClient, /embedded/);
});
