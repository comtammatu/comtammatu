import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const migrationsDir = resolve(root, "supabase/migrations");
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith("_inventory_period_valuation_event_semantics.sql"),
);

test("period valuation counts account events once and reprices only held inventory", () => {
  assert.ok(migrationName, "expected the period valuation semantics migration");
  const migration = readFileSync(resolve(migrationsDir, migrationName), "utf8");

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_inventory_valuation_period_value\(/,
  );
  assert.match(migration, /direct_event_impacts AS/);
  assert.match(migration, /reprice_inventory_impacts AS/);
  assert.match(migration, /event\.value_delta AS value_impact/);
  assert.match(
    migration,
    /event\.event_type NOT IN \(\s*'invoice_reprice',\s*'credit_reprice',\s*'provisional_reprice'/,
  );
  assert.match(
    migration,
    /JOIN public\.inventory_origin_balances AS to_balance\s+ON to_balance\.id = allocation\.to_balance_id/,
  );
  assert.match(
    migration,
    /event\.event_type IN \(\s*'invoice_reprice',\s*'credit_reprice',\s*'provisional_reprice'/,
  );
  assert.doesNotMatch(migration, /from_balance_account/);
  assert.doesNotMatch(migration, /Nguyễn Hữu Thọ|branch_id\s*=\s*3\b/);
});
