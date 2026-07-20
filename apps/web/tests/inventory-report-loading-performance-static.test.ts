import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readWeb(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("owner inventory report starts its independent report loaders together", () => {
  const page = readWeb("app/(protected)/inventory/reports/page.tsx");

  assert.match(
    page,
    /const \[apRes, varRes, movementRes, foodCostRes\] = await Promise\.all\(\[[\s\S]*fetchApAging\(\)[\s\S]*fetchConsumptionVariance\([\s\S]*fetchStockMovementReport\([\s\S]*fetchFoodCost\(/,
  );
});

test("consumption variance fans out independent RLS reads", () => {
  const actions = readWeb("app/(protected)/inventory/report-actions.ts");
  const functionStart = actions.indexOf(
    "export async function fetchConsumptionVariance",
  );
  assert.notEqual(functionStart, -1);

  const functionSource = actions.slice(functionStart);
  const fanOut = functionSource.match(
    /const \[ingredientResult, theoreticalResult, movementResult\] =\s*await Promise\.all\(\[([\s\S]*?)\]\);/,
  );
  assert.ok(fanOut);

  const concurrentReads = fanOut[1] ?? "";
  assert.match(concurrentReads, /\.from\("ingredients"\)/);
  assert.match(concurrentReads, /\.eq\("tenant_id", claims\.tenant_id\)/);
  assert.match(concurrentReads, /\.rpc\("get_theoretical_consumption"/);
  assert.match(concurrentReads, /p_branch_id: effectiveBranchId/);
  assert.match(concurrentReads, /movQuery/);

  assert.match(
    functionSource,
    /if \(effectiveBranchId\) \{\s*movQuery = movQuery\.eq\("branch_id", effectiveBranchId\);/,
  );
  assert.ok(
    functionSource.indexOf("const { data: ingredients, error: ingErr }") >
      functionSource.indexOf("await Promise.all"),
  );
});
