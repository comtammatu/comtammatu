import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const readRepo = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const migration = readRepo(
  "supabase/migrations/20260706170000_inventory_unit_system_phase_a2_catalog_anchor.sql",
);

test("A2 redefines the catalog upsert to derive to_base_factor from anchors", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.upsert_ingredient_catalog\(/,
  );
  // Persisted factor and legacy purchase_to_measure_factor both flow through the
  // shared resolver, never a raw client to_base_factor for anchored rows.
  assert.match(
    migration,
    /public\.inv_catalog_unit_to_base\(v_base_unit_id, e, p_units\)/,
    "the ingredient_units INSERT must derive to_base_factor via the resolver",
  );
  assert.match(
    migration,
    /v_factor := 1\.0 \/ public\.inv_catalog_unit_to_base\(v_base_unit_id, v_secondary, p_units\)/,
    "legacy purchase_to_measure_factor must use the derived secondary factor",
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

test("A2 resolver keeps a positive-guarded legacy fallback for anchorless rows", () => {
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
