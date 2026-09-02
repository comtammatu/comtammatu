import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { readSql } from "./_lib/active-sql.ts";


const root = process.cwd().replaceAll("\\", "/").includes("apps/web")
  ? join(process.cwd(), "../..")
  : process.cwd();
const read = (path: string) => readSql(root, path);

const migration = read(
  "supabase/migrations/20260822141800_fix_company_wac_equalize_non_negative_book_value.sql",
);

test("migration clamps project_company_wac origin balances book_value to non-negative", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.project_company_wac/,
  );
  assert.match(
    migration,
    /SET book_value = greatest\(0::numeric, book_value \+ v_share\)/,
  );
  assert.match(
    migration,
    /v_target := greatest\(0::numeric, v_total_value - v_assigned\)/,
  );
});

test("migration clamps propagate_inventory_origin_reprice book_value to non-negative", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.propagate_inventory_origin_reprice/,
  );
  assert.match(
    migration,
    /UPDATE public\.inventory_origin_balances\s+SET book_value = greatest\(0::numeric, book_value \+ v_share\)/,
  );
  assert.match(
    migration,
    /UPDATE public\.inventory_valuation_accounts\s+SET book_value = greatest\(0::numeric, book_value \+ v_share\)/,
  );
});
