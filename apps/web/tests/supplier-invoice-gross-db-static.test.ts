import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationDir = resolve(
  import.meta.dirname,
  "../../../supabase/migrations",
);
const migrationName = readdirSync(migrationDir).find((name) =>
  name.endsWith("_supplier_invoice_net_unit_price.sql"),
);

assert.ok(migrationName);
const migration = readFileSync(resolve(migrationDir, migrationName), "utf8");

test("supplier invoice migration backfills NET unit price and locks additive line invariants", () => {
  assert.match(
    migration,
    /UPDATE public\.supplier_invoice_lines[\s\S]*SET unit_price = CASE[\s\S]*\(line_total \+ line_discount_amount\) \/ quantity/,
  );
  assert.match(
    migration,
    /gross_line_total = line_total \+ vat_amount/,
  );
  assert.match(migration, /supplier_invoice_money_scale_invalid/);
  assert.match(migration, /supplier_invoice_line_invalid/);
});

test("supplier invoice migration drops the gross-first pricing evidence columns", () => {
  assert.match(migration, /DROP COLUMN IF EXISTS pricing_mode/);
  assert.match(migration, /DROP COLUMN IF EXISTS gross_unit_price/);
  assert.doesNotMatch(migration, /ADD COLUMN pricing_mode/);
  assert.doesNotMatch(migration, /pricing_mode IN \('gross_total', 'unit_price'\)/);
});

test("supplier invoice migration keeps matching on net lines and secures RPC", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.enforce_supplier_invoice_gross_contract/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.save_supplier_invoice_draft/,
  );
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.save_supplier_invoice_draft\([\s\S]*FROM PUBLIC, anon/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.save_supplier_invoice_draft\([\s\S]*TO authenticated, service_role/,
  );
  assert.match(migration, /quantity \* .*unit_price/);
  assert.match(migration, /line_discount_amount/);
  assert.match(migration, /gross_line_total = line_total \+ vat_amount/);
});
