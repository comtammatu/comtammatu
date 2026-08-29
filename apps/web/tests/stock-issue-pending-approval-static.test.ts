import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../../..");

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Generic issue confirmation stops pending writeoffs before the RPC", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/issue-actions.ts",
  );
  const confirmation = actions.slice(actions.indexOf("export async function confirmStockIssue"));
  const guardIndex = confirmation.indexOf('issue.approval_status === "pending"');
  const rpcIndex = confirmation.indexOf('.rpc("confirm_stock_issue"');

  assert.match(confirmation, /select\("branch_id, issue_type, approval_status"\)/);
  assert.ok(guardIndex >= 0, "pending-approval guard must exist");
  assert.ok(rpcIndex >= 0, "confirmation RPC call must exist");
  assert.ok(guardIndex < rpcIndex, "guard must run before the RPC call");
});

test("Issue detail surfaces load approval state and become read-only while pending", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/issue-actions.ts",
  );
  const ownerDetail = read(
    "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );
  const branchDetail = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/[id]/branch-stock-issue-detail-client.tsx",
  );

  assert.match(actions, /status, approval_status, notes/);
  assert.match(ownerDetail, /const isEditable = isDraft && !isAwaitingApproval/);
  assert.match(branchDetail, /isDraft && !isAwaitingApproval && data\.canManage/);
  assert.match(ownerDetail, /pendingApprovalReadOnlyHint/);
  assert.match(branchDetail, /pendingApprovalReadOnlyHint/);
});
