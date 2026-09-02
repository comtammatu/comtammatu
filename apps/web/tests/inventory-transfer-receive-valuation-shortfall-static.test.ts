import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("transfer receive valuation shortfall migration provides resilient origin posting", () => {
  const sql = read(
    "supabase/migrations/20260822015244_transfer_receive_valuation_shortfall.sql",
  );

  assertSqlMatch(sql, /transfer_shortfall/);
  assertSqlMatch(sql, /inventory_cost_origins_source_kind_check/);
  assertSqlMatch(sql, /patch_transfer_in_shortfall/);
  assertSqlMatch(sql, /v_shortfall_quantity := v_quantity - v_covered_quantity/);
  assertSqlMatch(sql, /create_inventory_cost_origin/);
  assertSqlMatch(sql, /backfill_inflight_transfers/);
});

test("inventory RPC error mappings include transfer valuation mismatch messages", () => {
  const code = read("apps/web/lib/messages/inventory-rpc-errors.ts");

  assert.match(code, /transfer_valuation/);
  assert.match(code, /valuation_quantity/);
  assert.match(code, /Lệch số dư giá vốn chuyển kho/);
});
