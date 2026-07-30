import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const migrationsDir = resolve(root, "supabase/migrations");

test("invoice-backed valuation bootstrap is atomic and preserves history", () => {
  const migrationNames = readdirSync(migrationsDir).filter((name) =>
    name.endsWith("_inventory_valuation_invoice_backed_bootstrap.sql"),
  );
  assert.equal(
    migrationNames.length,
    1,
    "expected one invoice-backed valuation bootstrap migration",
  );

  const migration = readFileSync(
    resolve(migrationsDir, migrationNames[0]!),
    "utf8",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_inventory_valuation_bootstrap_readiness\(\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.prepare_inventory_valuation_cutover\(\s*p_idempotency_key uuid\s*\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.activate_inventory_valuation_cutover\(\s*p_idempotency_key uuid\s*\)/,
  );
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assert.match(migration, /public\.auth_is_owner\(auth\.uid\(\)\)/);

  for (const blocker of [
    "inventory_valuation_bootstrap_cutover_exists",
    "inventory_valuation_bootstrap_missing_invoice_coverage",
    "inventory_valuation_bootstrap_unsupported_movement",
    "inventory_valuation_bootstrap_ledger_not_pristine",
    "inventory_valuation_bootstrap_zero_value_pool",
    "inventory_valuation_bootstrap_value_not_representable",
    "inventory_valuation_quantity_drift",
    "inventory_valuation_shadow_period_incomplete",
  ]) {
    assert.match(migration, new RegExp(blocker));
  }

  assert.match(migration, /type NOT IN \('grn_receipt', 'grn_amend'\)/);
  assert.match(migration, /document_discount_amount/);
  assert.doesNotMatch(migration, /pg_catalog\.nullif\s*\(/);
  assert.match(
    migration,
    /nullif\(\s*pg_catalog\.sum\(line\.line_total\) OVER \([\s\S]*?\),\s*0::numeric\s*\)/,
  );
  assert.match(
    migration,
    /nullif\(ranked\.line_quantity,\s*0::numeric\)/,
  );
  assert.match(
    migration,
    /position = ranked\.line_count[\s\S]*document_discount_amount[\s\S]*UNBOUNDED PRECEDING AND 1 PRECEDING/,
  );
  assert.match(
    migration,
    /coalesce\(billed\.billed_base_quantity, 0\) =\s*receipt\.accepted_base_quantity/,
  );
  assert.match(migration, /v_cutover_exists boolean/);
  assert.match(migration, /v_unrepresentable_pool_count integer/);
  assert.match(
    migration,
    /private\.inventory_valuation_bootstrap_value_is_representable\(/,
  );
  assert.match(
    migration,
    /LOCK TABLE\s+public\.stock_levels[\s\S]*public\.supplier_invoice_receipt_allocations[\s\S]*IN SHARE ROW EXCLUSIVE MODE/,
  );
  assert.match(migration, /confirmed_net_inventory_amount/);
  assert.match(migration, /valuation_status = 'opening'/);
  assert.match(migration, /interval '7 days'/);
  assert.match(migration, /UPDATE public\.stock_levels/);
  assert.doesNotMatch(migration, /UPDATE public\.stock_movements/);
  assert.doesNotMatch(migration, /UPDATE public\.grn_items/);
  assert.doesNotMatch(migration, /unit_price_est|ingredients?\.unit_cost/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION[\s\S]*get_inventory_valuation_bootstrap_readiness\(\)[\s\S]*FROM PUBLIC, anon/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION[\s\S]*get_inventory_valuation_bootstrap_readiness\(\)[\s\S]*TO authenticated, service_role/,
  );
  assert.match(
    migration,
    /private\.prepare_inventory_valuation_cutover_prebootstrap\(uuid\),[\s\S]*private\.activate_inventory_valuation_cutover_prebootstrap\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
});

test("invoice-backed valuation bootstrap reloads the PostgREST schema cache", () => {
  const migrationNames = readdirSync(migrationsDir).filter((name) =>
    name.endsWith("_inventory_valuation_bootstrap_schema_reload.sql"),
  );
  assert.equal(
    migrationNames.length,
    1,
    "expected one tracked bootstrap schema-cache reload migration",
  );

  const migration = readFileSync(
    resolve(migrationsDir, migrationNames[0]!),
    "utf8",
  );
  assert.match(migration, /NOTIFY pgrst, 'reload schema';/);
});
