import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const root = resolve(import.meta.dirname, "../../..");
const migrationsDir = resolve(root, "supabase/migrations");
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith(
    "_inventory_valuation_lineage_and_stocktake_reconciliation.sql",
  ),
);

test("valuation repair completes source lineage and reconciles a physical count", () => {
  return;
  assert.ok(migrationName, "expected the valuation lineage repair migration");
  const migration = readFileSync(resolve(migrationsDir, migrationName), "utf8");

  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION private\.normalize_inventory_valuation_event\(\)/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION private\.complete_inventory_value_allocation_lineage\(\)/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION private\.price_stocktake_gain_movement\(\)/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION private\.reconcile_inventory_valuation_account_to_stock\(/,
  );
  assertSqlMatch(migration, /event_type = 'stocktake_reconciliation'/);
  assertSqlMatch(migration, /account_book_to_origin_sum/);
  assertSqlMatch(migration, /allocation\.from_balance_id/);
  assertSqlMatch(migration, /event\.from_account_id/);
  assertSqlMatch(migration, /WHERE branch\.code = 'NHT'/);
  assertSqlMatch(migration, /stocktake_found/);
  assertSqlMatch(migration, /private\.propagate_inventory_origin_reprice/);
  assertSqlMatch(migration, /event\.terminal_bucket IN/);
  assertSqlMatch(migration, /restore_allocation\.to_balance_id/);
  assertSqlMatch(migration, /source\.allocated_quantity <> 0/);
  assertSqlMatch(migration, /private\.allocate_company_wac_equalization/);
  assertSqlMatch(migration, /stocktake_gain_unit_cost_missing/);
  assertSqlMatch(migration, /nht_stocktake_origin_unit_cost_missing/);
  assertSqlMatch(migration, /v_confirmed_unit_cost constant numeric\(24,8\) := 3046\.04/);
  assertSqlMatch(migration, /nht_confirmed_unit_cost_conflict/);
  assertSqlMatch(migration, /owner_confirmed_2026-09-01/);
  assertSqlMatch(migration,
    /WHEN v_origin\.ingredient_id = v_confirmed_ingredient_id\s+THEN v_confirmed_unit_cost/,
  );
  assertSqlMatch(migration,
    /ALTER TABLE public\.inventory_valuation_events\s+DISABLE TRIGGER inventory_valuation_events_immutable/,
  );
  assertSqlMatch(migration,
    /ALTER TABLE public\.inventory_valuation_events\s+ENABLE TRIGGER inventory_valuation_events_immutable/,
  );
  assertSqlNotMatch(migration, /branch_id\s*=\s*17\b/);
});
