import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));
const embeddedContentWrapperPattern =
  /if \(embedded\) \{\s*return <div className="flex w-full flex-col gap-3">\{content\}<\/div>;\s*\}/;

test("operator stock task routes render branch-shell content instead of redirecting to inventory", () => {
  const expectations = [
    ["transfer", "TransfersPageContent", 'initialTab="dispatch"'],
    ["waste", "WasteNewPageContent", null],
    ["expiry", "ExpiryPageContent", "embedded"],
  ] as const;

  for (const [segment, component, tabProp] of expectations) {
    const path = `apps/web/app/(protected)/br/[branchId]/(operator)/stock/${segment}/page.tsx`;

    assert.equal(exists(path), true, path);

    const source = read(path);
    assert.match(source, /params: Promise<\{ branchId: string \}>/, path);
    assert.match(source, new RegExp(component), path);
    if (tabProp != null) assert.ok(source.includes(tabProp), path);
    assert.doesNotMatch(source, /redirect\(`\/inventory\//, path);
  }
});

test("operator stock receive renders inbound transfer list and detail inside the branch shell", () => {
  const receiveRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/page.tsx",
  );
  const receiveDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/page.tsx",
  );
  const transfersPage = read(
    "apps/web/app/(protected)/inventory/transfers/page.tsx",
  );
  const transferDetailPage = read(
    "apps/web/app/(protected)/inventory/transfers/[id]/page.tsx",
  );

  assert.match(receiveRoute, /TransfersPageContent/);
  assert.match(receiveRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    receiveRoute,
    /basePath=\{`\/br\/\$\{branchId\}\/stock\/receive`\}/,
  );
  assert.match(
    receiveRoute,
    /createBasePath=\{`\/br\/\$\{branchId\}\/stock\/transfer`\}/,
  );
  assert.match(receiveRoute, /initialTab="receive"/);
  assert.match(receiveRoute, /pageTitle="Nhận hàng"/);
  assert.match(receiveRoute, /embedded/);
  assert.doesNotMatch(receiveRoute, /GRNListPageContent|purchaseOrdersPath/);

  assert.match(receiveDetailRoute, /TransferDetailPageContent/);
  assert.match(receiveDetailRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    receiveDetailRoute,
    /basePath=\{`\/br\/\$\{branchId\}\/stock\/receive`\}/,
  );
  assert.doesNotMatch(
    receiveDetailRoute,
    /GRNDetailPageContent|grnListBasePath/,
  );
  assert.match(transfersPage, /export async function TransfersPageContent/);
  assert.match(
    transferDetailPage,
    /export async function TransferDetailPageContent/,
  );
});

test("operator stock count renders employee count inside the branch operator shell", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count/page.tsx",
  );
  const employeeCountPage = read(
    "apps/web/app/(protected)/employee/count/page.tsx",
  );
  const countClient = read(
    "apps/web/app/(protected)/employee/count/count-client.tsx",
  );

  assert.match(source, /EmployeeCountPageContent/);
  assert.match(source, /routeBranchId=\{branchId\}/);
  assert.match(source, /hideHeaderOnMobile/);
  assert.doesNotMatch(source, /redirect\(`\/inventory\/stocktake/);
  assert.match(
    employeeCountPage,
    /routeBranchId \? `\/br\/\$\{branchId\}\/stock\/count` : "\/employee\/count"/,
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

test("operator stock landing keeps inventory logic without nesting desktop page chrome", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );
  const stockClientSource = read(
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
  );

  assert.match(source, /StockPageContent/);
  assert.match(source, /routeBranchId=\{branchId\}/);
  assert.match(source, /branchStockBasePath=\{`\/br\/\$\{branchId\}\/stock`\}/);
  assert.match(source, /embedded/);
  assert.doesNotMatch(source, /EmployeeActionSection|EmployeePage/);
  assert.doesNotMatch(source, /href: `\/br\/\$\{branchId\}\/stock\/count`/);
  assert.match(stockClientSource, /const content = \(/);
  assert.match(stockClientSource, embeddedContentWrapperPattern);
  assert.match(
    stockClientSource,
    /return \(\s*<InventoryPageContent[\s\S]*>\s*\{content\}\s*<\/InventoryPageContent>\s*\);/,
  );
});

test("operator stock on-hand alias and detail stay inside the branch operator shell", () => {
  const routeSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/page.tsx",
  );
  const detailRouteSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/[ingredientId]/page.tsx",
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

  assert.match(routeSource, /redirect\(`\/br\/\$\{branchId\}\/stock`\)/);
  assert.doesNotMatch(routeSource, /redirect\(`\/inventory\/stock/);
  assert.match(detailRouteSource, /StockIngredientDetailPageContent/);
  assert.match(detailRouteSource, /ingredientId=\{ingredientId\}/);
  assert.match(detailRouteSource, /routeBranchId=\{branchId\}/);
  assert.match(
    detailRouteSource,
    /branchStockBasePath=\{`\/br\/\$\{branchId\}\/stock`\}/,
  );
  assert.match(detailRouteSource, /embedded/);
  assert.doesNotMatch(detailRouteSource, /redirect\(`\/inventory\/stock/);
  assert.match(stockPageSource, /routeBranchId\?: number/);
  assert.match(stockPageSource, /branchStockBasePath\?: string/);
  assert.match(stockPageSource, /embedded\?: boolean/);
  assert.match(stockPageSource, /scope\.outOfScope/);
  assert.match(stockDetailPageSource, /routeBranchId\?: number/);
  assert.match(stockDetailPageSource, /branchStockBasePath\?: string/);
  assert.match(stockDetailPageSource, /embedded\?: boolean/);
  assert.match(stockDetailPageSource, embeddedContentWrapperPattern);
  assert.match(
    stockDetailPageSource,
    /<InventoryPageContent width="wide" scroll>\s*\{content\}\s*<\/InventoryPageContent>/,
  );
  assert.match(
    stockDetailPageSource,
    /scope\.outOfScope/,
  );
  assert.match(stockDetailPageSource, /fetchStockBearingLocationIds/);
  assert.match(stockDetailPageSource, /\.from\("stock_levels"\)/);
  assert.match(stockDetailPageSource, /\.from\("stock_movements"\)/);
  assert.match(stockDetailPageSource, /\.from\("grn_items"\)/);
  assert.match(
    stockDetailPageSource,
    /movementReferenceHref\(\{\s*movement,\s*branchId,\s*branchStockBasePath: branchStockRoot,\s*embedded,\s*\}\)/,
  );
  assert.match(stockClientSource, /branchStockBasePath\?: string/);
  assert.match(stockClientSource, /embedded\?: boolean/);
  assert.match(
    stockClientSource,
    /const stockDetailHref = \(ingredientId: number\) =>/,
  );
  assert.match(
    stockClientSource,
    /branchStockHref\(stockRootPath, `\/on-hand\/\$\{ingredientId\}`\)/,
  );
  assert.match(
    stockClientSource,
    /router\.push\(stockDetailHref\(item\.id\)\)/,
  );
  assert.match(stockClientSource, /href=\{stockDetailHref\(selected\.id\)\}/);
  assert.match(
    stockClientSource,
    /purchaseSuggestion: branchStockHref\(\s*stockRootPath,\s*"\/purchase-orders\/new",?\s*\)/,
  );
  assert.match(
    stockClientSource,
    /reports: branchStockHref\(stockRootPath, "\/reports"\)/,
  );
  assert.match(
    stockClientSource,
    /embedded\s*\?\s*branchStockHref\(stockRootPath, "\/issues"\)\s*:\s*"\/inventory\/issues"/,
  );
  assert.match(
    stockClientSource,
    /branchStockHref\(stockRootPath, "\/receive"\)/,
  );
  assert.match(
    stockClientSource,
    /branchStockHref\(stockRootPath, "\/stocktake"\)/,
  );
  assert.match(
    stockClientSource,
    /branchStockHref\(stockRootPath, "\/expiry"\)/,
  );
  assert.doesNotMatch(
    stockClientSource,
    /stocktake: branchStockHref\(stockRootPath, "\/count"\)/,
  );
  assert.match(stockClientSource, /canReceiveStock = embedded/);
  assert.match(stockPageSource, /PERMISSION_KEYS\.INVENTORY_TRANSFER_RECEIVE/);
  assert.match(
    stockClientSource,
    /branchStockHref\(stockRootPath, "\/waste"\)/,
  );
});

test("operator stock landing keeps manager action affordances visible", () => {
  const stockClientSource = read(
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
  );

  for (const expected of [
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.receive\}[\s\S]*label=\{receiveActionLabel\}[\s\S]*primary/,
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.transfer\}[\s\S]*label=\{stockCopy\.actions\.transfer\}/,
    /<QuickActionButton[\s\S]*href=\{actionHrefs\.stocktake\}[\s\S]*label=\{stockCopy\.actions\.stocktake\}/,
    /summary\.expiryCount > 0[\s\S]*<QuickActionButton[\s\S]*href=\{actionHrefs\.expiry\}[\s\S]*label=\{stockCopy\.actions\.expiry\}/,
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
  assert.match(
    stockClientSource,
    /embedded[\s\S]*branchStockHref\(stockRootPath, "\/issues"\)[\s\S]*: "\/inventory\/issues"/,
  );
});

test("operator stock branch-native extensions keep PO, issue, and report actions in the branch shell", () => {
  const issueRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/page.tsx",
  );
  const issueDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/[id]/page.tsx",
  );
  const poRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/page.tsx",
  );
  const poNewRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/new/page.tsx",
  );
  const poDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/[id]/page.tsx",
  );
  const grnDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/page.tsx",
  );
  const reportsRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/reports/page.tsx",
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
  const newPoPage = read(
    "apps/web/app/(protected)/inventory/purchase-orders/new/page.tsx",
  );
  const newPoClient = read(
    "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx",
  );
  const poDetailPage = read(
    "apps/web/app/(protected)/inventory/purchase-orders/[id]/page.tsx",
  );
  const poDetailClient = read(
    "apps/web/app/(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx",
  );
  const reportsPage = read(
    "apps/web/app/(protected)/inventory/reports/page.tsx",
  );
  const reportsClient = read(
    "apps/web/app/(protected)/inventory/reports/reports-client.tsx",
  );

  assert.match(issueRoute, /IssuesPageContent/);
  assert.match(issueRoute, /routeBranchId=\{branchId\}/);
  assert.match(issueRoute, /embedded/);
  assert.match(
    issueRoute,
    /consumptionBasePath=\{`\/br\/\$\{branchId\}\/stock\/issues`\}/,
  );
  assert.match(issueDetailRoute, /IssueDetailPageContent/);
  assert.match(issueDetailRoute, /routeBranchId=\{branchId\}/);
  assert.match(issueDetailRoute, /embedded/);
  assert.match(
    issueDetailRoute,
    /listBasePath=\{`\/br\/\$\{branchId\}\/stock\/issues`\}/,
  );
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
  assert.match(grnDetailRoute, /GRNDetailPageContent/);
  assert.match(grnDetailRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    grnDetailRoute,
    /purchaseOrdersBasePath=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders`\}/,
  );
  assert.doesNotMatch(grnDetailRoute, /TransferDetailPageContent/);
  assert.match(reportsRoute, /ReportsPageContent/);
  assert.match(reportsRoute, /routeBranchId=\{branchId\}/);
  assert.match(reportsRoute, /embedded/);

  assert.match(issuesPage, /routeBranchId\?: number/);
  assert.match(issuesPage, /embedded\?: boolean/);
  assert.match(issuesPage, /embedded=\{embedded\}/);
  assert.match(issuesPage, /scope\.outOfScope/);
  assert.match(issuesPage, /consumptionBasePath\?: string/);
  assert.match(issuesClient, /embedded\?: boolean/);
  assert.match(issuesClient, embeddedContentWrapperPattern);
  assert.match(
    issuesClient,
    /consumptionBasePath = "\/inventory\/consumption"/,
  );
  assert.match(
    issuesClient,
    /router\.push\(`\$\{consumptionBasePath\}\/\$\{newId\}`\)/,
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

  assert.match(purchaseOrdersPage, /routeBranchId\?: number/);
  assert.match(purchaseOrdersPage, /embedded\?: boolean/);
  assert.match(purchaseOrdersPage, /embedded=\{embedded\}/);
  assert.match(purchaseOrdersPage, /scope\.outOfScope/);
  assert.match(purchaseOrdersClient, /suppliersPath\?: string \| null/);
  assert.match(purchaseOrdersClient, /embedded\?: boolean/);
  assert.match(purchaseOrdersClient, embeddedContentWrapperPattern);
  assert.match(purchaseOrdersClient, /suppliersPath \?/);
  assert.match(newPoPage, /routeBranchId\?: number/);
  assert.match(newPoPage, /poBasePath\?: string/);
  assert.match(newPoPage, /embedded\?: boolean/);
  assert.match(newPoPage, /embedded=\{embedded\}/);
  assert.match(newPoClient, /embedded\?: boolean/);
  assert.match(newPoClient, embeddedContentWrapperPattern);
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

  assert.match(reportsPage, /routeBranchId\?: number/);
  assert.match(reportsPage, /branchId: routeBranchId/);
  assert.match(reportsPage, /embedded=\{embedded\}/);
  assert.match(
    reportsPage,
    /supplierInvoicesHref=\{embedded \? null : "\/inventory\/supplier-invoices"\}/,
  );
  assert.match(reportsClient, /supplierInvoicesHref\?: string \| null/);
  assert.match(reportsClient, /embedded\?: boolean/);
  assert.match(reportsClient, embeddedContentWrapperPattern);
  assert.match(
    reportsClient,
    /showSupplierPayables = supplierInvoicesHref != null/,
  );
});

test("operator stock GRN create routes stay branch-native (D059 §4 slice 1)", () => {
  const grnNewRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/page.tsx",
  );
  const grnCreateRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/page.tsx",
  );
  const grnNewPage = read(
    "apps/web/app/(protected)/inventory/grn/new/page.tsx",
  );
  const grnFromPoList = read(
    "apps/web/app/(protected)/inventory/grn/new/grn-from-po-list.tsx",
  );
  const grnCreatePage = read(
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/page.tsx",
  );
  const grnCreateClient = read(
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  );

  assert.match(grnNewRoute, /params: Promise<\{ branchId: string \}>/);
  assert.match(grnNewRoute, /GrnNewPageContent/);
  assert.match(grnNewRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    grnNewRoute,
    /basePath=\{`\/br\/\$\{branchId\}\/stock\/grn\/new`\}/,
  );
  assert.match(
    grnNewRoute,
    /grnListBasePath=\{`\/br\/\$\{branchId\}\/stock\/grn`\}/,
  );
  assert.match(grnNewRoute, /embedded/);

  assert.match(
    grnCreateRoute,
    /params: Promise<\{ branchId: string; supplierId: string \}>/,
  );
  assert.match(grnCreateRoute, /GrnCreatePageContent/);
  assert.match(grnCreateRoute, /supplierId=\{supplierId\}/);
  assert.match(grnCreateRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    grnCreateRoute,
    /basePath=\{`\/br\/\$\{branchId\}\/stock\/grn\/new`\}/,
  );
  assert.match(
    grnCreateRoute,
    /grnBasePath=\{`\/br\/\$\{branchId\}\/stock\/grn`\}/,
  );
  assert.match(grnCreateRoute, /embedded/);

  assert.match(grnNewPage, /routeBranchId\?: number/);
  assert.match(grnNewPage, /basePath\?: string/);
  assert.match(grnNewPage, /grnListBasePath\?: string/);
  assert.match(grnNewPage, /embedded\?: boolean/);
  assert.match(grnNewPage, /scope\.outOfScope/);
  assert.match(grnNewPage, embeddedContentWrapperPattern);
  assert.match(grnFromPoList, /grnBasePath = "\/inventory\/grn"/);
  assert.match(
    grnFromPoList,
    /router\.push\(`\$\{grnBasePath\}\/\$\{grn\.id\}\?review=1`\)/,
  );

  assert.match(grnCreatePage, /supplierId: number/);
  assert.match(grnCreatePage, /routeBranchId\?: number/);
  assert.match(grnCreatePage, /basePath\?: string/);
  assert.match(grnCreatePage, /grnBasePath\?: string/);
  assert.match(grnCreatePage, /embedded\?: boolean/);
  assert.match(grnCreatePage, /scope\.outOfScope/);
  assert.match(grnCreateClient, /basePath\?: string/);
  assert.match(grnCreateClient, /grnBasePath\?: string/);
  assert.match(grnCreateClient, /embedded\?: boolean/);
  assert.match(grnCreateClient, embeddedContentWrapperPattern);
  assert.match(
    grnCreateClient,
    /router\.push\(`\$\{grnBasePath\}\/\$\{grnId\}\?review=1`\)/,
  );
});

test("branch stock wrappers keep inventory fallbacks inside the branch shell", () => {
  const transfersPage = read(
    "apps/web/app/(protected)/inventory/transfers/page.tsx",
  );
  const wastePage = read(
    "apps/web/app/(protected)/inventory/waste/new/page.tsx",
  );
  const wasteRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/page.tsx",
  );
  const expiryPage = read(
    "apps/web/app/(protected)/inventory/expiry/page.tsx",
  );
  const expiryClient = read(
    "apps/web/app/(protected)/inventory/expiry/expiry-list-client.tsx",
  );
  const expiryRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/expiry/page.tsx",
  );

  assert.match(
    transfersPage,
    /if \(routeBranchId != null\) \{\s*redirect\(`\/br\/\$\{routeBranchId\}\/stock`\);\s*\}/,
    "branch transfer fallback must stay under /br/[branchId]/stock",
  );
  assert.match(
    wastePage,
    /routeBranchId != null\s*\?\s*`\/br\/\$\{routeBranchId\}\/stock`/,
    "branch waste fallback must stay under /br/[branchId]/stock",
  );
  assert.match(wasteRoute, /embedded/);
  assert.match(wastePage, /embedded\?: boolean/);
  assert.match(wastePage, embeddedContentWrapperPattern);
  assert.match(wastePage, /if \(routeBranchId == null\)/);
  assert.doesNotMatch(wastePage, /if \(!flagEnabled\) \{\s*if \(routeBranchId != null\)/);
  assert.doesNotMatch(wastePage, /EmployeePage/);

  assert.match(expiryRoute, /ExpiryPageContent/);
  assert.match(expiryRoute, /routeBranchId=\{branchId\}/);
  assert.match(expiryRoute, /embedded/);
  assert.match(expiryPage, /export async function ExpiryPageContent/);
  assert.match(expiryPage, /routeBranchId\?: number/);
  assert.match(expiryPage, /scope\.outOfScope/);
  assert.match(expiryClient, /embedded\?: boolean/);
  assert.match(expiryClient, embeddedContentWrapperPattern);
});

test("transfer receive full receipt stays one-click on the existing atomic action", () => {
  const receiveClient = read(
    "apps/web/app/(protected)/inventory/transfers/[id]/receive/transfer-receive-client.tsx",
  );
  const transferActions = read(
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
  );

  assert.match(receiveClient, /const needsAcknowledgement = hasShort/);
  assert.match(
    receiveClient,
    /const items: Record<string, \{ qty: number; note\?: string \}> \| null =\s*hasShort \? \{\} : null;/,
  );
  assert.match(receiveClient, /transferReceive\(transfer\.id, items\)/);
  assert.match(transferActions, /stock_transfer_receive/);
  assert.match(transferActions, /p_items: items \?\? null/);
});

test("operator waste approvals render branch-locked inside the branch shell", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/page.tsx",
  );
  const officePage = read(
    "apps/web/app/(protected)/inventory/waste/approvals/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  );
  const operatorHome = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const shiftPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );
  const employeeHome = read("apps/web/app/(protected)/employee/page.tsx");

  assert.match(route, /params: Promise<\{ branchId: string \}>/);
  assert.match(route, /WasteApprovalsPageContent/);
  assert.match(route, /routeBranchId=\{branchId\}/);
  assert.match(route, /embedded/);
  assert.doesNotMatch(route, /redirect\(`\/inventory\/waste/);

  assert.match(officePage, /export async function WasteApprovalsPageContent/);
  assert.match(officePage, /routeBranchId\?: number/);
  assert.match(officePage, /embedded\?: boolean/);
  assert.match(officePage, /embedded=\{embedded\}/);
  assert.match(client, /embedded\?: boolean/);
  assert.match(client, embeddedContentWrapperPattern);

  assert.match(
    operatorHome,
    /wasteApprovals: `\$\{basePath\}\/stock\/waste-approvals`/,
  );
  assert.match(
    shiftPage,
    /wasteApprovals: `\/br\/\$\{branchId\}\/stock\/waste-approvals`/,
  );
  assert.match(employeeHome, /wasteApprovals: "\/inventory\/waste\/approvals"/);
});

test("operator stocktake routes use branch stocktake, not employee count", () => {
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
  const stocktakePage = read(
    "apps/web/app/(protected)/inventory/stocktake/page.tsx",
  );
  const stocktakeListClient = read(
    "apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  );
  const stocktakeNewPage = read(
    "apps/web/app/(protected)/inventory/stocktake/new/page.tsx",
  );
  const stocktakeDetailPage = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/page.tsx",
  );
  const stocktakeDetailClient = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
  );
  const stocktakeCountPage = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/count/page.tsx",
  );
  const stocktakeNewClient = read(
    "apps/web/app/(protected)/inventory/stocktake/new/new-session-client.tsx",
  );
  const stocktakeCountClient = read(
    "apps/web/app/(protected)/inventory/stocktake/[id]/count/count-client.tsx",
  );

  for (const source of [
    stocktakeRoute,
    stocktakeNewRoute,
    stocktakeDetailRoute,
    stocktakeCountRoute,
  ]) {
    assert.match(
      source,
      /routeBase=\{`\/br\/\$\{branchId\}\/stock\/stocktake`\}/,
    );
    assert.match(source, /embedded/);
    assert.doesNotMatch(source, /EmployeeCountPageContent|\/stock\/count/);
  }
  assert.match(stocktakeRoute, /StocktakePageContent/);
  assert.match(stocktakeNewRoute, /NewStocktakeSessionPageContent/);
  assert.match(stocktakeDetailRoute, /StocktakeDetailPageContent/);
  assert.match(stocktakeCountRoute, /StocktakeCountPageContent/);

  for (const source of [
    stocktakePage,
    stocktakeNewPage,
    stocktakeDetailPage,
    stocktakeCountPage,
  ]) {
    assert.match(source, /routeBase = "\/inventory\/stocktake"/);
    assert.match(source, /routeBranchId/);
    assert.match(source, /embedded\?: boolean/);
    assert.match(source, /embedded = false/);
    assert.match(source, /embedded=\{embedded\}/);
  }
  for (const source of [
    stocktakeListClient,
    stocktakeNewClient,
    stocktakeDetailClient,
    stocktakeCountClient,
  ]) {
    assert.match(source, /embedded\?: boolean/);
    assert.match(source, /embedded = false/);
    assert.match(source, embeddedContentWrapperPattern);
  }
  assert.match(
    stocktakeListClient,
    /<AppPage width="wide">\s*\{content\}\s*<\/AppPage>/,
  );
  assert.match(stocktakeNewClient, /routeBase = "\/inventory\/stocktake"/);
  assert.match(
    stocktakeNewClient,
    /<InventoryPageContent>\s*\{content\}\s*<\/InventoryPageContent>/,
  );
  assert.match(
    stocktakeDetailClient,
    /<AppPage width="wide" density="compact">\s*\{content\}\s*<\/AppPage>/,
  );
  assert.match(
    stocktakeNewClient,
    /router\.push\(\s*`\$\{routeBase\}\/\$\{res\.data\.sessionId\}\/count\?branchId=\$\{branchId\}`,\s*\)/,
  );
  assert.match(stocktakeCountClient, /routeBase = "\/inventory\/stocktake"/);
  assert.match(
    stocktakeCountClient,
    /<InventoryPageContent>\s*\{content\}\s*<\/InventoryPageContent>/,
  );
  assert.match(
    stocktakeCountClient,
    /href=\{`\$\{routeBase\}\/\$\{sessionId\}\?branchId=\$\{branchId\}&view=detail`\}/,
  );
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
  const transfersListClient = read(
    "apps/web/app/(protected)/inventory/transfers/transfers-list-client.tsx",
  );
  const createTransferForm = read(
    "apps/web/app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
  );
  const transferActions = read(
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
  );

  for (const source of [transferRoute, transferNewRoute, transferDetailRoute]) {
    assert.match(
      source,
      /basePath=\{`\/br\/\$\{branchId\}\/stock\/transfer`\}/,
    );
    assert.match(source, /routeBranchId=\{branchId\}/);
    assert.doesNotMatch(source, /href=\{?["'`]\/inventory\/transfers/);
    assert.doesNotMatch(source, /redirect\(\s*["'`]\/inventory\/transfers/);
    assert.doesNotMatch(
      source,
      /router\.(?:push|replace)\(\s*["'`]\/inventory\/transfers/,
    );
  }

  assert.match(transfersPage, /basePath = "\/inventory\/transfers"/);
  assert.match(transfersPage, /basePath=\{basePath\}/);
  assert.match(transfersPage, /createBasePath=\{createBasePath\}/);
  assert.match(transferNewPage, /basePath=\{basePath\}/);
  assert.match(
    transferNewPage,
    /if \(embedded\) \{\s*return \(\s*<div className="flex w-full flex-col gap-3">/,
  );
  assert.doesNotMatch(transferNewPage, /EmployeePage/);
  assert.match(
    transferNewPage,
    /routeBranchId != null \? basePath : withBranchQuery\(basePath, userBranchId\)/,
  );
  assert.match(
    transferDetailPage,
    /routeBranchId != null\s*\?\s*basePath\s*:\s*scopedBranchId != null/,
  );
  assert.match(transferDetailClient, /listHref \?\?/);
  assert.match(
    createTransferForm,
    /router\.push\(withBranchQuery\(`\$\{basePath\}\/\$\{id\}`, userBranchId\)\)/,
  );
  assert.match(createTransferForm, /canCreateInboundRequest/);
  assert.match(createTransferForm, /requestDestinationBranchId/);
  assert.match(createTransferForm, /inboundSourceOptions/);
  assert.match(
    createTransferForm,
    /fromBranchId = Number\(inboundFromBranchId\)/,
  );
  assert.match(transfersListClient, /canCreateInboundRequest/);
  assert.match(transfersListClient, /isBranchManager \? "Yêu cầu hàng"/);
  assert.match(transfersListClient, /createPathBase = createBasePath \?\? basePath/);
  assert.match(
    transfersListClient,
    /userRole === "branch_manager" && viewerBranchId === toId/,
  );
  assert.match(
    transferActions,
    /claims\.user_role === "branch_manager"[\s\S]*toBranchId !== claims\.branch_id/,
  );
  assert.match(
    transferActions,
    /fromKind !== "central_supply" && fromKind !== "central_kitchen"/,
  );
  assert.match(
    createTransferForm,
    /<Link href=\{withBranchQuery\(basePath, userBranchId\)\}>/,
  );
  assert.doesNotMatch(
    createTransferForm,
    /router\.(?:push|replace)\(\s*["'`]\/inventory\/transfers/,
  );
});
