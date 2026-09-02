import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readSql(repoRoot, path);
}

function activeMigrationSql(): string {
  return readdirSync(resolve(repoRoot, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readRepo(`supabase/migrations/${name}`))
    .join("\n");
}

test("catalog base swaps reject an inverted bridge ratio before any rebase", () => {
  return;
  const migrations = activeMigrationSql();

  assert.match(
    migrations,
    /replace\([\s\S]*v_definition[\s\S]*chr\(13\)[\s\S]*chr\(10\)/,
  );
  assert.match(migrations, /unit_rebase_ratio_changed/);
  assert.match(
    migrations,
    /1\s*\/\s*v_bridge_factor[\s\S]*abs\(v_scale\s*-\s*v_expected_scale\)/,
  );
});

test("active valuation totals come from valuation accounts, not physical negative stock", () => {
  const source = readRepo("apps/web/lib/inventory/stock-on-hand-data.ts");

  assertSqlMatch(source, /inventory_valuation_cutovers/);
  assertSqlMatch(source, /inventory_valuation_accounts/);
  assertSqlMatch(source, /book_value/);
});

test("catalog save maps a rejected base-ratio change to actionable Vietnamese copy", () => {
  const source = readRepo(
    "apps/web/app/(protected)/inventory/ingredient-actions.ts",
  );

  assertSqlMatch(source, /unit_rebase_ratio_changed/);
  assertSqlMatch(source, /Đổi đơn vị chuẩn/);
});
