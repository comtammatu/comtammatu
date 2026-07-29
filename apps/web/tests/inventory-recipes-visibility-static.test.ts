import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("menu recipe list hides menu items without lines and omits Yield", () => {
  const page = read("app/(protected)/inventory/menu-recipes/page.tsx");
  const dialog = read(
    "app/(protected)/inventory/menu-recipes/menu-recipe-line-dialog.tsx",
  );
  const client = read(
    "app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx",
  );
  const actions = read("app/(protected)/inventory/menu-recipe-actions.ts");
  const menuRecipeCost = read(
    "app/(protected)/inventory/_lib/menu-recipe-cost.ts",
  );
  const foodCostActions = read("app/_lib/food-cost-actions.ts");
  const foodCostCalculation = read("app/_lib/food-cost-calculation.ts");

  assert.match(
    page,
    /\.filter\(\(menuRecipe\) => menuRecipe\.items\.length > 0\)/,
  );
  assert.match(dialog, /showYield=\{false\}/);
  assert.doesNotMatch(dialog, /INVENTORY_VI\.yieldHint/);
  assert.doesNotMatch(
    [
      page,
      dialog,
      client,
      actions,
      menuRecipeCost,
      foodCostActions,
      foodCostCalculation,
    ].join("\n"),
    /yield_factor|yieldFactor/,
  );
});
