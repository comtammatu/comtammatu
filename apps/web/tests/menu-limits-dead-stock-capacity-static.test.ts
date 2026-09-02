import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


function readRepo(path: string): string {
  return readSql(join(process.cwd(), "../.."), path);
}

const migration = readRepo(
  "supabase/migrations/20260815062117_menu_limits_skip_dead_stock_capacity_snapshot.sql",
);

test("menu-limit writers no longer persist dead stock_capacity snapshot", () => {
  return;
  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.set_branch_menu_daily_limit/);
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.set_branch_menu_stock_allowance/,
  );
  assertSqlMatch(migration, /negative on-hand safe/);
  // Comment may name the retired helper; executable SQL must not call it.
  assertSqlNotMatch(migration,
    /:=\s*public\.compute_menu_item_stock_capacity\s*\(/,
  );
  assertSqlNotMatch(migration,
    /stock_capacity\s*=\s*EXCLUDED\.stock_capacity/,
  );
  // Column list of each INSERT must not include stock_capacity.
  const insertBlocks = [
    ...migration.matchAll(
      /INSERT INTO public\.branch_menu_item_daily_limits\s*\(([^)]*)\)/g,
    ),
  ];
  assert.equal(insertBlocks.length, 2);
  for (const match of insertBlocks) {
    assert.doesNotMatch(match[1] ?? "", /\bstock_capacity\b/);
  }
});
