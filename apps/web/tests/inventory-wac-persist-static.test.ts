import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("valuation keeps last positive WAC when the pool is empty or negative", () => {
  const sql = read(
    "supabase/migration-archive/20260816165500_persist_wac_at_zero_qty.sql",
  );

  assert.match(sql, /WHEN account\.quantity > 0/);
  assert.match(sql, /account\.book_value \/ account\.quantity/);
  assert.match(sql, /WHEN stock\.avg_unit_cost IS NOT NULL AND stock\.avg_unit_cost > 0/);
  assert.match(sql, /THEN stock\.avg_unit_cost/);
  assert.match(sql, /last_known_movement/);
  assert.match(sql, /production_output/);
  assert.match(sql, /Sườn cọng/);
  assert.match(sql, /invoice_reprice/);
  assert.match(sql, /suon-cong-wac-repair/);
  assert.match(sql, /allocation_bucket = 'food_cost'/);
  assert.match(sql, /branch_kind = 'branch'/);
  assert.doesNotMatch(
    sql,
    /UPDATE public\.inventory_valuation_events/,
  );
  assert.doesNotMatch(
    sql,
    /UPDATE public\.inventory_value_allocations/,
  );
});
