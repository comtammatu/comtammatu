import assert from "node:assert/strict";
import { test } from "node:test";
import { readActiveMigrationSql, readSql, assertSqlMatch } from "./_lib/active-sql.ts";


function read(path: string): string {
  return readSql(process.cwd(), path);
}

const ownerStockPage = read("app/(protected)/inventory/stock/page.tsx");
const ownerStockClient = read(
  "app/(protected)/inventory/stock/stock-client.tsx",
);
const branchStockPage = read(
  "app/(protected)/br/[branchId]/(operator)/stock/on-hand/page.tsx",
);
const branchStockClient = read(
  "app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
);
const thresholdsData = read("lib/inventory/branch-thresholds-data.ts");
const thresholdsDialog = read(
  "app/components/inventory/branch-stock-thresholds-dialog.tsx",
);
const stockActions = read("app/(protected)/inventory/stock-actions.ts");
const inventoryMessages = read("lib/messages/inventory.ts");

test("stock location selection is URL-owned on owner and branch surfaces", () => {
  for (const source of [ownerStockClient, branchStockClient]) {
    assert.match(source, /usePathname/);
    assert.match(source, /useSearchParams/);
    assert.match(source, /params\.set\("location", value\)/);
    assert.doesNotMatch(source, /const \[selectedLocation, setSelectedLocation\]/);
  }
});

test("branch threshold reads and writes require an explicit inventory location", () => {
  assert.match(
    ownerStockPage,
    /loadBranchStockThresholdsData\(branchId, initialLocationId\)/,
  );
  assert.match(
    branchStockPage,
    /loadBranchStockThresholdsData\(data\.branchId, initialLocationId\)/,
  );
  assert.match(
    thresholdsData,
    /get_branch_stock_thresholds[\s\S]*p_location_id: locationId/,
  );
  assert.match(thresholdsData, /\.eq\("location_id", locationId\)/);
  assert.match(stockActions, /locationId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/);
  assert.match(stockActions, /p_location_id: data\.locationId/);
  assert.match(thresholdsDialog, /locationId/);
});

test("Kho-Bếp controls expose threshold setup and atomic intra-site transfer", () => {
  assert.match(branchStockPage, /loadIntraSiteTransferData/);
  assert.match(ownerStockPage, /loadIntraSiteTransferData/);
  for (const source of [ownerStockClient, branchStockClient]) {
    assert.match(source, /BranchStockThresholdsDialog/);
    assert.match(source, /IntraSiteTransferDialog/);
  }
});

test("every store branch owns mandatory Kho and Bếp locations", () => {
  const migration = readActiveMigrationSql();

  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.ensure_branch_inventory_location_defaults/,
  );
  const clearDefaultsIndex = migration.indexOf(
    "SET is_default_receive = FALSE,",
  );
  const warehouseSelectionIndex = migration.indexOf("INTO v_warehouse_id");
  assert.ok(
    clearDefaultsIndex >= 0 && clearDefaultsIndex < warehouseSelectionIndex,
    "existing defaults must be cleared before replacement locations are selected",
  );
  assertSqlMatch(migration, /v_branch_kind = 'branch'[\s\S]*'kitchen'/);
  assertSqlMatch(migration,
    /is_default_consumption = CASE[\s\S]*v_branch_kind = 'branch' THEN id = v_kitchen_id/,
  );
  assertSqlMatch(migration,
    /FOR branch_row IN[\s\S]*branch_kind IN \('branch', 'central_supply', 'central_kitchen'\)/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.trg_ensure_branch_inventory_location_defaults\(\)[\s\S]*NEW\.branch_kind IN \('branch', 'central_supply', 'central_kitchen'\)/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION private\.enforce_mandatory_branch_kitchen_flag[\s\S]*NEW\.enabled IS DISTINCT FROM TRUE[\s\S]*CREATE TRIGGER branch_kitchen_topology_mandatory/,
  );
  assertSqlMatch(migration,
    /IF TG_OP = 'DELETE' THEN[\s\S]*IF v_branch_kind = 'branch' THEN[\s\S]*branch_kitchen_topology_mandatory[\s\S]*RETURN OLD/,
  );
  assertSqlMatch(migration,
    /OLD\.flag_key = 'branch_kitchen_inventory_split'[\s\S]*NEW\.flag_key IS DISTINCT FROM OLD\.flag_key[\s\S]*NEW\.branch_id IS DISTINCT FROM OLD\.branch_id/,
  );
  assertSqlMatch(migration,
    /v_branch_kind IN \('central_supply', 'central_kitchen'\)[\s\S]*DELETE FROM public\.branch_feature_flags[\s\S]*flag_key = 'branch_kitchen_inventory_split'/,
  );
  assertSqlMatch(migration, /DROP FUNCTION public\.prepare_branch_kitchen_split/);
  assertSqlMatch(migration, /DROP FUNCTION public\.set_branch_kitchen_split/);
});

test("stock UI treats Kho-Bếp as topology, not an owner feature toggle", () => {
  assert.doesNotMatch(ownerStockPage, /loadBranchKitchenSplitStatus/);
  assert.doesNotMatch(ownerStockClient, /BranchKitchenSplitDialog/);
  assert.doesNotMatch(stockActions, /prepareBranchKitchenSplitAction/);
  assert.doesNotMatch(stockActions, /setBranchKitchenSplitAction/);
  assert.doesNotMatch(inventoryMessages, /Thiết lập Kho \/ Bếp/);
});
