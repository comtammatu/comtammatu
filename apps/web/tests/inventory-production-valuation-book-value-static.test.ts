import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("inventory valuation migration safely clamps origin balance allocations", () => {
  const sql = read(
    "supabase/migrations/20260821203000_fix_inventory_origin_balances_book_value_check.sql",
  );

  assertSqlMatch(sql, /post_stock_movement_valuation/);
  assertSqlMatch(sql, /greatest\(0::numeric, least\(v_remaining_value, v_balance\.book_value\)\)/);
  assertSqlMatch(sql, /greatest\(0::numeric, least\(v_remaining_quantity, v_balance\.quantity\)\)/);
  assertSqlMatch(sql, /greatest\(0::numeric, book_value - v_alloc_value\)/);
  assertSqlMatch(sql, /inventory_valuation_allocation_drift/);
});
