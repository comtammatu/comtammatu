import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { buildFoodCostRows } from "../app/_lib/food-cost-calculation";
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

test("finance food cost uses one catalog unit cost across branches", () => {
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
    menuRecipeLines: [
      {
        menuItemId: 10,
        ingredientId: 7,
        quantity: 0.5,
        entryUnitId: 2,
        resolvedUnitCost: 10,
        units,
      },
    ],
  });

  const branchOne = rows.find((row) => row.branch_id === 1);
  const branchTwo = rows.find((row) => row.branch_id === 2);

  assert.equal(branchOne?.unit_ingredient_cost, 5_000);
  assert.equal(branchOne?.ingredient_cost, 10_000);
  assert.equal(branchOne?.food_cost_pct, 10);
  assert.equal(branchOne?.gross_profit, 90_000);
  assert.equal(branchOne?.gross_margin_pct, 90);
  assert.equal(branchTwo?.unit_ingredient_cost, 5_000);
  assert.equal(branchTwo?.ingredient_cost, 5_000);
  assert.equal(branchTwo?.food_cost_pct, 8.33);
  assert.equal(branchTwo?.gross_profit, 55_000);
  assert.equal(branchTwo?.gross_margin_pct, 91.67);
});

test("finance food cost action aggregates sales via SQL RPC", () => {
  const source = read("apps/web/app/_lib/food-cost-actions.ts");

  assert.match(source, /\.rpc\(\s*\n?\s*"get_menu_item_sales_agg"/);
  assert.match(source, /resolveMenuRecipeUnitCost/);
  assert.match(source, /buildSourceSiteWacMap/);
  assert.doesNotMatch(source, /FOOD_COST_PAGE_SIZE/);
  assert.doesNotMatch(source, /\.range\(/);
});

test("finance food cost does not treat a missing recipe unit as factor 1", () => {
  const rows = buildFoodCostRows({
    periodStart: "2026-07-09",
    saleLines: [
      {
        branchId: 1,
        menuItemId: 10,
        itemName: "Cơm tấm sườn",
        quantity: 1,
        revenue: 50_000,
      },
    ],
    menuRecipeLines: [
      {
        menuItemId: 10,
        ingredientId: 7,
        quantity: 2,
        entryUnitId: 99,
        resolvedUnitCost: 10,
        units: [unit({ unit_id: 1, unit_code: "g", to_base_factor: 1, is_base: true })],
      },
    ],
  });

  assert.equal(rows[0]?.unit_ingredient_cost, 0);
  assert.equal(rows[0]?.ingredient_cost, 0);
});

test("finance food cost leaves định mức empty when a recipe line is unvalued", () => {
  const rows = buildFoodCostRows({
    periodStart: "2026-07-09",
    saleLines: [
      {
        branchId: 1,
        menuItemId: 10,
        itemName: "Cơm tấm sườn",
        quantity: 1,
        revenue: 50_000,
      },
    ],
    menuRecipeLines: [
      {
        menuItemId: 10,
        ingredientId: 7,
        quantity: 1,
        entryUnitId: null,
        resolvedUnitCost: null,
        units: [],
      },
    ],
  });

  assert.equal(rows[0]?.unit_ingredient_cost, null);
  assert.equal(rows[0]?.ingredient_cost, null);
  assert.equal(rows[0]?.gross_profit, null);
});

test("finance food cost treats a menu item with no recipe as zero định mức", () => {
  const rows = buildFoodCostRows({
    periodStart: "2026-07-09",
    saleLines: [
      {
        branchId: 1,
        menuItemId: 10,
        itemName: "Trà Đá",
        quantity: 3,
        revenue: 9_000,
      },
    ],
    menuRecipeLines: [],
  });

  assert.equal(rows[0]?.unit_ingredient_cost, 0);
  assert.equal(rows[0]?.ingredient_cost, 0);
  assert.equal(rows[0]?.gross_profit, 9_000);
});

test("paid menu-item sales allocate order discounts before calculating gross profit", () => {
  const migration = read(
    "supabase/migration-archive/20260720120000_fix_paid_menu_item_sales_aggregation.sql",
  );

  assert.match(migration, /FROM public\.payments p/);
  assert.match(migration, /p\.status = 'completed'/);
  assert.match(migration, /p\.paid_at >= COALESCE\(p_from/);
  assert.match(migration, /o\.payment_status = 'paid'/);
  assert.match(
    migration,
    /ir\.revenue_before_discount \* \(ir\.subtotal - ir\.discount_amount\) \/ ir\.order_item_subtotal/,
  );
  assert.match(
    migration,
    /CROSS JOIN LATERAL jsonb_array_elements\(pi\.sides\)/,
  );
  assert.match(migration, /private\.finance_scope\(v_uid, 'finance:view'\)/);
});

test("finance food cost keeps the resolved period in its filter, not the header", () => {
  const page = read("apps/web/app/(protected)/finance/food-cost/page.tsx");
  const client = read(
    "apps/web/app/(protected)/finance/food-cost/food-cost-client.tsx",
  );

  assert.doesNotMatch(
    page,
    /description=\{messages\.finance\.foodCost\.description\}/,
  );
  assert.doesNotMatch(page, /meta=\{messages\.finance\.basic\.periodMeta/);
  assert.match(client, /<FilterBar/);
  assert.doesNotMatch(client, /description=\{foodCopy\.tableDescription\}/);
  assert.match(client, /hide=\{\["compare", "granularity"\]\}/);
});
