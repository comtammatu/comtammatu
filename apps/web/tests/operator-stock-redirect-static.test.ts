import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));
const sourceFiles = (path: string): string[] => {
  const absolute = resolve(repoRoot, path);
  return readdirSync(absolute).flatMap((entry) => {
    const child = `${path}/${entry}`;
    const childAbsolute = resolve(repoRoot, child);
    if (statSync(childAbsolute).isDirectory()) return sourceFiles(child);
    return child.endsWith(".ts") || child.endsWith(".tsx") ? [child] : [];
  });
};
const embeddedContentWrapperPattern =
  /if \(embedded\) \{\s*return (?:<div className="flex w-full flex-col gap-3">[\s\S]*?<\/div>|\(\s*<div className="flex w-full flex-col gap-3">[\s\S]*?<\/div>\s*\));\s*\}/;

test("operator stock sticky action bars route through AppDetailFooter", () => {
  const stockFiles = [
    ...sourceFiles("apps/web/app/(protected)/inventory"),
    ...sourceFiles("apps/web/app/(protected)/br/[branchId]/(operator)/stock"),
  ];
  const rawStickyCallSites = stockFiles.filter((path) =>
    read(path).includes("sticky chrome-safe-bottom"),
  );
  const nestedFooterCallSites = stockFiles.filter((path) =>
    /<AppDetailFooter\s+sticky\s+trailing=\{footer\}/.test(read(path)),
  );
  const appSurface = read("apps/web/app/components/surface.tsx");

  assert.deepEqual(rawStickyCallSites, []);
  assert.deepEqual(nestedFooterCallSites, []);
  assert.match(appSurface, /sticky chrome-safe-bottom/);
  assert.match(appSurface, /shadow-lg/);
  assert.match(appSurface, /data-slot=button/);
});

test("operator stock waste route owns its Branch client", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/page.tsx";
  const source = read(path);

  assert.equal(exists(path), true, path);
  assert.match(source, /params: Promise<\{ branchId: string \}>/, path);
  assert.match(source, /loadBranchWasteCreateData\(branchId\)/, path);
  assert.match(source, /<BranchWasteCreateClient/, path);
  assert.doesNotMatch(
    source,
    /WasteNewPageContent|embedded|redirect\(`\/inventory\//,
    path,
  );
});

test("operator stock receive merges into the native transfer queue and keeps native detail", () => {
  const receiveRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/page.tsx",
  );
  const transferRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx",
  );
  const receiveDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/page.tsx",
  );
  const navConfig = read("packages/shared/src/auth/nav-config.ts");
  const receiveDetailContent = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-content.tsx",
  );
  const receiveClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-client.tsx",
  );

  assert.match(receiveRoute, /permanentRedirect/);
  assert.match(
    receiveRoute,
    /permanentRedirect\(`\/br\/\$\{branchId\}\/stock\/transfer\?queue=receive`\)/,
  );
  assert.doesNotMatch(receiveRoute, /TransfersPageContent|embedded|DataTable/);
  assert.match(
    transferRoute,
    /searchParams: Promise<\{ queue\?: string \| string\[\] \}>/,
  );
  assert.match(transferRoute, /const receiveOnly = queueParam === "receive"/);
  assert.match(transferRoute, /isTransferReceiveReady\(row\.status\)/);
  assert.match(
    transferRoute,
    /`\/br\/\$\{branchId\}\/stock\/receive\/\$\{row\.id\}`/,
  );
  assert.match(
    navConfig,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/transfer\?queue=receive",\s*label: "Nhận hàng"/,
  );

  // D067 §2: the receive detail route forks to a mobile-native receive
  // client over the SHARED transfer loader — no office
  // TransferDetailPageContent embed (that stepper/summary chrome is exactly
  // what the native screen removes).
  assert.match(receiveDetailRoute, /TransferReceiveContent/);
  assert.match(receiveDetailRoute, /branchId=\{branchId\}/);
  assert.match(receiveDetailRoute, /transferId=\{transferId\}/);
  assert.doesNotMatch(receiveDetailRoute, /TransferDetailPageContent/);
  assert.doesNotMatch(
    receiveDetailRoute,
    /GRNDetailPageContent|grnListBasePath/,
  );

  assert.match(
    receiveDetailContent,
    /export async function TransferReceiveContent/,
  );
  assert.match(receiveDetailContent, /loadTransferDetailPageData/);
  assert.match(receiveDetailContent, /routeBranchId: branchId/);
  assert.match(receiveDetailContent, /includeAudit: false/);
  assert.match(receiveDetailContent, /includeCorrections: false/);
  assert.doesNotMatch(
    receiveDetailContent,
    /fetchStockTransferDetail|resolveInventoryListScope|computeTransferLineTotal/,
  );
  assert.match(receiveDetailContent, /<TransferReceiveClient/);
  assert.match(
    receiveDetailContent,
    /backHref=\{`\/br\/\$\{branchId\}\/stock\/transfer\?queue=receive`\}/,
  );
  assert.match(
    receiveDetailContent,
    /detailHref=\{`\/br\/\$\{branchId\}\/stock\/transfer\/\$\{transferId\}`\}/,
  );
  assert.match(receiveClient, /size="icon-touch"/);
  assert.match(receiveClient, /<AppDetailFooter[\s\S]*\bsticky\b/);
  assert.match(
    receiveClient,
    /initialValue=\{\s*sheetItem\s*\?\s*confirmed\.has\(sheetItem\.ingredientId\)[\s\S]*: null\s*: null\s*\}/,
  );
});

test("operator stock count renders employee count inside the branch operator shell", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count/page.tsx",
  );
  const employeeCountPage = read("apps/web/lib/staff-runtime/count/page.tsx");
  const countClient = read("apps/web/lib/staff-runtime/count/count-client.tsx");

  assert.match(source, /StaffCountPageContent/);
  assert.match(source, /routeBranchId=\{branchId\}/);
  assert.match(source, /hideHeaderOnMobile/);
  assert.match(source, /plane="branch"/);
  assert.doesNotMatch(source, /redirect\(`\/inventory\/stocktake/);
  assert.match(
    employeeCountPage,
    /routeBranchId \? `\/br\/\$\{branchId\}\/stock\/count` : "\/br"/,
  );
  assert.match(
    countClient,
    /router\.replace\(`\$\{baseHref\}\?\$\{params\.toString\(\)\}`\)/,
  );
});

test("operator count-slip approvals render inside the branch operator shell", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/page.tsx",
  );
  const globalSource = read(
    "apps/web/app/(protected)/inventory/count-slips/page.tsx",
  );
  const clientSource = read(
    "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx",
  );

  assert.match(source, /CountSlipsPageContent/);
  assert.match(source, /routeBranchId=\{branchId\}/);
  assert.match(source, /embedded/);
  assert.doesNotMatch(source, /redirect\(`\/inventory\/count-slips/);
  assert.match(globalSource, /routeBranchId\?: number/);
  assert.match(globalSource, /embedded\?: boolean/);
  assert.match(globalSource, /\.eq\("branch_id", routeBranchId\)/);
  assert.match(clientSource, /branchScoped/);
  assert.match(clientSource, /embedded/);
  assert.match(clientSource, /if \(embedded\)/);
});

test("operator stock landing is a branch-native hub, not the office stock page wrapper", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );

  assert.match(source, /BranchOperatorPage/);
  assert.match(source, /BranchOperatorActionSection/);
  assert.match(source, /resolveOperatorTiles/);
  assert.match(source, /STOCK_PRIMARY_SUFFIXES/);
  assert.match(source, /STOCK_LOOKUP_SUFFIXES/);
  assert.match(source, /STOCK_CATALOG_SUFFIXES/);
  assert.match(source, /operatorStockPrimaryTitle/);
  assert.match(source, /operatorStockLookupTitle/);
  assert.match(source, /operatorStockCatalogTitle/);
  assert.match(
    source,
    /tile\.href === stockRoot\s*\?\s*`\$\{stockRoot\}\/on-hand`/,
  );
  assert.equal(
    (source.match(/mobileColumns=\{1\}/g) ?? []).length >= 3,
    true,
    "stock landing action sections must render as full-width touch rows on mobile",
  );
  assert.doesNotMatch(source, /StockPageContent/);
  assert.doesNotMatch(source, /embedded/);
  assert.doesNotMatch(source, /href: `\/br\/\$\{branchId\}\/stock\/count`/);
});

test("operator stock on-hand list forks Branch presentation over the shared loader", () => {
  const routeSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/page.tsx",
  );
  const branchClientSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  );
  const stockPageSource = read(
    "apps/web/app/(protected)/inventory/stock/page.tsx",
  );
  const stockClientSource = read(
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
  );
  const stockDataSource = read("apps/web/lib/inventory/stock-on-hand-data.ts");

  assert.match(routeSource, /loadStockOnHandPageData/);
  assert.match(routeSource, /routeBranchId: branchId/);
  assert.match(routeSource, /includeValuation: false/);
  assert.match(routeSource, /BranchStockOnHandClient/);
  assert.doesNotMatch(routeSource, /<BranchStockOnHandClient \{\.\.\.data\}/);
  assert.doesNotMatch(
    routeSource,
    /StockPageContent|StockClient|DataTable|embedded/,
  );
  assert.doesNotMatch(routeSource, /redirect\(`\/br\/\$\{branchId\}\/stock`\)/);
  assert.match(branchClientSource, /BranchOperatorPage/);
  assert.match(branchClientSource, /BranchOperatorPanel/);
  assert.match(branchClientSource, /ItemGroup/);
  assert.match(branchClientSource, /StockTouchRow/);
  assert.match(branchClientSource, /filterStockOnHandIngredients/);
  assert.match(branchClientSource, /ITEM_KIND_LABELS/);
  assert.match(branchClientSource, /size="touch"/);
  assert.doesNotMatch(
    branchClientSource,
    /DataTable|AppPage|StockPageContent|StockClient|embedded|overflow-x-auto|QuickStockIssueDialog|QuickInternalTransferDialog|AdjustStockDialog/,
  );
  assert.match(stockPageSource, /loadStockOnHandPageData/);
  assert.match(stockPageSource, /<StockClient/);
  assert.match(stockPageSource, /coreDataLoadFailed=\{coreDataLoadFailed\}/);
  assert.match(stockDataSource, /import "server-only"/);
  assert.match(stockDataSource, /resolveInventoryListScope/);
  assert.match(stockDataSource, /fetchStockBearingLocationIds/);
  assert.doesNotMatch(stockClientSource, /embedded|branchStockBasePath/);
  assert.match(stockClientSource, /if \(coreDataLoadFailed\)/);
  assert.match(
    stockClientSource,
    /return \(\s*<AppPage[\s\S]*width=\{isCompactLayout \? "narrow" : "xwide"\}[\s\S]*scroll[\s\S]*>\s*\{content\}\s*<\/AppPage>\s*\);/,
  );
  assert.doesNotMatch(stockClientSource, /InventoryPageContent/);
});

test("operator stock on-hand alias and detail stay inside the branch operator shell", () => {
  const routeSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/page.tsx",
  );
  const detailRouteSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/[ingredientId]/page.tsx",
  );
  const branchDetailSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/[ingredientId]/branch-stock-ingredient-detail.tsx",
  );
  const stockPageSource = read(
    "apps/web/app/(protected)/inventory/stock/page.tsx",
  );
  const stockDetailPageSource = read(
    "apps/web/app/(protected)/inventory/stock/[ingredientId]/page.tsx",
  );
  const stockClientSource = read(
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
  );
  const branchClientSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  );
  const stockDataSource = read("apps/web/lib/inventory/stock-on-hand-data.ts");
  const stockDetailDataSource = read(
    "apps/web/lib/inventory/stock-on-hand-detail-data.ts",
  );
  const stockDetailModelSource = read(
    "apps/web/lib/inventory/stock-on-hand-detail-model.ts",
  );

  assert.match(routeSource, /loadStockOnHandPageData/);
  assert.match(routeSource, /routeBranchId: branchId/);
  assert.match(routeSource, /BranchStockOnHandClient/);
  assert.doesNotMatch(routeSource, /redirect\(`\/inventory\/stock/);
  assert.match(detailRouteSource, /loadStockIngredientDetailData/);
  assert.match(detailRouteSource, /routeBranchId: branchId/);
  assert.match(detailRouteSource, /includeValuation: false/);
  assert.match(detailRouteSource, /movementLimit: 12/);
  assert.match(detailRouteSource, /BranchStockIngredientDetail/);
  assert.doesNotMatch(
    detailRouteSource,
    /StockIngredientDetailPageContent|embedded|@\/\(protected\)\/inventory\/stock/,
  );
  assert.doesNotMatch(detailRouteSource, /redirect\(`\/inventory\/stock/);
  assert.match(branchDetailSource, /BranchOperatorPage/);
  assert.match(branchDetailSource, /BranchOperatorPanel/);
  assert.match(branchDetailSource, /BranchOperatorActionSection/);
  assert.match(branchDetailSource, /ItemGroup/);
  assert.match(branchDetailSource, /AppDetailFooter/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/grn\/new/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/transfer/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/count/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/issues/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/waste/);
  assert.doesNotMatch(
    branchDetailSource,
    /formatVND|DataTable|AppPageHeader|StockIngredientDetailPageContent|OfficeStockIngredientDetail|embedded/,
  );
  assert.doesNotMatch(branchDetailSource, /\$\{stockBasePath\}\/receive/);
  assert.match(stockPageSource, /loadStockOnHandPageData/);
  assert.match(stockPageSource, /queryBranchId: params\.branchId/);
  assert.doesNotMatch(
    stockPageSource,
    /routeBranchId\?: number|branchStockBasePath|embedded/,
  );
  assert.match(stockDataSource, /scope\.outOfScope/);
  assert.match(stockDetailPageSource, /loadStockIngredientDetailData/);
  assert.match(stockDetailPageSource, /OfficeStockIngredientDetail/);
  assert.match(stockDetailPageSource, /formatVND/);
  assert.doesNotMatch(
    stockDetailPageSource,
    /routeBranchId\?: number|branchStockBasePath|embedded/,
  );
  assert.doesNotMatch(stockDetailPageSource, /InventoryPageContent/);
  assert.doesNotMatch(stockDetailPageSource, /\.from\("stock_levels"\)/);
  assert.doesNotMatch(stockDetailPageSource, /\.from\("stock_movements"\)/);
  assert.doesNotMatch(stockDetailPageSource, /\.from\("grn_items"\)/);
  assert.match(stockDetailDataSource, /import "server-only"/);
  assert.match(stockDetailDataSource, /resolveInventoryListScope/);
  assert.match(stockDetailDataSource, /fetchStockBearingLocationIds/);
  assert.match(stockDetailDataSource, /includeValuation \? "unit_cost" : null/);
  assert.match(stockDetailDataSource, /\.from\("stock_levels"\)/);
  assert.match(stockDetailDataSource, /\.from\("stock_movements"\)/);
  assert.match(
    stockDetailDataSource,
    /PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE/,
  );
  assert.match(stockDetailModelSource, /stockMovementReferenceHref/);
  assert.match(
    stockDetailModelSource,
    /`\$\{branchStockBasePath\}\/grn\/\$\{movement\.grnId\}`/,
  );
  assert.doesNotMatch(stockClientSource, /branchStockBasePath|embedded/);
  assert.match(
    stockClientSource,
    /const stockDetailHref = \(ingredientId: number\) =>/,
  );
  assert.match(
    stockClientSource,
    /branchHref\(branchId, `\/inventory\/stock\/\$\{ingredientId\}`\)/,
  );
  assert.match(
    branchClientSource,
    /href=\{`\/br\/\$\{branchId\}\/stock\/on-hand\/\$\{item\.id\}`\}/,
  );
  assert.doesNotMatch(branchClientSource, /href=\{?[`"]\/inventory\/stock/);
  assert.match(stockClientSource, /href: stockDetailHref\(item\.id\)/);
  assert.match(stockClientSource, /href=\{stockDetailHref\(item\.id\)\}/);
  assert.match(
    stockClientSource,
    /const quickIssueBasePath = \(issueType: QuickIssueType\) =>/,
  );
  assert.match(
    stockClientSource,
    /issueType === "consumption"[\s\S]*\? "\/inventory\/consumption"[\s\S]*: "\/inventory\/issues"/,
  );
  assert.match(
    stockClientSource,
    /canReceiveStock = actionPermissions\.canReceiveGrn/,
  );
  assert.match(stockDataSource, /PERMISSION_KEYS\.INVENTORY_TRANSFER_RECEIVE/);
  assert.match(
    branchClientSource,
    /href=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders\/new`\}/,
  );
});

test("office stock workbench keeps manager action affordances after the plane split", () => {
  const stockClientSource = read(
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
  );

  for (const expected of [
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.receive\}[\s\S]*label=\{receiveActionLabel\}[\s\S]*primary/,
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.transfer\}[\s\S]*label=\{stockCopy\.actions\.transfer\}/,
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.stocktake\}[\s\S]*label=\{stockCopy\.actions\.stocktake\}/,
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.waste\}[\s\S]*label=\{stockCopy\.actions\.waste\}/,
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.purchaseSuggestion\}[\s\S]*label=\{stockCopy\.actions\.purchaseSuggestion\}/,
  ]) {
    assert.match(stockClientSource, expected);
  }

  for (const expected of [
    /const primaryReceiveAction = canReceiveStock \?[\s\S]*href=\{actionHrefs\.receive\}/,
    /actionPermissions\.canCreateIssue[\s\S]*setQuickIssueTarget\(\{[\s\S]*issueType: "consumption"/,
    /actionPermissions\.canCreateStocktake[\s\S]*href=\{actionHrefs\.stocktake\}/,
    /actionPermissions\.canAdjustException[\s\S]*setAdjustTarget\(item\)/,
  ]) {
    assert.match(stockClientSource, expected);
  }

  assert.match(stockClientSource, /<AdjustStockDialog/);
  assert.match(stockClientSource, /<QuickStockIssueDialog/);
  assert.match(stockClientSource, /import dynamic from "next\/dynamic"/);
  assert.match(
    stockClientSource,
    /dynamic<AdjustStockDialogProps>\(\s*\(\) => import\("\.\/adjust-stock-dialog"\)/,
  );
  assert.match(
    stockClientSource,
    /dynamic<QuickInternalTransferDialogProps>[\s\S]*import\("\.\/quick-internal-transfer-dialog"\)/,
  );
  assert.match(
    stockClientSource,
    /dynamic<QuickStockIssueDialogProps>\(\s*\(\) =>[\s\S]*import\("\.\/quick-stock-issue-dialog"\)/,
  );
  assert.doesNotMatch(
    stockClientSource,
    /import \{\s*AdjustStockDialog|import \{\s*QuickInternalTransferDialog/,
  );
  assert.doesNotMatch(stockClientSource, /function QuickStockIssueDialog/);
  assert.doesNotMatch(stockClientSource, /expiryCount|actionHrefs\.expiry/);
  assert.match(
    stockClientSource,
    /issueBasePath=\{quickIssueBasePath\(quickIssueTarget\.issueType\)\}/,
  );
});

test("operator stock branch-native extensions keep PO, GRN, issue, and report actions in the branch shell", () => {
  const issueRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/page.tsx",
  );
  const issueDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/[id]/page.tsx",
  );
  const branchIssuesListClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/branch-stock-issues-list-client.tsx",
  );
  const branchIssueDetailClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/[id]/branch-stock-issue-detail-client.tsx",
  );
  const branchStockIssueData = read(
    "apps/web/lib/inventory/branch-stock-issue-data.ts",
  );
  const stockIssueModel = read("apps/web/lib/inventory/stock-issue-model.ts");
  const poRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/page.tsx",
  );
  const poNewRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/new/page.tsx",
  );
  const poDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/[id]/page.tsx",
  );
  const grnRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/page.tsx",
  );
  const branchGrnListClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
  );
  const grnDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/page.tsx",
  );
  const branchGrnReviewClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/grn-review-operator-client.tsx",
  );
  const branchGrnReceiptClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/branch-grn-receipt-client.tsx",
  );
  const grnDetailData = read("apps/web/lib/inventory/grn-detail-data.ts");
  const reportsRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/reports/page.tsx",
  );
  const branchReportsClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/reports/branch-stock-reports-client.tsx",
  );
  const branchReportsData = read(
    "apps/web/lib/inventory/branch-stock-report-data.ts",
  );
  const branchReportsModel = read(
    "apps/web/lib/inventory/branch-stock-report-model.ts",
  );
  const issuesPage = read("apps/web/app/(protected)/inventory/issues/page.tsx");
  const issuesClient = read(
    "apps/web/app/(protected)/inventory/issues/issues-client.tsx",
  );
  const issueDetailPage = read(
    "apps/web/app/(protected)/inventory/issues/[id]/page.tsx",
  );
  const issueDetailClient = read(
    "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );
  const purchaseOrdersPage = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  const purchaseOrdersClient = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const grnPage = read("apps/web/app/(protected)/inventory/grn/page.tsx");
  const grnListData = read("apps/web/lib/inventory/grn-list-data.ts");
  const grnListClient = read(
    "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  );
  const grnDetailClient = read(
    "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const newPoPage = read(
    "apps/web/app/(protected)/inventory/purchase-orders/new/page.tsx",
  );
  const newPoClient = read(
    "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx",
  );
  const newPoClientEmbeddedBranch = newPoClient.slice(
    newPoClient.indexOf("if (embedded)"),
    newPoClient.indexOf("<DocumentFormFrame"),
  );
  const grnDetailEmbeddedBranch = grnDetailClient.slice(
    grnDetailClient.indexOf("if (embedded)"),
    grnDetailClient.indexOf(
      "<AppPage width",
      grnDetailClient.indexOf("if (embedded)"),
    ),
  );
  const poDetailPage = read(
    "apps/web/app/(protected)/inventory/purchase-orders/[id]/page.tsx",
  );
  const poDetailClient = read(
    "apps/web/app/(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx",
  );
  const poLineMobileCard = poDetailClient.slice(
    poDetailClient.indexOf("function PoLineMobileCard"),
    poDetailClient.indexOf("const PO_PREVIEW_LIMIT"),
  );
  const reportsPage = read(
    "apps/web/app/(protected)/inventory/reports/page.tsx",
  );
  const reportsClient = read(
    "apps/web/app/(protected)/inventory/reports/reports-client.tsx",
  );
  const appSurface = read("apps/web/app/components/surface.tsx");
  const formDialog = read("apps/web/app/components/form/form-dialog.tsx");
  const formCombobox = read("apps/web/app/components/form/combobox.tsx");

  assert.match(issueRoute, /loadBranchStockIssueListData\(branchId\)/);
  assert.match(issueRoute, /<BranchStockIssuesListClient/);
  assert.doesNotMatch(issueRoute, /IssuesPageContent|embedded|DataTable/);
  assert.match(
    issueDetailRoute,
    /loadBranchStockIssueDetailData\(issueId, branchId\)/,
  );
  assert.match(issueDetailRoute, /<BranchStockIssueDetailClient/);
  assert.doesNotMatch(
    issueDetailRoute,
    /IssueDetailPageContent|embedded|DataTable/,
  );
  assert.match(branchIssuesListClient, /BranchOperatorPage/);
  assert.match(branchIssuesListClient, /ItemGroup/);
  assert.match(branchIssuesListClient, /<Sheet/);
  assert.doesNotMatch(
    branchIssuesListClient,
    /DataTable|useLongPress|FormDialog/,
  );
  assert.match(branchIssueDetailClient, /BranchOperatorDetailList/);
  assert.match(branchIssueDetailClient, /<AppDetailFooter[\s\S]*\bsticky\b/);
  assert.match(branchIssueDetailClient, /<Sheet/);
  assert.doesNotMatch(
    branchIssueDetailClient,
    /DataTable|AuditHistoryList|DocumentStockCorrectionDialog/,
  );
  assert.match(branchStockIssueData, /resolveInventoryListScope/);
  assert.match(branchStockIssueData, /resolveInventoryBranchScope/);
  assert.match(branchStockIssueData, /issueTypes: \["writeoff", "other"\]/);
  assert.match(branchStockIssueData, /INVENTORY_WRITEOFF/);
  assert.match(stockIssueModel, /canConfirmBranchStockIssue/);
  assert.match(poRoute, /PurchaseOrdersPageContent/);
  assert.match(poRoute, /routeBranchId=\{branchId\}/);
  assert.match(poRoute, /embedded/);
  assert.match(
    poRoute,
    /basePath=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders`\}/,
  );
  assert.match(poRoute, /suppliersPath=\{null\}/);
  assert.match(poNewRoute, /NewPurchaseOrderPageContent/);
  assert.match(poNewRoute, /routeBranchId=\{branchId\}/);
  assert.match(poNewRoute, /embedded/);
  assert.match(
    poNewRoute,
    /poBasePath=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders`\}/,
  );
  assert.match(poDetailRoute, /PODetailPageContent/);
  assert.match(poDetailRoute, /routeBranchId=\{branchId\}/);
  assert.match(poDetailRoute, /embedded/);
  assert.match(
    poDetailRoute,
    /purchaseOrdersBasePath=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders`\}/,
  );
  // GRN receipt must route to the operator GRN wrapper, NOT the transfers
  // receive route (a GRN id fed to /stock/receive resolves against
  // stock_transfers → wrong entity).
  assert.match(
    poDetailRoute,
    /afterCreateGrnHref=\{`\/br\/\$\{branchId\}\/stock\/grn\/:id`\}/,
  );
  assert.doesNotMatch(
    poDetailRoute,
    /afterCreateGrnHref=\{`\/br\/\$\{branchId\}\/stock\/receive\/:id`\}/,
  );
  assert.match(
    grnRoute,
    /loadGrnListPageData\(\{ routeBranchId: branchId \}\)/,
  );
  assert.match(grnRoute, /<BranchGrnListClient/);
  assert.doesNotMatch(grnRoute, /GRNListPageContent|embedded|DataTable/);
  // GRN detail keeps a shared loader/model/action boundary while both draft
  // review and the confirmed receipt own their Branch touch presentation.
  assert.match(grnDetailRoute, /isGrnLookupParam\(rawId\)/);
  assert.match(grnDetailRoute, /loadGrnDetail\(rawId, branchId\)/);
  assert.match(grnDetailRoute, /GrnReviewOperatorClient/);
  assert.match(grnDetailRoute, /BranchGrnReceiptClient/);
  assert.match(grnDetailRoute, /@lib\/inventory\/grn-detail-data/);
  assert.doesNotMatch(grnDetailRoute, /GRNDetailClient|embedded/);
  assert.doesNotMatch(
    grnDetailRoute,
    /@\/\(protected\)\/inventory\/grn\/\[id\]\//,
  );
  assert.match(
    grnDetailRoute,
    /purchaseOrdersBasePath=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders`\}/,
  );
  assert.doesNotMatch(grnDetailRoute, /TransferDetailPageContent/);
  assert.match(branchGrnReviewClient, /BranchGrnReviewLineSheet/);
  assert.match(branchGrnReviewClient, /BranchGrnAddLineSheet/);
  assert.match(branchGrnReviewClient, /useGrnDetailActions/);
  assert.match(branchGrnReviewClient, /useGrnDetailLines/);
  assert.match(branchGrnReviewClient, /canEditDraft/);
  assert.match(branchGrnReviewClient, /canConfirm/);
  assert.doesNotMatch(
    branchGrnReviewClient,
    /@\/\(protected\)\/inventory\/grn\/\[id\]\//,
  );
  assert.match(branchGrnReceiptClient, /BranchOperatorPage/);
  assert.doesNotMatch(
    branchGrnReceiptClient,
    /GRNDetailClient|AuditHistoryList/,
  );
  assert.match(
    grnDetailData,
    /routeBranchId != null && data\.grn\.branch_id !== routeBranchId/,
  );
  assert.match(grnDetailData, /PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE/);
  assert.match(grnDetailData, /PERMISSION_KEYS\.PROCUREMENT_GRN_CONFIRM/);
  assert.match(reportsRoute, /loadBranchStockReportData\(branchId\)/);
  assert.match(reportsRoute, /<BranchStockReportsClient/);
  assert.doesNotMatch(reportsRoute, /ReportsPageContent|embedded|DataTable/);
  assert.match(branchReportsClient, /BranchOperatorPage/);
  assert.match(branchReportsClient, /BranchOperatorPanel/);
  assert.match(branchReportsClient, /ItemGroup/);
  assert.match(branchReportsClient, /formatQuantity/);
  assert.match(branchReportsClient, /\/stock\/on-hand\//);
  assert.doesNotMatch(
    branchReportsClient,
    /import\s+\{\s*ReportsClient|<ReportsClient\b|ReportsProps|DataTable|AppPage|\bformatVND\b|embedded/,
  );
  assert.match(branchReportsData, /import "server-only"/);
  assert.match(branchReportsData, /resolveInventoryListScope/);
  assert.match(branchReportsData, /fetchConsumptionVariance/);
  assert.match(branchReportsData, /fetchStockMovementReport/);
  assert.doesNotMatch(branchReportsData, /fetchApAging|fetchFoodCost/);
  assert.match(branchReportsModel, /getBranchStockVarianceExceptions/);
  assert.match(branchReportsModel, /getBranchStockMovementHighlights/);
  assert.doesNotMatch(branchReportsModel, /totalQuantity|movementTotals/);

  assert.match(issuesPage, /routeBranchId\?: number/);
  assert.match(issuesPage, /embedded\?: boolean/);
  assert.match(issuesPage, /embedded=\{embedded\}/);
  assert.match(issuesPage, /scope\.outOfScope/);
  assert.match(issuesPage, /listBasePath\?: string/);
  assert.match(issuesClient, /embedded\?: boolean/);
  assert.match(issuesClient, embeddedContentWrapperPattern);
  assert.match(issuesClient, /listBasePath = "\/inventory\/consumption"/);
  assert.match(
    issuesClient,
    /router\.push\(`\$\{listBasePath\}\/\$\{newId\}`\)/,
  );
  assert.doesNotMatch(issuesClient, /router\.push\(`\/inventory\/consumption/);
  assert.match(issueDetailPage, /routeBranchId\?: number/);
  assert.match(issueDetailPage, /embedded\?: boolean/);
  assert.match(issueDetailPage, /embedded=\{embedded\}/);
  assert.match(issueDetailPage, /d\.issue\.branch_id !== routeBranchId/);
  assert.match(issueDetailClient, /listBasePath = "\/inventory\/consumption"/);
  assert.match(issueDetailClient, /embedded\?: boolean/);
  assert.match(issueDetailClient, embeddedContentWrapperPattern);
  assert.match(issueDetailClient, /href=\{listBasePath\}/);
  assert.match(issueDetailClient, /embedded=\{embedded\}/);
  assert.match(
    issueDetailClient,
    /actionSize=\{embedded \? "touch" : "default"\}/,
  );
  assert.match(
    issueDetailClient,
    /<Combobox[\s\S]*size=\{embedded \? "touch" : "default"\}/,
  );
  assert.match(issueDetailClient, /className=\{embedded \? "h-12" : "h-10"\}/);
  assert.equal(
    (
      issueDetailClient.match(
        /<SelectTrigger[\s\S]*?size=\{embedded \? "touch" : "default"\}[\s\S]*?className="w-full"[\s\S]*?>/g,
      ) ?? []
    ).length,
    2,
    "issue add-line unit selectors must stay touch-sized in embedded stock",
  );
  assert.match(
    issueDetailClient,
    /size=\{embedded \? "touch-lg" : "default"\}/,
  );
  assert.match(issueDetailClient, /size=\{embedded \? "icon-touch" : "icon"\}/);
  assert.match(appSurface, /sticky chrome-safe-bottom/);
  assert.match(appSurface, /border-t border-border/);
  assert.match(appSurface, /shadow-lg/);
  assert.match(appSurface, /data-slot=button/);
  assert.match(issueDetailClient, /<AppDetailFooter[\s\S]*sticky=\{embedded\}/);
  assert.match(
    formDialog,
    /actionSize\?: ComponentProps<typeof Button>\["size"\]/,
  );
  assert.equal(
    (formDialog.match(/size=\{actionSize\}/g) ?? []).length,
    2,
    "FormDialog action buttons must keep opt-in touch sizing",
  );
  assert.match(formCombobox, /size\?: ComponentProps<typeof Button>\["size"\]/);
  assert.match(formCombobox, /size=\{size\}/);
  assert.match(formCombobox, /size = "field"/);
  assert.match(formCombobox, /<Button[\s\S]*size=\{size\}/);

  assert.match(purchaseOrdersPage, /routeBranchId\?: number/);
  assert.match(purchaseOrdersPage, /embedded\?: boolean/);
  assert.match(purchaseOrdersPage, /embedded=\{embedded\}/);
  assert.match(purchaseOrdersPage, /scope\.outOfScope/);
  assert.match(purchaseOrdersClient, /suppliersPath\?: string \| null/);
  assert.match(purchaseOrdersClient, /embedded\?: boolean/);
  assert.match(purchaseOrdersClient, embeddedContentWrapperPattern);
  assert.match(
    purchaseOrdersClient,
    /const isOperator = purchaseOrdersBasePath\.startsWith\("\/br\/"\)/,
  );
  assert.match(
    purchaseOrdersClient,
    /const controlSize = isOperator \? "touch" : "default"/,
  );
  assert.match(purchaseOrdersClient, /<AppToolbar\s+variant="inline"/);
  assert.match(
    purchaseOrdersClient,
    /<InputGroup className=\{fieldClassName\}/,
  );
  assert.match(purchaseOrdersClient, /suppliersPath \?/);
  assert.match(grnPage, /loadGrnListPageData/);
  assert.match(grnPage, /includeDrafts: showDrafts/);
  assert.match(grnPage, /canCreate=\{data\.canCreate\}/);
  assert.match(
    grnPage,
    /drafts=\{showDrafts && data\.canCreate \? data\.drafts : undefined\}/,
  );
  assert.match(
    grnPage,
    /draftsLoadFailed=\{showDrafts && data\.canCreate && data\.draftsLoadFailed\}/,
  );
  assert.match(grnPage, /grnsLoadFailed=\{data\.grnsLoadFailed\}/);
  assert.doesNotMatch(grnPage, /routeBranchId/);
  assert.match(grnListClient, /<DataTable/);
  assert.doesNotMatch(
    grnListClient,
    /basePath\.startsWith\("\/br\/"\)|OperatorFlowSteps|embedded/,
  );
  assert.match(grnListData, /import "server-only"/);
  assert.match(grnListData, /listMyGrnDrafts\(routeBranchId\)/);
  assert.match(branchGrnListClient, /BranchOperatorPage/);
  assert.match(branchGrnListClient, /BranchOperatorPanel/);
  assert.match(branchGrnListClient, /ItemGroup/);
  assert.match(branchGrnListClient, /size="touch"/);
  assert.match(branchGrnListClient, /discardGrnDraft/);
  assert.match(
    branchGrnListClient,
    /className="min-h-20 items-center gap-2 p-0 touch-manipulation"/,
  );
  assert.match(
    branchGrnListClient,
    /self-stretch items-center gap-3 px-3 py-2/,
  );
  assert.match(
    branchGrnListClient,
    /aria-disabled=\{disabled \|\| undefined\}/,
  );
  assert.equal(
    (branchGrnListClient.match(/role="listitem"/g) ?? []).length,
    2,
    "Branch GRN list rows must retain listitem semantics",
  );
  assert.match(
    branchGrnListClient,
    /draft\.poId != null\s*\?\s*`\$\{basePath\}\/\$\{draft\.grnId\}`/,
  );
  assert.doesNotMatch(
    branchGrnListClient,
    /\bDataTable\b|\bGrnListClient\b|\bembedded\b|\buseLongPress\b|\bformatVND\b|overflow-x-auto/,
  );
  assert.match(grnListClient, /touch-manipulation select-none cursor-pointer/);
  assert.doesNotMatch(grnListClient, /touch-none/);
  assert.match(grnDetailClient, /embedded\?: boolean/);
  assert.match(grnDetailClient, /embedded = false/);
  assert.match(grnDetailClient, embeddedContentWrapperPattern);
  assert.doesNotMatch(grnDetailEmbeddedBranch, /AppPageHeader|<AppPage/);
  assert.match(newPoPage, /routeBranchId\?: number/);
  assert.match(newPoPage, /poBasePath\?: string/);
  assert.match(newPoPage, /embedded\?: boolean/);
  assert.match(newPoPage, /embedded=\{embedded\}/);
  assert.match(newPoClient, /embedded\?: boolean/);
  // R2 — no nested page shell. The new-PO form composes header/body/footer:
  // embedded returns the bare flex wrapper as its FIRST return path (no
  // AppPage/DocumentFormFrame chrome), and the office plane wraps the same
  // body in DocumentFormFrame (an AppPage-backed desktop shell) only after
  // the embedded short-circuit. Pinning the embedded branch to the bare div
  // keeps it from ever re-nesting the desktop frame.
  assert.match(
    newPoClient,
    /if \(embedded\) \{\s*return \(\s*<div className="flex w-full flex-col gap-3">[\s\S]*?\}\s*return \(\s*<DocumentFormFrame/,
  );
  assert.doesNotMatch(newPoClientEmbeddedBranch, /\{header\}/);
  assert.match(newPoClientEmbeddedBranch, /<AppDetailFooter[\s\S]*\bsticky\b/);
  assert.match(newPoClient, /<SuggestionsPanel[\s\S]*embedded=\{embedded\}/);
  assert.equal(
    (newPoClient.match(/size=\{embedded \? "touch" : "sm"\}/g) ?? []).length,
    3,
    "embedded new-PO suggestion actions must be touch-sized",
  );
  assert.match(newPoClient, /size=\{embedded \? "touch-lg" : "default"\}/);
  assert.match(
    newPoClient,
    /className=\{embedded \? "min-h-12 w-full" : "w-40"\}/,
  );
  assert.match(
    newPoClient,
    /className=\{embedded \? "min-h-12 w-full" : "w-28"\}/,
  );
  assert.equal(
    (
      newPoClient.match(
        /<SelectTrigger size="touch" className="w-full" aria-label=\{unit\}>/g,
      ) ?? []
    ).length,
    2,
    "new-PO add-line unit picker must stay touch-sized",
  );
  assert.match(
    newPoPage,
    /canSwitchBranch=\{routeBranchId == null && !isBranchScoped\}/,
  );
  assert.match(poDetailPage, /routeBranchId\?: number/);
  assert.match(poDetailPage, /embedded\?: boolean/);
  assert.match(poDetailPage, /embedded=\{embedded\}/);
  assert.match(poDetailPage, /d\.po\.branch_id !== routeBranchId/);
  assert.match(
    poDetailClient,
    /purchaseOrdersBasePath = "\/inventory\/purchase-orders"/,
  );
  assert.match(poDetailClient, /embedded\?: boolean/);
  assert.match(poDetailClient, embeddedContentWrapperPattern);
  assert.match(
    poDetailClient,
    /afterCreateGrnHref[\s\S]*replace\(":id", String\(created\.id\)\)/,
  );
  assert.match(
    poDetailClient,
    /triggerClassName=\{\s*embedded \? "h-12 border-dashed" : "h-9 border-dashed"\s*\}/,
  );
  assert.match(poDetailClient, /size=\{embedded \? "touch" : "default"\}/);
  assert.match(
    poLineMobileCard,
    /<SelectTrigger[\s\S]*size="touch"[\s\S]*className="min-h-12"[\s\S]*aria-label=\{FORM_VI\.unit\}/,
  );
  assert.match(poLineMobileCard, /className="h-12"/);
  assert.match(poLineMobileCard, /size="touch"[\s\S]*poDetailCopy\.saveLine/);

  assert.match(reportsPage, /export async function ReportsPageContent\(\)/);
  assert.match(reportsPage, /fetchApAging\(\)/);
  assert.doesNotMatch(
    reportsPage,
    /routeBranchId|resolveInventoryBranchScope|embedded/,
  );
  assert.match(reportsClient, /<AppPageHeader/);
  assert.match(
    reportsClient,
    /<AppPage width="xwide" density="compact" scroll>/,
  );
  assert.doesNotMatch(reportsClient, /supplierInvoicesHref|embedded/);
});

test("operator stock GRN source and receipt form keep Branch-native presentation", () => {
  const grnNewRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/page.tsx",
  );
  const branchGrnSourceClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/branch-grn-source-picker-client.tsx",
  );
  const grnCreateRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/page.tsx",
  );
  const branchGrnCreateClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/branch-grn-create-client.tsx",
  );
  const grnNewPage = read(
    "apps/web/app/(protected)/inventory/grn/new/page.tsx",
  );
  const grnSourceData = read("apps/web/lib/inventory/grn-source-data.ts");
  const grnSourceModel = read("apps/web/lib/inventory/grn-source-model.ts");
  const grnFromPoList = read(
    "apps/web/app/(protected)/inventory/grn/new/grn-from-po-list.tsx",
  );
  const grnCreatePage = read(
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/page.tsx",
  );
  const grnCreateClient = read(
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  );
  const grnCreateData = read("apps/web/lib/inventory/grn-create-data.ts");
  const grnCreateController = read(
    "apps/web/lib/inventory/use-grn-create-controller.ts",
  );
  const grnLineEditor = read(
    "apps/web/app/components/inventory/grn-line-editor.tsx",
  );

  assert.match(grnNewRoute, /params: Promise<\{ branchId: string \}>/);
  assert.match(grnNewRoute, /BranchGrnSourcePickerClient/);
  assert.match(grnNewRoute, /loadGrnSourcePageData/);
  assert.match(grnNewRoute, /routeBranchId: branchId/);
  assert.match(
    grnNewRoute,
    /redirect\(grnSourceSupplierHref\(sourceBasePath, selectedSupplierId\)\)/,
  );
  assert.doesNotMatch(
    grnNewRoute,
    /GrnNewPageContent|DocumentFormFrame|DataTable|embedded/,
  );
  assert.match(branchGrnSourceClient, /BranchOperatorPage/);
  assert.match(branchGrnSourceClient, /BranchOperatorPanel/);
  assert.match(branchGrnSourceClient, /AppDetailFooter/);
  assert.match(
    branchGrnSourceClient,
    /href=\{`\/br\/\$\{branchId\}\/stock\/grn`\}/,
  );
  assert.match(branchGrnSourceClient, /ItemGroup/);
  assert.match(branchGrnSourceClient, /createSupplier/);
  assert.match(branchGrnSourceClient, /createGrnFromPo/);
  assert.match(branchGrnSourceClient, /grnSourceSupplierHref/);
  assert.match(branchGrnSourceClient, /min-h-20 touch-manipulation/);
  assert.doesNotMatch(
    branchGrnSourceClient,
    /GrnNewPageContent|DocumentFormFrame|DataTable|embedded|formatVND|overflow-x-auto/,
  );
  assert.match(grnSourceData, /import "server-only"/);
  assert.match(grnSourceData, /resolveInventoryListScope/);
  assert.match(
    grnSourceData,
    /probePermission\(auth, PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE, branchId\)/,
  );
  assert.match(grnSourceData, /fetchOpenPurchaseOrdersForReceiving/);
  assert.match(grnSourceModel, /export function grnSourceSupplierHref/);
  assert.match(grnSourceModel, /export function parseGrnSupplierIdParam/);

  assert.match(
    grnCreateRoute,
    /params: Promise<\{ branchId: string; supplierId: string \}>/,
  );
  assert.match(grnCreateRoute, /BranchGrnCreateClient/);
  assert.match(grnCreateRoute, /loadGrnCreatePageData/);
  assert.match(grnCreateRoute, /supplierId,/);
  assert.match(grnCreateRoute, /routeBranchId: branchId/);
  assert.match(
    grnCreateRoute,
    /sourceBasePath = `\/br\/\$\{branchId\}\/stock\/grn\/new`/,
  );
  assert.match(
    grnCreateRoute,
    /grnBasePath=\{`\/br\/\$\{branchId\}\/stock\/grn`\}/,
  );
  assert.doesNotMatch(
    grnCreateRoute,
    /GrnCreatePageContent|DocumentFormFrame|embedded/,
  );
  assert.match(branchGrnCreateClient, /BranchOperatorPage/);
  assert.match(branchGrnCreateClient, /BranchOperatorPanel/);
  assert.match(branchGrnCreateClient, /AppDetailFooter/);
  assert.match(branchGrnCreateClient, /GrnLineEditSheet/);
  assert.match(branchGrnCreateClient, /useGrnCreateController/);
  assert.match(branchGrnCreateClient, /size="touch"/);
  assert.match(
    branchGrnCreateClient,
    /lg:grid-cols-\[minmax\(0,0\.85fr\)_minmax\(0,1\.15fr\)\]/,
  );
  assert.doesNotMatch(
    branchGrnCreateClient,
    /DocumentFormFrame|DataTable|AppPageHeader|AppSection|\bGrnCreateClient\b|embedded|overflow-x-auto/,
  );
  assert.doesNotMatch(branchGrnCreateClient, /handleBranchChange/);

  assert.match(grnNewPage, /supplierId\?: string \| string\[\]/);
  assert.match(grnNewPage, /loadGrnSourcePageData/);
  assert.match(grnNewPage, /selectedSupplierId != null/);
  assert.match(grnNewPage, /supplierId=\{selectedSupplierId\}/);
  assert.doesNotMatch(
    grnNewPage,
    /routeBranchId\?: number|embedded\?: boolean/,
  );
  assert.match(grnFromPoList, /grnBasePath = "\/inventory\/grn"/);
  assert.match(
    grnFromPoList,
    /router\.push\(`\$\{grnBasePath\}\/\$\{grn\.id\}`\)/,
  );

  assert.match(grnCreatePage, /supplierId: number/);
  assert.match(grnCreatePage, /routeBranchId\?: number/);
  assert.match(grnCreatePage, /basePath\?: string/);
  assert.match(grnCreatePage, /grnBasePath\?: string/);
  assert.match(grnCreatePage, /loadGrnCreatePageData/);
  assert.doesNotMatch(grnCreatePage, /embedded|resolveInventoryListScope/);
  assert.match(grnCreateData, /import "server-only"/);
  assert.match(grnCreateData, /resolveInventoryListScope/);
  assert.match(
    grnCreateData,
    /probePermission\(\s*auth,\s*PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE,\s*scope\.selectedBranchId,\s*\)/,
  );
  assert.match(
    grnCreateData,
    /PERMISSION_KEYS\.PROCUREMENT_GRN_CONFIRM,\s*scope\.selectedBranchId/,
  );
  assert.match(grnCreateClient, /basePath\?: string/);
  assert.match(grnCreateClient, /grnBasePath\?: string/);
  assert.match(grnCreateClient, /useGrnCreateController/);
  assert.match(grnCreateClient, /DocumentFormFrame/);
  assert.doesNotMatch(grnCreateClient, /embedded/);
  assert.match(grnCreateController, /serverDraftPromiseRef/);
  assert.match(grnCreateController, /createGrnDraft/);
  assert.match(grnCreateController, /upsertGrnLine/);
  assert.match(grnCreateController, /confirmGrn/);
  assert.match(
    grnCreateController,
    /router\.push\(`\$\{grnBasePath\}\/\$\{grnId\}\?review=1`\)/,
  );
  assert.match(grnLineEditor, /<SheetContent[\s\S]*side="bottom"/);
  assert.match(grnLineEditor, /<SelectTrigger size="touch"/);
});

test("branch transfer fallback stays inside the Branch shell", () => {
  const transfersPage = read(
    "apps/web/app/(protected)/inventory/transfers/page.tsx",
  );
  assert.match(
    transfersPage,
    /if \(routeBranchId != null\) \{\s*redirect\(`\/br\/\$\{routeBranchId\}\/stock\/transfer\/new`\);\s*\}/,
    "branch transfer fallback must stay under /br/[branchId]/stock",
  );
});

test("transfer receive full receipt stays one-click on the existing atomic action", () => {
  // Receive happens inline on the detail page (action: "receive"); the
  // standalone [id]/receive sub-route was an unreachable orphan and was
  // removed.
  assert.equal(
    exists(
      "apps/web/app/(protected)/inventory/transfers/[id]/receive/transfer-receive-client.tsx",
    ),
    false,
  );

  const detailClient = read(
    "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  );
  const transferActions = read(
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
  );

  assert.match(
    detailClient,
    /const noteOk = !hasShort \|\| shortNote\.trim\(\)\.length >= 3;/,
  );
  assert.match(detailClient, /transferReceive\(transfer\.id, payload\)/);
  assert.match(
    detailClient,
    /className=\{embedded \? "h-12 text-right" : "h-9 text-right"\}/,
  );
  assert.match(detailClient, /embedded=\{embedded\}/);
  assert.equal(
    (detailClient.match(/size=\{embedded \? "touch" : "default"\}/g) ?? [])
      .length,
    2,
    "embedded transfer detail footer actions must be touch-sized",
  );
  assert.match(detailClient, /className=\{embedded \? "h-12" : "h-9"\}/);
  assert.match(transferActions, /stock_transfer_receive/);
  assert.match(transferActions, /p_items: items \?\? null/);
});

test("operator waste approvals own a native Branch review queue", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/page.tsx",
  );
  const officePage = read(
    "apps/web/app/(protected)/inventory/waste/approvals/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  );
  const branchClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/branch-waste-approvals-client.tsx",
  );
  const data = read("apps/web/lib/inventory/waste-approvals-data.ts");
  const operatorQueue = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-queue-section.tsx",
  );
  const shiftPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );
  const employeeHome = read("apps/web/lib/staff-runtime/page.tsx");

  assert.match(route, /params: Promise<\{ branchId: string \}>/);
  assert.match(route, /loadBranchWasteApprovalsData\(branchId\)/);
  assert.match(route, /<BranchWasteApprovalsClient/);
  assert.doesNotMatch(route, /WasteApprovalsPageContent|embedded/);
  assert.doesNotMatch(route, /redirect\(`\/inventory\/waste/);

  assert.match(data, /import "server-only"/);
  assert.match(data, /resolveInventoryListScope/);
  assert.match(data, /currentUserHasPermission/);
  assert.match(data, /PERMISSION_KEYS\.INVENTORY_WASTE_APPROVE/);
  assert.match(branchClient, /BranchOperatorPage/);
  assert.match(branchClient, /<SheetContent[\s\S]*side="bottom"/);
  assert.match(branchClient, /approveWaste/);
  assert.match(branchClient, /await confirm/);
  assert.doesNotMatch(
    branchClient,
    /\bWasteApprovalsClient\b|DataTable|embedded/,
  );

  assert.match(officePage, /loadWasteApprovalsData/);
  assert.match(client, /<AppPage/);
  assert.doesNotMatch(officePage, /routeBranchId|embedded/);
  assert.doesNotMatch(client, /embedded/);

  assert.match(operatorQueue, /href: `\$\{basePath\}\/stock\/waste-approvals`/);
  assert.match(
    shiftPage,
    /wasteApprovals: `\/br\/\$\{branchId\}\/stock\/waste-approvals`/,
  );
  assert.match(employeeHome, /wasteApprovals: "\/inventory\/waste\/approvals"/);
});

test("operator stock issues keep internal issue workflow native to Branch", () => {
  const listRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/page.tsx",
  );
  const detailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/[id]/page.tsx",
  );
  const listClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/branch-stock-issues-list-client.tsx",
  );
  const detailClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/[id]/branch-stock-issue-detail-client.tsx",
  );
  const data = read("apps/web/lib/inventory/branch-stock-issue-data.ts");
  const model = read("apps/web/lib/inventory/stock-issue-model.ts");

  assert.match(listRoute, /loadBranchStockIssueListData\(branchId\)/);
  assert.match(listRoute, /<BranchStockIssuesListClient/);
  assert.doesNotMatch(listRoute, /IssuesPageContent|embedded|DataTable/);
  assert.match(
    detailRoute,
    /loadBranchStockIssueDetailData\(issueId, branchId\)/,
  );
  assert.match(detailRoute, /<BranchStockIssueDetailClient/);
  assert.doesNotMatch(detailRoute, /IssueDetailPageContent|embedded|DataTable/);

  assert.match(listClient, /BranchOperatorPage/);
  assert.match(listClient, /ItemGroup/);
  assert.match(listClient, /<Sheet/);
  assert.doesNotMatch(listClient, /DataTable|useLongPress|FormDialog/);
  assert.match(detailClient, /BranchOperatorDetailList/);
  assert.match(detailClient, /<AppDetailFooter[\s\S]*\bsticky\b/);
  assert.match(detailClient, /<Sheet/);
  assert.doesNotMatch(
    detailClient,
    /DataTable|AuditHistoryList|DocumentStockCorrectionDialog/,
  );

  assert.match(data, /resolveInventoryListScope/);
  assert.match(data, /resolveInventoryBranchScope/);
  assert.match(data, /issueTypes: \["writeoff", "other"\]/);
  assert.match(data, /INVENTORY_WRITEOFF/);
  assert.match(data, /detail\.issue\.branch_id !== routeBranchId/);
  assert.match(model, /canConfirmBranchStockIssue/);
});

test("operator stocktake routes keep session stocktake native to Branch", () => {
  const stocktakeRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/page.tsx",
  );
  const stocktakeNewRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/new/page.tsx",
  );
  const stocktakeDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/page.tsx",
  );
  const stocktakeCountRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/count/page.tsx",
  );
  const branchListClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/branch-stocktake-list-client.tsx",
  );
  const branchNewClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/new/branch-stocktake-new-client.tsx",
  );
  const branchDetailClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/branch-stocktake-detail-client.tsx",
  );
  const branchCountClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/count/branch-stocktake-count-client.tsx",
  );
  const stocktakeData = read("apps/web/lib/inventory/branch-stocktake-data.ts");
  const stocktakeModel = read("apps/web/lib/inventory/stocktake-model.ts");

  assert.match(stocktakeRoute, /loadBranchStocktakeListData\(branchId\)/);
  assert.match(stocktakeNewRoute, /loadBranchStocktakeStartData\(branchId\)/);
  assert.match(
    stocktakeDetailRoute,
    /loadBranchStocktakeDetailData\(stocktakeId, branchId\)/,
  );
  assert.match(stocktakeDetailRoute, /stocktake_redesigned_not_enabled/);
  assert.match(
    stocktakeCountRoute,
    /loadBranchStocktakeCountData\(stocktakeId, branchId\)/,
  );

  for (const source of [
    stocktakeRoute,
    stocktakeNewRoute,
    stocktakeDetailRoute,
    stocktakeCountRoute,
  ]) {
    assert.doesNotMatch(source, /Stocktake\w*PageContent|embedded/);
    assert.doesNotMatch(source, /EmployeeCountPageContent|\/stock\/count/);
  }

  assert.match(branchListClient, /BranchOperatorPage/);
  assert.match(branchListClient, /ItemGroup/);
  assert.doesNotMatch(branchListClient, /DataTable|useLongPress|Drawer/);
  assert.match(branchNewClient, /BranchOperatorPage/);
  assert.match(branchNewClient, /<StocktakeModeSelector/);
  assert.match(branchNewClient, /<AppDetailFooter[\s\S]*\bsticky\b/);
  assert.doesNotMatch(branchNewClient, /DocumentFormFrame|branches\.map/);
  assert.match(branchDetailClient, /BranchOperatorStatusStrip/);
  assert.match(branchDetailClient, /canCompleteBranchStocktake/);
  assert.doesNotMatch(branchDetailClient, /DataTable|AuditHistoryList|reports/);
  assert.match(branchCountClient, /<StocktakeCountWizard/);
  assert.match(branchCountClient, /onUnitChange=\{onUnitChange\}/);
  assert.match(branchCountClient, /useStocktakeDraftSaver/);
  assert.match(branchCountClient, /ZoneLockIndicator/);
  assert.doesNotMatch(branchCountClient, /DocumentFormFrame|DataTable/);

  assert.match(stocktakeData, /resolveInventoryListScope/);
  assert.match(stocktakeData, /resolveInventoryBranchScope/);
  assert.match(stocktakeData, /getStocktakeLinesBlind/);
  assert.match(stocktakeData, /INVENTORY_STOCKTAKE_COMPLETE/);
  assert.match(stocktakeData, /status === "in_progress"/);
  assert.match(stocktakeData, /systemQuantity: null/);
  assert.match(stocktakeModel, /canCompleteBranchStocktake/);
});

test("operator transfer routes keep list, create, detail, and form actions branch-scoped", () => {
  const transferRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx",
  );
  const transferNewRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/page.tsx",
  );
  const transferDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/page.tsx",
  );
  const transfersPage = read(
    "apps/web/app/(protected)/inventory/transfers/page.tsx",
  );
  const transferNewPage = read(
    "apps/web/app/(protected)/inventory/transfers/new/page.tsx",
  );
  const transferDetailPage = read(
    "apps/web/app/(protected)/inventory/transfers/[id]/page.tsx",
  );
  const transferDetailClient = read(
    "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  );
  const branchTransferDetailClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/branch-transfer-detail-client.tsx",
  );
  const branchTransferCreateClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/branch-transfer-create-client.tsx",
  );
  const transferCreateData = read(
    "apps/web/lib/inventory/transfer-create-data.ts",
  );
  const transferCreateModel = read(
    "apps/web/lib/inventory/transfer-create-model.ts",
  );
  const transferCreateController = read(
    "apps/web/lib/inventory/use-transfer-create-controller.ts",
  );
  const transferDetailData = read(
    "apps/web/lib/inventory/transfer-detail-data.ts",
  );
  const transferDetailModel = read(
    "apps/web/lib/inventory/transfer-detail-model.ts",
  );
  const transfersListClient = read(
    "apps/web/app/(protected)/inventory/transfers/transfers-list-client.tsx",
  );
  const createTransferForm = read(
    "apps/web/app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
  );
  const transferActions = read(
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
  );
  const transferListModel = read(
    "apps/web/app/(protected)/inventory/transfers/transfer-list-model.ts",
  );
  assert.match(transferRoute, /BranchOperatorPage/);
  assert.match(transferRoute, /BranchOperatorPanel/);
  assert.match(transferRoute, /BranchOperatorActionSection/);
  assert.match(transferRoute, /fetchStockTransfers\(branchId\)/);
  assert.match(transferRoute, /fetchBranchesForTransfer\(\)/);
  assert.match(
    transferRoute,
    /resolveBranchContext\(supabase, claims, branchId\)/,
  );
  assert.match(transferRoute, /classifyTransfer/);
  assert.match(transferRoute, /compareTransferQueue/);
  assert.match(transferRoute, /copy\.requestGoods/);
  assert.match(transferRoute, /isTransferReceiveReady\(row\.status\)/);
  assert.match(
    transferRoute,
    /`\/br\/\$\{branchId\}\/stock\/receive\/\$\{row\.id\}`/,
  );
  assert.match(
    transferRoute,
    /`\/br\/\$\{branchId\}\/stock\/transfer\/\$\{row\.id\}`/,
  );
  assert.match(
    transferRoute,
    /href: `\/br\/\$\{branchId\}\/stock\/transfer\/new`/,
  );
  assert.doesNotMatch(transferRoute, /TransfersPageContent/);
  assert.doesNotMatch(transferRoute, /TransfersListClient/);
  assert.doesNotMatch(transferRoute, /DataTable/);
  assert.doesNotMatch(transferRoute, /embedded/);

  assert.match(
    transferNewRoute,
    /const basePath = `\/br\/\$\{branchId\}\/stock\/transfer`/,
  );
  assert.match(
    transferNewRoute,
    /loadTransferCreatePageData\(\{ routeBranchId: branchId \}\)/,
  );
  assert.match(transferNewRoute, /<BranchOperatorPage/);
  assert.match(transferNewRoute, /<BranchTransferCreateClient/);
  assert.match(transferNewRoute, /operatorFlow\.kitchenDispatchTitle/);
  assert.match(transferNewRoute, /operatorFlow\.kitchenDispatchDescription/);
  assert.doesNotMatch(
    transferNewRoute,
    /NewTransferPageContent|DocumentFormFrame|CreateTransferForm|embedded/,
  );
  assert.doesNotMatch(transferNewRoute, /href=\{?["'`]\/inventory\/transfers/);

  assert.match(branchTransferCreateClient, /useTransferCreateController/);
  assert.match(branchTransferCreateClient, /branchScopeInPath: true/);
  assert.match(branchTransferCreateClient, /BranchOperatorPanel/);
  assert.match(
    branchTransferCreateClient,
    /md:grid-cols-\[minmax\(0,0\.85fr\)_minmax\(0,1\.15fr\)\]/,
  );
  assert.match(branchTransferCreateClient, /size="touch"/);
  assert.match(branchTransferCreateClient, /size="touch-lg"/);
  assert.match(branchTransferCreateClient, /copy\.kitchenDispatchNative/);
  assert.match(branchTransferCreateClient, /className="min-h-11 py-2\.5"/);
  assert.match(branchTransferCreateClient, /className="h-11 min-w-11 px-2"/);
  assert.match(branchTransferCreateClient, /<AppDetailFooter[\s\S]*sticky/);
  assert.match(branchTransferCreateClient, /inputMode="decimal"/);
  assert.doesNotMatch(
    branchTransferCreateClient,
    /DocumentFormFrame|DataTable|CreateTransferForm|embedded/,
  );
  assert.match(transferCreateData, /"production_storage"/);
  assert.match(transferCreateData, /itemKind: ingredient\.item_kind \?\? null/);
  assert.match(transferCreateModel, /getTransferSourceLocationOptions/);
  assert.match(transferCreateModel, /location\.kind === "production_storage"/);
  assert.match(transferCreateModel, /getTransferSelectableIngredients/);
  assert.match(transferCreateModel, /ingredient\.itemKind === "finished_good"/);
  assert.match(
    transferCreateController,
    /sourceBranchKind: selectedSourceBranch\?\.branch_kind \?\? null/,
  );

  assert.match(transferDetailRoute, /loadTransferDetailPageData/);
  assert.match(transferDetailRoute, /routeBranchId: branchId/);
  assert.match(transferDetailRoute, /includeAudit: false/);
  assert.match(transferDetailRoute, /includeCorrections: false/);
  assert.match(transferDetailRoute, /<BranchOperatorPage/);
  assert.match(transferDetailRoute, /<BranchTransferDetailClient/);
  assert.match(
    transferDetailRoute,
    /const listHref = `\/br\/\$\{branchId\}\/stock\/transfer`/,
  );
  assert.doesNotMatch(transferDetailRoute, /TransferDetailPageContent/);
  assert.doesNotMatch(transferDetailRoute, /<TransferDetailClient/);
  assert.doesNotMatch(transferDetailRoute, /DataTable|embedded/);
  assert.doesNotMatch(
    transferDetailRoute,
    /@\/\(protected\)\/inventory\/transfers\/\[id\]\/page/,
  );
  assert.doesNotMatch(
    transferDetailRoute,
    /href=\{?["'`]\/inventory\/transfers/,
  );

  assert.match(branchTransferDetailClient, /getTransferActionConfig/);
  assert.match(branchTransferDetailClient, /BranchOperatorControlBar/);
  assert.match(branchTransferDetailClient, /BranchOperatorDetailList/);
  assert.match(branchTransferDetailClient, /size="icon-touch"/);
  assert.match(
    branchTransferDetailClient,
    /const receiveHref = `\/br\/\$\{branchId\}\/stock\/receive\/\$\{transfer\.id\}`/,
  );
  assert.match(
    branchTransferDetailClient,
    /md:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(17rem,0\.65fr\)\]/,
  );
  assert.match(branchTransferDetailClient, /<AppDetailFooter sticky/);
  assert.doesNotMatch(branchTransferDetailClient, /DataTable|embedded/);
  assert.doesNotMatch(
    branchTransferDetailClient,
    /@\/\(protected\)\/inventory\/transfers\/\[id\]\/transfer-detail-client/,
  );

  assert.match(transfersPage, /basePath = "\/inventory\/transfers"/);
  assert.match(transfersPage, /basePath=\{basePath\}/);
  assert.match(transfersPage, /createBasePath=\{createBasePath\}/);
  assert.match(transferNewPage, /basePath=\{basePath\}/);
  assert.match(transferNewPage, /<DocumentFormFrame/);
  assert.match(transferNewPage, /loadTransferCreatePageData/);
  assert.match(transferNewPage, /queryBranchId: params\.branchId/);
  assert.match(transferNewPage, /<CreateTransferForm/);
  assert.doesNotMatch(transferNewPage, /BranchOperatorPage/);
  assert.match(
    transferNewPage,
    /withTransferBranchQuery\(basePath, data\.userBranchId\)/,
  );
  assert.doesNotMatch(transferNewPage, /routeBranchId|embedded/);
  assert.match(transferCreateData, /import "server-only"/);
  assert.match(transferCreateData, /resolveInventoryListScope/);
  assert.match(transferCreateData, /fetchBranchesForTransfer/);
  assert.match(transferCreateData, /fetchIngredients/);
  assert.match(transferCreateData, /sourceLocationsByBranch/);
  assert.match(transferCreateData, /sourceStockByLocation/);
  assert.match(transferCreateModel, /resolveTransferCreatePolicy/);
  assert.match(transferCreateModel, /buildTransferLinesPayload/);
  assert.match(transferCreateController, /createStockTransfer/);
  assert.match(transferCreateController, /branchScopeInPath/);
  assert.match(transferCreateController, /selectedSourceLocationId/);
  assert.match(transferCreateController, /router\.refresh\(\)/);
  assert.match(
    transferDetailPage,
    /routeBranchId != null\s*\?\s*basePath\s*:\s*data\.userBranchId != null/,
  );
  assert.match(transferDetailPage, /loadTransferDetailPageData/);
  assert.match(transferDetailData, /fetchStockTransferDetail/);
  assert.match(transferDetailData, /resolveInventoryListScope/);
  assert.match(transferDetailData, /includeAudit = true/);
  assert.match(transferDetailData, /includeCorrections = true/);
  assert.match(transferDetailModel, /export function getTransferActionConfig/);
  assert.match(transferDetailModel, /export function isTransferReceiveReady/);
  assert.match(transferDetailClient, /listHref \?\?/);
  assert.match(transferDetailClient, /getTransferActionConfig/);
  assert.match(transferDetailClient, /isTransferReceiveReady/);
  assert.match(
    transferDetailClient,
    /<AppDetailFooter[\s\S]*sticky=\{embedded\}/,
  );
  assert.match(transferCreateModel, /canCreateInboundRequest/);
  assert.match(transferCreateModel, /requestDestinationBranchId/);
  assert.match(transferCreateModel, /inboundSourceOptions/);
  assert.match(
    transferCreateController,
    /fromBranchId = Number\(inboundFromBranchId\)/,
  );
  assert.match(transfersListClient, /canCreateInboundRequest/);
  assert.match(transfersListClient, /isBranchManager \? copy\.requestGoods/);
  assert.match(
    transfersListClient,
    /createPathBase = createBasePath \?\? basePath/,
  );
  assert.match(
    transferListModel,
    /userRole === "branch_manager" && viewerBranchId === toId/,
  );
  assert.match(transfersListClient, /classifyTransfer/);
  assert.match(transfersListClient, /compareTransferQueue/);
  assert.match(transfersListClient, /if \(isOperator\) \{/);
  assert.match(transfersListClient, /<AppToolbar\s+variant="inline"/);
  assert.doesNotMatch(transfersListClient, /<AppToolbar\s+variant="card"/);
  assert.match(
    transferActions,
    /claims\.user_role === "branch_manager"[\s\S]*toBranchId !== claims\.branch_id/,
  );
  assert.match(
    transferActions,
    /fromKind !== "central_supply"\s*&&\s*fromKind !== "central_kitchen"/,
  );
  assert.match(
    transferActions,
    /\.array\(transferLineInputSchema\)\s*\.min\(1/,
  );
  assert.match(createTransferForm, /useTransferCreateController/);
  assert.match(createTransferForm, /href=\{controller\.listHref\}/);
  assert.match(createTransferForm, /className="flex min-w-0 flex-col gap-4"/);
  assert.match(createTransferForm, /<AppSection/);
  assert.doesNotMatch(createTransferForm, /<OperatorFlowSteps/);
  assert.doesNotMatch(
    createTransferForm,
    /BranchOperatorPage|BranchOperatorPanel|AppDetailFooter|embedded/,
  );
  assert.doesNotMatch(
    transferCreateController,
    /router\.(?:push|replace)\(\s*["'`]\/inventory\/transfers/,
  );
});

test("operator count assignments render branch-native inside the branch operator shell (D059 §4 slice 2)", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/page.tsx",
  );
  const officePage = read(
    "apps/web/app/(protected)/inventory/count-assignments/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  );
  const navConfig = read("packages/shared/src/auth/nav-config.ts");

  assert.match(route, /params: Promise<\{ branchId: string \}>/);
  assert.match(route, /CountAssignmentsPageContent/);
  assert.match(route, /routeBranchId=\{branchId\}/);
  assert.match(
    route,
    /basePath=\{`\/br\/\$\{branchId\}\/stock\/count-assignments`\}/,
  );
  assert.match(route, /embedded/);
  assert.doesNotMatch(route, /redirect\(`\/inventory\/count-assignments/);

  assert.match(officePage, /export async function CountAssignmentsPageContent/);
  assert.match(officePage, /routeBranchId\?: number/);
  assert.match(officePage, /basePath\?: string/);
  assert.match(officePage, /embedded\?: boolean/);
  assert.match(officePage, /embedded=\{embedded\}/);
  assert.match(client, /embedded\?: boolean/);
  assert.match(client, /const content = \(\s*<>/);
  assert.match(client, /if \(embedded\) \{\s*return content;\s*\}/);
  assert.match(client, /return <AppPage scroll>\{content\}<\/AppPage>;/);

  assert.match(
    navConfig,
    /moduleKey: "employee_checkout_approvals",\s*icon: "ClipboardList",\s*group: "stock",\s*hrefTemplate: "\/br\/\{branchId\}\/stock\/count-assignments"/,
  );
});

test("operator supplier returns keep the rejected-GRN workflow native to Branch", () => {
  const listRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/page.tsx",
  );
  const newRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/new/page.tsx",
  );
  const detailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/[id]/page.tsx",
  );
  const listClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/branch-supplier-returns-list-client.tsx",
  );
  const createClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/new/branch-supplier-return-create-client.tsx",
  );
  const detailClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/[id]/branch-supplier-return-detail-client.tsx",
  );
  const dataSource = read(
    "apps/web/lib/inventory/branch-supplier-return-data.ts",
  );
  const modelSource = read("apps/web/lib/inventory/supplier-return-model.ts");
  const navConfig = read("packages/shared/src/auth/nav-config.ts");

  assert.match(listRoute, /params: Promise<\{ branchId: string \}>/);
  assert.match(listRoute, /loadBranchSupplierReturnListData/);
  assert.match(listRoute, /BranchSupplierReturnsListClient/);
  assert.doesNotMatch(
    listRoute,
    /SupplierReturnsPageContent|embedded|@\/\(protected\)\/inventory\/supplier-returns/,
  );

  assert.match(newRoute, /params: Promise<\{ branchId: string \}>/);
  assert.match(newRoute, /loadBranchSupplierReturnCreateData/);
  assert.match(newRoute, /BranchSupplierReturnCreateClient/);
  assert.doesNotMatch(
    newRoute,
    /SupplierReturnNewPageContent|embedded|@\/\(protected\)\/inventory\/supplier-returns/,
  );

  assert.match(
    detailRoute,
    /params: Promise<\{ branchId: string; id: string \}>/,
  );
  assert.match(detailRoute, /loadBranchSupplierReturnDetailData/);
  assert.match(detailRoute, /BranchSupplierReturnDetailClient/);
  assert.doesNotMatch(
    detailRoute,
    /SupplierReturnDetailPageContent|embedded|@\/\(protected\)\/inventory\/supplier-returns/,
  );

  assert.match(listClient, /BranchOperatorPage/);
  assert.match(listClient, /BranchOperatorPanel/);
  assert.match(listClient, /ItemGroup/);
  assert.match(listClient, /size="touch"/);
  assert.doesNotMatch(listClient, /DataTable|AppPage|embedded/);

  assert.match(createClient, /BranchOperatorPage/);
  assert.match(createClient, /BranchOperatorPanel/);
  assert.match(createClient, /AppDetailFooter/);
  assert.match(createClient, /<Combobox[\s\S]*size="touch"/);
  assert.match(createClient, /size="touch"/);
  assert.match(createClient, /sm:grid-cols-2/);
  assert.doesNotMatch(createClient, /DocumentFormFrame|embedded/);

  assert.match(detailClient, /BranchOperatorPage/);
  assert.match(detailClient, /BranchOperatorPanel/);
  assert.match(detailClient, /ItemGroup/);
  assert.match(detailClient, /AppDetailFooter/);
  assert.match(detailClient, /confirmSupplierReturn/);
  assert.match(detailClient, /transitionSupplierReturn/);
  assert.doesNotMatch(
    detailClient,
    /DataTable|AuditHistoryList|\bformatVND\b|embedded/,
  );

  assert.match(dataSource, /import "server-only"/);
  assert.match(dataSource, /resolveInventoryListScope/);
  assert.match(dataSource, /resolveInventoryBranchScope/);
  assert.match(dataSource, /fetchSupplierReturns/);
  assert.match(dataSource, /fetchReturnableGrns/);
  assert.match(dataSource, /fetchSupplierReturnDetail/);
  assert.doesNotMatch(dataSource, /total_value|fetchEntityAuditLogs/);
  assert.match(modelSource, /filterBranchSupplierReturns/);
  assert.match(modelSource, /canProgressBranchSupplierReturn/);

  assert.match(
    navConfig,
    /moduleKey: "inventory",\s*icon: "Undo2",\s*group: "stock",\s*hrefTemplate: "\/br\/\{branchId\}\/stock\/supplier-returns"/,
  );
});

test("operator production renders branch-native inside the production operator shell (D059 §4 production)", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/page.tsx",
  );
  const recipeRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/recipes/page.tsx",
  );
  const newRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/page.tsx",
  );
  const detailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/[id]/page.tsx",
  );
  const recipeNewRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/recipes/new/page.tsx",
  );
  const recipeDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/recipes/[finishedGoodId]/page.tsx",
  );
  const officePage = read(
    "apps/web/app/(protected)/inventory/production/page.tsx",
  );
  const dataSource = read(
    "apps/web/app/(protected)/inventory/production-data.ts",
  );
  const operatorClientSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/production-operator-client.tsx",
  );
  const newClientSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/branch-production-new-client.tsx",
  );
  const detailClientSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/[id]/branch-production-detail-client.tsx",
  );
  const recipeListClientSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/recipes/branch-production-recipes-client.tsx",
  );
  const recipeEditorClientSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/recipes/branch-production-recipe-editor-client.tsx",
  );
  const navConfig = read("packages/shared/src/auth/nav-config.ts");
  const operatorCapabilities = read(
    "packages/shared/src/auth/operator-capabilities.ts",
  );

  assert.match(route, /params: Promise<\{ branchId: string \}>/);
  // D067 §1: the operator route forks presentation to a mobile-native client
  // over the SAME data loader — no office ProductionPageContent embed, no
  // redirect to the office plane.
  assert.match(route, /ProductionOperatorClient/);
  assert.match(
    route,
    /loadProductionSurfaceData\(\{ routeBranchId: branchId \}\)/,
  );
  assert.doesNotMatch(route, /ProductionPageContent/);
  assert.doesNotMatch(route, /redirect\(`\/inventory\/production/);

  assert.match(officePage, /export async function ProductionPageContent/);
  assert.match(officePage, /routeBranchId\?: number/);
  assert.match(officePage, /embedded\?: boolean/);
  assert.match(officePage, /embedded=\{embedded\}/);
  assert.match(recipeRoute, /<BranchProductionRecipesClient/);
  assert.doesNotMatch(recipeRoute, /ProductionRecipePanel|embedded/);
  assert.match(
    newRoute,
    /<BranchProductionNewClient[\s\S]*basePath=\{`\/br\/\$\{branchId\}\/stock\/production`\}/,
  );
  assert.doesNotMatch(newRoute, /\bProductionNewClient\b|embedded/);
  assert.match(detailRoute, /fetchProductionRunById\(runId\)/);
  assert.match(detailRoute, /<BranchProductionDetailClient/);
  assert.doesNotMatch(detailRoute, /\bProductionDetailClient\b|embedded/);
  assert.match(
    detailRoute,
    /run\.branch_id !== branchId && run\.target_branch_id !== branchId/,
  );
  assert.match(recipeNewRoute, /<BranchProductionRecipeEditorClient/);
  assert.match(recipeDetailRoute, /<BranchProductionRecipeEditorClient/);
  assert.match(
    recipeDetailRoute,
    /params: Promise<\{ branchId: string; finishedGoodId: string \}>/,
  );

  // hasCurrentProductionBranchAccess must prefer routeBranchId over
  // claims.branch_id — production_manager claims stay tenant-level
  // (D055 §1), so claims.branch_id is always null for that role.
  assert.match(
    dataSource,
    /hasCurrentProductionBranchAccess[\s\S]*routeBranchId\?: number,/,
  );
  assert.match(
    dataSource,
    /const branchId = routeBranchId \?\? claims\.branch_id;/,
  );
  assert.match(
    dataSource,
    /hasCurrentProductionBranchAccess\(supabase, claims, routeBranchId\)/,
  );

  assert.match(operatorClientSource, /<BranchOperatorPage/);
  assert.match(operatorClientSource, /<BranchOperatorStatusStrip/);
  assert.match(operatorClientSource, /<BranchOperatorPanel/);
  assert.match(operatorClientSource, /<ItemGroup/);
  assert.match(operatorClientSource, /size="touch"/);
  assert.doesNotMatch(
    operatorClientSource,
    /useSearchParams|AppLinkCard|LinkCardGrid|DataTable|embedded/,
  );

  assert.match(newClientSource, /<BranchOperatorPage/);
  assert.match(newClientSource, /<BranchOperatorPanel/);
  assert.match(newClientSource, /<BranchOperatorStatusStrip/);
  assert.match(newClientSource, /<ItemGroup/);
  assert.match(newClientSource, /<AppDetailFooter[\s\S]*sticky/);
  assert.match(newClientSource, /lg:grid-cols-/);
  assert.match(newClientSource, /location\.branchId === routeBranchId/);
  assert.match(newClientSource, /location\.kind !== "production_storage"/);
  assert.match(newClientSource, /location\.kind === "production_storage"/);
  assert.doesNotMatch(newClientSource, /targetBranches|targetBranchIds/);
  assert.doesNotMatch(
    newClientSource,
    /\bProductionNewClient\b|DataTable|DocumentFormFrame|embedded/,
  );

  assert.match(detailClientSource, /<BranchOperatorPage/);
  assert.match(detailClientSource, /<BranchOperatorPanel/);
  assert.match(detailClientSource, /<BranchOperatorDetailList/);
  assert.match(detailClientSource, /<ItemGroup/);
  assert.match(detailClientSource, /<AppDetailFooter[\s\S]*sticky/);
  assert.doesNotMatch(
    detailClientSource,
    /\bProductionDetailClient\b|DataTable|DocumentFormFrame|embedded/,
  );

  assert.match(recipeListClientSource, /<BranchOperatorPage/);
  assert.match(recipeListClientSource, /<ItemGroup/);
  assert.match(recipeEditorClientSource, /<BranchOperatorPage/);
  assert.match(recipeEditorClientSource, /<SheetContent[\s\S]*side="bottom"/);
  assert.match(recipeEditorClientSource, /sm:max-w-lg/);
  assert.match(recipeEditorClientSource, /lg:grid-cols-/);
  assert.match(recipeEditorClientSource, /beforeunload/);
  assert.doesNotMatch(
    `${recipeListClientSource}\n${recipeEditorClientSource}`,
    /ProductionRecipePanel|FormDialog|DataTable|DocumentFormFrame|embedded/,
  );

  // Native production tile is gated to production-capable branch kinds.
  // Curation is declarative: nav-config `kinds` + the operator-capabilities kind filter.
  assert.match(
    navConfig,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/production",\s*label: "Sản xuất",\s*kinds: \["central_kitchen", "branch"\]/,
  );
  assert.match(
    operatorCapabilities,
    /tile\.kinds === undefined \|\| tile\.kinds\.includes\(branchKind\)/,
  );
  assert.match(
    operatorClientSource,
    /const workQueue = \[\.\.\.inProgress, \.\.\.drafts\]/,
  );
  assert.match(operatorClientSource, /title="Việc cần làm"/);
  assert.match(operatorClientSource, /title="Công thức"/);

  // The office_bridge "Sản xuất" tile is retired now that the native
  // surface has landed (D059 §2 shrink-to-zero).
  assert.doesNotMatch(navConfig, /hrefTemplate: "\/inventory\/production"/);

  assert.match(
    navConfig,
    /moduleKey: "inventory_procurement",\s*icon: "FileText",\s*group: "stock",\s*hrefTemplate: "\/br\/\{branchId\}\/stock\/purchase-orders",\s*label: "Đơn đặt hàng",\s*kinds: \["central_supply", "central_kitchen"\]/,
  );
});
