import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Branch stock reports use a native per-unit touch presentation", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/reports/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/reports/branch-stock-reports-client.tsx",
  );
  const data = read("apps/web/lib/inventory/branch-stock-report-data.ts");
  const model = read("apps/web/lib/inventory/branch-stock-report-model.ts");
  const officePage = read(
    "apps/web/app/(protected)/inventory/reports/page.tsx",
  );
  const officeClient = read(
    "apps/web/app/(protected)/inventory/reports/reports-client.tsx",
  );

  assert.match(route, /loadBranchStockReportData\(branchId, locationId\)/);
  assert.match(route, /<BranchStockReportsClient/);
  assert.doesNotMatch(route, /ReportsPageContent|embedded|DataTable/);

  assert.match(client, /BranchOperatorPage/);
  assert.match(client, /BranchOperatorPanel/);
  assert.match(client, /ItemGroup/);
  assert.match(client, /formatQuantity/);
  assert.match(client, /\/stock\/on-hand\//);
  assert.match(client, /branchLocationScope/);
  assert.match(client, /branchIntraTransferIn/);
  assert.doesNotMatch(
    client,
    /import\s+\{\s*ReportsClient|<ReportsClient\b|ReportsProps|DataTable|AppPage|\bformatVND\b|embedded/,
  );

  assert.match(data, /import "server-only"/);
  assert.match(data, /resolveInventoryListScope/);
  assert.match(data, /fetchConsumptionVariance/);
  assert.match(data, /fetchStockMovementReport/);
  assert.match(data, /requestedLocationId/);
  assert.doesNotMatch(data, /fetchApAging|fetchFoodCost/);
  assert.match(model, /getBranchStockVarianceExceptions/);
  assert.match(model, /getBranchStockMovementHighlights/);
  assert.doesNotMatch(model, /totalQuantity|movementTotals/);

  assert.match(officePage, /export async function ReportsPageContent\(\)/);
  assert.match(officePage, /fetchApAging\(\)/);
  assert.doesNotMatch(
    officePage,
    /routeBranchId|resolveInventoryBranchScope|embedded/,
  );
  assert.match(officeClient, /<AppPageHeader/);
  assert.match(
    officeClient,
    /<AppPage width="xwide" density="compact" scroll>/,
  );
  assert.doesNotMatch(officeClient, /supplierInvoicesHref|embedded/);
});
