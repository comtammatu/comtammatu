import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { readActiveMigrationSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const _migrationDir = resolve(
  import.meta.dirname,
  "../../../supabase/migrations",
);
const migration = readActiveMigrationSql();
const poFirstWorkflowTest = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../supabase/tests/po_first_purchase_workflow_test.sql",
  ),
  "utf8",
);

test("supplier invoice migration backfills NET unit price and locks additive line invariants", () => {
  assertSqlMatch(migration,
    /UPDATE public\.supplier_invoice_lines[\s\S]*SET unit_price = CASE[\s\S]*\(line_total \+ line_discount_amount\) \/ quantity/,
  );
  assertSqlMatch(migration,
    /gross_line_total = line_total \+ vat_amount/,
  );
  assertSqlMatch(migration, /supplier_invoice_money_scale_invalid/);
  assertSqlMatch(migration, /supplier_invoice_line_invalid/);
});

test("supplier invoice migration drops the gross-first pricing evidence columns", () => {
  assertSqlMatch(migration, /DROP COLUMN IF EXISTS pricing_mode/);
  assertSqlMatch(migration, /DROP COLUMN IF EXISTS gross_unit_price/);
  assertSqlNotMatch(migration, /ADD COLUMN pricing_mode/);
  assertSqlNotMatch(migration, /pricing_mode IN \('gross_total', 'unit_price'\)/);
});

test("po-first workflow SQL test sends additive NET unit_price payload", () => {
  assert.match(poFirstWorkflowTest, /'unit_price',\s*100/);
  assert.doesNotMatch(poFirstWorkflowTest, /'pricing_mode'/);
  assert.doesNotMatch(poFirstWorkflowTest, /'gross_unit_price'/);
});

test("supplier invoice migration keeps matching on net lines and secures RPC", () => {
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION private\.enforce_supplier_invoice_gross_contract/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.save_supplier_invoice_draft/,
  );
  assertSqlMatch(migration, /SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION public\.save_supplier_invoice_draft\([\s\S]*FROM PUBLIC, anon/,
  );
  assertSqlMatch(migration,
    /GRANT EXECUTE ON FUNCTION public\.save_supplier_invoice_draft\([\s\S]*TO authenticated, service_role/,
  );
  assertSqlMatch(migration, /quantity \* .*unit_price/);
  assertSqlMatch(migration, /line_discount_amount/);
  assertSqlMatch(migration, /gross_line_total = line_total \+ vat_amount/);
});
