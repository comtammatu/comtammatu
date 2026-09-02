import { resolve } from "node:path";
import { test } from "node:test";
import { readActiveMigrationSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const root = resolve(import.meta.dirname, "../../..");
const _migrationsDir = resolve(root, "supabase/migrations");

test("invoice-backed valuation bootstrap is atomic and preserves history", () => {
  const migration = readActiveMigrationSql(root);

  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.get_inventory_valuation_bootstrap_readiness\(\)/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.prepare_inventory_valuation_cutover\(\s*p_idempotency_key uuid\s*\)/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.activate_inventory_valuation_cutover\(\s*p_idempotency_key uuid\s*\)/,
  );
  assertSqlMatch(migration, /SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assertSqlMatch(migration, /public\.auth_is_owner\(auth\.uid\(\)\)/);

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
    assertSqlMatch(migration, new RegExp(blocker));
  }

  assertSqlMatch(migration, /type NOT IN \('grn_receipt', 'grn_amend'\)/);
  assertSqlMatch(migration, /document_discount_amount/);
  assertSqlNotMatch(migration, /pg_catalog\.nullif\s*\(/);
  assertSqlMatch(migration,
    /nullif\(\s*pg_catalog\.sum\(line\.line_total\) OVER \([\s\S]*?\),\s*0::numeric\s*\)/,
  );
  assertSqlMatch(migration,
    /nullif\(ranked\.line_quantity,\s*0::numeric\)/,
  );
  assertSqlMatch(migration,
    /position = ranked\.line_count[\s\S]*document_discount_amount[\s\S]*UNBOUNDED PRECEDING AND 1 PRECEDING/,
  );
  assertSqlMatch(migration,
    /coalesce\(billed\.billed_base_quantity, 0\) =\s*receipt\.accepted_base_quantity/,
  );
  assertSqlMatch(migration, /v_cutover_exists boolean/);
  assertSqlMatch(migration, /v_unrepresentable_pool_count integer/);
  assertSqlMatch(migration,
    /private\.inventory_valuation_bootstrap_value_is_representable\(/,
  );
  assertSqlMatch(migration,
    /LOCK TABLE\s+public\.stock_levels[\s\S]*public\.supplier_invoice_receipt_allocations[\s\S]*IN SHARE ROW EXCLUSIVE MODE/,
  );
  assertSqlMatch(migration, /confirmed_net_inventory_amount/);
  assertSqlMatch(migration, /valuation_status = 'opening'/);
  assertSqlMatch(migration, /interval '7 days'/);
  assertSqlMatch(migration, /UPDATE public\.stock_levels/);
  assertSqlNotMatch(migration, /UPDATE public\.stock_movements/);
  assertSqlNotMatch(migration, /UPDATE public\.grn_items/);
  assertSqlNotMatch(migration, /unit_price_est|ingredients?\.unit_cost/);
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION[\s\S]*get_inventory_valuation_bootstrap_readiness\(\)[\s\S]*FROM PUBLIC, anon/,
  );
  assertSqlMatch(migration,
    /GRANT EXECUTE ON FUNCTION[\s\S]*get_inventory_valuation_bootstrap_readiness\(\)[\s\S]*TO authenticated, service_role/,
  );
  assertSqlMatch(migration,
    /private\.prepare_inventory_valuation_cutover_prebootstrap\(uuid\),[\s\S]*private\.activate_inventory_valuation_cutover_prebootstrap\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
});

test("invoice-backed valuation bootstrap reloads the PostgREST schema cache", () => {
  const migration = readActiveMigrationSql(root);
  assertSqlMatch(migration, /NOTIFY pgrst, 'reload schema';/);
});
