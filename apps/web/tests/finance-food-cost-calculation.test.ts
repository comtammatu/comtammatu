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

test("finance food cost uses recipe unit conversion and branch WAC", () => {
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

  assert.equal(branchOne?.ingredient_cost, 10_000);
  assert.equal(branchOne?.unit_ingredient_cost, 5_000);
  assert.equal(branchOne?.food_cost_pct, 10);
  assert.equal(branchOne?.gross_profit, 90_000);
  assert.equal(branchOne?.gross_margin_pct, 90);
  assert.equal(branchTwo?.ingredient_cost, 10_000);
  assert.equal(branchTwo?.food_cost_pct, 16.67);
  assert.equal(branchTwo?.unit_ingredient_cost, 10_000);
  assert.equal(branchTwo?.gross_profit, 50_000);
  assert.equal(branchTwo?.gross_margin_pct, 83.33);
});

test("finance food cost action aggregates sales via SQL RPC", () => {
  const source = read("apps/web/app/_lib/food-cost-actions.ts");

  // Sales totals come from one permission-checked SQL aggregate, not a paged
  // raw-row fetch (which silently truncated at the PostgREST 1000-row cap).
  assert.match(source, /\.rpc\(\s*\n?\s*"get_menu_item_sales_agg"/);
  assert.doesNotMatch(source, /FOOD_COST_PAGE_SIZE/);
  assert.doesNotMatch(source, /\.range\(/);
});

test("finance food cost uses the active branch warehouse WAC", () => {
  const source = read("apps/web/app/_lib/food-cost-actions.ts");

  assert.match(source, /\.from\("inventory_locations"\)/);
  assert.match(source, /\.eq\("location_kind", "warehouse"\)/);
  assert.match(source, /\.eq\("is_active", true\)/);
  assert.match(source, /\.in\("location_id", warehouseLocationIds\)/);
  assert.doesNotMatch(source, /const accum = new Map/);
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
  assert.match(migration, /CROSS JOIN LATERAL jsonb_array_elements\(pi\.sides\)/);
  assert.match(migration, /private\.finance_scope\(v_uid, 'finance:view'\)/);
});

test("finance food cost keeps the resolved period in its filter, not the header", () => {
  const page = read("apps/web/app/(protected)/finance/food-cost/page.tsx");
  const client = read(
    "apps/web/app/(protected)/finance/food-cost/food-cost-client.tsx",
  );

  assert.doesNotMatch(page, /description=\{messages\.finance\.foodCost\.description\}/);
  assert.doesNotMatch(page, /meta=\{messages\.finance\.basic\.periodMeta/);
  assert.match(client, /<FilterBar/);
  assert.doesNotMatch(client, /description=\{foodCopy\.tableDescription\}/);
  assert.match(client, /hide=\{\["compare", "payment", "granularity"\]\}/);
});
