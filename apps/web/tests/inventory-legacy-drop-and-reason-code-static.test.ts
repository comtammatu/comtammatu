import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "../../..");

test("drop transfer legacy migration inlines wrappers before DROP", () => {
  const sql = readFileSync(
    join(
      root,
      "supabase/migration-archive/20260810022022_drop_transfer_legacy_and_consume_stock_orphans.sql",
    ),
    "utf8",
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.stock_transfer_confirm_ship/);
  assert.match(sql, /stock_transfer_mark_in_transit/);
  assert.match(sql, /private\.execute_stock_transfer_receive/);
  assert.doesNotMatch(sql, /RETURN public\.stock_transfer_receive_legacy/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.stock_transfer_confirm_ship_legacy/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.stock_transfer_receive_legacy/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.consume_stock_for_order\(/);
  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.consume_stock_for_order_service/,
  );
  assert.match(sql, /retired consume_stock_for_order wrapper/);
});

test("stocktake variance reason_code migration shares waste enum", () => {
  const sql = readFileSync(
    join(
      root,
      "supabase/migration-archive/20260810022059_stocktake_variance_reason_code.sql",
    ),
    "utf8",
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS reason_code text/);
  assert.match(sql, /stocktake_reason_code_required/);
  assert.match(sql, /'spoiled'::text/);
  assert.match(sql, /'found_missing'::text/);
});
