import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const migrationsDir = resolve(root, "supabase/migration-archive");
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith(
    "_inventory_valuation_lineage_and_stocktake_reconciliation.sql",
  ),
);

test("valuation repair completes source lineage and reconciles a physical count", () => {
  assert.ok(migrationName, "expected the valuation lineage repair migration");
  const migration = readFileSync(resolve(migrationsDir, migrationName), "utf8");

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.normalize_inventory_valuation_event\(\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.complete_inventory_value_allocation_lineage\(\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.price_stocktake_gain_movement\(\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.reconcile_inventory_valuation_account_to_stock\(/,
  );
  assert.match(migration, /event_type = 'stocktake_reconciliation'/);
  assert.match(migration, /account_book_to_origin_sum/);
  assert.match(migration, /allocation\.from_balance_id/);
  assert.match(migration, /event\.from_account_id/);
  assert.match(migration, /WHERE branch\.code = 'NHT'/);
  assert.match(migration, /stocktake_found/);
  assert.match(migration, /private\.propagate_inventory_origin_reprice/);
  assert.match(migration, /event\.terminal_bucket IN/);
  assert.match(migration, /restore_allocation\.to_balance_id/);
  assert.match(migration, /source\.allocated_quantity <> 0/);
  assert.match(migration, /private\.allocate_company_wac_equalization/);
  assert.match(migration, /stocktake_gain_unit_cost_missing/);
  assert.match(migration, /nht_stocktake_origin_unit_cost_missing/);
  assert.match(migration, /v_confirmed_unit_cost constant numeric\(24,8\) := 3046\.04/);
  assert.match(migration, /nht_confirmed_unit_cost_conflict/);
  assert.match(migration, /owner_confirmed_2026-09-01/);
  assert.match(
    migration,
    /WHEN v_origin\.ingredient_id = v_confirmed_ingredient_id\s+THEN v_confirmed_unit_cost/,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.inventory_valuation_events\s+DISABLE TRIGGER inventory_valuation_events_immutable/,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.inventory_valuation_events\s+ENABLE TRIGGER inventory_valuation_events_immutable/,
  );
  assert.doesNotMatch(migration, /branch_id\s*=\s*17\b/);
});
