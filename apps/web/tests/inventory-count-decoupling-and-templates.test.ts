import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { buildCountSlipLineView } from "../lib/inventory/count-slip-model";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("count slip line view prioritizes snapshot conversion factor over current master unit factor", () => {
  // Master unit table might now say 1 thùng = 30 lon, but when staff counted it was 24 lon
  const line = buildCountSlipLineView({
    id: 101,
    ingredientId: 12,
    ingredientName: "Coca Cola",
    systemQuantity: 48, // 48 lon at time of snapshot
    countedQuantity: 2, // counted 2 thùng
    entryUnitId: 5,
    entryUnitCode: "thùng",
    baseUnitCode: "lon",
    toBaseFactor: 30, // Current master data factor
    entryToBaseFactor: 24, // Snapshotted factor on the slip line
    countedBaseQuantity: 48,
    currentLiveQuantity: 60, // Current live stock (60 lon / 24 = 2.5 thùng)
    note: null,
  });

  // System qty in entry unit should use the snapshotted factor (48 / 24 = 2 thùng)
  assert.equal(line.systemQuantity, 2);
  assert.equal(line.systemUnit, "thùng");
  assert.equal(line.countedQuantity, 2);
  assert.equal(line.countedUnit, "thùng");
  assert.equal(line.countedBaseQuantity, 48);
  assert.equal(line.variance, 0); // 2 - 2 = 0
  assert.equal(line.currentLiveQuantity, 2.5); // 60 / 24 = 2.5
});

test("count slip line view shows live stock without mutating snapshot variance", () => {
  const line = buildCountSlipLineView({
    id: 102,
    ingredientId: 15,
    ingredientName: "Rau Má Tươi",
    systemQuantity: 10,
    countedQuantity: 8,
    entryUnitId: 1,
    entryUnitCode: "kg",
    baseUnitCode: "kg",
    toBaseFactor: 1,
    entryToBaseFactor: 1,
    countedBaseQuantity: 8,
    currentLiveQuantity: 6, // Sold 2kg after count was submitted
    note: "Hao hụt lá úa",
  });

  // Snapshot variance is based on systemQuantity at submission (8 - 10 = -2)
  assert.equal(line.systemQuantity, 10);
  assert.equal(line.countedQuantity, 8);
  assert.equal(line.variance, -2);
  assert.equal(line.currentLiveQuantity, 6);
});

test("migration and actions confirm count slip approval is decoupled from stock movements", () => {
  const migration = read(
    "supabase/migrations/20260826163516_inventory_role_count_and_snapshot_decouple.sql",
  );
  const backfill = migration.slice(
    migration.indexOf("-- Backfill"),
    migration.indexOf("-- ─── 4."),
  );
  const actions = read(
    "apps/web/app/(protected)/inventory/count-slips/actions.ts",
  );

  // Migration should drop count_adjustment movement insertions
  assert.doesNotMatch(
    migration,
    /movement_type\s*:=\s*'count_adjustment'/,
    "Approve RPC must not post count_adjustment stock movements",
  );
  assert.match(
    migration,
    /status\s*=\s*'approved'/,
    "Approve RPC must flip slip status to approved",
  );
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.inventory_count_templates/,
    "Migration must create inventory_count_templates table",
  );
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.inventory_count_template_items/,
    "Migration must create inventory_count_template_items table",
  );
  assert.match(
    migration,
    /FUNCTION public\.set_inventory_count_assignments_by_template/,
    "Migration must create set_inventory_count_assignments_by_template RPC",
  );
  assert.doesNotMatch(
    backfill,
    /inv_to_base_for_tenant/,
    "Migration backfill must not require a request-scoped JWT tenant",
  );
  assert.match(
    backfill,
    /ingredient_unit\.tenant_id = line\.tenant_id/,
    "Migration backfill must scope conversion factors to each row tenant",
  );

  // Actions should not expose adjustedLines
  assert.doesNotMatch(actions, /adjustedLines: Number/);
  assert.match(actions, /alreadyApproved: raw\.already_approved === true/);
});

test("branch count assignments presents Station Templates", () => {
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  );
  const actions = read(
    "apps/web/app/(protected)/inventory/count-assignments/actions.ts",
  );
  const messages = read(
    "packages/shared/src/messages/inventory.ts",
  );

  assert.match(client, /setCountAssignmentsByTemplate/);
  assert.match(client, /INVENTORY_VI\.countAssignStationTitle/);
  assert.match(messages, /countAssignStationTitle:\s*"Phân công theo Vai trò ca"/);
  assert.match(actions, /setCountAssignmentsByTemplate/);
  assert.match(actions, /p_template_id/);
});
