import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readActiveMigrationSql } from "./active-migration-sql.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const sqlCoverage = readFileSync(
  resolve(repoRoot, "supabase/tests/inventory_unit_anchor_graph_test.sql"),
  "utf8",
);
const inventoryContract = readFileSync(
  resolve(repoRoot, "docs/ref/inventory.md"),
  "utf8",
);
test("the graph resolver follows selected standard anchors and enforces membership", () => {
  const migration = readActiveMigrationSql();

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.inv_derive_to_base_factor\(\s*p_base_unit_id bigint,\s*p_unit_id bigint,\s*p_is_base boolean,\s*p_anchor_unit_id bigint,\s*p_anchor_factor numeric,\s*p_all_units jsonb\s*\)/,
  );
  assert.match(migration, /LANGUAGE plpgsql STABLE/);
  assert.match(migration, /SET search_path TO ''/);
  assert.match(migration, /v_selected_anchor_count\s+integer/);
  assert.match(migration, /v_selected_anchor_count <> 1/);
  assert.match(migration, /anchor_unit_not_selected/);

  const selectedLookup = migration.indexOf(
    "SELECT count(*), max(nullif(selected->>'anchor_unit_id', '')::bigint)",
  );
  const standardTerminal = migration.indexOf("IF v_hop_is_standard THEN", selectedLookup);
  assert.ok(selectedLookup >= 0, "selected anchors must be resolved from p_all_units");
  assert.ok(
    standardTerminal > selectedLookup,
    "a selected standard row must be inspected before it can be a registry terminal",
  );
  assert.match(migration, /v_chain_dimension IS DISTINCT FROM v_hop_dimension/);
  assert.match(migration, /standard_unit_dimension_mismatch/);
});

test("the catalog resolver validates anchors before accepting a base row", () => {
  const migration = readActiveMigrationSql();

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.inv_catalog_unit_to_base\(\s*p_base_unit_id bigint,\s*p_unit jsonb,\s*p_all_units jsonb\s*\)/,
  );
  const catalogStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.inv_catalog_unit_to_base",
  );
  const catalogSource = migration.slice(catalogStart);
  const membershipCheck = catalogSource.indexOf("v_selected_anchor_count <> 1");
  const baseReturn = catalogSource.indexOf(
    "IF coalesce((p_unit->>'is_base')::boolean, false) THEN",
  );
  assert.ok(membershipCheck >= 0);
  assert.ok(baseReturn > membershipCheck);
  assert.match(migration, /unit_anchor_cycle/);
  assert.match(
    migration,
    /IF p_is_base THEN\s+IF p_anchor_unit_id IS NOT NULL OR p_anchor_factor IS NOT NULL THEN\s+RAISE EXCEPTION 'unit_anchor_cycle'/,
  );
});

test("anchorless standard rows still use the dimension-aware resolver", () => {
  const migration = readActiveMigrationSql();
  const catalogStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.inv_catalog_unit_to_base",
  );
  const catalogSource = migration.slice(catalogStart);

  assert.match(catalogSource, /SELECT is_standard/);
  assert.match(catalogSource, /IF v_unit_is_standard THEN/);
  assert.match(
    catalogSource,
    /RETURN public\.inv_derive_to_base_factor\([\s\S]*?NULL,[\s\S]*?NULL,[\s\S]*?p_all_units/,
  );
});

test("anchorless packaging rows fail closed instead of trusting effective factors", () => {
  const migration = readActiveMigrationSql();
  const catalogStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.inv_catalog_unit_to_base",
  );
  const catalogSource = migration.slice(catalogStart);

  assert.match(catalogSource, /packaging_unit_requires_anchor/);
  assert.doesNotMatch(
    catalogSource,
    /RETURN coalesce\(\(p_unit->>'to_base_factor'\)::numeric, 1\)/,
  );
});

test("anchor and accumulated factors must fit their persisted numeric domains exactly", () => {
  const migration = readActiveMigrationSql();

  assert.match(migration, /anchor_factor_not_representable/);
  assert.match(migration, /effective_factor_not_representable/);
  assert.match(migration, /v_current_factor::text IN \('NaN', 'Infinity', '-Infinity'\)/);
  assert.match(migration, /pg_catalog\.round\(v_current_factor, 9\) IS DISTINCT FROM v_current_factor/);
  assert.match(migration, /v_current_factor >= 1000000000/);
  assert.match(migration, /v_acc_factor::text IN \('NaN', 'Infinity', '-Infinity'\)/);
  assert.match(migration, /pg_catalog\.round\(v_acc_factor, 12\) IS DISTINCT FROM v_acc_factor/);
  assert.match(migration, /v_acc_factor >= 1000000/);
});

test("effective factor bounds apply to stored row finals, not path prefixes", () => {
  const migration = readActiveMigrationSql();
  const multiply = migration.indexOf(
    "v_acc_factor := v_acc_factor * v_current_factor;",
  );
  const selectedLookup = migration.indexOf("SELECT count(*), max(nullif", multiply);
  const directBase = migration.indexOf(
    "IF v_current_anchor = p_base_unit_id THEN",
    selectedLookup,
  );
  const prefixSource = migration.slice(multiply, selectedLookup);
  const directBaseSource = migration.slice(
    directBase,
    migration.indexOf("END IF;", directBase) + "END IF;".length,
  );

  assert.doesNotMatch(prefixSource, /effective_factor_not_representable/);
  assert.match(directBaseSource, /effective_factor_not_representable/);
});

test("direct base helper calls validate identity, existence and selected membership", () => {
  const migration = readActiveMigrationSql();
  const directHelperStart = migration.indexOf("IF p_is_base THEN");
  const directHelperEnd = migration.indexOf(
    "SELECT dimension, is_standard, standard_factor",
    directHelperStart,
  );
  const directHelperSource = migration.slice(directHelperStart, directHelperEnd);
  const catalogStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.inv_catalog_unit_to_base",
  );
  const catalogSource = migration.slice(catalogStart);

  assert.match(directHelperSource, /p_unit_id IS DISTINCT FROM p_base_unit_id/);
  assert.match(directHelperSource, /FROM public\.units/);
  assert.match(directHelperSource, /id = p_base_unit_id/);
  assert.match(migration, /v_selected_base_count\s+integer/);
  assert.match(directHelperSource, /v_selected_base_count <> 1/);
  assert.match(
    directHelperSource,
    /COALESCE\(\(selected->>'is_base'\)::boolean, false\)/,
  );
  assert.match(catalogSource, /v_anchor_factor bigint|v_anchor_factor numeric/);
  assert.match(
    catalogSource,
    /IF v_anchor_unit IS NOT NULL OR v_anchor_factor IS NOT NULL THEN/,
  );
  assert.match(
    catalogSource,
    /RETURN public\.inv_derive_to_base_factor\(\s*p_base_unit_id,\s*v_unit_id,\s*true,/,
  );
});

test("the resolver keeps its existing ACL and numeric storage contract", () => {
  const migration = readActiveMigrationSql();

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.inv_derive_to_base_factor\(\s*bigint, bigint, boolean, bigint, numeric, jsonb\s*\) FROM PUBLIC/,
  );
  assert.match(
    migration,
    /GRANT ALL ON FUNCTION public\.inv_derive_to_base_factor\(\s*bigint, bigint, boolean, bigint, numeric, jsonb\s*\) TO authenticated/,
  );
  assert.match(
    migration,
    /GRANT ALL ON FUNCTION public\.inv_derive_to_base_factor\(\s*bigint, bigint, boolean, bigint, numeric, jsonb\s*\) TO service_role/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.inv_catalog_unit_to_base\(bigint, jsonb, jsonb\)\s+FROM PUBLIC/,
  );
  assert.match(
    migration,
    /GRANT ALL ON FUNCTION public\.inv_catalog_unit_to_base\(bigint, jsonb, jsonb\)\s+TO authenticated/,
  );
  assert.match(
    migration,
    /GRANT ALL ON FUNCTION public\.inv_catalog_unit_to_base\(bigint, jsonb, jsonb\)\s+TO service_role/,
  );
  assert.doesNotMatch(migration, /ALTER TABLE public\.(?:units|ingredient_units)/);
  assert.doesNotMatch(migration, /numeric\s*\(\s*18\s*,/i);
});

test("the transactional SQL contract covers graph success and failure cases", () => {
  assert.match(sqlCoverage, /SET LOCAL ROLE authenticated;/);
  assert.match(sqlCoverage, /Thùng -> Chai -> ml did not persist derived factors/);
  assert.match(sqlCoverage, /selected standard outgoing edge was not followed/);
  assert.match(sqlCoverage, /unselected registry anchor accepted/);
  assert.match(sqlCoverage, /duplicate selected anchor accepted/);
  assert.match(sqlCoverage, /direct cross-dimension standards accepted/);
  assert.match(sqlCoverage, /anchorless cross-dimension standard accepted/);
  assert.match(sqlCoverage, /multi-hop cross-dimension standards accepted/);
  assert.match(sqlCoverage, /self link accepted/);
  assert.match(sqlCoverage, /multi-hop cycle accepted/);
  assert.match(sqlCoverage, /anchored base row accepted/);
  assert.match(sqlCoverage, /direct helper accepted malformed base arguments/);
  assert.match(sqlCoverage, /save RPC accepted an unselected anchor/);
  assert.match(sqlCoverage, /save RPC accepted a duplicate anchor/);
  assert.match(sqlCoverage, /save RPC accepted an anchored base/);
  assert.match(sqlCoverage, /save RPC accepted an anchor cycle/);
  assert.match(sqlCoverage, /save RPC accepted anchorless packaging/);
  assert.match(sqlCoverage, /save RPC accepted NaN/);
  assert.match(sqlCoverage, /save RPC accepted Infinity/);
  assert.match(sqlCoverage, /save RPC accepted -Infinity/);
  assert.match(sqlCoverage, /save RPC accepted zero anchor factor/);
  assert.match(sqlCoverage, /save RPC accepted excess anchor scale/);
  assert.match(sqlCoverage, /save RPC accepted anchor overflow/);
  assert.match(sqlCoverage, /save RPC accepted excess effective scale/);
  assert.match(sqlCoverage, /save RPC accepted effective overflow/);
  assert.match(sqlCoverage, /failed save RPC left partial ingredient data/);
  assert.match(sqlCoverage, /cross-boundary graph did not persist 200000 and 0.1/);
  assert.match(sqlCoverage, /direct base helper accepted mismatched ids/);
  assert.match(sqlCoverage, /direct base helper accepted nonexistent unit/);
  assert.match(sqlCoverage, /direct base helper accepted unselected base/);
  assert.match(sqlCoverage, /catalog helper accepted base anchor_factor without anchor id/);
  assert.match(sqlCoverage, /BEGIN;[\s\S]*ROLLBACK;/);
});

test("the Inventory reference states the enforced database graph contract", () => {
  assert.match(inventoryContract, /Mỗi `anchor_unit_id` khác `NULL` phải khớp đúng một dòng/);
  assert.match(inventoryContract, /Đơn vị không chuẩn bắt buộc\s+có neo/);
  assert.match(inventoryContract, /`numeric\(18,9\)`/);
  assert.match(inventoryContract, /`numeric\(18,12\)`/);
  assert.doesNotMatch(inventoryContract, /hardening\s+follow-up của RPC/);
});
