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
  const appSurface = read("apps/web/app/components/surface/app-detail-footer.tsx");

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
  const receiveClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-client.tsx",
  );

  assert.match(receiveRoute, /permanentRedirect/);
  assert.match(
    receiveRoute,
    /permanentRedirect\(`\/br\/\$\{branchId\}\/stock\?work=receive`\)/,
  );
  assert.doesNotMatch(receiveRoute, /TransfersPageContent|embedded|DataTable/);
  assert.match(transferRoute, /BranchStockFulfillmentHubClient/);
  assert.match(transferRoute, /mode = "central"/);
  assert.match(transferRoute, /isBranchKind/);
  assert.match(transferRoute, /redirect\([\s\S]*\/stock/);
  assert.match(transferRoute, /stock\/requests\/new/);
  assert.doesNotMatch(transferRoute, /(?<!Branch)StockFulfillmentHubClient/);
  assert.doesNotMatch(
    navConfig,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/transfer\?queue=receive"/,
  );
  assert.match(
    navConfig,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/transfer"/,
  );
  assert.doesNotMatch(
    navConfig,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/(?:requests|receive)"/,
  );

  // The receive detail route forks to a mobile-native receive
  // client over the SHARED transfer loader — no Owner surface
  // TransferDetailPageContent embed (that stepper/summary chrome is exactly
  // what the native screen removes).
  assert.match(receiveDetailRoute, /loadTransferDetailPageData/);
  assert.match(receiveDetailRoute, /routeBranchId: branchId/);
  assert.match(receiveDetailRoute, /includeAudit: false/);
  assert.match(receiveDetailRoute, /includeCorrections: false/);
  assert.match(receiveDetailRoute, /<TransferReceiveClient/);
  assert.doesNotMatch(receiveDetailRoute, /TransferDetailPageContent/);
  assert.doesNotMatch(
    receiveDetailRoute,
    /GRNDetailPageContent|grnListBasePath/,
  );

  assert.doesNotMatch(
    receiveDetailRoute,
    /fetchStockTransferDetail|resolveInventoryListScope|computeTransferLineTotal/,
  );
  assert.match(
    receiveDetailRoute,
    /backHref=\{`\/br\/\$\{branchId\}\/stock\?work=receive`\}/,
  );
  assert.match(receiveDetailRoute, /resolveBranchContext/);
  assert.match(receiveDetailRoute, /isStoreBranch/);
  assert.match(receiveDetailRoute, /documentTitle=\{documentTitle\}/);
  assert.match(
    receiveDetailRoute,
    /detailHref=\{\s*isStoreBranch\s*\?\s*null\s*:\s*`\/br\/\$\{branchId\}\/stock\/transfer\/\$\{transferId\}`\s*\}/,
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

test("operator stock landing is a branch-native list with four doors", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );

  assert.match(source, /BranchOperatorPage/);
  assert.match(source, /BranchStockFulfillmentHubClient/);
  assert.match(source, /BranchStockDoors/);
  assert.match(source, /branchDoorOnHand/);
  assert.match(source, /branchDoorRequest/);
  assert.match(source, /branchDoorStocktake/);
  assert.match(source, /branchDoorWaste/);
  assert.match(source, /loadStockFulfillmentRows/);
  assert.match(source, /CENTRAL_STOCK_TAB_SUFFIXES/);
  assert.match(source, /StockWorkflowSections/);
  assert.match(
    source,
    /tile\.href === stockRoot\s*\?\s*`\$\{stockRoot\}\/on-hand`/,
  );
  assert.doesNotMatch(source, /BranchStockWorkPanel/);
  assert.doesNotMatch(source, /BRANCH_STOCK_TAB_SUFFIXES/);
  assert.doesNotMatch(source, /AppPageTabs/);
  assert.doesNotMatch(source, /StockPageContent/);
  assert.doesNotMatch(source, /key: "consumption"/);
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
  assert.match(routeSource, /branchKind=\{branchKind\}/);
  assert.match(routeSource, /permissions=\{data\.permissions\}/);
  assert.match(routeSource, /secondaryJobs=/);
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
  assert.match(branchClientSource, /isStockReorderRisk/);
  assert.match(branchClientSource, /filterStockOnHandIngredients/);
  assert.match(branchClientSource, /MultiSelectCombobox/);
  assert.match(branchClientSource, /ToggleGroup/);
  assert.match(branchClientSource, /SheetContent[\s\S]*side="bottom"/);
  assert.match(branchClientSource, /moreStockJobs/);
  assert.match(
    branchClientSource,
    /aria-label=\{stockCopy\.filters\.searchPlaceholder\}/,
  );
  assert.match(branchClientSource, /variant="default"/);
  assert.match(branchClientSource, /min-h-12/);
  assert.match(branchClientSource, /border-b border-border/);
  assert.doesNotMatch(branchClientSource, /<ItemGroup/);
  assert.match(branchClientSource, /size="touch"/);
  assert.match(branchClientSource, /StockActionPermissions/);
  assert.match(branchClientSource, /attentionTitle/);
  assert.match(branchClientSource, /resolveAttentionCtas/);
  assert.doesNotMatch(branchClientSource, /md:grid md:grid-cols-3/);
  assert.match(branchClientSource, /requests\/new/);
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
    /return \(\s*<AppPage[\s\S]*width="xwide"[\s\S]*density="compact"[\s\S]*scroll[\s\S]*>\s*\{content\}\s*<\/AppPage>\s*\);/,
  );
  assert.doesNotMatch(stockClientSource, /isCompactLayout|useStockCompactLayout/);
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
  assert.match(branchDetailSource, /DropdownMenu/);
  assert.match(branchDetailSource, /resolvePrimaryActions/);
  assert.match(branchDetailSource, /ItemGroup/);
  assert.match(branchDetailSource, /AppDetailFooter/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/on-hand/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/requests\/new/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/transfer/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/stocktake/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/consumption/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/waste/);
  assert.match(branchDetailSource, /\$\{stockBasePath\}\/waste/);
  assert.doesNotMatch(
    branchDetailSource,
    /formatVND|DataTable|AppPageHeader|StockIngredientDetailPageContent|embedded/,
  );
  assert.doesNotMatch(branchDetailSource, /\bStockIngredientDetail\b/);
  assert.doesNotMatch(branchDetailSource, /\$\{stockBasePath\}\/receive/);
  assert.match(stockPageSource, /loadStockOnHandPageData/);
  assert.match(stockPageSource, /queryBranchId: params\.branchId/);
  assert.doesNotMatch(
    stockPageSource,
    /routeBranchId\?: number|branchStockBasePath|embedded/,
  );
  assert.match(stockDataSource, /scope\.outOfScope/);
  assert.match(stockDetailPageSource, /loadStockIngredientDetailData/);
  assert.match(stockDetailPageSource, /\bStockIngredientDetail\b/);
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
    /const quickIssueBasePath = \(_issueType: QuickIssueType\) =>/,
  );
  assert.match(stockClientSource, /"\/inventory\/consumption"/);
  assert.match(stockClientSource, /href: actionHrefs\.waste/);
  assert.doesNotMatch(stockClientSource, /issueType:\s*"writeoff"/);
  assert.match(
    stockClientSource,
    /canReceiveStock = actionPermissions\.canReceiveGrn/,
  );
  assert.match(stockDataSource, /PERMISSION_KEYS\.INVENTORY_TRANSFER_RECEIVE/);
  assert.match(branchClientSource, /\$\{base\}\/requests\/new/);
  assert.match(branchClientSource, /canCreateStockRequest/);
});

test("Owner surface stock workbench keeps manager action affordances after the plane split", () => {
  const stockClientSource = read(
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
  );

  for (const expected of [
    /const primaryRequestAction = actionPermissions\.canCreateStockRequest \?/,
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.request\}[\s\S]*primary/,
    /href=\{actionHrefs\.receive\}[\s\S]*stockCopy\.actions\.receiveGoods/,
    /href=\{actionHrefs\.stocktake\}[\s\S]*stockCopy\.actions\.stocktake/,
    /href=\{actionHrefs\.waste\}[\s\S]*stockCopy\.actions\.waste/,
  ]) {
    assert.match(stockClientSource, expected);
  }
  assert.doesNotMatch(
    stockClientSource,
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.transfer\}[\s\S]*label=\{stockCopy\.actions\.transfer\}/,
  );

  for (const expected of [
    /const desktopSecondaryActionsDropdown = hasSecondaryActions \?/,
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

test("branch GRN routes keep branch redirect; direct central creation is retired", () => {
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

  assert.match(grnRoute, /branch_kind === "branch"/);
  assert.match(grnRoute, /redirect\(`\/br\/\$\{branchId\}\/stock\/transfer`\)/);
  assert.match(grnRoute, /BranchGrnListClient|loadGrnListPageData/);
  assert.match(grnDetailRoute, /branch_kind === "branch"/);
  assert.match(
    grnDetailRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/transfer`\)/,
  );
  assert.match(grnDetailRoute, /GrnReviewOperatorClient|loadGrnDetail/);
  assert.match(grnNewRoute, /branch_kind === "branch"/);
  assert.match(
    grnNewRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/requests\/new`\)/,
  );
  assert.match(
    grnNewRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/purchase-requests`\)/,
  );
  assert.doesNotMatch(
    grnNewRoute,
    /BranchGrnSourcePickerClient|loadGrnSourcePageData/,
  );
  assert.match(grnCreateRoute, /branch_kind === "branch"/);
  assert.match(
    grnCreateRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/requests\/new`\)/,
  );
  assert.match(
    grnCreateRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/purchase-requests`\)/,
  );
  assert.doesNotMatch(
    grnCreateRoute,
    /BranchGrnCreateClient|loadGrnCreatePageData/,
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
  const grnPage = read("apps/web/app/(protected)/inventory/grn/page.tsx");
  const grnListData = read("apps/web/lib/inventory/grn-list-data.ts");
  const grnListClient = read(
    "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  );
  const grnDetailClient = read(
    "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const reportsPage = read(
    "apps/web/app/(protected)/inventory/reports/page.tsx",
  );
  const reportsClient = read(
    "apps/web/app/(protected)/inventory/reports/reports-client.tsx",
  );
  const appSurface = read("apps/web/app/components/surface/app-detail-footer.tsx");
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
  assert.match(branchIssuesListClient, /wasteHref/);
  assert.match(branchIssuesListClient, /\$\{stockBasePath\}\/waste/);
  assert.doesNotMatch(
    branchIssuesListClient,
    /<Sheet|createStockIssueDraft|DataTable|useLongPress|FormDialog/,
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
  assert.match(branchStockIssueData, /issueTypes: \["writeoff"\]/);
  assert.match(branchStockIssueData, /INVENTORY_WRITEOFF/);
  assert.match(stockIssueModel, /canConfirmBranchStockIssue/);
  assert.doesNotMatch(stockIssueModel, /canCreateOther|"other"/);
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

  assert.doesNotMatch(issuesPage, /embedded\?: boolean/);
  assert.doesNotMatch(issuesPage, /embedded=\{embedded\}/);
  assert.match(issuesPage, /scope\.outOfScope/);
  assert.match(issuesPage, /listBasePath\?: InventoryRouteKey/);
  assert.doesNotMatch(issuesClient, /embedded\?: boolean/);
  assert.doesNotMatch(issuesClient, embeddedContentWrapperPattern);
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

  assert.match(grnPage, /loadGrnListPageData/);
  assert.doesNotMatch(grnPage, /routeBranchId/);
  assert.match(grnListClient, /<DataTable/);
  assert.doesNotMatch(
    grnListClient,
    /basePath\.startsWith\("\/br\/"\)|OperatorFlowSteps|embedded/,
  );
  assert.match(grnListData, /import "server-only"/);
  assert.match(grnListClient, /onRowClick=\{\(row\) => openDetail\(row\)\}/);
  assert.doesNotMatch(grnListClient, /useLongPress/);
  assert.doesNotMatch(grnListClient, /touch-none/);
  assert.doesNotMatch(grnDetailClient, /embedded\?: boolean/);
  assert.doesNotMatch(grnDetailClient, /\bembedded\b/);
  assert.match(grnDetailClient, /presentation\?: "page" \| "dialog"/);
  assert.match(grnDetailClient, /presentation === "dialog"/);

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

test("GRN create routes redirect into the current purchase workflow", () => {
  const grnNewRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/page.tsx",
  );
  const grnCreateRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/page.tsx",
  );
  const grnNewPage = read(
    "apps/web/app/(protected)/inventory/grn/new/page.tsx",
  );

  assert.match(grnNewRoute, /branch_kind === "branch"/);
  assert.match(
    grnNewRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/requests\/new`\)/,
  );
  assert.match(
    grnNewRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/purchase-requests`\)/,
  );
  assert.doesNotMatch(
    grnNewRoute,
    /BranchGrnSourcePickerClient|loadGrnSourcePageData/,
  );

  assert.match(grnCreateRoute, /branch_kind === "branch"/);
  assert.match(
    grnCreateRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/requests\/new`\)/,
  );
  assert.match(
    grnCreateRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/purchase-requests`\)/,
  );
  assert.doesNotMatch(
    grnCreateRoute,
    /loadGrnCreatePageData|BranchGrnCreateClient/,
  );

  assert.match(grnNewPage, /redirect\("\/inventory\/grn"\)/);
});

test("transfer receive requires inspection and keeps the atomic receive action", () => {
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
    /const noteOk = !hasShort \|\| shortNote\.trim\(\)\.length >= 5;/,
  );
  assert.match(detailClient, /transferConfirmReceive\(transfer\.id\)/);
  assert.match(detailClient, /transferReceive\(transfer\.id, payload\)/);
  assert.match(
    detailClient,
    /className=\{embedded \? "h-12 text-right" : "h-9 text-right"\}/,
  );
  assert.match(detailClient, /embedded=\{embedded\}/);
  assert.equal(
    (detailClient.match(/size="touch"/g) ?? []).length,
    2,
    "embedded transfer detail footer actions must be touch-sized",
  );
  assert.match(detailClient, /buttonSize="touch"/);
  assert.match(detailClient, /buttonSize="default"/);
  assert.match(detailClient, /className=\{embedded \? "h-12" : "h-9"\}/);
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
  assert.match(listClient, /wasteHref/);
  assert.match(listClient, /\$\{stockBasePath\}\/waste/);
  assert.doesNotMatch(
    listClient,
    /<Sheet|createStockIssueDraft|DataTable|useLongPress|FormDialog/,
  );
  assert.match(detailClient, /BranchOperatorDetailList/);
  assert.match(detailClient, /<AppDetailFooter[\s\S]*\bsticky\b/);
  assert.match(detailClient, /<Sheet/);
  assert.doesNotMatch(
    detailClient,
    /DataTable|AuditHistoryList|DocumentStockCorrectionDialog/,
  );

  assert.match(data, /resolveInventoryListScope/);
  assert.match(data, /resolveInventoryBranchScope/);
  assert.match(data, /issueTypes: \["writeoff"\]/);
  assert.match(data, /INVENTORY_WRITEOFF/);
  assert.match(data, /detail\.issue\.branch_id !== routeBranchId/);
  assert.match(model, /canConfirmBranchStockIssue/);
  assert.doesNotMatch(model, /canCreateOther|"other"/);
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

test("operator and central routes share the fulfillment hub while details stay canonical", () => {
  const transferRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx",
  );
  const transfersPage = read(
    "apps/web/app/(protected)/inventory/transfers/page.tsx",
  );
  const transferNewPage = read(
    "apps/web/app/(protected)/inventory/transfers/new/page.tsx",
  );
  const transferDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/page.tsx",
  );
  const transferDetailPage = read(
    "apps/web/app/(protected)/inventory/transfers/[id]/page.tsx",
  );

  assert.match(transferRoute, /BranchOperatorPage/);
  assert.match(transferRoute, /loadStockFulfillmentRows/);
  assert.match(transferRoute, /BranchStockFulfillmentHubClient/);
  assert.match(transferRoute, /mode = "central"/);
  assert.match(transferRoute, /isBranchKind/);
  assert.match(transferRoute, /redirect\([\s\S]*\/stock/);
  assert.match(transferRoute, /stock.requests.new/);
  assert.doesNotMatch(
    transferRoute,
    /fetchBranchesForTransfer|TransfersListClient|(?<!Branch)StockFulfillmentHubClient/,
  );

  assert.match(transfersPage, /loadStockFulfillmentRows/);
  assert.match(transfersPage, /StockFulfillmentHubClient/);
  assert.match(transfersPage, /mode="central"/);
  assert.match(transferNewPage, /loadTransferCreatePageData/);
  assert.match(transferNewPage, /CreateTransferForm/);
  const branchTransferNew = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/page.tsx",
  );
  assert.match(branchTransferNew, /BranchTransferCreateClient/);
  assert.doesNotMatch(branchTransferNew, /CreateTransferForm/);

  assert.match(transferDetailRoute, /loadTransferDetailPageData/);
  assert.match(transferDetailRoute, /BranchTransferDetailClient/);
  assert.match(transferDetailRoute, /branch_kind === "branch"/);
  assert.match(
    transferDetailRoute,
    /redirect\(\s*`\/br\/\$\{branchId\}\/stock\/requests\/\$\{data\.transfer\.stockRequestId\}`/,
  );
  assert.match(
    transferDetailRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/receive\/\$\{transferId\}`\)/,
  );
  assert.match(transferDetailPage, /loadTransferDetailPageData/);
});

test("operator count assignments render branch-native inside the branch operator shell", () => {
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

test("branch production routes redirect to the canonical production surface", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/page.tsx",
  );
  const newRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/new/page.tsx",
  );
  const detailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/[id]/page.tsx",
  );
  const navConfig = read("packages/shared/src/auth/nav-config.ts");

  assert.match(route, /redirect\(`\/inventory\/production\?branchId=/);
  assert.match(newRoute, /redirect\(\s*`\/inventory\/production\/new\?branchId=/);
  assert.match(detailRoute, /\/inventory\/production\/\$\{encodeURIComponent\(id\)\}/);

  assert.match(
    navConfig,
    /hrefTemplate: "\/inventory\/production"[\s\S]*kinds: \["central_kitchen"\]/,
  );
});
