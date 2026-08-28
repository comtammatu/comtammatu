import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");

function read(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

test("count slip review queues exclude the reviewer's own employee slip", () => {
  const reviewer = read("apps/web/lib/inventory/count-slip-reviewer.ts");
  const branchLoader = read("apps/web/lib/inventory/branch-count-slip-data.ts");
  const managementPage = read(
    "apps/web/app/(protected)/inventory/count-slips/page.tsx",
  );

  assert.match(reviewer, /import "server-only"/);
  assert.match(reviewer, /createServiceClient/);
  assert.match(reviewer, /\.eq\("tenant_id", tenantId\)/);
  assert.match(reviewer, /\.eq\("profile_id", userId\)/);

  for (const source of [branchLoader, managementPage]) {
    assert.match(source, /resolveCountSlipReviewerEmployeeId/);
    assert.match(source, /const \{ supabase, claims, userId \} = ctx/);
    assert.match(
      source,
      /slipsQuery = slipsQuery\.neq\("employee_id", reviewerEmployeeId\)/,
    );
  }
});

test("count slip action rejects self-review before calling the database RPC", () => {
  const action = read(
    "apps/web/app/(protected)/inventory/count-slips/actions.ts",
  );
  const migration = read(
    "supabase/migrations/20260826163516_inventory_role_count_and_snapshot_decouple.sql",
  );

  assert.match(action, /resolveCountSlipReviewerEmployeeId/);
  assert.match(action, /employee_id/);
  assert.match(action, /slip\.employee_id === reviewerEmployeeId/);
  assert.ok(
    action.indexOf("slip.employee_id === reviewerEmployeeId") <
      action.indexOf('supabase.rpc("approve_inventory_count_slip"'),
    "self-review preflight must run before the approval RPC",
  );
  const selfReviewChecks = [
    ...action.matchAll(/slip\.employee_id === reviewerEmployeeId/g),
  ];
  assert.equal(selfReviewChecks.length, 2);
  assert.ok(
    (selfReviewChecks[1]?.index ?? Number.POSITIVE_INFINITY) <
      action.indexOf('supabase.rpc("request_inventory_count_line_recount"'),
    "self-review preflight must run before the recount RPC",
  );

  assert.match(migration, /cannot_review_own_slip/);
  assert.match(
    migration,
    /e\.id = v_slip\.employee_id AND e\.profile_id = v_uid/,
  );
});

test("branch approval badges and close-day counts exclude self-review slips", () => {
  const dashboard = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/data.ts",
  );
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const closeDayData = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/data.ts",
  );
  const closeDayPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/page.tsx",
  );
  const staffRuntime = read("apps/web/lib/staff-runtime/page.tsx");

  for (const source of [dashboard, closeDayData, staffRuntime]) {
    assert.match(source, /resolveCountSlipReviewerEmployeeId/);
    assert.match(
      source,
      /\.neq\(\s*"employee_id",\s*reviewerEmployeeId,?\s*\)/,
    );
  }
  assert.match(layout, /fetchBranchQueueCounts\([\s\S]*userId/);
  assert.match(closeDayPage, /fetchCloseDayData\([\s\S]*userId/);
});
