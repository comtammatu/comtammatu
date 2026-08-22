import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("transfer receive valuation shortfall migration provides resilient origin posting", () => {
  const sql = read(
    "supabase/migrations/20260822015244_transfer_receive_valuation_shortfall.sql",
  );

  assert.match(sql, /transfer_shortfall/);
  assert.match(sql, /inventory_cost_origins_source_kind_check/);
  assert.match(sql, /patch_transfer_in_shortfall/);
  assert.match(sql, /v_shortfall_quantity := v_quantity - v_covered_quantity/);
  assert.match(sql, /create_inventory_cost_origin/);
  assert.match(sql, /backfill_inflight_transfers/);
});

test("inventory RPC error mappings include transfer valuation mismatch messages", () => {
  const code = read("apps/web/lib/messages/inventory-rpc-errors.ts");

  assert.match(code, /transfer_valuation/);
  assert.match(code, /valuation_quantity/);
  assert.match(code, /Lệch số dư giá vốn chuyển kho/);
});
