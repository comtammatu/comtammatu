import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const prodBaseline = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/00000000000000_baseline.sql",
  ),
  "utf8",
);
const historicalWarehouseAvailabilityRepair = readFileSync(
  resolve(
    repoRoot,
    "supabase/migration-archive/20260710234808_pos_warehouse_menu_availability.sql",
  ),
  "utf8",
);

function readPgDumpObject(source: string, createPrefix: string): string {
  const start = source.indexOf(createPrefix);
  assert.notEqual(start, -1, `missing pg_dump object: ${createPrefix}`);
  const end = source.indexOf("\n\n--\n-- Name:", start + createPrefix.length);
  assert.notEqual(end, -1, `unterminated pg_dump object: ${createPrefix}`);
  return source.slice(start, end);
}

test("PROD baseline reads both live menu-capacity routines from branch warehouse stock", () => {
  const computeCapacityRpc = readPgDumpObject(
    prodBaseline,
    "CREATE FUNCTION public.compute_menu_item_stock_capacity(",
  );
  const menuAvailabilityRpc = readPgDumpObject(
    prodBaseline,
    "CREATE FUNCTION public.branch_menu_limit_availability(",
  );

  assert.match(
    computeCapacityRpc,
    /location_kind = 'warehouse'/,
  );
  assert.match(
    menuAvailabilityRpc,
    /location_kind = 'warehouse'/,
  );
  assert.doesNotMatch(computeCapacityRpc, /location_kind = 'kitchen'/);
  assert.doesNotMatch(menuAvailabilityRpc, /location_kind = 'kitchen'/);
});

test("historical D078 repair rewired both routines and verified the result", () => {
  assert.match(
    historicalWarehouseAvailabilityRepair,
    /compute_menu_item_stock_capacity\(bigint, bigint, bigint\)/,
  );
  assert.match(
    historicalWarehouseAvailabilityRepair,
    /branch_menu_limit_availability\(bigint, bigint, date, boolean, uuid\[\]\)/,
  );
  assert.match(historicalWarehouseAvailabilityRepair, /location_kind = ''kitchen''/);
  assert.match(historicalWarehouseAvailabilityRepair, /location_kind = ''warehouse''/);
  assert.match(historicalWarehouseAvailabilityRepair, /pos_warehouse_availability_rewire_failed/);
});
