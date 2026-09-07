import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  extractSqlFunction,
  readActiveMigrationSql,
} from "./_lib/active-sql.ts";

const root = join(import.meta.dirname, "../../..");

test("positive count surplus is priced at company WAC before posting", () => {
  const sql = readActiveMigrationSql(root);
  const pricer = extractSqlFunction(
    sql,
    "private.price_stocktake_gain_movement",
  );
  const repair = readFileSync(
    join(
      root,
      "supabase/migrations/20260907161322_price_unpriced_count_surplus.sql",
    ),
    "utf8",
  );

  assert.match(pricer, /NEW\.type IN \('count_adjustment', 'adjustment'\)/);
  assert.match(pricer, /ingredient_provisional_unit_cost/);
  assert.match(pricer, /stocktake_gain_unit_cost_missing/);
  assert.match(
    sql,
    /CREATE TRIGGER inventory_price_stocktake_gain BEFORE INSERT ON public\.stock_movements/,
  );
  assert.match(repair, /source_kind = 'stocktake_found'/);
  assert.match(repair, /balance\.book_value = 0/);
  assert.match(repair, /ingredient_provisional_unit_cost/);
});

test("stocktake complete and count-slip surplus map missing WAC", () => {
  const complete = readFileSync(
    join(root, "apps/web/app/(protected)/inventory/actions.ts"),
    "utf8",
  );
  const countSlips = readFileSync(
    join(root, "apps/web/app/(protected)/inventory/count-slips/actions.ts"),
    "utf8",
  );
  const proof = readFileSync(
    join(root, "supabase/tests/inventory_stocktake_surplus_pricing_test.sql"),
    "utf8",
  );

  assert.match(complete, /stocktake_gain_unit_cost_missing/);
  assert.match(countSlips, /stocktake_gain_unit_cost_missing/);
  assert.match(proof, /STOCKTAKE SURPLUS: adjustment must inherit company WAC/);
  assert.match(
    complete,
    /Nguyên liệu chưa có Giá vốn để ghi lượng đếm thừa/,
  );
});
