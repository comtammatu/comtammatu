import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(import.meta.dirname, "../../..");
const migrationsDir = resolve(repoRoot, "supabase/migrations");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function activeMigrationNamed(suffix: string): string {
  const names = readdirSync(migrationsDir).filter((name) =>
    name.endsWith(suffix),
  );
  assert.equal(
    names.length,
    1,
    `expected one active ${suffix} migration`,
  );
  return read(`supabase/migrations/${names[0]!}`);
}

test("parked cutover and high-confidence twins revoke authenticated EXECUTE without DROP", () => {
  const sql = activeMigrationNamed(
    "_revoke_parked_authenticated_execute.sql",
  );

  assert.doesNotMatch(sql, /DROP FUNCTION/i);
  assert.doesNotMatch(sql, /DROP TABLE/i);

  for (const signature of [
    "public.prepare_inventory_valuation_cutover(uuid)",
    "public.activate_inventory_valuation_cutover(uuid)",
    "public.approve_leave_request(bigint)",
    "public.create_expense_transfer_intent(bigint, date, text, jsonb, text, text, text)",
    "public.get_food_cost(bigint, date, date)",
    "public.get_daily_revenue(bigint, date, date)",
    "public.get_inventory_dashboard(bigint)",
    "public.get_branch_day_summary(bigint, date)",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}[\\s\\S]*?FROM(?: anon,)? authenticated`,
      ),
      `must revoke authenticated EXECUTE on ${signature}`,
    );
  }

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.get_branch_day_summary\(bigint, date\)[\s\S]*FROM anon, authenticated/,
  );

  for (const keep of [
    "enqueue_kitchen_print",
    "update_pos_order_status",
    "create_supplier_payment",
    "save_purchase_demand",
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`REVOKE[\\s\\S]*${keep}`),
      `must not revoke ${keep} in this parked-twin batch`,
    );
  }
});

test("fold and reregister both schedule valuation reconciliation and order-delay SLA", () => {
  const fold = read(
    "supabase/migrations/20260902162919_fold_managed_surfaces.sql",
  );
  const reregister = read(
    "supabase/migrations/20260902162922_reregister_managed_cron_jobs.sql",
  );
  const forward = activeMigrationNamed(
    "_revoke_parked_authenticated_execute.sql",
  );

  for (const sql of [fold, reregister, forward]) {
    assert.match(
      sql,
      /cron\.schedule\(\s*'inventory-valuation-reconciliation-daily'/,
    );
    assert.match(sql, /cron\.schedule\(\s*'scan-order-delay-sla'/);
  }
});

test("Smart Reorder does not call frozen save_purchase_demand and fails closed on supplier channel", () => {
  const stockActions = read(
    "apps/web/app/(protected)/inventory/stock-actions.ts",
  );
  const purchaseActions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const closeDayData = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/close-day/data.ts",
  );
  const leaveActions = read(
    "apps/web/app/(protected)/hr/leave-request-actions.ts",
  );
  const expenseActions = read(
    "apps/web/app/(protected)/finance/expense-actions.ts",
  );

  assert.doesNotMatch(stockActions, /save_purchase_demand/);
  assert.match(stockActions, /supplierItems\.length > 0/);
  assert.match(
    stockActions,
    /return \{\s*success: false,\s*error: "Không thể tạo đề xuất\. Vui lòng thử lại\."/,
  );
  assert.match(stockActions, /commit_intra_site_transfer/);

  assert.match(purchaseActions, /export const createPurchaseOrder/);
  assert.match(purchaseActions, /"create_purchase_order" as never/);
  assert.match(purchaseActions, /export const savePurchaseDemand/);

  assert.match(closeDayData, /get_branch_day_report/);
  assert.doesNotMatch(closeDayData, /get_branch_day_summary/);
  assert.doesNotMatch(closeDayData, /get_food_cost/);
  assert.doesNotMatch(closeDayData, /get_daily_revenue/);

  assert.match(leaveActions, /\.rpc\(\s*"approve_leave_request_with_roster"/);
  assert.doesNotMatch(
    leaveActions,
    /\.rpc\(\s*"approve_leave_request"\s*,/,
  );

  assert.doesNotMatch(
    expenseActions,
    /\.rpc\([\s\S]*"create_expense_transfer_intent"/,
  );
  assert.match(expenseActions, /\.rpc\([\s\S]*"transition_expense_payment"/);
  assert.doesNotMatch(expenseActions, /"get_food_cost"/);
  assert.doesNotMatch(expenseActions, /"get_inventory_dashboard"/);
});
