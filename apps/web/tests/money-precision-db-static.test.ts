import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const migrationsRoot = path.join(repoRoot, "supabase", "migrations");
const sqlRegression = readFileSync(
  path.join(repoRoot, "supabase", "tests", "money_precision_contract_test.sql"),
  "utf8",
);

function readMoneyPrecisionMigration() {
  const filename = readdirSync(migrationsRoot).find((candidate) =>
    candidate.endsWith("_money_precision_contract.sql"),
  );
  assert.ok(filename, "money precision migration must exist");
  return readFileSync(path.join(migrationsRoot, filename), "utf8");
}

function readMoneyPrecisionCoalesceFix() {
  const filename = readdirSync(migrationsRoot).find((candidate) =>
    candidate.endsWith("_fix_money_precision_coalesce.sql"),
  );
  assert.ok(filename, "money precision COALESCE fix migration must exist");
  return readFileSync(path.join(migrationsRoot, filename), "utf8");
}

test("expense VAT trigger rejects excess scale before normalization", () => {
  const migration = readMoneyPrecisionMigration();

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.normalize_expense_vat_breakdown/);
  assert.match(migration, /v_raw_taxable_amount numeric/);
  assert.match(migration, /v_raw_vat_amount numeric/);
  assert.match(
    migration,
    /v_raw_taxable_amount\s*<> pg_catalog\.round\(v_raw_taxable_amount, 2\)/,
  );
  assert.match(migration, /expense_vat_amount_scale_invalid/);
});

test("supplier invoice RPC validates raw money scale and exact normalized totals", () => {
  const migration = readMoneyPrecisionMigration();

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.save_supplier_invoice_draft/);
  assert.match(migration, /line\.unit_price <> pg_catalog\.round\(line\.unit_price, 2\)/);
  assert.match(migration, /line\.quantity <> pg_catalog\.round\(line\.quantity, 3\)/);
  assert.match(migration, /supplier_invoice_money_scale_invalid/);
  assert.match(migration, /GREATEST\([\s\S]*?0::numeric/);
  assert.doesNotMatch(migration, /> 1\s/);
});

test("migration carries read-only anomaly audit queries without data repair", () => {
  const migration = readMoneyPrecisionMigration();

  assert.match(migration, /money_precision_audit_expense_header_mismatch/);
  assert.match(migration, /money_precision_audit_supplier_header_mismatch/);
  assert.match(migration, /money_precision_audit_pos_fractional_amount/);
  assert.doesNotMatch(migration, /\bUPDATE\s+public\.(?:expenses|supplier_invoice)/i);
});

test("SQL regression rejects supplier money with more than two decimals", () => {
  assert.match(sqlRegression, /'unit_price', '1\.001'/);
  assert.match(sqlRegression, /supplier_invoice_money_scale_invalid/);
  assert.match(sqlRegression, /SQLSTATE '22023'/);
});

test("supplier invoice wrapper uses SQL COALESCE with matching numeric types", () => {
  const migration = readMoneyPrecisionCoalesceFix();

  assert.match(migration, /v_raw_discount := COALESCE\(/);
  assert.match(migration, /0::numeric/);
  assert.doesNotMatch(migration, /pg_catalog\.coalesce/);
});
