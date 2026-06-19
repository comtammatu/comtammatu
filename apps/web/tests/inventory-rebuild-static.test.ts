import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const readRepo = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const readWeb = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = readRepo(
  "supabase/migrations/20260619121446_inventory_rebuild_consumption_central_sites.sql",
);

function extractSqlFunctionBody(functionName: string): string {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = migration.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${escapedName}[\\s\\S]*?\\n\\$\\$;`,
    ),
  );
  assert.ok(match, `missing SQL function ${functionName}`);
  return match[0];
}

test("central site kinds are valid and branch intra-transfer is rejected", () => {
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
    migration,
    /stock_transfers_no_intra_branch_new[\s\S]*CHECK \(from_branch_id <> to_branch_id\) NOT VALID/,
    "new stock transfer rows must not be intra-branch",
  );

  const commitIntraBranch = extractSqlFunctionBody(
    "commit_intra_branch_transfer",
  );
  assert.match(
    commitIntraBranch,
    /RAISE EXCEPTION 'intra_branch_transfer_not_supported' USING ERRCODE = '22023'/,
    "legacy intra-branch RPC should fail loudly",
  );
});

test("branch consumption approval posts sale consumption from warehouse/default issue only", () => {
  const approveConsumption = extractSqlFunctionBody(
    "branch_manager_approve_consumption_report",
  );

  assert.match(approveConsumption, /il\.is_default_issue = true/);
  assert.match(approveConsumption, /il\.location_kind = 'warehouse'/);
  assert.doesNotMatch(
    approveConsumption,
    /is_default_consumption/,
    "approval must not route through a branch kitchen default",
  );
  assert.doesNotMatch(
    approveConsumption,
    /location_kind\s+(?:=|IN)[\s\S]{0,120}'kitchen'|WHEN 'kitchen'/,
    "approval must not prefer kitchen locations",
  );
  assert.match(approveConsumption, /'consumption'/);
  assert.match(approveConsumption, /'sale_consumption'/);
  assert.match(approveConsumption, /'hrm_consumption'/);
});

test("transfer UI and action surface cannot create branch kitchen transfers", () => {
  const transferActions = readWeb("app/(protected)/inventory/transfer-actions.ts");
  const transferForm = readWeb(
    "app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
  );
  const transferPage = readWeb("app/(protected)/inventory/transfers/page.tsx");
  const transferList = readWeb(
    "app/(protected)/inventory/transfers/transfers-list-client.tsx",
  );
  const locationCompat = readWeb(
    "app/(protected)/inventory/_lib/inventory-location-compat.ts",
  );

  assert.doesNotMatch(
    transferActions,
    /commit_intra_branch_transfer/,
    "createStockTransfer must not call the retired intra-branch RPC",
  );
  assert.match(transferActions, /fromBranchId === toBranchId/);
  assert.match(transferActions, /tiêu hao bán hàng/);
  assert.match(
    transferActions,
    /fromKind === "central_supply" \|\| fromKind === "central_kitchen"/,
  );
  assert.doesNotMatch(transferForm, /type SlipKind|TabsTrigger/);
  assert.doesNotMatch(transferForm, /is_default_consumption/);
  assert.doesNotMatch(transferForm, /location_kind\s*===\s*"kitchen"/);
  assert.match(transferPage, /createParam === "cap-bep"/);
  assert.match(transferPage, /\/inventory\/consumption/);
  assert.match(transferList, /central_supply/);
  assert.match(transferList, /central_kitchen/);
  assert.doesNotMatch(
    locationCompat,
    /is_default_consumption|"consumption"/,
    "new server actions should resolve receive/issue warehouse locations only",
  );
});

test("consumption route is first-class while issues route remains compatible", () => {
  const routeResolution = readRepo("packages/shared/src/auth/route-resolution.ts");
  const inventoryPaths = readWeb("app/(protected)/inventory/_lib/paths.ts");
  const inventoryNav = readWeb("app/(protected)/inventory/_lib/inventory-nav.ts");
  const consumptionPage = readWeb(
    "app/(protected)/inventory/consumption/page.tsx",
  );
  const consumptionDetailPage = readWeb(
    "app/(protected)/inventory/consumption/[id]/page.tsx",
  );
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
    inventoryNav,
    /href: "\/inventory\/consumption"[\s\S]*label: "Tiêu hao"/,
  );
  assert.match(consumptionPage, /export \{ default \} from "\.\.\/issues\/page"/);
  assert.match(
    consumptionDetailPage,
    /export \{ default \} from "\.\.\/\.\.\/issues\/\[id\]\/page"/,
  );
  assert.match(issuesClient, /\/inventory\/consumption/);
  assert.match(issueDetailClient, /\/inventory\/consumption/);
  assert.match(issueDetailClient, /Phiếu tiêu hao/);
});

test("stock and inventory value exclude legacy branch kitchen locations", () => {
  const stockBearing = readWeb(
    "app/(protected)/inventory/_lib/stock-bearing-locations.ts",
  );
  const stockPage = readWeb("app/(protected)/inventory/stock/page.tsx");
  const inventoryValue = readWeb(
    "app/(protected)/inventory/inventory-value-actions.ts",
  );
  const reportActions = readWeb("app/(protected)/inventory/report-actions.ts");
  const financeCockpit = readWeb("app/(protected)/finance/_lib/finance-cockpit.ts");

  assert.match(stockBearing, /locationKind === "warehouse"/);
  assert.match(
    stockBearing,
    /siteKind === "central_kitchen" && locationKind === "production_storage"/,
  );
  assert.doesNotMatch(
    stockBearing,
    /locationKind === "kitchen"/,
    "Bếp CN/kitchen must not be treated as normal stock",
  );

  for (const [name, source] of [
    ["stock page", stockPage],
    ["inventory value", inventoryValue],
    ["movement report", reportActions],
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
});

test("finance gross profit uses actual approved consumption, not mv_food_cost", () => {
  const financeCockpit = readWeb("app/(protected)/finance/_lib/finance-cockpit.ts");

  assert.match(financeCockpit, /function buildKpis\(\{[\s\S]*actualFoodCostRows/);
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

test("procurement and production route central sites through the new model", () => {
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

  assert.match(
    procurementBranches,
    /\.in\("branch_kind", \["branch", "central_supply", "central_kitchen"\]\)/,
  );
  assert.match(productionData, /data\?\.branch_kind === "central_kitchen"/);
  assert.match(
    productionData,
    /branch\.branch_kind === "central_kitchen"/,
  );
  assert.match(productionShared, /data\?\.branch_kind !== "central_kitchen"/);
  assert.match(labels, /central_supply: "Kho Tổng"/);
  assert.match(labels, /central_kitchen: "Bếp Trung Tâm"/);
});

test("legacy kitchen backfill stays dry-run and read-only", () => {
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
