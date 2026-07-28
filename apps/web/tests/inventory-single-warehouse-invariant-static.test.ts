import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const migration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/20260728180429_enforce_single_active_warehouse_per_site.sql",
  ),
  "utf8",
);
const acceptanceTest = readFileSync(
  resolve(
    repoRoot,
    "supabase/tests/inventory_single_warehouse_invariant_test.sql",
  ),
  "utf8",
);

test("active sites are constrained to one canonical warehouse", () => {
  assert.match(
    migration,
    /CONSTRAINT inventory_locations_active_site_warehouse_chk/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX inventory_locations_one_active_per_site_idx/,
  );
  assert.match(
    migration,
    /CREATE CONSTRAINT TRIGGER trg_inventory_locations_active_site_warehouse/,
  );
  assert.match(
    migration,
    /CREATE CONSTRAINT TRIGGER trg_branches_active_site_warehouse/,
  );
  assert.match(migration, /inventory_location_consolidation_required/);
  assert.match(migration, /sl\.current_quantity IS DISTINCT FROM 0/);
});

test("inventory routing is warehouse-only and acceptance-tested", () => {
  for (const signature of [
    "branch_manager_approve_consumption_report(bigint,bigint)",
    "consume_stock_for_order(bigint)",
    "consume_stock_for_order_service(bigint,uuid)",
    "create_production_run_with_locations(bigint,bigint,numeric,bigint,text,bigint,jsonb,bigint,bigint)",
    "get_production_recipe_context_for_location(bigint,bigint,bigint)",
  ]) {
    assert.ok(migration.includes(`public.${signature}`), signature);
    assert.ok(acceptanceTest.includes(`public.${signature}`), signature);
  }

  assert.match(migration, /'location_kind = ''kitchen'''/);
  assert.match(migration, /'location_kind = ''production_storage'''/);
  assert.match(acceptanceTest, /active_legacy_location_was_accepted/);
  assert.match(acceptanceTest, /second_active_warehouse_was_accepted/);
  assert.match(acceptanceTest, /active_site_without_warehouse_was_accepted/);
});
