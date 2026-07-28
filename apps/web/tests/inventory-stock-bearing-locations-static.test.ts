import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(import.meta.dirname, "../../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("stock-bearing locations disambiguate inventory_locations→branches FK and fail closed", () => {
  const helper = read(
    "apps/web/app/(protected)/inventory/_lib/stock-bearing-locations.ts",
  );
  const stockData = read("apps/web/lib/inventory/stock-on-hand-data.ts");
  const stockDetailData = read(
    "apps/web/lib/inventory/stock-on-hand-detail-data.ts",
  );
  const inventoryValue = read(
    "apps/web/app/(protected)/inventory/inventory-value-actions.ts",
  );
  const recipeActions = read(
    "apps/web/app/(protected)/inventory/recipe-actions.ts",
  );
  const financeCockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );

  assert.match(
    helper,
    /branches!inventory_locations_branch_id_fkey!inner\s*\(\s*branch_kind\s*\)/,
  );
  assert.doesNotMatch(helper, /branches!inner\s*\(\s*branch_kind\s*\)/);
  assert.doesNotMatch(helper, /if\s*\(\s*error\s*\)\s*return\s*\[\s*\]/);
  assert.match(helper, /StockBearingLocationsResult/);
  assert.match(helper, /ok:\s*false/);
  assert.match(helper, /locationIds/);

  assert.match(stockData, /!stockBearingLocations\.ok/);
  assert.match(stockData, /coreDataLoadFailed:/);
  assert.match(stockDetailData, /!stockBearingLocations\.ok/);
  assert.match(stockDetailData, /coreDataLoadFailed:/);
  assert.match(inventoryValue, /!stockBearingLocations\.ok/);
  assert.match(
    inventoryValue,
    /messages\.inventory\.value\.stockLoadFailed/,
  );
  assert.match(recipeActions, /!stockBearingLocations\.ok/);
  assert.match(
    recipeActions,
    /messages\.inventory\.recipes\.branchWacLoadFailed/,
  );
  assert.match(financeCockpit, /!stockBearingLocations\.ok/);
});
