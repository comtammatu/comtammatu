import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "../../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

test("finance food-cost recorded RPC is DEFINER + finance:view gated", () => {
  const migration = read(
    "supabase/migration-archive/20260820151656_finance_food_cost_recorded.sql",
  );
  assert.match(migration, /CREATE FUNCTION public\.get_finance_food_cost_recorded/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /private\.finance_scope\(v_uid, 'finance:view'\)/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*get_finance_food_cost_recorded[\s\S]*TO authenticated/);
  assert.match(migration, /REVOKE ALL[\s\S]*get_finance_food_cost_recorded[\s\S]*FROM PUBLIC/);
  assert.match(migration, /allocation_bucket[\s\S]*food_cost/);
  assert.match(migration, /covered_order_count/);
});

test("finance operating cockpit RPC aggregates period KPIs and stops mv_food_cost refresh", () => {
  const migration = read(
    "supabase/migration-archive/20260820151657_finance_operating_cockpit_and_stop_mv_food_cost.sql",
  );
  assert.match(migration, /CREATE FUNCTION public\.get_finance_operating_cockpit/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /has_permission_any\('finance:view'\)/);
  assert.match(migration, /get_finance_food_cost_recorded/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*get_finance_operating_cockpit[\s\S]*TO authenticated/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.refresh_finance_views\(\)[\s\S]*mv_food_cost is no longer/,
  );
  assert.doesNotMatch(
    migration,
    /REFRESH MATERIALIZED VIEW CONCURRENTLY public\.mv_food_cost/,
  );
});

test("finance bank list + token match RPCs are finance:view gated", () => {
  const migration = read(
    "supabase/migration-archive/20260820151658_list_finance_bank_transactions_and_match_token.sql",
  );
  assert.match(migration, /CREATE FUNCTION public\.list_finance_bank_transactions/);
  assert.match(migration, /CREATE FUNCTION public\.match_bank_by_transfer_token/);
  assert.match(migration, /has_permission_any\('finance:view'\)/);
  assert.match(migration, /match_kind/);
  assert.match(migration, /needs_review/);
  assert.match(migration, /reconcile_bank_transaction_targets/);
  assert.match(migration, /record_bank_transaction_cash_deposit/);
  assert.match(
    migration,
    /GRANT EXECUTE[\s\S]*list_finance_bank_transactions[\s\S]*TO authenticated/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE[\s\S]*match_bank_by_transfer_token[\s\S]*TO authenticated/,
  );
});

test("finance hub loader and bank page call the new RPCs", () => {
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const expenseActions = read(
    "apps/web/app/(protected)/finance/expense-actions.ts",
  );
  const bankLoader = read(
    "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
  );
  const bankActions = read(
    "apps/web/app/(protected)/finance/bank-webhook-review-actions.ts",
  );
  const realtime = read(
    "apps/web/app/(protected)/finance/use-finance-realtime-refresh.ts",
  );
  const revenueLoader = read(
    "apps/web/app/(protected)/finance/revenue/_lib/revenue-loader.ts",
  );

  assert.match(cockpit, /get_finance_operating_cockpit/);
  assert.match(expenseActions, /get_finance_food_cost_recorded/);
  assert.match(bankLoader, /list_finance_bank_transactions/);
  assert.match(bankActions, /match_bank_by_transfer_token/);
  assert.match(
    realtime,
    /if \(segment === ""\) \{\s*return \["payment"\];/,
  );
  assert.doesNotMatch(revenueLoader, /fetchFoodCost/);
});
