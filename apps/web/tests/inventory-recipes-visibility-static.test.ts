import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("menu recipe list shows every active item and omits Yield", () => {
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

  assert.doesNotMatch(
    page,
    /\.filter\(\(menuRecipe\) => menuRecipe\.items\.length > 0\)/,
  );
  assert.match(page, /fetchBranchWacMap\(null\)/);
  assert.match(page, /companyWacMap/);
  assert.match(page, /resolveMenuRecipeUnitCost/);
  assert.match(page, /resolveMenuRecipeCostSignals/);
  assert.match(page, /default_fulfill_site_kind/);
  assert.doesNotMatch(page, /referenceUnitCost/);
  assert.doesNotMatch(page, /wacRes\.error/);
  assert.doesNotMatch(page, /stockCapacityRes\.error/);
  assert.match(actions, /\.gt\("avg_unit_cost", 0\)/);
  assert.match(actions, /buildSourceSiteWacMap/);
  assert.match(actions, /buildCompanyWacMap/);
  assert.match(actions, /revalidatePath/);
  assert.match(actions, /unit_id, to_base_factor/);
  assert.doesNotMatch(actions, /select\("id, name, unit_cost"\)/);
  assert.match(menuRecipeCost, /buildSourceSiteWacMap/);
  assert.match(menuRecipeCost, /buildCompanyWacMap/);
  assert.match(menuRecipeCost, /menuRecipeSourceWacKey/);
  assert.match(menuRecipeCost, /resolveMenuRecipeCostSignals/);
  assert.match(menuRecipeCost, /resolveMenuRecipeListCostState/);
  assert.match(client, /menuRecipeColIngredientCount/);
  assert.match(client, /formatMenuRecipeBomSummary/);
  assert.match(client, /menuRecipesPageDescription/);
  assert.match(client, /menuRecipeMissingLines/);
  assert.match(client, /menuRecipeCoverageMissing/);
  assert.match(client, /showStockCapacity/);
  assert.match(page, /showStockCapacity=\{branchId != null\}/);
  assert.doesNotMatch(client, /items\.map\(\(item\) => item\.ingredientName/);
  assert.match(client, /menuRecipeCostUnavailable/);
  assert.match(client, /menuRecipeMissingFulfillSite/);
  assert.match(client, /menuRecipeSourceWacSiteMismatch|wacMapAvailable/);
  assert.match(page, /wacMapAvailable/);
  assert.match(dialog, /menuRecipeCostSignalsHint/);
  assert.doesNotMatch(menuRecipeCost, /buildValuedWacMap/);
  assert.doesNotMatch(menuRecipeCost, /referenceUnitCost/);
  assert.doesNotMatch(dialog, /showYield/);
  assert.doesNotMatch(dialog, /INVENTORY_VI\.yieldHint/);
  assert.match(foodCostCalculation, /resolvedUnitCost/);
  assert.doesNotMatch(foodCostCalculation, /foodCostUnitCostKey\(row\.branch_id/);
  assert.doesNotMatch(foodCostCalculation, /buildSourceSiteWacMap/);
  assert.match(foodCostActions, /buildSourceSiteWacMap/);
  assert.match(foodCostActions, /buildCompanyWacMap/);
  assert.match(foodCostActions, /companyWacMap/);
  assert.match(foodCostActions, /resolveMenuRecipeUnitCost/);
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
