import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  buildFoodCostRows,
  foodCostUnitCostKey,
} from "../app/_lib/food-cost-calculation";
import type { IngredientUnitRow } from "../lib/inventory/types";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function unit(row: Partial<IngredientUnitRow>): IngredientUnitRow {
  return {
    id: 0,
    unit_id: 0,
    unit_code: "",
    to_base_factor: 1,
    is_base: false,
    is_active: true,
    sort_order: 0,
    ...row,
  };
}

test("finance food cost uses recipe unit conversion, yield, and branch WAC", () => {
  const units = [
    unit({ unit_id: 1, unit_code: "g", to_base_factor: 1, is_base: true }),
    unit({ unit_id: 2, unit_code: "kg", to_base_factor: 1000 }),
  ];

  const rows = buildFoodCostRows({
    periodStart: "2026-07-09",
    saleLines: [
      {
        branchId: 1,
        menuItemId: 10,
        itemName: "Cơm tấm sườn",
        quantity: 2,
        revenue: 100_000,
      },
      {
        branchId: 2,
        menuItemId: 10,
        itemName: "Cơm tấm sườn",
        quantity: 1,
        revenue: 60_000,
      },
    ],
    recipeLines: [
      {
        menuItemId: 10,
        ingredientId: 7,
        quantity: 0.5,
        entryUnitId: 2,
        yieldFactor: 0.5,
        fallbackUnitCost: 1,
        units,
      },
    ],
    unitCosts: new Map([
      [foodCostUnitCostKey(1, 7), 10],
      [foodCostUnitCostKey(2, 7), 20],
    ]),
  });

  const branchOne = rows.find((row) => row.branch_id === 1);
  const branchTwo = rows.find((row) => row.branch_id === 2);

  assert.equal(branchOne?.ingredient_cost, 20_000);
  assert.equal(branchOne?.food_cost_pct, 20);
  assert.equal(branchTwo?.ingredient_cost, 20_000);
  assert.equal(branchTwo?.food_cost_pct, 33.33);
});

test("finance food cost action aggregates sales via SQL RPC", () => {
  const source = read("apps/web/app/_lib/food-cost-actions.ts");

  // Sales totals come from one permission-checked SQL aggregate, not a paged
  // raw-row fetch (which silently truncated at the PostgREST 1000-row cap).
  assert.match(source, /\.rpc\(\s*\n?\s*"get_menu_item_sales_agg"/);
  assert.doesNotMatch(source, /FOOD_COST_PAGE_SIZE/);
  assert.doesNotMatch(source, /\.range\(/);
});
