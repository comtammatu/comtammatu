import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { readActiveMigrationSql, assertSqlNotMatch } from "./_lib/active-sql.ts";


const root = resolve(import.meta.dirname, "../../..");
const _migrationsDir = resolve(root, "supabase/migrations");
test("period valuation counts account events once and reprices only held inventory", () => {
  const migration = readActiveMigrationSql(root);

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
  assertSqlNotMatch(migration, /from_balance_account/);
  assertSqlNotMatch(migration, /Nguyễn Hữu Thọ|branch_id\s*=\s*3\b/);
});
