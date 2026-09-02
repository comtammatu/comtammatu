import { resolve } from "node:path";
import { test } from "node:test";
import { readActiveMigrationSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const root = resolve(import.meta.dirname, "../../..");
const _migrationsDir = resolve(root, "supabase/migrations");

test("inventory valuation restores confirmed invoices without a shadow gate", () => {
  const migration = readActiveMigrationSql(root);
  assertSqlMatch(migration, /NEW\.unit_cost := 0/);
  assertSqlMatch(migration, /NEW\.cost_pending := TRUE/);
  assertSqlMatch(migration, /UPDATE public\.stock_movements/);
  assertSqlMatch(migration, /private\.settle_supplier_invoice_valuation/);
  assertSqlMatch(migration, /CHECK \(status IN \('inactive', 'active'\)\)/);
  assertSqlNotMatch(migration, /interval '7 days'/);
  assertSqlNotMatch(migration, /supplier_ingredient_price_history/);
});
