import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

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
    "supabase/migrations/20260816172557_post_paid_sale_consumption_without_dispatch.sql",
  );
  const foodCostMigration = read(
    "supabase/migrations/20260820151656_finance_food_cost_recorded.sql",
  );
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const expenses = read(
    "apps/web/app/(protected)/finance/expense-actions.ts",
  );

  assertSqlMatch(sql, /TRUE\s+AND NOT EXISTS/);
  assertSqlMatch(sql, /post_pos_sale_consumption_if_ready/);
  assertSqlMatch(sql, /branch_kind = 'branch'/);
  assertSqlMatch(foodCostMigration, /paid\.status = 'completed'/);
  assertSqlMatch(foodCostMigration, /no_recipe AS/);
  assert.match(cockpit, /get_finance_operating_cockpit/);
  assert.match(expenses, /get_finance_food_cost_recorded/);
});
