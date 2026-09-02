import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Finance desync attention follows the selected local period and branch", () => {
  const source = read("app/(protected)/finance/_lib/finance-cockpit.ts");
  const migration = read(
    "../../supabase/migration-archive/20260820151657_finance_operating_cockpit_and_stop_mv_food_cost.sql",
  );

  assert.match(source, /get_finance_operating_cockpit/);
  assert.match(source, /paymentDesyncCount/);
  assert.match(migration, /find_payment_order_desync\(v_start_utc\)/);
  assert.match(migration, /payment_paid_at < v_end_utc/);
  assert.match(migration, /desync\.branch_id = p_branch_id/);
});

test("Inventory fulfillment hub treats dest-initiated DC as the primary create route", () => {
  const list = read("app/(protected)/inventory/transfers/page.tsx");
  const create = read("app/(protected)/inventory/transfers/new/page.tsx");

  assert.match(list, /copy\.manualTransferAction/);
  assert.doesNotMatch(list, /stock-requests\/new/);
  assert.match(create, /<CreateTransferForm/);
});
