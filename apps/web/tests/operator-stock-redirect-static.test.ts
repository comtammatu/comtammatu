import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

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

test("operator stock receive renders GRN list and detail inside the branch shell", () => {
  const receiveRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/page.tsx",
  );
  const receiveDetailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/page.tsx",
  );
  const grnListPage = read("apps/web/app/(protected)/inventory/grn/page.tsx");
  const grnListClient = read(
    "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  );
  const grnDetailPage = read(
    "apps/web/app/(protected)/inventory/grn/[id]/page.tsx",
  );
  const grnDetailClient = read(
    "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const grnActionsHook = read(
    "apps/web/app/(protected)/inventory/grn/[id]/_hooks/use-grn-line-actions.ts",
  );

  assert.match(receiveRoute, /GRNListPageContent/);
  assert.match(receiveRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    receiveRoute,
    /basePath=\{`\/br\/\$\{branchId\}\/stock\/receive`\}/,
  );
  assert.match(
    receiveRoute,
    /purchaseOrdersPath=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders`\}/,
  );
  assert.doesNotMatch(
    receiveRoute,
    /TransfersPageContent|initialTab="receive"/,
  );

  assert.match(receiveDetailRoute, /GRNDetailPageContent/);
  assert.match(receiveDetailRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    receiveDetailRoute,
    /grnListBasePath=\{`\/br\/\$\{branchId\}\/stock\/receive`\}/,
  );
  assert.match(
    receiveDetailRoute,
    /grnMobileBackPath=\{`\/br\/\$\{branchId\}\/stock\/receive`\}/,
  );
  assert.match(
    receiveDetailRoute,
    /purchaseOrdersBasePath=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders`\}/,
  );

  assert.match(grnListPage, /export async function GRNListPageContent/);
  assert.match(grnListPage, /routeBranchId\?: number/);
  assert.match(grnListClient, /basePath = "\/inventory\/grn"/);
  assert.match(grnListClient, /grnDetailHref\(basePath, g\.id\)/);
  assert.doesNotMatch(
    grnListClient,
    /href=\{`\/inventory\/grn\/\$\{g\.id\}`\}/,
  );

  assert.match(grnDetailPage, /export async function GRNDetailPageContent/);
  assert.match(grnDetailPage, /routeBranchId\?: number/);
  assert.match(grnDetailPage, /d\.grn\.branch_id !== routeBranchId/);
  assert.match(grnDetailClient, /grnListBasePath = "\/inventory\/grn"/);
  assert.match(grnDetailClient, /grnMobileBackPath = "\/inventory\/grn\/new"/);
  assert.match(
    grnDetailClient,
    /purchaseOrdersBasePath = "\/inventory\/purchase-orders"/,
  );
  assert.match(
    grnDetailClient,
    /href=\{isMobile \? grnMobileBackPath : grnListBasePath\}/,
  );
  assert.match(grnActionsHook, /router\.push\(grnMobileBackPath\)/);
  assert.match(
    grnActionsHook,
    /router\.push\(`\$\{purchaseOrdersBasePath\}\/\$\{grn\.poId\}`\)/,
  );
  assert.doesNotMatch(grnActionsHook, /router\.push\("\/inventory\/grn"\)/);
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

test("operator stock landing reuses the desktop stock workbench in the operator shell", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );

  assert.match(source, /StockPageContent/);
  assert.match(source, /routeBranchId=\{branchId\}/);
  assert.match(source, /branchStockBasePath=\{`\/br\/\$\{branchId\}\/stock`\}/);
  assert.match(source, /embedded/);
  assert.doesNotMatch(source, /EmployeeActionSection|EmployeePage/);
  assert.doesNotMatch(source, /href: `\/br\/\$\{branchId\}\/stock\/count`/);
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
  assert.match(stockPageSource, /scope\.selectedBranchId !== routeBranchId/);
  assert.match(stockDetailPageSource, /routeBranchId\?: number/);
  assert.match(stockDetailPageSource, /branchStockBasePath\?: string/);
  assert.match(stockDetailPageSource, /embedded\?: boolean/);
  assert.match(
    stockDetailPageSource,
    /scope\.selectedBranchId !== routeBranchId/,
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
  assert.match(stockClientSource, /stocktake: null/);
  assert.doesNotMatch(
    stockClientSource,
    /branchStockHref\(stockRootPath, "\/count"\)/,
  );
  assert.match(
    stockClientSource,
    /branchStockHref\(stockRootPath, "\/waste"\)/,
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
  assert.match(
    issueRoute,
    /consumptionBasePath=\{`\/br\/\$\{branchId\}\/stock\/issues`\}/,
  );
  assert.match(issueDetailRoute, /IssueDetailPageContent/);
  assert.match(issueDetailRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    issueDetailRoute,
    /listBasePath=\{`\/br\/\$\{branchId\}\/stock\/issues`\}/,
  );
  assert.match(poRoute, /PurchaseOrdersPageContent/);
  assert.match(poRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    poRoute,
    /basePath=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders`\}/,
  );
  assert.match(poRoute, /suppliersPath=\{null\}/);
  assert.match(poNewRoute, /NewPurchaseOrderPageContent/);
  assert.match(poNewRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    poNewRoute,
    /poBasePath=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders`\}/,
  );
  assert.match(poDetailRoute, /PODetailPageContent/);
  assert.match(poDetailRoute, /routeBranchId=\{branchId\}/);
  assert.match(
    poDetailRoute,
    /purchaseOrdersBasePath=\{`\/br\/\$\{branchId\}\/stock\/purchase-orders`\}/,
  );
  assert.match(
    poDetailRoute,
    /afterCreateGrnHref=\{`\/br\/\$\{branchId\}\/stock\/receive\/:id`\}/,
  );
  assert.match(reportsRoute, /ReportsPageContent/);
  assert.match(reportsRoute, /routeBranchId=\{branchId\}/);
  assert.match(reportsRoute, /embedded/);

  assert.match(issuesPage, /routeBranchId\?: number/);
  assert.match(issuesPage, /scope\.selectedBranchId !== routeBranchId/);
  assert.match(issuesPage, /consumptionBasePath\?: string/);
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
  assert.match(issueDetailPage, /d\.issue\.branch_id !== routeBranchId/);
  assert.match(issueDetailClient, /listBasePath = "\/inventory\/consumption"/);
  assert.match(issueDetailClient, /href=\{listBasePath\}/);

  assert.match(purchaseOrdersPage, /routeBranchId\?: number/);
  assert.match(purchaseOrdersPage, /scope\.selectedBranchId !== routeBranchId/);
  assert.match(purchaseOrdersClient, /suppliersPath\?: string \| null/);
  assert.match(purchaseOrdersClient, /suppliersPath \?/);
  assert.match(newPoPage, /routeBranchId\?: number/);
  assert.match(newPoPage, /poBasePath\?: string/);
  assert.match(
    newPoPage,
    /canSwitchBranch=\{routeBranchId == null && !isBranchScoped\}/,
  );
  assert.match(poDetailPage, /routeBranchId\?: number/);
  assert.match(poDetailPage, /d\.po\.branch_id !== routeBranchId/);
  assert.match(
    poDetailClient,
    /purchaseOrdersBasePath = "\/inventory\/purchase-orders"/,
  );
  assert.match(
    poDetailClient,
    /afterCreateGrnHref[\s\S]*replace\(":id", String\(created\.id\)\)/,
  );

  assert.match(reportsPage, /routeBranchId\?: number/);
  assert.match(reportsPage, /branchId: routeBranchId/);
  assert.match(
    reportsPage,
    /supplierInvoicesHref=\{embedded \? null : "\/inventory\/supplier-invoices"\}/,
  );
  assert.match(reportsClient, /supplierInvoicesHref\?: string \| null/);
  assert.match(reportsClient, /supplierInvoicesHref \?/);
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
  const createTransferForm = read(
    "apps/web/app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
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
  assert.match(transferNewPage, /basePath=\{basePath\}/);
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
  assert.match(
    createTransferForm,
    /<Link href=\{withBranchQuery\(basePath, userBranchId\)\}>/,
  );
  assert.doesNotMatch(
    createTransferForm,
    /router\.(?:push|replace)\(\s*["'`]\/inventory\/transfers/,
  );
});
