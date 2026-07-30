import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationDir = resolve(
  import.meta.dirname,
  "../../../supabase/migrations",
);
const migrationName = readdirSync(migrationDir).find((name) =>
  name.endsWith("_supplier_invoice_gross_vat_entry.sql"),
);

assert.ok(migrationName);
const migration = readFileSync(resolve(migrationDir, migrationName), "utf8");

test("supplier invoice migration stores gross source and locks line invariants", () => {
  assert.match(
    migration,
    /ADD COLUMN pricing_mode text[\s\S]*ADD COLUMN gross_unit_price numeric\(15,2\)[\s\S]*ADD COLUMN gross_line_total numeric\(15,2\)/,
  );
  assert.match(
    migration,
    /pricing_mode IN \('gross_total', 'unit_price'\)/,
  );
  assert.match(
    migration,
    /line_total = gross_line_total - vat_amount/,
  );
  assert.match(migration, /supplier_invoice_money_scale_invalid/);
  assert.match(migration, /supplier_invoice_line_invalid/);
});

test("supplier invoice migration derives matching from net lines and secures RPC", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.apply_supplier_invoice_matching/,
  );
  assert.match(
    migration,
    /invoice_line\.line_total[\s\S]*allocation\.billed_quantity[\s\S]*invoice_line\.quantity/,
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
  assert.match(
    migration,
    /'unit_price',[\s\S]*?\(line\.value->>'line_total'\)::numeric[\s\S]*?\/ \(line\.value->>'quantity'\)::numeric,[\s\S]*?'line_discount',[\s\S]*?0/,
  );
  assert.match(
    migration,
    /line_discount_amount = source\.line_discount/,
  );
});
