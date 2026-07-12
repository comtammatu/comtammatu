import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { canonicalizeImportedUnitCode } from "../lib/inventory/unit-codes";

const repoRoot = resolve(process.cwd(), "../..");
const readRepo = (path: string) =>
  readFileSync(resolve(repoRoot, path), "utf8");

const migration = readRepo(
  "supabase/migrations/20260712022515_canonicalize_unit_codes_and_category_policy.sql",
);

test("Vietnamese unit inputs normalize only at import boundaries", () => {
  assert.equal(canonicalizeImportedUnitCode("chai"), "bottle");
  assert.equal(canonicalizeImportedUnitCode("thùng"), "case");
  assert.equal(canonicalizeImportedUnitCode("lon"), "tin_can");
  assert.equal(canonicalizeImportedUnitCode("can"), "jerrycan");
  assert.equal(canonicalizeImportedUnitCode("portion"), "portion");
});

test("unit migration preserves ids and assigns collision-safe machine codes", () => {
  for (const expected of [
    "('chai', 'bottle', 'chai')",
    "('thùng', 'case', 'thùng')",
    "('lon', 'tin_can', 'lon')",
    "('can', 'jerrycan', 'can')",
  ]) {
    assert.ok(
      migration.includes(expected),
      `expected unit mapping ${expected}`,
    );
  }
  assert.match(migration, /SET code = 'zz_canonical_unit_20260712_'/);
  assert.match(migration, /WHERE target\.unit_id = u\.id/);
  assert.match(migration, /CONSTRAINT units_code_machine_chk/);
  assert.match(migration, /\^\[a-z\]\[a-z0-9_\]\*\$/);
});

test("category review policy follows category ids instead of mutable names", () => {
  assert.match(migration, /ADD COLUMN category_id bigint/);
  assert.match(migration, /PRIMARY KEY \(tenant_id, category_id\)/);
  assert.match(
    migration,
    /FOREIGN KEY \(category_id, tenant_id\)[\s\S]*?REFERENCES public\.ingredient_categories \(id, tenant_id\)/,
  );
  assert.match(migration, /DROP COLUMN category/);
  assert.match(migration, /policy\.category_id = ing\.category_id/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.inventory_requires_manual_review\(bigint\)[\s\S]*?FROM anon, authenticated/,
  );
});

test("unit actions keep machine code and display name separate", () => {
  const actions = readRepo(
    "apps/web/app/(protected)/inventory/settings/units/units-actions.ts",
  );
  assert.match(actions, /name: data\.name/);
  assert.doesNotMatch(actions, /name: data\.code/);
  assert.match(actions, /\^\[a-z\]\[a-z0-9_\]\*\$/);
});
