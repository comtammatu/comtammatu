import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

function read(rel: string): string {
  return readFileSync(new URL(rel, root), "utf8");
}

test("mutation SA schemas require positive branchId (no null/all)", () => {
  const waste = read("app/(protected)/inventory/waste-actions.ts");
  const stocktake = read("app/(protected)/inventory/stocktake-actions.ts");
  const transfer = read("app/(protected)/inventory/transfer-actions.ts");

  assert.match(
    waste,
    /branchId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)/,
  );
  assert.match(waste, /create_waste_entry[\s\S]*p_branch_id:\s*parsed\.data\.branchId/);
  assert.match(
    stocktake,
    /branchId:\s*z\.coerce\.number\(\)\.int\(\)\.positive\(\)/,
  );
  assert.match(stocktake, /start_stocktake[\s\S]*p_branch_id:\s*parsed\.data\.branchId/);
  assert.doesNotMatch(waste, /p_branch_id:\s*null/);
  assert.doesNotMatch(stocktake, /p_branch_id:\s*null/);
  assert.match(transfer, /p_branch_id:\s*(branchId|fromBranch\.id)/);
});

test("list/report SA pass null branch only where RPC documents null=all", () => {
  const report = read("app/(protected)/inventory/report-actions.ts");
  const value = read("app/(protected)/inventory/inventory-value-actions.ts");
  assert.match(report, /branchId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
  assert.match(report, /p_branch_id: effectiveBranchId \?\? undefined/);
  assert.match(value, /branchId: z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
  assert.match(value, /p_branch_id: parsed\.data\.branchId \?\? null/);
});

test("all-scope writes fail closed unless their form requires a branch", () => {
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const issueCreateDialog = read(
    "app/(protected)/inventory/issues/issue-create-dialog.tsx",
  );
  const stocktake = read(
    "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  );
  const transfers = read("app/(protected)/inventory/transfers/page.tsx");
  assert.match(issueCreateDialog, /name="branchId"[\s\S]*required/);
  assert.match(
    issues,
    /resolvedView === "manual"\s*&&\s*allowedCreateIssueTypes\.length > 0\s*\? \(/,
  );
  assert.match(stocktake, /writeRequiresSitePick/);
  assert.match(stocktake, /disabled/);
  assert.match(transfers, /writeRequiresSitePick/);
  assert.match(transfers, /disabled/);
});

test("finance branches token filters sales Chi nhánh only", () => {
  const sales = read(
    "app/(protected)/finance/_lib/finance-sales-branches.ts",
  );
  assert.match(sales, /eq\("branch_kind", "branch"\)/);
  assert.doesNotMatch(sales, /central_supply|central_kitchen/);
});
