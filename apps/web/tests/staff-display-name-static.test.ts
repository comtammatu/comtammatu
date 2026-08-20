import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("staff display names come from profiles.full_name and never fall back to UUID", () => {
  const helper = read("apps/web/app/_lib/profile-display-names.ts");
  const layout = read("apps/web/app/(protected)/layout.tsx");
  const stocktakeDetail = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
  );
  const stocktakeActions = read(
    "apps/web/app/(protected)/inventory/actions.ts",
  );
  const branchDetail = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/branch-stocktake-detail-client.tsx",
  );
  const branchData = read("apps/web/lib/inventory/branch-stocktake-data.ts");
  const wasteData = read("apps/web/lib/inventory/waste-approvals-data.ts");
  const workActions = read("apps/web/app/(protected)/work/actions.ts");
  const audit = read("apps/web/app/_lib/audit.ts");
  const staffAudit = read("apps/web/app/(protected)/hr/staff/audit/page.tsx");

  assert.match(helper, /from\("profiles"\)/);
  assert.match(helper, /select\("id, full_name"\)/);
  assert.match(helper, /STAFF_VI\.long/);
  assert.match(helper, /UUID_RE\.test/);
  assert.match(helper, /export function staffDisplayLabel/);
  assert.match(helper, /export async function resolveProfileDisplayNames/);

  assert.match(layout, /resolveProfileDisplayNames/);
  assert.match(layout, /staffDisplayLabel/);
  assert.doesNotMatch(layout, /user_metadata\?\.\["display_name"\]/);

  assert.match(stocktakeActions, /created_by_name/);
  assert.match(stocktakeActions, /resolveProfileDisplayNames/);
  assert.match(stocktakeDetail, /description: session\.created_by_name/);
  assert.doesNotMatch(stocktakeDetail, /description: session\.created_by,/);

  assert.match(branchData, /createdByName/);
  assert.match(branchData, /resolveProfileDisplayNames/);
  assert.match(branchDetail, /value: session\.createdByName/);
  assert.doesNotMatch(branchDetail, /value: session\.createdBy,/);

  assert.match(wasteData, /resolveProfileDisplayNames/);
  assert.match(wasteData, /createdByName: creatorMap\.get\(creatorId\) \?\? STAFF_VI\.long/);
  assert.doesNotMatch(wasteData, /\?\? creatorId/);
  assert.doesNotMatch(wasteData, /full_name \?\? profile\.id/);

  assert.match(workActions, /staffDisplayLabel\(profile\?\.full_name\)/);
  assert.doesNotMatch(workActions, /full_name \?\? row\.user_id/);

  assert.match(audit, /resolveProfileDisplayNames/);
  assert.match(staffAudit, /resolveProfileDisplayNames/);
});
