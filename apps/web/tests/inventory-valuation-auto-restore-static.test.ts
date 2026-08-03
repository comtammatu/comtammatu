import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const migrationsDir = resolve(root, "supabase/migration-archive");

test("inventory valuation restores confirmed invoices without a shadow gate", () => {
  const migrationName = readdirSync(migrationsDir).find((name) =>
    name.endsWith("_inventory_invoice_valuation_auto_restore.sql"),
  );
  assert.ok(migrationName, "expected the automatic valuation restore migration");

  const migration = readFileSync(resolve(migrationsDir, migrationName), "utf8");
  assert.match(migration, /NEW\.unit_cost := 0/);
  assert.match(migration, /NEW\.cost_pending := TRUE/);
  assert.match(migration, /UPDATE public\.stock_movements/);
  assert.match(migration, /private\.settle_supplier_invoice_valuation/);
  assert.match(migration, /CHECK \(status IN \('inactive', 'active'\)\)/);
  assert.doesNotMatch(migration, /interval '7 days'/);
  assert.doesNotMatch(migration, /supplier_ingredient_price_history/);
});
