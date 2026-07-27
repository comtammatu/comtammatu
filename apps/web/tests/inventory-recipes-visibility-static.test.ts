import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("recipe list hides menu items without recipe lines and omits Yield", () => {
  const page = read("app/(protected)/inventory/recipes/page.tsx");
  const dialog = read(
    "app/(protected)/inventory/recipes/recipe-line-dialog.tsx",
  );
  const client = read("app/(protected)/inventory/recipes/recipes-client.tsx");
  const actions = read("app/(protected)/inventory/recipe-actions.ts");
  const recipeCost = read("app/(protected)/inventory/_lib/recipe-cost.ts");
  const foodCostActions = read("app/_lib/food-cost-actions.ts");
  const foodCostCalculation = read("app/_lib/food-cost-calculation.ts");

  assert.match(page, /\.filter\(\(recipe\) => recipe\.items\.length > 0\)/);
  assert.match(dialog, /showYield=\{false\}/);
  assert.doesNotMatch(dialog, /INVENTORY_VI\.yieldHint/);
  assert.doesNotMatch(
    [
      page,
      dialog,
      client,
      actions,
      recipeCost,
      foodCostActions,
      foodCostCalculation,
    ].join("\n"),
    /yield_factor|yieldFactor/,
  );
});
