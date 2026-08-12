import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const ingredientDialog = read(
  "app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
);
const ingredientList = read(
  "app/(protected)/inventory/ingredients/ingredients-client.tsx",
);
const ingredientActions = read(
  "app/(protected)/inventory/ingredient-actions.ts",
);
const thresholdClient = read(
  "app/(protected)/inventory/settings/thresholds/thresholds-client.tsx",
);
const thresholdActions = read(
  "app/(protected)/inventory/settings/thresholds/actions.ts",
);
const alertActions = read("app/(protected)/inventory/alert-actions.ts");

test("ingredient surfaces expose only the minimum stock threshold", () => {
  assert.match(ingredientDialog, /name="min_stock_level"/);
  assert.doesNotMatch(ingredientDialog, /name="max_stock_level"/);
  assert.doesNotMatch(ingredientDialog, /name="reorder_point"/);
  assert.doesNotMatch(ingredientList, /Re \{item|Max \{item/);
  assert.doesNotMatch(ingredientList, /Min \{item\.min_stock_level/);
});

test("threshold editor persists Min and clears unused Re and Max values", () => {
  assert.match(
    thresholdClient,
    /type ThresholdRow = \{[\s\S]*minStock: string/,
  );
  assert.doesNotMatch(thresholdClient, /reorderPoint|maxStock/);
  assert.match(thresholdActions, /reorder_point: null/);
  assert.match(thresholdActions, /max_stock_level: null/);
});

test("stock alerts use the minimum threshold", () => {
  assert.match(alertActions, /id, name, min_stock_level, is_active/);
  assert.match(alertActions, /sl\.current_quantity <= ing\.min_stock_level/);
  assert.doesNotMatch(alertActions, /ingredients\.reorder_point/);
});

test("ingredient import and export publish one threshold column", () => {
  assert.match(ingredientActions, /header: "Tồn tối thiểu"/);
  assert.doesNotMatch(ingredientActions, /header: "Tồn tối đa"/);
  assert.doesNotMatch(ingredientActions, /header: "Điểm đặt hàng"/);
  assert.match(ingredientActions, /max_stock_level: null/);
  assert.match(ingredientActions, /reorder_point: null/);
});
