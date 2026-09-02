import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { readActiveMigrationSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = path.resolve(import.meta.dirname, "../../..");
const _migrationsRoot = path.join(repoRoot, "supabase", "migrations");
const sqlRegression = readFileSync(
  path.join(repoRoot, "supabase", "tests", "money_precision_contract_test.sql"),
  "utf8",
);

function readMoneyPrecisionMigration() {
  return readActiveMigrationSql(repoRoot);
}

function readMoneyPrecisionCoalesceFix() {
  return readActiveMigrationSql(repoRoot);
}

test("expense VAT trigger rejects excess scale before normalization", () => {
  const migration = readMoneyPrecisionMigration();

  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.normalize_expense_vat_breakdown/);
  assertSqlMatch(migration, /v_raw_taxable_amount numeric/);
  assertSqlMatch(migration, /v_raw_vat_amount numeric/);
  assertSqlMatch(migration,
    /v_raw_taxable_amount\s*<> pg_catalog\.round\(v_raw_taxable_amount, 2\)/,
  );
  assertSqlMatch(migration, /expense_vat_amount_scale_invalid/);
});

test("supplier invoice RPC validates raw money scale and exact normalized totals", () => {
  const migration = readMoneyPrecisionMigration();

  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.save_supplier_invoice_draft/);
  assertSqlMatch(migration, /line\.unit_price <> pg_catalog\.round\(line\.unit_price, 2\)/);
  assertSqlMatch(migration, /line\.quantity <> pg_catalog\.round\(line\.quantity, 3\)/);
  assertSqlMatch(migration, /supplier_invoice_money_scale_invalid/);
  assertSqlMatch(migration, /GREATEST\([\s\S]*?0::numeric/);
  assertSqlNotMatch(migration, /> 1\s/);
});

test("migration carries read-only anomaly audit queries without data repair", () => {
  const migration = readMoneyPrecisionMigration();

  assertSqlMatch(migration, /money_precision_audit_expense_header_mismatch/);
  assertSqlMatch(migration, /money_precision_audit_supplier_header_mismatch/);
  assertSqlMatch(migration, /money_precision_audit_pos_fractional_amount/);
  assertSqlNotMatch(migration, /\bUPDATE\s+public\.(?:expenses|supplier_invoice)/i);
});

test("SQL regression rejects supplier money with more than two decimals", () => {
  assert.match(sqlRegression, /'unit_price', '1\.001'/);
  assert.match(sqlRegression, /supplier_invoice_money_scale_invalid/);
  assert.match(sqlRegression, /SQLSTATE '22023'/);
});

test("supplier invoice wrapper uses SQL COALESCE with matching numeric types", () => {
  const migration = readMoneyPrecisionCoalesceFix();

  assertSqlMatch(migration, /v_raw_discount := COALESCE\(/);
  assertSqlMatch(migration, /0::numeric/);
  assertSqlNotMatch(migration, /pg_catalog\.coalesce/);
});
