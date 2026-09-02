import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("paid orders with no recipe lines count as covered food cost", () => {
  const source = read(
    "apps/web/app/(protected)/finance/_lib/food-cost-coverage.ts",
  );
  assert.match(source, /itemMenuItemIds\.every\(\(id\) => !recipeMenuItemIds\.has\(id\)\)/);
  assert.match(source, /addPaidOrdersWithoutRecipeNeed/);
  assert.match(source, /fetchAllPagedRows/);
});

test("paid sale consumption no longer waits for kitchen dispatch", () => {
  const sql = read(
    "supabase/migration-archive/20260816172557_post_paid_sale_consumption_without_dispatch.sql",
  );
  const foodCostMigration = read(
    "supabase/migration-archive/20260820151656_finance_food_cost_recorded.sql",
  );
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const expenses = read(
    "apps/web/app/(protected)/finance/expense-actions.ts",
  );

  assert.match(sql, /TRUE\s+AND NOT EXISTS/);
  assert.match(sql, /post_pos_sale_consumption_if_ready/);
  assert.match(sql, /branch_kind = 'branch'/);
  assert.match(foodCostMigration, /paid\.status = 'completed'/);
  assert.match(foodCostMigration, /no_recipe AS/);
  assert.match(cockpit, /get_finance_operating_cockpit/);
  assert.match(expenses, /get_finance_food_cost_recorded/);
});
