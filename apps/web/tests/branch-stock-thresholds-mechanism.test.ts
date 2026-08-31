import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildBranchMinimumMap,
  resolveEffectiveMinimum,
  selectDirtyBranchThresholds,
} from "../lib/inventory/branch-stock-threshold-model";

const read = (path: string) => readFileSync(path, "utf8");

test("warehouse-specific minimum overrides the chain default without leaking across warehouses", () => {
  const warehouse37 = buildBranchMinimumMap([
    { ingredient_id: 901, min_stock_level: 18 },
  ]);
  const warehouse84 = buildBranchMinimumMap([
    { ingredient_id: 901, min_stock_level: 42 },
  ]);

  assert.equal(resolveEffectiveMinimum(10, warehouse37, 901), 18);
  assert.equal(resolveEffectiveMinimum(10, warehouse84, 901), 42);
  assert.equal(resolveEffectiveMinimum(10, warehouse37, 902), 10);
});

test("stock list and detail scope threshold reads to the trusted warehouse id", () => {
  for (const source of [
    read("lib/inventory/stock-on-hand-data.ts"),
    read("lib/inventory/stock-on-hand-detail-data.ts"),
  ]) {
    assert.match(source, /from\("branch_ingredient_thresholds"\)/);
    assert.match(source, /\.eq\("tenant_id", claims\.tenant_id\)/);
    assert.match(source, /\.eq\("branch_id", branchId\)/);
    assert.match(source, /resolveEffectiveMinimum/);
    assert.match(source, /thresholdResult\.error != null/);
  }
});

test("threshold editor labels quantities with the ledger base unit, not the receipt unit", () => {
  const loader = read("lib/inventory/branch-thresholds-data.ts");
  const reorderLoader = read("lib/inventory/smart-reorder-data.ts");

  for (const source of [loader, reorderLoader]) {
    assert.match(source, /from\("ingredient_units"\)/);
    assert.match(source, /\.eq\("is_base", true\)/);
    assert.doesNotMatch(source, /receipt_unit:units/);
  }
});

test("saving one edited ingredient does not materialize chain defaults as warehouse overrides", () => {
  const dialog = read(
    "app/components/inventory/branch-stock-thresholds-dialog.tsx",
  );
  const action = read("app/(protected)/inventory/stock-actions.ts");

  const changedRows = selectDirtyBranchThresholds(
    [
      { ingredientId: 901, minStockLevel: 18 },
      { ingredientId: 902, minStockLevel: 10 },
    ],
    new Set([901]),
  );
  assert.deepEqual(changedRows, [{ ingredientId: 901, minStockLevel: 18 }]);

  assert.match(dialog, /dirtyIngredientIds/);
  assert.match(
    dialog,
    /selectDirtyBranchThresholds\(rows, dirtyIngredientIds\)/,
  );
  assert.match(dialog, /thresholds: changedRows\.map/);
  assert.doesNotMatch(action, /Fallback manual upsert/);
  assert.match(action, /requireBranchScope: true/);
  assert.match(action, /from\("branches"\)/);
  assert.match(action, /from\("ingredients"\)/);
  assert.match(
    action,
    /return \{ success: false, error: "Không thể lưu định mức tồn kho\." \}/,
  );
});
