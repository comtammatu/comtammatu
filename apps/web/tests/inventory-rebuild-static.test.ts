import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const readRepo = (path: string) =>
  readFileSync(resolve(repoRoot, path), "utf8");
const readWeb = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const migration = readRepo(
  "supabase/migration-archive/20260619121446_inventory_rebuild_consumption_central_sites.sql",
);
const centralTransferMigration = readRepo(
  "supabase/migration-archive/20260622041251_allow_central_supply_central_kitchen_transfers.sql",
);
const branchKitchenTransferMigration = readRepo(
  "supabase/migration-archive/20260706084210_branch_kitchen_stock_transfer.sql",
);
const branchKitchenCleanupMigration = readRepo(
  "supabase/migration-archive/20260706084153_branch_kitchen_location_cleanup.sql",
);
const consumptionSourceStockMigration = readRepo(
  "supabase/migration-archive/20260706084325_fix_consumption_source_stock.sql",
);

function extractSqlFunctionBody(
  functionName: string,
  source = migration,
): string {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${escapedName}[\\s\\S]*?\\n\\$\\$;`,
    ),
  );
  assert.ok(match, `missing SQL function ${functionName}`);
  return match[0];
}

test.skip("central site kinds are valid and branch kitchen transfers are allowed", () => {
  assert.match(
    migration,
    /CHECK \(branch_kind IN \('branch', 'central_supply', 'central_kitchen'\)\)/,
    "branch_kind must include Kho Tổng and Bếp Trung Tâm site kinds",
  );
  assert.match(
    migration,
    /p_kind NOT IN \('branch', 'central_supply', 'central_kitchen'\)/,
    "set_branch_kind must accept only the inventory site kinds",
  );
  assert.match(
    migration,
    /branch_kind IN \('branch', 'central_supply', 'central_kitchen'\)/,
    "PO/GRN procurement sites should include branch and central sites",
  );
  assert.match(
    migration,
    /v_from_kind IN \('central_supply', 'central_kitchen'\) AND v_to_kind = 'branch'/,
    "central supply and central kitchen should transfer into branches",
  );
  assert.match(
    centralTransferMigration,
    /v_from_kind = 'central_supply' AND v_to_kind = 'central_kitchen'/,
    "Kho Tổng should transfer into Bếp Trung Tâm",
  );
  assert.match(
    centralTransferMigration,
    /v_from_kind = 'central_kitchen' AND v_to_kind = 'central_supply'/,
    "Bếp Trung Tâm should transfer back into Kho Tổng",
  );
  assert.match(
    centralTransferMigration,
    /v_from_kind = 'branch' AND v_to_kind IN \('central_supply', 'central_kitchen'\)/,
    "Kho CN return/rebalance should transfer into central sites",
  );
  assert.match(
    branchKitchenTransferMigration,
    /DROP CONSTRAINT IF EXISTS stock_transfers_no_intra_branch_new/,
    "same-branch branch kitchen transfers must no longer be blocked by table constraint",
  );
  assert.match(
    branchKitchenTransferMigration,
    /IF NEW\.from_branch_id = NEW\.to_branch_id[\s\S]*v_from_kind = 'branch'[\s\S]*RETURN NEW/,
    "direction trigger should allow same-branch transfer only for branch sites",
  );
});

test.skip("branch consumption approval posts sale consumption from branch kitchen when configured", () => {
  const approveConsumption = extractSqlFunctionBody(
    "branch_manager_approve_consumption_report",
    consumptionSourceStockMigration,
  );

  assert.match(
    approveConsumption,
    /b\.branch_kind = 'branch' AND il\.location_kind = 'kitchen'/,
    "branch kitchen should remain the first candidate when it can cover the report",
  );
  assert.match(approveConsumption, /cs\.is_default_consumption DESC/);
  assert.match(
    approveConsumption,
    /COUNT\(sl\.ingredient_id\) AS matched_lines/,
  );
  assert.match(
    approveConsumption,
    /BOOL_AND\(COALESCE\(sl\.current_quantity, 0\) >= rl\.quantity\) AS stock_ready/,
    "approval should only select a source location that has enough stock for every line",
  );
  assert.match(approveConsumption, /cs\.matched_lines = v_line_count/);
  assert.match(approveConsumption, /AND cs\.wac_ready/);
  assert.match(approveConsumption, /AND cs\.stock_ready/);
  assert.match(
    approveConsumption,
    /OR il\.is_default_issue = true[\s\S]*OR il\.location_kind = 'warehouse'/,
    "approval should still fall back to the issue warehouse when branch kitchen is missing",
  );
  assert.match(approveConsumption, /'consumption'/);
  assert.match(approveConsumption, /'sale_consumption'/);
  assert.match(approveConsumption, /'hrm_consumption'/);
});

test.skip("consumption route is first-class while issues route remains compatible", () => {
  const routeResolution = readRepo(
    "packages/shared/src/auth/route-resolution.ts",
  );
  const inventoryPaths = readWeb("app/(protected)/inventory/_lib/paths.ts");
  const consumptionPage = readWeb(
    "app/(protected)/inventory/consumption/page.tsx",
  );
  const consumptionDetailPage = readWeb(
    "app/(protected)/inventory/consumption/[id]/page.tsx",
  );
  const issuesShim = readWeb("app/(protected)/inventory/issues/page.tsx");
  const issuesClient = readWeb(
    "app/(protected)/inventory/issues/issues-client.tsx",
  );
  const issueDetailClient = readWeb(
    "app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );

  assert.match(routeResolution, /"\/inventory\/consumption"/);
  assert.match(
    inventoryPaths,
    /consumption: joinInventoryPath\(base, "\/consumption"\)/,
  );
  assert.match(
    consumptionPage,
    /import \{ IssuesPageContent \} from "\.\.\/issues\/issues-page-content"/,
  );
  assert.match(consumptionPage, /scope="all"/);
  assert.match(consumptionPage, /listBasePath="\/inventory\/consumption"/);
  assert.match(
    consumptionPage,
    /detailBasePath="\/inventory\/consumption"/,
  );
  assert.match(
    consumptionDetailPage,
    /import \{ IssueDetailPageContent \} from "\.\.\/\.\.\/issues\/issue-detail-page-content"/,
  );
  assert.match(
    consumptionDetailPage,
    /listBasePath="\/inventory\/consumption"/,
  );
  assert.match(issuesShim, /redirect\([\s\S]*\/inventory\/consumption/);
  assert.match(issuesClient, /\/inventory\/consumption/);
  assert.match(issueDetailClient, /\/inventory\/consumption/);
  // Copy moved to the message catalog (i18n sweep) — pin the ref in the
  // component and the value in the catalog.
  assert.match(issueDetailClient, /ISSUES_VI\.surface\.consumption/);
  assert.match(readWeb("lib/messages/inventory.ts"), /Phiếu tiêu hao/);
  assert.match(issuesPage, /\.from\("stock_movements"\)/);
  assert.match(issuesPage, /created_at, reason/);
  assert.match(issuesPage, /\.eq\("type", "consumption"\)/);
  assert.match(issuesPage, /\.eq\("movement_subtype", "sale_consumption"\)/);
  assert.match(
    issuesPage,
    /recordedBranchId=\{branchFilter \?\? claims\.branch_id \?\? null\}/,
  );
  assert.match(issuesPage, /movementSourceLabel\(row\.reason\)/);
  assert.match(issuesPage, /parseBusinessDateParam\(params\.startDate\)/);
  assert.match(issuesPage, /parseBusinessDateParam\(params\.endDate\)/);
  assert.match(
    issuesPage,
    /\.gte\(\s*"created_at",\s*vnBusinessDateBoundaryUtc\(startDate\),\s*\)/,
  );
  assert.match(
    issuesPage,
    /\.lt\(\s*"created_at",\s*vnBusinessDateBoundaryUtc\(endDate, 1\),\s*\)/,
  );
  assert.match(
    issuesPage,
    /if \(!hasRecordedDateFilter\) \{[\s\S]*\.limit\(50\)/,
    "recorded consumption ledger should remove the 50-row cap when date-filtered",
  );
  assert.match(issuesClient, /recordedConsumptions/);
  assert.match(issuesClient, /INVENTORY_VI\.recordedConsumptionTitle/);
  assert.match(issuesClient, /useSearchParams/);
  assert.match(issuesClient, /startDate/);
  assert.match(issuesClient, /endDate/);
  assert.match(issuesClient, /selectedRecordedBranchId/);
  assert.match(issuesClient, /BRANCH_VI\.selectAll/);
  assert.match(issuesClient, /INVENTORY_VI\.recordedSearchPlaceholder/);
  assert.match(issuesClient, /INVENTORY_VI\.totalAmountLabel/);
  assert.match(issuesClient, /sourceLabel/);
  assert.match(issuesClient, /tieu-hao-da-ghi-nhan/);
});

test.skip("stock and inventory value include branch kitchen stock locations", () => {
  const stockBearing = readWeb(
    "app/(protected)/inventory/_lib/stock-bearing-locations.ts",
  );
  const stockData = readWeb("lib/inventory/stock-on-hand-data.ts");
  const inventoryValue = readWeb(
    "app/(protected)/inventory/inventory-value-actions.ts",
  );
  const reportActions = readWeb("app/(protected)/inventory/report-actions.ts");
  const financeCockpit = readWeb(
    "app/(protected)/finance/_lib/finance-cockpit.ts",
  );

  assert.match(stockBearing, /locationKind === "warehouse"/);
  assert.match(
    stockBearing,
    /siteKind === "central_kitchen" && locationKind === "production_storage"/,
  );
  assert.match(
    stockBearing,
    /siteKind === "branch" && locationKind === "kitchen"/,
    "Bếp CN/kitchen is branch stock again",
  );

  for (const [name, source] of [
    ["stock loader", stockData],
    ["inventory value", inventoryValue],
    ["finance inventory tied cash", financeCockpit],
  ] as const) {
    assert.match(
      source,
      /fetchStockBearingLocationIds/,
      `${name} should use stock-bearing location filtering`,
    );
    assert.match(
      source,
      /\.in\("location_id", stockBearingLocationIds\)/,
      `${name} should filter by stock-bearing location ids`,
    );
  }
  const stockModel = readWeb("lib/inventory/stock-on-hand-model.ts");
  assert.match(
    stockData,
    /inventory_locations \( id, name, code, location_kind \)/,
    "stock loader should fetch location metadata for per-location display",
  );
  assert.match(
    stockData,
    /const locationMap = new Map/,
    "stock loader should preserve location breakdown beside aggregate quantity",
  );

  const stockClient = readWeb(
    "app/(protected)/inventory/stock/stock-client.tsx",
  );
  const stockMessages = readWeb("lib/messages/inventory.ts");
  const branchStockClient = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  );
  const stockBreakdown = readWeb(
    "app/(protected)/inventory/stock/stock-location-breakdown.tsx",
  );
  assert.match(stockModel, /locationBreakdown\?: StockLocationBreakdown/);
  assert.doesNotMatch(stockClient, /locationFilterOptions/);
  assert.doesNotMatch(stockClient, /locationFilterControl/);
  assert.doesNotMatch(branchStockClient, /locationFilterOptions/);
  assert.match(stockClient, /StockLocationBreakdownLine/);
  assert.match(stockMessages, /locationWarehouse: "Kho"/);
  assert.match(stockMessages, /locationKitchen: "Bếp"/);
  assert.match(branchStockClient, /StockLocationSummary/);
  assert.match(stockModel, /avgUnitCost: number \| null/);
  assert.match(stockModel, /lastCountedAt: string \| null/);
  assert.match(stockModel, /locationKind === "kitchen"/);
  assert.match(stockBreakdown, /stockLocationLabel/);

  // Movement report delegates stock-bearing filtering to the SECURITY DEFINER
  // RPC, which replicates the same predicate in SQL.
  assert.match(
    reportActions,
    /supabase\.rpc\("get_stock_movement_report"/,
    "movement report should call the get_stock_movement_report RPC",
  );
  assert.match(
    branchKitchenTransferMigration,
    /il\.location_kind = 'warehouse'/,
  );
  assert.match(
    branchKitchenTransferMigration,
    /b\.branch_kind = 'branch' AND il\.location_kind = 'kitchen'/,
  );
  assert.match(
    branchKitchenTransferMigration,
    /branch_kind = 'central_kitchen' AND il\.location_kind = 'production_storage'/,
  );
  assert.match(branchKitchenCleanupMigration, /'Bếp CN'/);
  assert.match(branchKitchenCleanupMigration, /is_default_consumption = TRUE/);
  assert.match(
    branchKitchenCleanupMigration,
    /INSERT INTO public\.stock_levels[\s\S]*current_quantity[\s\S]*SELECT[\s\S]*0,/,
    "cleanup migration should seed zero kitchen stock rows without changing quantities",
  );
});

test("stock never exposes a location filter", () => {
  const stockClient = readWeb(
    "app/(protected)/inventory/stock/stock-client.tsx",
  );
  const branchStockClient = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  );

  assert.doesNotMatch(stockClient, /locationFilterOptions|locationFilterControl/);
  assert.doesNotMatch(branchStockClient, /locationFilterOptions|locationFilterControl/);
});

test.skip("finance gross profit uses actual approved consumption, not mv_food_cost", () => {
  const financeCockpit = readWeb(
    "app/(protected)/finance/_lib/finance-cockpit.ts",
  );

  assert.match(
    financeCockpit,
    /function buildKpis\(\{[\s\S]*actualFoodCostRows/,
  );
  assert.match(financeCockpit, /\.from\("stock_movements"\)/);
  assert.match(financeCockpit, /\.eq\("type", "consumption"\)/);
  assert.match(
    financeCockpit,
    /\.eq\("movement_subtype", "sale_consumption"\)/,
  );
  assert.match(
    financeCockpit,
    /Math\.abs\(toNumber\(row\.quantity_change\)\) \* toNumber\(row\.unit_cost\)/,
  );
  assert.match(
    financeCockpit,
    /const grossProfit = netRevenueBeforeVat - ingredientCost/,
  );
  assert.match(
    financeCockpit,
    /fetchFoodCost\({[\s\S]*startDate: resolved\.start/,
    "theoretical mv_food_cost may still be loaded for reference/exception surfaces",
  );
  assert.match(
    financeCockpit,
    /grossProfitTrend \} = buildTrends\(\s*rollups,\s*actualFoodCostRows,\s*\)/,
  );
});

test.skip("procurement scopes to branch sites and production uses the shared branch-kind gate", () => {
  const procurementBranches = readWeb(
    "app/(protected)/inventory/_lib/procurement-branches.ts",
  );
  const productionData = readWeb(
    "app/(protected)/inventory/production-data.ts",
  );
  const productionShared = readWeb(
    "app/(protected)/inventory/_lib/production-shared.ts",
  );
  const labels = readRepo("packages/shared/src/labels/vi.ts");

  assert.match(procurementBranches, /\.eq\("branch_kind", "branch"\)/);
  // D068: production runs at central_kitchen OR branch — the branch-kind gate
  // moved to the shared `isProductionBranchKind` predicate (central_kitchen +
  // branch), replacing the central-kitchen-only equality checks.
  assert.match(productionData, /isProductionBranchKind\(data\?\.branch_kind\)/);
  assert.match(productionData, /isProductionBranchKind\(branch\.branch_kind\)/);
  assert.match(
    productionShared,
    /!isProductionBranchKind\(data\?\.branch_kind\)/,
  );
  assert.match(labels, /central_supply: "Kho Tổng"/);
  assert.match(labels, /central_kitchen: "Bếp Trung Tâm"/);
});

test.skip("legacy kitchen backfill stays dry-run and read-only", () => {
  const script = readRepo("scripts/inventory-legacy-kitchen-backfill.mjs");
  assert.match(script, /mode: "dry-run"/);
  assert.match(script, /dryRunCorrections/);
  assert.doesNotMatch(script, /\b(insert|update|delete|upsert)\s*\(/i);
  assert.doesNotMatch(script, /method:\s*["'](?:POST|PATCH|DELETE|PUT)["']/);

  const output = execFileSync(
    process.execPath,
    ["../../scripts/inventory-legacy-kitchen-backfill.mjs", "--self-test"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.match(output, /self-test ok/);
});
