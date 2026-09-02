import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { readActiveMigrationSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = path.resolve(import.meta.dirname, "../../..");
const _migrationsRoot = path.join(repoRoot, "supabase", "migrations");

function readMigration(): string {
  return readActiveMigrationSql(repoRoot);
}

test("drink cup recipe add is additive and skips empty catalogs", () => {
  const sql = readMigration();
  assertSqlMatch(sql, /name = 'Nước'/);
  assertSqlMatch(sql, /Ly nhựa trơn PP 95 - 650ml/);
  assertSqlMatch(sql, /unit\.code = 'cái'/);
  assertSqlMatch(sql, /ON CONFLICT \(menu_item_id, ingredient_id, tenant_id\)/);
  assertSqlMatch(sql, /ensure_drink_cup_menu_recipes_nuoc_missing; skip/);
  assertSqlNotMatch(sql, /DELETE FROM public\.recipes/);
  assertSqlNotMatch(sql, /upsert_recipe_lines\s*\(/);
});

test("drink cup recipe covers house drinks and canned lon, not chai or extras", () => {
  const sql = readMigration();
  for (const name of [
    "Cam Ép",
    "Coca Cola",
    "Fanta Cam",
    "Fanta Xá Xị",
    "Nước Sâm",
    "Rau Má",
    "Sprite",
    "Trà Đá",
    "Trà Tắc",
  ]) {
    assertSqlMatch(sql, new RegExp(`'${name}'`));
  }
  assertSqlNotMatch(sql, /'Nước Suối'/);
  assertSqlNotMatch(sql, /'Khăn Lạnh'/);
  assertSqlNotMatch(sql, /'Dụng cụ mang về'/);
  assertSqlNotMatch(sql, /Ly nhựa 65-140ml sọc/);
});

test("canned drink cup add backfills only missing sale_consumption", () => {
  const sql = readMigration();
  const proof = readFileSync(
    path.join(repoRoot, "supabase/tests/drink_cup_menu_recipes_test.sql"),
    "utf8",
  );
  assertSqlMatch(sql, /post_pos_sale_consumption_if_ready/);
  assertSqlMatch(sql,
    /item\.name IN \(\s*'Coca Cola',\s*'Fanta Cam',\s*'Fanta Xá Xị',\s*'Sprite'\s*\)/,
  );
  assert.match(proof, /all nine drink recipes must consume 1 cái 650ml cup/);
  assert.match(proof, /cup upsert must keep other BOM lines/);
  assert.match(
    proof,
    /chai\/towel\/takeaway pack must not consume the drink cup/,
  );
});
