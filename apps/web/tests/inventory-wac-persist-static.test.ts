import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("valuation keeps last positive WAC when the pool is empty or negative", () => {
  const sql = read(
    "supabase/migrations/20260816165500_persist_wac_at_zero_qty.sql",
  );

  assertSqlMatch(sql, /WHEN account\.quantity > 0/);
  assertSqlMatch(sql, /account\.book_value \/ account\.quantity/);
  assertSqlMatch(sql, /WHEN stock\.avg_unit_cost IS NOT NULL AND stock\.avg_unit_cost > 0/);
  assertSqlMatch(sql, /THEN stock\.avg_unit_cost/);
  assertSqlMatch(sql, /last_known_movement/);
  assertSqlMatch(sql, /production_output/);
  assertSqlMatch(sql, /Sườn cọng/);
  assertSqlMatch(sql, /invoice_reprice/);
  assertSqlMatch(sql, /suon-cong-wac-repair/);
  assertSqlMatch(sql, /allocation_bucket = 'food_cost'/);
  assertSqlMatch(sql, /branch_kind = 'branch'/);
  assertSqlNotMatch(sql,
    /UPDATE public\.inventory_valuation_events/,
  );
  assertSqlNotMatch(sql,
    /UPDATE public\.inventory_value_allocations/,
  );
});
