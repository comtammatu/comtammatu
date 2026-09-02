import { join } from "node:path";
import test from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";

const root = join(import.meta.dirname, "../../..");

test("drop transfer legacy migration inlines wrappers before DROP", () => {
  const sql = readSql(root, "supabase/migrations/20260810022022_drop_transfer_legacy_and_consume_stock_orphans.sql");
  assertSqlMatch(sql, /CREATE OR REPLACE FUNCTION public\.stock_transfer_confirm_ship/);
  assertSqlMatch(sql, /stock_transfer_mark_in_transit/);
  assertSqlMatch(sql, /private\.execute_stock_transfer_receive/);
  assertSqlNotMatch(sql, /RETURN public\.stock_transfer_receive_legacy/);
  assertSqlMatch(sql, /DROP FUNCTION IF EXISTS public\.stock_transfer_confirm_ship_legacy/);
  assertSqlMatch(sql, /DROP FUNCTION IF EXISTS public\.stock_transfer_receive_legacy/);
  assertSqlMatch(sql, /DROP FUNCTION IF EXISTS public\.consume_stock_for_order\(/);
  assertSqlMatch(sql,
    /DROP FUNCTION IF EXISTS public\.consume_stock_for_order_service/,
  );
  assertSqlMatch(sql, /retired consume_stock_for_order wrapper/);
});

test("stocktake variance reason_code migration shares waste enum", () => {
  const sql = readSql(root, "supabase/migrations/20260810022059_stocktake_variance_reason_code.sql");
  assertSqlMatch(sql, /ADD COLUMN IF NOT EXISTS reason_code text/);
  assertSqlMatch(sql, /stocktake_reason_code_required/);
  assertSqlMatch(sql, /'spoiled'::text/);
  assertSqlMatch(sql, /'found_missing'::text/);
});
