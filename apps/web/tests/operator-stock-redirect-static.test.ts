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
    read(path).includes("sticky bottom-0"),
  );
  const redundantBottomNavPadding = stockFiles.filter(
    (path) =>
      path.includes("/(operator)/stock/") && read(path).includes("pb-28"),
  );
  const nestedFooterCallSites = stockFiles.filter((path) =>
    /<AppDetailFooter\s+sticky\s+trailing=\{footer\}/.test(read(path)),
  );
  const appSurface = read("apps/web/app/components/surface.tsx");

  assert.deepEqual(rawStickyCallSites, []);
  assert.deepEqual(redundantBottomNavPadding, []);
  assert.deepEqual(nestedFooterCallSites, []);
  assert.match(
    appSurface,
    /sticky bottom-\[var\(--app-bottom-nav-offset,0px\)\]/,
  );
  assert.match(appSurface, /lg:bottom-0/);
  assert.doesNotMatch(appSurface, /chrome-safe-pb/);
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

test("operator stock receive stays in the native transfer queue and opens a fullscreen Sheet", () => {
  const receiveRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/page.tsx",
  );
  const transferRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx",
  );
  const receiveDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/page.tsx",
  );
  const transferDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/page.tsx",
  );
  const navConfig = read("packages/shared/src/auth/nav-config.ts");
  const transferSheet = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/branch-transfer-sheet.tsx",
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
  assert.match(transferRoute, /transferId\?: string \| string\[\]/);
  assert.match(transferRoute, /mode\?: string \| string\[\]/);
  assert.match(transferRoute, /const receiveOnly = queueParam === "receive"/);
  assert.match(transferRoute, /isTransferReceiveReady\(row\.status\)/);
  assert.match(transferRoute, /params\.set\("transferId", String\(row\.id\)\)/);
  assert.match(transferRoute, /<BranchTransferSheet/);
  assert.match(transferRoute, /loadTransferDetailPageData/);
  assert.match(
    navConfig,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/receive"/,
  );
  assert.match(
    navConfig,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/transfer"/,
  );

  assert.match(receiveDetailRoute, /redirect\(/);
  assert.match(receiveDetailRoute, /transferId=\$\{transferId\}&mode=receive/);
  assert.match(transferDetailRoute, /redirect\(/);
  assert.match(transferDetailRoute, /transferId=\$\{transferId\}&mode=view/);
  assert.doesNotMatch(receiveDetailRoute, /TransferReceiveClient/);
  assert.doesNotMatch(transferDetailRoute, /BranchTransferDetailClient/);

  assert.match(
    transferSheet,
    /from "@comtammatu\/ui\/components\/sheet"/,
  );
  assert.match(transferSheet, /<SheetContent[\s\S]*fullscreen/);
  assert.match(transferSheet, /<TransferReceiveClient/);
  assert.match(transferSheet, /presentation="sheet"/);
  assert.match(transferSheet, /onDirtyChange=\{setDirty\}/);
  assert.match(transferSheet, /<BranchTransferDetailClient/);
  assert.doesNotMatch(transferSheet, /AppDialog/);
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
    /baseHref=\{baseHref \?\? `\/br\/\$\{branchId\}\/stock\/count`\}/,
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
  const branchClientSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  );
  const branchDataSource = read(
    "apps/web/lib/inventory/branch-count-slip-data.ts",
  );

  assert.match(source, /loadBranchCountSlipData\(branchId, employeeId\)/);
  assert.match(source, /<BranchCountSlipsClient/);
  assert.doesNotMatch(source, /CountSlipsPageContent|embedded|DataTable/);
  assert.doesNotMatch(source, /redirect\(`\/inventory\/count-slips/);
  assert.match(branchClientSource, /BranchOperatorPage/);
  assert.match(branchClientSource, /approveCountSlip/);
  assert.doesNotMatch(branchClientSource, /DataTable/);
  assert.match(branchDataSource, /import "server-only"/);
  assert.match(branchDataSource, /resolveInventoryListScope/);
  assert.match(branchDataSource, /PERMISSION_KEYS\.INVENTORY_COUNT_APPROVE/);
  assert.match(globalSource, /export async function CountSlipsPageContent\(/);
  assert.doesNotMatch(globalSource, /routeBranchId/);
  assert.doesNotMatch(clientSource, /embedded|branchScoped/);
});

test("operator stock landing is a branch-native landing, not the Owner surface stock page wrapper", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );

  assert.match(source, /BranchOperatorPage/);
  assert.match(source, /BranchOperatorActionSection/);
  assert.match(source, /resolveOperatorTiles/);
  assert.match(source, /STOCK_TAB_SUFFIXES/);
  assert.match(source, /AppPageTabs/);
  assert.match(source, /paramKey="group"/);
  assert.match(
    source,
    /tile\.href === stockRoot\s*\?\s*`\$\{stockRoot\}\/on-hand`/,
  );
  assert.match(source, /mobileColumns=\{2\}/);
  assert.match(
    source,
    /stockTabOnhand[\s\S]*stockTabCount[\s\S]*stockTabWaste[\s\S]*stockTabCatalog/,
  );
  assert.doesNotMatch(source, /operatorStockPrimaryDescription/);
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
  assert.match(
    branchClientSource,
    /<div role="list" className="flex flex-col">/,
  );
  assert.match(branchClientSource, /StockTouchRow/);
  assert.match(branchClientSource, /StockRiskBadge/);
  assert.match(branchClientSource, /filterStockOnHandIngredients/);
  assert.match(branchClientSource, /isStockReorderRisk/);
  assert.match(
    branchClientSource,
    /aria-label=\{stockCopy\.filters\.searchPlaceholder\}/,
  );
  assert.match(branchClientSource, /variant="default"/);
  assert.match(branchClientSource, /min-h-11/);
  assert.match(branchClientSource, /border-b border-border/);
  assert.doesNotMatch(branchClientSource, /<ItemGroup/);
  assert.match(branchClientSource, /size="touch"/);
  assert.match(routeSource, /canCreateStockRequest=\{data\.permissions\.canCreateStockRequest\}/);
  assert.match(branchClientSource, /canCreateStockRequest: boolean/);
  assert.match(branchClientSource, /stockCopy\.attention\.title/);
  assert.doesNotMatch(branchClientSource, /md:grid md:grid-cols-3/);
  assert.match(
    branchClientSource,
    /href=\{`\/br\/\$\{branchId\}\/stock\/requests\/new`\}/,
  );
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
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/requests\/new/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/transfer/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/count/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/issues/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/waste/);
  assert.doesNotMatch(
    branchDetailSource,
    /formatVND|DataTable|AppPageHeader|StockIngredientDetailPageContent|OwnerStockIngredientDetail|embedded/,
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
  assert.match(stockDetailPageSource, /OwnerStockIngredientDetail/);
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
    /href=\{`\/br\/\$\{branchId\}\/stock\/requests\/new`\}/,
  );
});

test("Owner surface stock workbench keeps manager action affordances after the plane split", () => {
  const stockClientSource = read(
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
  );

  for (const expected of [
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.receive\}[\s\S]*label=\{receiveActionLabel\}[\s\S]*primary/,
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.stocktake\}[\s\S]*label=\{stockCopy\.actions\.stocktake\}/,
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.waste\}[\s\S]*label=\{stockCopy\.actions\.waste\}/,
  ]) {
    assert.match(stockClientSource, expected);
  }
  assert.doesNotMatch(
    stockClientSource,
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.transfer\}[\s\S]*label=\{stockCopy\.actions\.transfer\}/,
  );

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
  assert.doesNotMatch(stockClientSource, /QuickInternalTransferDialog/);
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

test("D093 branch GRN routes redirect to stock requests", () => {
  const grnRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/page.tsx",
  );
  const grnDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/page.tsx",
  );
  const grnNewRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/page.tsx",
  );
  const grnCreateRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/page.tsx",
  );

  assert.match(grnRoute, /redirect\(`\/br\/\$\{branchId\}\/stock\/requests`\)/);
  assert.doesNotMatch(grnRoute, /BranchGrnListClient|loadGrnListPageData/);
  assert.match(
    grnDetailRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/requests`\)/,
  );
  assert.doesNotMatch(grnDetailRoute, /GrnReviewOperatorClient|loadGrnDetail/);
  assert.match(
    grnNewRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/requests\/new`\)/,
  );
  assert.match(
    grnCreateRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/requests\/new`\)/,
  );
});

test("operator stock branch-native extensions keep issue and report actions in the branch shell", () => {
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
  const issuesPage = read(
    "apps/web/app/(protected)/inventory/issues/issues-page-content.tsx",
  );
  const issuesClient = read(
    "apps/web/app/(protected)/inventory/issues/issues-client.tsx",
  );
  const issueDetailClient = read(
    "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
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
  const sharedCombobox = read("packages/ui/src/components/combobox.tsx");

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

  assert.match(issuesPage, /embedded\?: boolean/);
  assert.match(issuesPage, /embedded=\{embedded\}/);
  assert.match(issuesPage, /scope\.outOfScope/);
  assert.match(issuesPage, /listBasePath\?: InventoryRouteKey/);
  assert.match(issuesClient, /embedded\?: boolean/);
  assert.match(issuesClient, embeddedContentWrapperPattern);
  assert.match(issuesClient, /listBasePath = "\/inventory\/consumption"/);
  assert.match(issuesClient, /detailBasePath = listBasePath/);
  assert.match(
    issuesClient,
    /router\.push\(`\$\{detailBasePath\}\/\$\{newId\}`\)/,
  );
  assert.doesNotMatch(issuesClient, /router\.push\(`\/inventory\/consumption/);
  assert.match(issueDetailClient, /listBasePath = "\/inventory\/consumption"/);
  assert.match(issueDetailClient, /href=\{listBasePath\}/);
  assert.match(
    appSurface,
    /sticky bottom-\[var\(--app-bottom-nav-offset,0px\)\]/,
  );
  assert.match(appSurface, /lg:bottom-0/);
  assert.doesNotMatch(appSurface, /chrome-safe-pb/);
  assert.match(appSurface, /border-t border-border/);
  assert.match(appSurface, /shadow-lg/);
  assert.match(appSurface, /data-slot=button/);
  assert.match(issueDetailClient, /<AppDetailFooter\s+sticky\b/);
  assert.match(
    formDialog,
    /actionSize\?: ComponentProps<typeof Button>\["size"\]/,
  );
  assert.equal(
    (formDialog.match(/size=\{actionSize\}/g) ?? []).length,
    2,
    "FormDialog action buttons must share one touch-safe size",
  );
  assert.match(formDialog, /actionSize = "touch"/);
  assert.match(formCombobox, /Combobox as SharedCombobox/);
  assert.match(sharedCombobox, /React\.ComponentProps<typeof Button>/);
  assert.match(sharedCombobox, /size=\{size\}/);
  assert.match(sharedCombobox, /size = "field"/);
  assert.match(sharedCombobox, /<Button[\s\S]*size=\{size\}/);

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

test("D093 branch GRN create routes redirect; Owner GRN create routes to PO", () => {
  const grnNewRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/page.tsx",
  );
  const grnCreateRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/page.tsx",
  );
  const grnNewPage = read(
    "apps/web/app/(protected)/inventory/grn/new/page.tsx",
  );
  const grnCreatePage = read(
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/page.tsx",
  );

  assert.match(
    grnNewRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/requests\/new`\)/,
  );
  assert.doesNotMatch(
    grnNewRoute,
    /BranchGrnCreateClient|loadGrnCreatePageData|GrnNewPageContent/,
  );

  assert.match(
    grnCreateRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/requests\/new`\)/,
  );
  assert.doesNotMatch(grnCreateRoute, /loadGrnCreatePageData|BranchGrnCreateClient/);

  assert.match(grnNewPage, /redirect\("\/inventory\/purchase-orders"\)/);
  assert.match(grnCreatePage, /redirect\("\/inventory\/grn\/new"\)/);
  assert.doesNotMatch(grnNewPage, /loadGrnCreatePageData|GrnCreateClient/);
});

test("transfer receive full receipt stays one-click on the existing atomic action", () => {
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
  const branchReceiveClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-client.tsx",
  );

  assert.match(
    detailClient,
    /const noteOk = !hasShort \|\| shortNote\.trim\(\)\.length >= 3;/,
  );
  assert.match(detailClient, /transferReceive\(transfer\.id, payload\)/);
  assert.match(detailClient, /variant="document"/);
  assert.match(branchReceiveClient, /transferReceive\(transfer\.id, payload\)/);
  assert.match(branchReceiveClient, /<NumberPadSheet/);
  assert.match(branchReceiveClient, /presentation === "sheet"/);
  assert.match(transferActions, /stock_transfer_receive/);
  assert.match(transferActions, /p_items: items \?\? null/);
});

test("operator waste approvals own a native Branch review queue", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/page.tsx",
  );
  const ownerPage = read(
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
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-queue-section.tsx",
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

  assert.match(ownerPage, /loadWasteApprovalsData/);
  assert.match(client, /<AppPage/);
  assert.doesNotMatch(ownerPage, /routeBranchId|embedded/);
  assert.doesNotMatch(client, /embedded/);

  assert.match(operatorQueue, /href: `\$\{basePath\}\/stock\/waste-approvals`/);
  assert.match(
    shiftPage,
    /wasteApprovals: `\/br\/\$\{branchId\}\/stock\/waste-approvals`/,
  );
  assert.match(employeeHome, /routes: EmployeeHomeRoutes/);
  assert.doesNotMatch(
    employeeHome,
    /DEFAULT_HOME_ROUTES|"\/inventory\/waste\/approvals"/,
  );
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

test("operator transfer routes stay Branch-scoped while Owner keeps history only", () => {
  const transferRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx",
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
  const branchTransferSheet = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/branch-transfer-sheet.tsx",
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
  assert.match(transferRoute, /fetchStockTransfers\(branchId\)/);
  assert.match(
    transferRoute,
    /resolveBranchContext\(supabase, claims, branchId\)/,
  );
  assert.match(transferRoute, /classifyTransfer/);
  assert.match(transferRoute, /compareTransferQueue/);
  assert.match(transferRoute, /isTransferReceiveReady\(row\.status\)/);
  assert.match(transferRoute, /params\.set\("transferId", String\(row\.id\)\)/);
  assert.match(transferRoute, /params\.set\(\s*"mode"/);
  assert.match(transferRoute, /<BranchTransferSheet/);
  assert.doesNotMatch(
    transferRoute,
    /BranchOperatorActionSection|fetchBranchesForTransfer|stock\/transfer\/new/,
  );
  assert.doesNotMatch(transferRoute, /TransfersPageContent/);
  assert.doesNotMatch(transferRoute, /TransfersListClient/);
  assert.doesNotMatch(transferRoute, /DataTable/);
  assert.doesNotMatch(transferRoute, /embedded/);

  assert.match(transferCreateData, /\.eq\("location_kind", "warehouse"\)/);
  assert.doesNotMatch(transferCreateData, /"production_storage"/);
  assert.match(transferCreateData, /itemKind: ingredient\.item_kind \?\? null/);
  assert.match(transferCreateModel, /getTransferSourceLocationOptions/);
  assert.match(transferCreateModel, /location\.kind === "warehouse"/);
  assert.match(transferCreateModel, /getTransferSelectableIngredients/);
  assert.match(transferCreateModel, /ingredient\.itemKind === "finished_good"/);
  assert.match(
    transferCreateController,
    /sourceBranchKind: selectedSourceBranch\?\.branch_kind \?\? null/,
  );

  assert.match(transferDetailRoute, /redirect\(/);
  assert.match(transferDetailRoute, /transferId=\$\{transferId\}&mode=view/);
  assert.doesNotMatch(transferDetailRoute, /loadTransferDetailPageData/);
  assert.doesNotMatch(transferDetailRoute, /<BranchOperatorPage/);
  assert.doesNotMatch(transferDetailRoute, /<BranchTransferDetailClient/);
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

  assert.match(branchTransferSheet, /<SheetContent[\s\S]*fullscreen/);
  assert.match(branchTransferSheet, /<BranchTransferDetailClient/);
  assert.match(branchTransferSheet, /<TransferReceiveClient/);
  assert.doesNotMatch(branchTransferSheet, /AppDialog/);
  assert.match(branchTransferDetailClient, /getTransferActionConfig/);
  assert.match(branchTransferDetailClient, /BranchOperatorControlBar/);
  assert.match(branchTransferDetailClient, /BranchOperatorDetailList/);
  assert.match(branchTransferDetailClient, /size="icon-touch"/);
  assert.match(
    branchTransferDetailClient,
    /receiveHrefOverride \?\? `\/br\/\$\{branchId\}\/stock\/receive\/\$\{transfer\.id\}`/,
  );
  assert.match(
    branchTransferDetailClient,
    /BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME/,
  );
  assert.match(branchTransferDetailClient, /<AppDetailFooter sticky/);
  assert.doesNotMatch(branchTransferDetailClient, /DataTable|embedded/);
  assert.doesNotMatch(
    branchTransferDetailClient,
    /@\/\(protected\)\/inventory\/transfers\/\[id\]\/transfer-detail-client/,
  );

  assert.match(transfersPage, /basePath = "\/inventory\/transfers"/);
  assert.match(transfersPage, /createEnabled = false/);
  assert.match(transfersPage, /basePath=\{basePath\}/);
  assert.doesNotMatch(transfersPage, /createBasePath|supplierGrnBasePath/);
  assert.match(transferNewPage, /redirect\("\/inventory\/transfers"\)/);
  assert.doesNotMatch(
    transferNewPage,
    /CreateTransferForm|DocumentFormFrame|loadTransferCreatePageData|BranchOperatorPage/,
  );
  assert.match(transferCreateData, /import "server-only"/);
  assert.match(transferCreateData, /resolveInventoryListScope/);
  assert.match(transferCreateData, /fetchBranchesForTransfer/);
  assert.match(transferCreateData, /fetchIngredients/);
  assert.match(transferCreateData, /sourceLocationsByBranch/);
  assert.match(transferCreateData, /sourceStockByLocation/);
  assert.match(transferCreateModel, /resolveTransferCreatePolicy/);
  assert.match(transferCreateModel, /buildTransferLinesPayload/);
  assert.match(transferCreateController, /createStockTransfer/);
  assert.doesNotMatch(
    transferCreateController,
    /branchScopeInPath|canCreateInboundRequest|inboundFromBranchId|isBranchManager/,
  );
  assert.match(transferCreateController, /selectedSourceLocationId/);
  assert.match(transferCreateController, /router\.refresh\(\)/);
  assert.match(transferDetailPage, /redirect\(`\/inventory\/transfers\?\$\{next\}`\)/);
  assert.match(transferDetailPage, /transferId: id/);
  assert.match(transferDetailPage, /mode: "view"/);
  assert.doesNotMatch(transferDetailPage, /loadTransferDetailPageData/);
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
  assert.match(transfersListClient, /const isOwner = userRole === "owner"/);
  assert.match(
    transfersListClient,
    /const canCreate = createEnabled && canCreateOutbound/,
  );
  assert.doesNotMatch(
    transfersListClient,
    /createBasePath|supplierGrnBasePath|canCreateInboundRequest|requestGoods|isOperator/,
  );
  assert.match(
    transferListModel,
    /userRole === "branch_manager" && viewerBranchId === toId/,
  );
  assert.match(transfersListClient, /classifyTransfer/);
  assert.match(transfersListClient, /compareTransferQueue/);
  assert.match(transfersListClient, /<AppToolbar\s+variant="inline"/);
  assert.doesNotMatch(transfersListClient, /<AppToolbar\s+variant="card"/);
  assert.match(transferActions, /claims\.user_role !== "owner"/);
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
  const ownerPage = read(
    "apps/web/app/(protected)/inventory/count-assignments/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  );
  const navConfig = read("packages/shared/src/auth/nav-config.ts");
  const branchClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  );
  const branchData = read(
    "apps/web/lib/inventory/branch-count-assignment-data.ts",
  );

  assert.match(route, /params: Promise<\{ branchId: string \}>/);
  assert.match(route, /loadBranchCountAssignmentData\(\{/);
  assert.match(route, /routeBranchId: branchId/);
  assert.match(route, /<BranchCountAssignmentsClient data=\{data\} \/>/);
  assert.doesNotMatch(route, /CountAssignmentsPageContent|embedded/);
  assert.doesNotMatch(route, /redirect\(`\/inventory\/count-assignments/);
  assert.match(branchClient, /BranchOperatorPage/);
  assert.match(branchClient, /BranchOperatorPanel/);
  assert.doesNotMatch(branchClient, /DataTable/);
  assert.match(branchData, /import "server-only"/);
  assert.match(branchData, /resolveInventoryListScope/);
  assert.match(branchData, /PERMISSION_KEYS\.INVENTORY_COUNT_ASSIGN/);

  assert.match(ownerPage, /export async function CountAssignmentsPageContent/);
  assert.doesNotMatch(ownerPage, /routeBranchId|embedded/);
  assert.doesNotMatch(client, /embedded/);
  assert.match(client, /<AppPage width="xwide"/);
  assert.match(client, /<DataTable/);
  assert.match(client, /<AppDialog/);
  assert.doesNotMatch(client, /<Drawer|useSwipeReveal|useLongPress/);

  assert.match(
    navConfig,
    /moduleKey: "branch_stock",\s*icon: "ClipboardList",\s*group: "stock",\s*hrefTemplate: "\/br\/\{branchId\}\/stock\/count-assignments"/,
  );
});

test("D093 branch production routes redirect to stock landing; Owner surface keeps production", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/page.tsx",
  );
  const newRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/page.tsx",
  );
  const detailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/[id]/page.tsx",
  );
  const ownerPage = read(
    "apps/web/app/(protected)/inventory/production/page.tsx",
  );
  const dataSource = read(
    "apps/web/app/(protected)/inventory/production-data.ts",
  );
  const navConfig = read("packages/shared/src/auth/nav-config.ts");

  assert.match(route, /params: Promise<\{ branchId: string \}>/);
  assert.match(route, /redirect\(`\/br\/\$\{branchId\}\/stock`\)/);
  assert.doesNotMatch(route, /ProductionOperatorClient|ProductionPageContent/);

  assert.match(newRoute, /redirect\(`\/br\/\$\{branchId\}\/stock`\)/);
  assert.doesNotMatch(newRoute, /BranchProductionNewClient|ProductionNewClient/);

  assert.match(detailRoute, /redirect\(`\/br\/\$\{branchId\}\/stock`\)/);
  assert.doesNotMatch(
    detailRoute,
    /BranchProductionDetailClient|fetchProductionRunById/,
  );

  assert.match(ownerPage, /export async function ProductionPageContent/);
  assert.match(ownerPage, /routeBranchId\?: number/);
  assert.match(ownerPage, /embedded\?: boolean/);
  assert.match(ownerPage, /embedded=\{embedded\}/);

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

  assert.doesNotMatch(navConfig, /hrefTemplate: "\/br\/\{branchId\}\/stock\/production"/);
  assert.doesNotMatch(navConfig, /hrefTemplate: "\/inventory\/production"/);
});
