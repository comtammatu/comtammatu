import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const migrationsRoot = path.join(repoRoot, "supabase", "migrations");

function readMigration(): string {
  const filename = readdirSync(migrationsRoot).find((candidate) =>
    candidate.endsWith("_ensure_drink_cup_menu_recipes.sql"),
  );
  assert.ok(filename, "ensure_drink_cup_menu_recipes migration must exist");
  return readFileSync(path.join(migrationsRoot, filename), "utf8");
}

test("drink cup recipe add is additive and skips empty catalogs", () => {
  const sql = readMigration();
  assert.match(sql, /name = 'Nước'/);
  assert.match(sql, /Ly nhựa trơn PP 95 - 650ml/);
  assert.match(sql, /unit\.code = 'cái'/);
  assert.match(sql, /ON CONFLICT \(menu_item_id, ingredient_id, tenant_id\)/);
  assert.match(sql, /ensure_drink_cup_menu_recipes_nuoc_missing; skip/);
  assert.doesNotMatch(sql, /DELETE FROM public\.recipes/);
  assert.doesNotMatch(sql, /upsert_recipe_lines\s*\(/);
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
    assert.match(sql, new RegExp(`'${name}'`));
  }
  assert.doesNotMatch(sql, /'Nước Suối'/);
  assert.doesNotMatch(sql, /'Khăn Lạnh'/);
  assert.doesNotMatch(sql, /'Dụng cụ mang về'/);
  assert.doesNotMatch(sql, /Ly nhựa 65-140ml sọc/);
});

test("canned drink cup add backfills only missing sale_consumption", () => {
  const sql = readMigration();
  const proof = readFileSync(
    path.join(repoRoot, "supabase/tests/drink_cup_menu_recipes_test.sql"),
    "utf8",
  );
  assert.match(sql, /post_pos_sale_consumption_if_ready/);
  assert.match(
    sql,
    /item\.name IN \(\s*'Coca Cola',\s*'Fanta Cam',\s*'Fanta Xá Xị',\s*'Sprite'\s*\)/,
  );
  assert.match(proof, /all nine drink recipes must consume 1 cái 650ml cup/);
  assert.match(proof, /cup upsert must keep other BOM lines/);
  assert.match(
    proof,
    /chai\/towel\/takeaway pack must not consume the drink cup/,
  );
});
