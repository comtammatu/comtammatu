import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const migration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migration-archive/20260710234808_pos_warehouse_menu_availability.sql",
  ),
  "utf8",
);

test("D078 availability follow-up rewires both live capacity routines", () => {
  assert.match(
    migration,
    /compute_menu_item_stock_capacity\(bigint, bigint, bigint\)/,
  );
  assert.match(
    migration,
    /branch_menu_limit_availability\(bigint, bigint, date, boolean, uuid\[\]\)/,
  );
  assert.match(migration, /location_kind = ''kitchen''/);
  assert.match(migration, /location_kind = ''warehouse''/);
  assert.match(migration, /pos_warehouse_availability_rewire_failed/);
});
