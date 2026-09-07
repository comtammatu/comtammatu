import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20260907112225_correct_posted_count_units.sql"), "utf8");

test("posted count corrections preserve subsequent movements and use the slip location", () => {
  assert.match(sql, /v_delta := v_new_base - v_line.counted_base_quantity/);
  assert.match(sql, /v_slip.location_id/);
  assert.doesNotMatch(sql, /SET current_quantity\s*=/i);
  assert.match(sql, /expected_base_quantity/);
  assert.match(sql, /FOR UPDATE/);
});

test("count corrections are audited, idempotent, authorized and distinct from food cost", () => {
  assert.match(sql, /CREATE TABLE private\.count_slip_corrections/);
  assert.match(sql, /UNIQUE \(tenant_id, source_movement_id\)/);
  assert.match(sql, /inventory:adjust_approve/);
  assert.match(sql, /count_correction_retry_mismatch/);
  assert.match(sql, /reconcile_inventory_valuation_account_to_stock/);
  assert.match(sql, /count_correction_valuation_mismatch/);
});
