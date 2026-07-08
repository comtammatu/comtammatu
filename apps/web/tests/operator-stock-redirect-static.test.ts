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

test("operator stock task routes render branch-shell content instead of redirecting to inventory", () => {
  const expectations = [
    ["transfer", "TransfersPageContent", 'initialTab="dispatch"'],
    ["waste", "WasteNewPageContent", null],
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
  const receiveDetailContent = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-content.tsx",
  );
  const receiveClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-client.tsx",
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
  assert.match(receiveDetailContent, /fetchStockTransferDetail/);
  assert.match(receiveDetailContent, /resolveInventoryListScope/);
  assert.match(receiveDetailContent, /scope\.outOfScope/);
  assert.match(receiveDetailContent, /<TransferReceiveClient/);
  assert.match(
    receiveDetailContent,
    /backHref=\{`\/br\/\$\{branchId\}\/stock\/receive`\}/,
  );
  assert.match(
    receiveDetailContent,
    /detailHref=\{`\/br\/\$\{branchId\}\/stock\/transfer\/\$\{transferId\}`\}/,
  );
  assert.match(receiveClient, /Button asChild variant="ghost" size="icon"/);
  assert.match(receiveClient, /<AppDetailFooter[\s\S]*\bsticky\b/);
  assert.match(
    receiveClient,
    /initialValue=\{\s*sheetItem\s*\?\s*confirmed\.has\(sheetItem\.ingredientId\)[\s\S]*: null\s*: null\s*\}/,
  );

  assert.match(transfersPage, /export async function TransfersPageContent/);
});

test("operator stock count renders employee count inside the branch operator shell", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count/page.tsx",
  );
  const employeeCountPage = read("apps/web/lib/staff-runtime/count/page.tsx");
  const countClient = read("apps/web/lib/staff-runtime/count/count-client.tsx");

  assert.match(source, /EmployeeCountPageContent/);
  assert.match(source, /routeBranchId=\{branchId\}/);
  assert.match(source, /hideHeaderOnMobile/);
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
    /<AppToolbar\s*variant=\{embedded \? "inline" : "card"\}/,
  );
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
    /<AppPage width="wide" scroll>\s*\{content\}\s*<\/AppPage>/,
  );
  assert.doesNotMatch(stockDetailPageSource, /InventoryPageContent/);
  assert.match(stockDetailPageSource, /scope\.outOfScope/);
  assert.match(stockDetailPageSource, /fetchStockBearingLocationIds/);
  assert.match(stockDetailPageSource, /\.from\("stock_levels"\)/);
  assert.match(stockDetailPageSource, /\.from\("stock_movements"\)/);
  assert.doesNotMatch(stockDetailPageSource, /\.from\("grn_items"\)/);
  assert.equal(
    (stockDetailPageSource.match(/size=\{embedded \? "touch" : "sm"\}/g) ?? [])
      .length,
    5,
    "embedded stock detail operation buttons must be touch-sized",
  );
  assert.match(
    stockDetailPageSource,
    /movementReferenceHref\(\{\s*movement,\s*branchId,\s*branchStockBasePath: branchStockRoot,\s*embedded,\s*\}\)/,
  );
  assert.match(
    stockDetailPageSource,
    /branchStockHref\(branchStockBasePath,\s*`\/grn\/\$\{movement\.grn_id\}`\)/,
  );
  assert.doesNotMatch(
    stockDetailPageSource,
    /movement\.grn_id != null\)\s*return branchStockHref\(branchStockBasePath,\s*"\/receive"\)/,
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
  // Stock-card navigation must resolve through the branch-native
  // stockDetailHref (embedded => /br/{branchId}/stock/on-hand/{id}). The row
  // now navigates via the RowActionsMenu "view stock card" item and the
  // mobile card Link, both bound to stockDetailHref(item.id) — never an
  // office /inventory/stock href.
  assert.match(stockClientSource, /href: stockDetailHref\(item\.id\)/);
  assert.match(stockClientSource, /href=\{stockDetailHref\(item\.id\)\}/);
  assert.doesNotMatch(stockClientSource, /router\.push\(`?\/inventory\/stock/);
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
  assert.doesNotMatch(
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
    /embedded[\s\S]*branchStockHref\(stockRootPath, "\/issues"\)[\s\S]*: "\/inventory\/issues"/,
  );
});

test("operator stock branch-native extensions keep PO, GRN, issue, and report actions in the branch shell", () => {
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
  const grnRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/page.tsx",
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
  const grnPage = read("apps/web/app/(protected)/inventory/grn/page.tsx");
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

  assert.match(issueRoute, /IssuesPageContent/);
  assert.match(issueRoute, /routeBranchId=\{branchId\}/);
  assert.match(issueRoute, /embedded/);
  assert.match(
    issueRoute,
    /listBasePath=\{`\/br\/\$\{branchId\}\/stock\/issues`\}/,
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
  assert.match(grnRoute, /GRNListPageContent/);
  assert.match(grnRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    grnRoute,
    /basePath=\{`\/br\/\$\{branchId\}\/stock\/grn`\}/,
  );
  assert.match(
    grnRoute,
    /purchaseOrdersPath=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders`\}/,
  );
  assert.match(grnRoute, /embedded/);
  // D067 §1: GRN detail forks presentation over the SHARED loader. Draft
  // review stays native, confirmed GRN uses the shared detail client in
  // embedded mode so branch stock never nests the office AppPage frame.
  assert.match(grnDetailRoute, /isGrnLookupParam\(rawId\)/);
  assert.match(grnDetailRoute, /loadGrnDetail\(rawId, branchId\)/);
  assert.match(grnDetailRoute, /GrnReviewOperatorClient/);
  assert.match(grnDetailRoute, /GRNDetailClient/);
  assert.match(grnDetailRoute, /embedded/);
  assert.match(
    grnDetailRoute,
    /purchaseOrdersBasePath = `\/br\/\$\{branchId\}\/stock\/purchase-orders`/,
  );
  assert.doesNotMatch(grnDetailRoute, /TransferDetailPageContent/);
  assert.match(reportsRoute, /ReportsPageContent/);
  assert.match(reportsRoute, /routeBranchId=\{branchId\}/);
  assert.match(reportsRoute, /embedded/);

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
  assert.match(
    issueDetailClient,
    /className=\{embedded \? "h-12" : "h-10"\}/,
  );
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
  assert.match(formCombobox, /isTouchSize && "h-auto min-h-12 text-sm/);

  assert.match(purchaseOrdersPage, /routeBranchId\?: number/);
  assert.match(purchaseOrdersPage, /embedded\?: boolean/);
  assert.match(purchaseOrdersPage, /embedded=\{embedded\}/);
  assert.match(purchaseOrdersPage, /scope\.outOfScope/);
  assert.match(purchaseOrdersClient, /suppliersPath\?: string \| null/);
  assert.match(purchaseOrdersClient, /embedded\?: boolean/);
  assert.match(purchaseOrdersClient, embeddedContentWrapperPattern);
  assert.match(
    purchaseOrdersClient,
    /<AppToolbar\s*variant=\{embedded \? "inline" : "card"\}/,
  );
  assert.match(
    purchaseOrdersClient,
    /size=\{embedded \? "touch" : "default"\}/,
  );
  assert.match(purchaseOrdersClient, /suppliersPath \?/);
  assert.match(
    grnListClient,
    /<AppToolbar variant=\{isOperator \? "inline" : "card"\}>/,
  );
  assert.match(grnPage, /showDrafts \? listMyGrnDrafts\(routeBranchId\)/);
  assert.match(grnPage, /drafts=\{showDrafts \? drafts : undefined\}/);
  assert.match(grnListClient, /const isOperator = basePath\.startsWith\("\/br\/"\)/);
  assert.match(grnListClient, /<GrnDraftsTab drafts=\{drafts\} basePath=\{basePath\} \/>/);
  assert.match(
    grnListClient,
    /router\.push\(`\$\{basePath\}\/new\/\$\{draft\.supplierId\}`\)/,
  );
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
  const grnCreateEmbeddedBranch = grnCreateClient.slice(
    grnCreateClient.indexOf("if (embedded)"),
    grnCreateClient.indexOf("<DocumentFormFrame"),
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
  assert.match(
    grnCreateEmbeddedBranch,
    /if \(embedded\) \{\s*return \(\s*<div className="flex w-full flex-col gap-3">/,
  );
  assert.doesNotMatch(grnCreateEmbeddedBranch, /\{header\}/);
  assert.match(grnCreateEmbeddedBranch, /\{footer\}/);
  assert.match(grnCreateClient, /<AppDetailFooter[\s\S]*sticky=\{embedded\}/);
  assert.equal(
    (
      grnCreateClient.match(
        /<SelectTrigger size="touch" className="w-full" aria-label=\{unit\}>/g,
      ) ?? []
    ).length,
    2,
    "GRN create unit picker must stay touch-sized",
  );
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
  const wasteCreateClient = read(
    "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx",
  );
  const wasteRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/page.tsx",
  );
  assert.match(
    transfersPage,
    /if \(routeBranchId != null\) \{\s*redirect\(`\/br\/\$\{routeBranchId\}\/stock\/transfer\/new`\);\s*\}/,
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
  assert.match(
    wasteCreateClient,
    /<SelectTrigger\s+id="waste-loc"\s+size=\{embedded \? "touch" : "default"\}\s+className="w-full"/,
  );
  assert.match(
    wasteCreateClient,
    /<Combobox[\s\S]*size=\{embedded \? "touch" : "sm"\}[\s\S]*className="w-full"/,
  );
  assert.match(
    wasteCreateClient,
    /<WasteReasonDropdown[\s\S]*size=\{embedded \? "touch" : "sm"\}[\s\S]*className="w-full"/,
  );
  assert.match(
    wasteCreateClient,
    /size=\{embedded \? "touch-lg" : "default"\}/,
  );
  assert.match(wasteCreateClient, /<AppDetailFooter[\s\S]*sticky=\{embedded\}/);
  assert.doesNotMatch(
    wastePage,
    /if \(!flagEnabled\) \{\s*if \(routeBranchId != null\)/,
  );
  assert.doesNotMatch(wastePage, /EmployeePage/);
  assert.equal(
    exists("apps/web/app/(protected)/inventory/expiry/page.tsx"),
    false,
  );
  assert.equal(
    exists(
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/expiry/page.tsx",
    ),
    false,
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
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-today-status.tsx",
  );
  const shiftPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );
  const employeeHome = read("apps/web/lib/staff-runtime/page.tsx");

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
  ]) {
    assert.match(source, /embedded\?: boolean/);
    assert.match(source, /embedded = false/);
    assert.match(source, embeddedContentWrapperPattern);
  }
  // The stocktake count client is the native operator exception: embedded mode
  // renders the numpad-wizard (D067 mockup 8) instead of the office grid.
  assert.match(stocktakeCountClient, /embedded\?: boolean/);
  assert.match(stocktakeCountClient, /embedded = false/);
  assert.match(
    stocktakeCountClient,
    /if \(showWizard\) \{\s*return \(\s*<div[\s\S]*?<StocktakeCountWizard/,
  );
  assert.match(
    stocktakeListClient,
    /<AppPage width="xwide"[^>]*>\s*\{content\}\s*<\/AppPage>/,
  );
  assert.match(
    stocktakeListClient,
    /<AppToolbar variant=\{embedded \? "inline" : "card"\}>/,
  );
  assert.match(
    stocktakeDetailClient,
    /size=\{embedded \? "touch" : "default"\}/,
  );
  assert.match(stocktakeNewClient, /routeBase = "\/inventory\/stocktake"/);
  assert.match(
    stocktakeNewClient,
    /<DocumentFormFrame header=\{header\} scroll>\s*\{content\}\s*<\/DocumentFormFrame>/,
  );
  assert.doesNotMatch(stocktakeNewClient, /InventoryPageContent/);
  assert.match(
    stocktakeDetailClient,
    /<AppPage width="x?wide" density="compact">[\s\S]*?<AppPageHeader/,
  );
  assert.match(
    stocktakeNewClient,
    /router\.push\(\s*`\$\{routeBase\}\/\$\{res\.data\.sessionId\}\/count\?branchId=\$\{branchId\}`,\s*\)/,
  );
  assert.equal(
    (
      stocktakeNewClient.match(
        /<SelectTrigger\s+size=\{embedded \? "touch" : "default"\}\s+className="w-full"/g,
      ) ?? []
    ).length,
    2,
    "embedded stocktake start branch/location selects must be touch-sized",
  );
  assert.match(
    stocktakeNewClient,
    /size=\{embedded \? "touch-lg" : "default"\}/,
  );
  assert.match(stocktakeNewClient, /<AppDetailFooter[\s\S]*\bsticky\b/);
  assert.match(stocktakeCountClient, /routeBase = "\/inventory\/stocktake"/);
  assert.match(
    stocktakeCountClient,
    /<DocumentFormFrame header=\{header\} scroll>\s*\{content\}\s*<\/DocumentFormFrame>/,
  );
  assert.doesNotMatch(stocktakeCountClient, /InventoryPageContent/);
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
  const transferNewEmbeddedBranch = transferNewPage.slice(
    transferNewPage.indexOf("if (embedded)"),
    transferNewPage.indexOf(
      "\n\n  return (",
      transferNewPage.indexOf("if (embedded)"),
    ),
  );
  const transferDetailEmbeddedBranch = transferDetailClient.slice(
    transferDetailClient.indexOf("const content = embedded ?"),
    transferDetailClient.indexOf(
      ") : (",
      transferDetailClient.indexOf("const content = embedded ?"),
    ),
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
    transferNewEmbeddedBranch,
    /if \(embedded\) \{\s*return \(\s*<div className="flex w-full flex-col gap-3">\s*<CreateTransferForm[\s\S]*?embedded[\s\S]*?<\/div>/,
  );
  assert.doesNotMatch(transferNewEmbeddedBranch, /AppPageHeader/);
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
  assert.doesNotMatch(transferDetailEmbeddedBranch, /AppPageHeader/);
  assert.match(
    transferDetailEmbeddedBranch,
    /<Badge variant=\{statusBadge\.variant\}/,
  );
  assert.match(
    transferDetailClient,
    /<AppDetailFooter[\s\S]*sticky=\{embedded\}/,
  );
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
  assert.match(transfersListClient, /isBranchManager \? requestGoodsLabel/);
  assert.match(
    transfersListClient,
    /createPathBase = createBasePath \?\? basePath/,
  );
  assert.match(
    transfersListClient,
    /userRole === "branch_manager" && viewerBranchId === toId/,
  );
  assert.match(transfersListClient, /<AppToolbar\s*variant="inline"/);
  assert.match(transfersListClient, /<AppToolbar\s*variant="card"/);
  assert.match(
    transferActions,
    /claims\.user_role === "branch_manager"[\s\S]*toBranchId !== claims\.branch_id/,
  );
  assert.match(
    transferActions,
    /fromKind !== "central_supply"\s*&&\s*fromKind !== "central_kitchen"/,
  );
  assert.match(
    createTransferForm,
    /<Link href=\{withBranchQuery\(basePath, userBranchId\)\}>/,
  );
  assert.match(
    createTransferForm,
    /className=\{`flex min-w-0 flex-col \$\{embedded \? "gap-3" : "gap-4"\}`\}/,
  );
  assert.doesNotMatch(createTransferForm, /<OperatorFlowSteps/);
  assert.match(createTransferForm, /flowProgressValue/);
  assert.match(createTransferForm, /showLineSection/);
  assert.match(createTransferForm, /showNotesSection/);
  assert.equal(
    (
      createTransferForm.match(
        /<SelectTrigger\s+size=\{embedded \? "touch" : "default"\}\s+className="w-full"/g,
      ) ?? []
    ).length,
    2,
    "embedded transfer create warehouse selectors must be touch-sized",
  );
  assert.match(createTransferForm, /<AppDetailFooter[\s\S]*\bsticky\b/);
  assert.doesNotMatch(
    createTransferForm,
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

test("operator supplier returns render branch-native inside the branch operator shell (D059 §4 slice 3)", () => {
  const listRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/page.tsx",
  );
  const newRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/new/page.tsx",
  );
  const detailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/supplier-returns/[id]/page.tsx",
  );
  const officeListPage = read(
    "apps/web/app/(protected)/inventory/supplier-returns/page.tsx",
  );
  const officeNewPage = read(
    "apps/web/app/(protected)/inventory/supplier-returns/new/page.tsx",
  );
  const officeDetailPage = read(
    "apps/web/app/(protected)/inventory/supplier-returns/[id]/page.tsx",
  );
  const listClient = read(
    "apps/web/app/(protected)/inventory/supplier-returns/supplier-returns-client.tsx",
  );
  const createClient = read(
    "apps/web/app/(protected)/inventory/supplier-returns/new/supplier-return-create-client.tsx",
  );
  const navConfig = read("packages/shared/src/auth/nav-config.ts");

  assert.match(listRoute, /params: Promise<\{ branchId: string \}>/);
  assert.match(listRoute, /SupplierReturnsPageContent/);
  assert.match(listRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    listRoute,
    /basePath=\{`\/br\/\$\{branchId\}\/stock\/supplier-returns`\}/,
  );
  assert.match(listRoute, /embedded/);
  assert.doesNotMatch(listRoute, /redirect\(`\/inventory\/supplier-returns/);

  assert.match(newRoute, /params: Promise<\{ branchId: string \}>/);
  assert.match(newRoute, /SupplierReturnNewPageContent/);
  assert.doesNotMatch(newRoute, /redirect\(`\/inventory\/supplier-returns/);

  assert.match(
    detailRoute,
    /params: Promise<\{ branchId: string; id: string \}>/,
  );
  assert.match(detailRoute, /SupplierReturnDetailPageContent/);
  assert.match(detailRoute, /routeBranchId=\{branchId\}/);
  assert.doesNotMatch(detailRoute, /redirect\(`\/inventory\/supplier-returns/);

  assert.match(
    officeListPage,
    /export async function SupplierReturnsPageContent/,
  );
  assert.match(officeListPage, /routeBranchId\?: number/);
  assert.match(officeListPage, /basePath\?: string/);
  assert.match(officeListPage, /embedded\?: boolean/);
  assert.match(officeListPage, /embedded=\{embedded\}/);
  assert.match(listClient, /embedded\?: boolean/);
  assert.match(listClient, embeddedContentWrapperPattern);

  assert.match(
    officeNewPage,
    /export async function SupplierReturnNewPageContent/,
  );
  assert.match(officeNewPage, /embedded\?: boolean/);
  assert.match(
    createClient,
    /<Combobox[\s\S]*size="touch"[\s\S]*className="w-full"/,
  );
  assert.match(createClient, /grid grid-cols-1 gap-3 sm:grid-cols-2/);
  assert.equal(
    (
      createClient.match(/<SelectTrigger size="touch" className="w-full">/g) ??
      []
    ).length,
    2,
    "supplier return create selects must stay touch-sized",
  );

  assert.match(
    officeDetailPage,
    /export async function SupplierReturnDetailPageContent/,
  );
  assert.match(officeDetailPage, /routeBranchId\?: number/);
  assert.match(officeDetailPage, /embedded\?: boolean/);

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
  const officePage = read(
    "apps/web/app/(protected)/inventory/production/page.tsx",
  );
  const dataSource = read(
    "apps/web/app/(protected)/inventory/production-data.ts",
  );
  const operatorClientSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/production/production-operator-client.tsx",
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
  assert.match(recipeRoute, /<ProductionRecipePanel[\s\S]*embedded/);
  assert.match(newRoute, /<ProductionNewClient[\s\S]*basePath=\{`\/br\/\$\{branchId\}\/stock\/production`\}/);
  assert.match(detailRoute, /fetchProductionRunById\(runId\)/);
  assert.match(detailRoute, /run\.branch_id !== branchId && run\.target_branch_id !== branchId/);

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

  assert.match(operatorClientSource, /<OperatorFlowSteps/);
  assert.match(operatorClientSource, /operatorFlow\.productionTitle/);
  assert.match(operatorClientSource, /<LinkCardGrid>/);
  assert.match(operatorClientSource, /<AppLinkCard/);
  assert.match(
    operatorClientSource,
    /import \{[^}]*\buseSearchParams\b[^}]*\} from "next\/navigation"/,
  );
  assert.match(operatorClientSource, /const view = searchParams\.get\("view"\)/);
  assert.match(
    operatorClientSource,
    /href=\{buildViewHref\(PRODUCTION_ORDERS_VIEW\)\}/,
  );
  assert.match(
    operatorClientSource,
    /href=\{buildViewHref\(PRODUCTION_RECIPES_VIEW\)\}/,
  );
  assert.match(
    operatorClientSource,
    /view === PRODUCTION_ORDERS_VIEW[\s\S]*<ProductionRunSection/,
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
  assert.match(operatorClientSource, /const showDraftsFirst =/);
  assert.match(
    operatorClientSource,
    /\{showDraftsFirst \? draftsSection : createSection\}/,
  );
  assert.match(
    operatorClientSource,
    /\{showDraftsFirst[\s\S]*\? createSection[\s\S]*: drafts\.length > 0[\s\S]*\? draftsSection[\s\S]*: null\}/,
  );
  assert.doesNotMatch(operatorClientSource, /productionOperatorEmpty/);

  // The office_bridge "Sản xuất" tile is retired now that the native
  // surface has landed (D059 §2 shrink-to-zero).
  assert.doesNotMatch(navConfig, /hrefTemplate: "\/inventory\/production"/);

  assert.match(
    navConfig,
    /moduleKey: "inventory_procurement",\s*icon: "FileText",\s*group: "stock",\s*hrefTemplate: "\/br\/\{branchId\}\/stock\/purchase-orders",\s*label: "Đơn đặt hàng",\s*kinds: \["central_supply", "central_kitchen"\]/,
  );
});
