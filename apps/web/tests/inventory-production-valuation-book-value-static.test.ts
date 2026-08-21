import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("inventory valuation migration safely clamps origin balance allocations", () => {
  const sql = read(
    "supabase/migrations/20260821203000_fix_inventory_origin_balances_book_value_check.sql",
  );

  assert.match(sql, /post_stock_movement_valuation/);
  assert.match(sql, /greatest\(0::numeric, least\(v_remaining_value, v_balance\.book_value\)\)/);
  assert.match(sql, /greatest\(0::numeric, least\(v_remaining_quantity, v_balance\.quantity\)\)/);
  assert.match(sql, /greatest\(0::numeric, book_value - v_alloc_value\)/);
  assert.match(sql, /inventory_valuation_allocation_drift/);
});
