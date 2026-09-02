import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readActiveMigrationSql } from "./_lib/active-sql.ts";


const repoRoot = path.resolve(import.meta.dirname, "../../..");
const _migrationsRoot = path.join(repoRoot, "supabase", "migrations");

function readMigrationBySuffix(_suffix: string): string {
  return readActiveMigrationSql(repoRoot);
}

test("bill_line_items snapshots vat_rate for bill tax lines", () => {
  const migration = readMigrationBySuffix(
    "_receipt_print_ex_vat_line_amounts.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.bill_line_items\(p_order_id bigint\)/,
  );
  assert.match(migration, /'vat_rate',\s*oi\.vat_rate/);
  assert.match(migration, /oi\.unit_price, oi\.modifiers, oi\.sides, oi\.vat_rate, mc\.type/);
});

test("later bill_line_items snapshot sums item discount without changing the merge key", () => {
  const migration = readMigrationBySuffix(
    "_self_order_guest_promotion_code.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.bill_line_items\(p_order_id bigint\)/,
  );
  assert.match(migration, /'discount_amount', COALESCE\(SUM\(oi\.discount_amount\), 0\)/);
  assert.match(migration, /'discount_note', MAX\(oi\.discount_note\)/);
  assert.match(
    migration,
    /oi\.unit_price, oi\.modifiers, oi\.sides, oi\.vat_rate, mc\.type/,
  );
});
