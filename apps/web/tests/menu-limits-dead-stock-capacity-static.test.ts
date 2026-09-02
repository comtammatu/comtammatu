import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

const migration = readRepo(
  "supabase/migration-archive/20260815062117_menu_limits_skip_dead_stock_capacity_snapshot.sql",
);

test("menu-limit writers no longer persist dead stock_capacity snapshot", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.set_branch_menu_daily_limit/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.set_branch_menu_stock_allowance/,
  );
  assert.match(migration, /negative on-hand safe/);
  // Comment may name the retired helper; executable SQL must not call it.
  assert.doesNotMatch(
    migration,
    /:=\s*public\.compute_menu_item_stock_capacity\s*\(/,
  );
  assert.doesNotMatch(
    migration,
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
