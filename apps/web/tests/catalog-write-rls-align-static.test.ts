import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  extractSqlFunction,
  listActiveMigrationFiles,
  readActiveMigrationSql,
  readSql,
} from "./_lib/active-sql.ts";

const root = resolve(process.cwd(), "../..");
const activeSql = readActiveMigrationSql(root);

function extractLastPolicy(source: string, name: string): string {
  const matches = [
    ...source.matchAll(
      new RegExp(`CREATE POLICY ${name}\\b[\\s\\S]*?;`, "g"),
    ),
  ];
  const last = matches.at(-1)?.[0] ?? "";
  assert.notEqual(last, "", `missing policy ${name}`);
  return last;
}

function latestMigration(suffix: string): string {
  const files = listActiveMigrationFiles(root).filter((file) =>
    file.endsWith(`_${suffix}.sql`),
  );
  const file = files.at(-1);
  assert.ok(file, `missing migration ${suffix}`);
  return readSql(root, `supabase/migrations/${file}`);
}

const CATEGORY_WRITE = [
  "ingredient_categories_insert",
  "ingredient_categories_update",
  "ingredient_categories_delete",
] as const;

const UNIT_WRITE = [
  "units_insert",
  "units_update",
  "units_delete",
] as const;

const INGREDIENT_WRITE = [
  "ingredients_insert",
  "ingredients_update",
  "ingredients_delete",
] as const;

test("ingredient_categories write RLS is catalog_write plus Kho Tong adapter", () => {
  for (const name of CATEGORY_WRITE) {
    const policy = extractLastPolicy(activeSql, name);
    assert.match(policy, /has_permission_any\('inventory:catalog_write'/);
    assert.match(policy, /has_position\('central_supply_ops'/);
    assert.doesNotMatch(policy, /inventory:write/);
    assert.doesNotMatch(policy, /auth_role\(\)\s*=\s*'owner'/);
  }
});

test("units write RLS keeps units_master, catalog_write, and Kho Tong adapter", () => {
  for (const name of UNIT_WRITE) {
    const policy = extractLastPolicy(activeSql, name);
    assert.match(policy, /has_permission_any\('inventory:units_master'/);
    assert.match(policy, /has_permission_any\('inventory:catalog_write'/);
    assert.match(policy, /has_position\('central_supply_ops'/);
    assert.doesNotMatch(policy, /auth_role\(\)\s*=\s*'owner'/);
  }
});

test("ingredients write RLS matches catalog_write, not inventory:write stock", () => {
  for (const name of INGREDIENT_WRITE) {
    const policy = extractLastPolicy(activeSql, name);
    assert.match(policy, /has_permission_any\('inventory:catalog_write'/);
    assert.match(policy, /has_position\('central_supply_ops'/);
    assert.doesNotMatch(policy, /inventory:write/);
  }

  const select = extractLastPolicy(activeSql, "ingredients_select");
  assert.match(select, /inventory:read/);
});

test("catalog_write_rls_align keeps the ADR 0045 Kho Tong adapter", () => {
  const migration = latestMigration("catalog_write_rls_align");
  const policies = [...migration.matchAll(/CREATE POLICY[\s\S]*?;/g)]
    .map((match) => match[0])
    .join("\n");
  assert.match(policies, /has_position\('central_supply_ops'/);
  assert.doesNotMatch(policies, /auth_role\(\)/);

  const save = extractSqlFunction(activeSql, "save_ingredient_catalog");
  assert.notEqual(save, "");
  assert.match(save, /has_position\('central_supply_ops'\)/);
});
