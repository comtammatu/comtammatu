import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const hardeningSql = readRepo(
  "supabase/migrations/_archive/20260629144952_ingredient_catalog_tenant_scope_hardening.sql",
);

test("ingredient catalog tenant-scope hardening enforces new cross-tenant rows", () => {
  for (const constraint of [
    "ingredient_units_ingredient_tenant_fkey",
    "ingredient_units_unit_tenant_fkey",
    "ingredients_category_tenant_fkey",
  ]) {
    assert.match(
      hardeningSql,
      new RegExp(`${constraint}[\\s\\S]*NOT VALID`),
      constraint,
    );
  }

  assert.match(
    hardeningSql,
    /LEFT JOIN public\.units u[\s\S]*u\.tenant_id = v_tenant[\s\S]*u\.is_active/,
  );
  assert.match(
    hardeningSql,
    /FROM public\.ingredient_categories[\s\S]*tenant_id = v_tenant[\s\S]*AND is_active/,
  );
  assert.match(
    hardeningSql,
    /WHERE ingredient_id = p_ingredient_id[\s\S]*AND unit_id = p_unit_id[\s\S]*AND tenant_id = public\.auth_tenant_id\(\)/,
  );
});

test("ingredient catalog callable RPC privileges are explicit", () => {
  assert.match(
    hardeningSql,
    /REVOKE ALL ON FUNCTION public\.upsert_ingredient_catalog[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    hardeningSql,
    /GRANT EXECUTE ON FUNCTION public\.upsert_ingredient_catalog[\s\S]*TO authenticated;/,
  );
  assert.match(
    hardeningSql,
    /REVOKE ALL ON FUNCTION public\.inv_to_base\(bigint, bigint, numeric\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    hardeningSql,
    /GRANT EXECUTE ON FUNCTION public\.inv_to_base\(bigint, bigint, numeric\) TO authenticated;/,
  );
});
