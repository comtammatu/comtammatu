import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const readRepo = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const migration = readRepo(
  "supabase/migration-archive/20260706170000_inventory_unit_system_phase_a2_catalog_anchor.sql",
);
const unitLadderLockMigration = readRepo(
  "supabase/migration-archive/20260706024311_inventory_unit_ladder_lock_by_stock_movements.sql",
);
const ingredientActions = readRepo(
  "apps/web/app/(protected)/inventory/ingredient-actions.ts",
);

test("A2 redefines the catalog upsert to derive to_base_factor from anchors", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.upsert_ingredient_catalog\(/,
  );
  // The Phase A2 persisted factor and purchase_to_measure_factor migration
  // path both flow through the shared resolver for anchored rows.
  assert.match(
    migration,
    /public\.inv_catalog_unit_to_base\(v_base_unit_id, e, p_units\)/,
    "the ingredient_units INSERT must derive to_base_factor via the resolver",
  );
  assert.match(
    migration,
    /v_factor := 1\.0 \/ public\.inv_catalog_unit_to_base\(v_base_unit_id, v_secondary, p_units\)/,
    "purchase_to_measure_factor must use the derived secondary factor",
  );
});

test("A2 persists the anchor pair on ingredient_units", () => {
  assert.match(migration, /anchor_unit_id, anchor_factor,/);
  assert.match(migration, /nullif\(e->>'anchor_unit_id', ''\)::bigint/);
  assert.match(migration, /nullif\(e->>'anchor_factor', ''\)::numeric/);
});

test("A2 resolver derives anchored rows via the tenant-scoped Phase A helper", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.inv_catalog_unit_to_base\(/,
  );
  assert.match(migration, /LANGUAGE plpgsql STABLE/);
  assert.match(migration, /SET search_path TO ''/);
  // The resolver reads no tables itself; anchored rows delegate to
  // inv_derive_to_base_factor, which scopes tenant from auth_tenant_id().
  assert.match(
    migration,
    /RETURN public\.inv_derive_to_base_factor\(/,
    "anchored rows must derive through the Phase A helper",
  );
});

test("A2 resolver keeps a positive-guarded factor for anchorless rows", () => {
  // A non-base packaging row without an anchor keeps its client factor so the
  // currently-deployed dialog still saves during the apply -> deploy window.
  assert.match(
    migration,
    /RETURN coalesce\(\(p_unit->>'to_base_factor'\)::numeric, 1\)/,
  );
  assert.match(
    migration,
    /nullif\(e->>'anchor_unit_id', ''\) IS NULL\s+AND coalesce\(\(e->>'to_base_factor'\)::numeric, 0\) <= 0/,
    "the positive-factor guard must apply only to anchorless non-base rows",
  );
});

test("A2 locks the new resolver to authenticated/service_role and keeps the RPC grant", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.inv_catalog_unit_to_base\(bigint, jsonb, jsonb\) FROM PUBLIC/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.inv_catalog_unit_to_base\(bigint, jsonb, jsonb\) TO authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT ALL ON FUNCTION public\.upsert_ingredient_catalog\([^)]*\) TO authenticated, service_role/,
  );
});

test("A2 blocks unit ladder rewrites once ledger movements exist", () => {
  const guardIndex = unitLadderLockMigration.indexOf(
    "inventory_unit_ladder_locked_by_stock_movements",
  );
  const replaceIndex = unitLadderLockMigration.indexOf(
    "DELETE FROM public.ingredient_units WHERE ingredient_id = v_id",
  );

  assert.ok(guardIndex > 0, "the catalog upsert must expose a stable lock code");
  assert.ok(
    replaceIndex > guardIndex,
    "the lock must run before replacing ingredient_units",
  );
  assert.match(
    unitLadderLockMigration,
    /FROM public\.stock_movements sm\s+WHERE sm\.tenant_id = v_tenant\s+AND sm\.ingredient_id = v_id/,
    "the guard must be driven by existing ledger movements",
  );
  assert.match(
    unitLadderLockMigration,
    /iu\.is_base\s+AND iu\.unit_id IS DISTINCT FROM v_base_unit_id/,
    "base unit changes would reinterpret stock_levels quantities",
  );
  assert.match(
    unitLadderLockMigration,
    /public\.inv_catalog_unit_to_base\(v_base_unit_id, incoming\.e, p_units\)/,
    "used entry units must keep the same derived base factor",
  );
});

test("ingredient actions surface locked unit ladders with operator-safe copy", () => {
  assert.match(
    ingredientActions,
    /inventory_unit_ladder_locked_by_stock_movements/,
  );
  assert.match(
    ingredientActions,
    /Nguyên liệu đã có lịch sử tồn kho; không thể đổi đơn vị tồn chuẩn hoặc quy đổi về tồn chuẩn\./,
  );
  assert.match(
    ingredientActions,
    /mapCatalogRpcError\(error\.code, error\.message\)/,
  );
});
