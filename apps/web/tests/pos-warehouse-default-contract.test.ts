import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migration-archive/20260711120000_enable_pos_sale_stock_deduction_at_branch_warehouse.sql",
  ),
  "utf8",
);

test("POS sale stock deduction is enabled only after the warehouse cutover is safe", () => {
  assert.match(migration, /branch_warehouse_required_before_pos_stock_outcome_enable/);
  assert.match(migration, /branch_kitchen_must_be_retired_before_pos_stock_outcome_enable/);
  assert.match(migration, /il\.location_kind = 'warehouse'/);
  assert.match(migration, /il\.location_kind = 'kitchen'/);
});

test("active branches are enabled and retain a per-branch Owner override afterwards", () => {
  assert.match(
    migration,
    /FROM public\.branches b\s+WHERE b\.branch_kind = 'branch'\s+AND b\.is_active = TRUE/,
  );
  assert.match(migration, /ON CONFLICT \(branch_id, flag_key\) DO UPDATE/);
  assert.match(migration, /enabled = TRUE/);
  assert.match(migration, /disabled_at = NULL/);
  assert.match(migration, /enabled_by = NULL/);
});

test("new branches default to POS sale deduction without re-enabling an explicit override", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.trg_ensure_branch_inventory_location_defaults\(\)[\s\S]*?SECURITY DEFINER/,
  );
  assert.match(migration, /PERFORM public\.ensure_branch_inventory_location_defaults\(NEW\.tenant_id, NEW\.id\)/);
  assert.match(migration, /'pos_stock_outcome_posting'/);
  assert.match(migration, /ON CONFLICT \(branch_id, flag_key\) DO NOTHING/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.trg_ensure_branch_inventory_location_defaults\(\)\s+FROM PUBLIC, anon, authenticated/,
  );
});
