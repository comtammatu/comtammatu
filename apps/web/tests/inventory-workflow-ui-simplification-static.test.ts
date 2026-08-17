import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const between = (source: string, start: string, end: string) =>
  source.slice(source.indexOf(start), source.indexOf(end));

test("Inventory cancel navigation returns to its owning list", () => {
  const productionCreate = read(
    "app/(protected)/inventory/production/production-create-dialog.tsx",
  );

  assert.doesNotMatch(productionCreate, /router\.back\(\)/);
  assert.match(productionCreate, /onOpenChange\(false\)/);
});

test("stocktake list exposes one create entrypoint", () => {
  const source = read(
    "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  );

  assert.match(source, /\$\{routeBase\}\/new\$\{branchQuery\}/);
  assert.doesNotMatch(source, /createStocktakeSession/);
  assert.doesNotMatch(source, /handleCreateSession/);
  assert.doesNotMatch(source, /<FormDialog/);
});

test("Branch keeps separate roles; Owner hubs consumption and waste as tabs", () => {
  const operatorConsumption = read(
    "app/(protected)/br/[branchId]/(operator)/stock/consumption/page.tsx",
  );
  const operatorIssues = read(
    "app/(protected)/br/[branchId]/(operator)/stock/issues/page.tsx",
  );
  const operatorConsumptionDetail = read(
    "app/(protected)/br/[branchId]/(operator)/stock/consumption/[id]/page.tsx",
  );
  const ownerConsumption = read(
    "app/(protected)/inventory/consumption/page.tsx",
  );
  const dictionary = read("app/(protected)/inventory/_lib/dictionary.ts");
  const branchIssueData = read("lib/inventory/branch-stock-issue-data.ts");

  assert.match(operatorConsumption, /loadBranchConsumptionListData\(/);
  assert.match(operatorIssues, /loadBranchStockIssueListData\(/);
  assert.match(
    operatorConsumptionDetail,
    /loadBranchStockIssueDetailData\(\s*issueId,\s*branchId,\s*"consumption",\s*\)/,
  );
  assert.match(
    operatorConsumptionDetail,
    /listBasePath=\{`\$\{stockBasePath\}\/consumption`\}/,
  );
  assert.match(branchIssueData, /isBranchInternalIssueType/);
  assert.match(ownerConsumption, /scope="hub"/);
  assert.match(ownerConsumption, /detailBasePath="\/inventory\/consumption"/);
  assert.match(dictionary, /issues: \{ long: "Hao hụt" \}/);
  assert.match(dictionary, /stocktake: \{ short: "Kiểm kê", long: "Kiểm kê đối chiếu" \}/);
});

test("Owner surface stock quick issue stays on consumption while Branch lookup stays read-only", () => {
  const stock = read("app/(protected)/inventory/stock/stock-client.tsx");
  const branchStock = read(
    "app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  );
  const dialog = read(
    "app/(protected)/inventory/stock/quick-stock-issue-dialog.tsx",
  );
  const messages = read("lib/messages/inventory.ts");

  assert.match(stock, /stockCopy\.actions\.issueStock/);
  assert.doesNotMatch(stock, /ACTIONS_VI\.export/);
  assert.match(stock, /quickIssueBasePath[\s\S]*"\/inventory\/consumption"/);
  assert.match(stock, /href: actionHrefs\.waste/);
  assert.doesNotMatch(stock, /issueType:\s*"writeoff"/);
  assert.doesNotMatch(
    branchStock,
    /QuickStockIssueDialog|QuickInternalTransferDialog|AdjustStockDialog/,
  );
  assert.match(dialog, /z\.enum\(\["consumption"\]\)/);
  assert.doesNotMatch(dialog, /"writeoff"|"other"/);
  assert.doesNotMatch(dialog, /stockCopy\.quickIssue\.operation/);
  assert.match(messages, /issueStock: "Ghi tiêu hao"/);
  assert.match(messages, /issueTitle: "Ghi tiêu hao nhanh"/);
});

test("consumption list separates POS ledger, manual slips, and waste via tabs", () => {
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const issueCreateDialog = read(
    "app/(protected)/inventory/issues/issue-create-dialog.tsx",
  );
  const issuesCreateUi = issues + issueCreateDialog;
  const messages = read("../../packages/shared/src/messages/inventory.ts");

  assert.match(issues, /const isHubScope =/);
  assert.match(issues, /const showsRecordedConsumption =/);
  assert.match(issues, /const showsWasteTab =/);
  assert.match(issues, /<AppPageTabs/);
  assert.match(issues, /paramKey="view"/);
  assert.match(issues, /queryKeysByValue=\{\{/);
  assert.match(issues, /recorded: \[[\s\S]*?"branch"[\s\S]*?"branchId"[\s\S]*?"startDate"/);
  assert.match(
    issues,
    /manual: \["branch", "branchId", "status", "type", "q"\]/,
  );
  assert.match(
    issues,
    /waste: \["branch", "branchId", "status", "type", "q"\]/,
  );
  assert.match(issues, /<TabsContent value="recorded"/);
  assert.match(issues, /<TabsContent value="manual"/);
  assert.match(issues, /<TabsContent value="waste"/);
  assert.match(issues, /title=\{INVENTORY_VI\.recordedConsumptionTitle\}/);
  assert.match(issues, /INVENTORY_VI\.manualConsumptionSlipsTitle/);
  assert.match(issues, /INVENTORY_VI\.writeoffSlipsTitle/);
  assert.match(
    issuesCreateUi,
    /title=\{INVENTORY_VI\.manualConsumptionCreateAction\}/,
  );
  assert.match(
    issuesCreateUi,
    /submitLabel=\{INVENTORY_VI\.manualConsumptionCreateAction\}/,
  );

  assert.match(messages, /recordedConsumptionTitle: "Tiêu hao đã ghi nhận"/);
  assert.match(messages, /consumptionTabRecorded: "Đã ghi nhận"/);
  assert.match(messages, /consumptionTabManual: "Phiếu tiêu hao"/);
  assert.match(messages, /consumptionTabWaste: "Hao hụt"/);
  assert.match(
    messages,
    /manualConsumptionSlipsTitle: "Phiếu tiêu hao thủ công"/,
  );
  assert.match(
    messages,
    /manualConsumptionCreateAction: "Tạo phiếu tiêu hao thủ công"/,
  );
  assert.match(messages, /writeoffSlipsTitle: "Phiếu hao hụt"/);
  assert.match(messages, /createWasteTitle: "Tạo phiếu hao hụt"/);
  assert.match(issues, /value: "waste"/);
  assert.match(issues, /resolvedView === "waste"/);
  assert.match(issues, /INVENTORY_VI\.createWasteTitle/);
  assert.doesNotMatch(issues, /isCombinedConsumptionScope/);
});

test("recorded consumption toolbar keeps one baseline and separate slots", () => {
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const issueListChrome = read(
    "app/(protected)/inventory/issues/issue-list-chrome.tsx",
  );
  const recordedFilterSource = issueListChrome;

  assert.match(
    recordedFilterSource,
    /export function RecordedConsumptionFilterBar/,
  );
  assert.match(
    recordedFilterSource,
    /<AppToolbar\s+variant="inline"\s+className="items-center"/,
  );
  assert.doesNotMatch(
    recordedFilterSource,
    /RecordedConsumptionFilterBar[\s\S]{0,200}items-stretch/,
  );
  assert.match(
    recordedFilterSource,
    /RecordedConsumptionFilterBar[\s\S]*?search=\{\s*<InputGroup size=\{controlSize\} className="min-w-0 flex-1"/,
  );
  assert.match(
    recordedFilterSource,
    /RecordedConsumptionFilterBar[\s\S]*?filters=\{\s*<>[\s\S]*?Select[\s\S]*?items=\{recordedBranchSelectItems\}/,
  );
  assert.match(
    recordedFilterSource,
    /id="recorded-start-date"[\s\S]*?aria-label=\{FORM_VI\.fromDate\}/,
  );
  assert.match(
    recordedFilterSource,
    /id="recorded-end-date"[\s\S]*?aria-label=\{FORM_VI\.toDate\}/,
  );
  assert.doesNotMatch(
    recordedFilterSource,
    /htmlFor="recorded-start-date"|htmlFor="recorded-end-date"/,
  );
  assert.doesNotMatch(
    recordedFilterSource,
    /RecordedConsumptionFilterBar[\s\S]*?search=\{\s*<>[\s\S]*?<Select/,
  );
  assert.match(issues, /<RecordedConsumptionFilterBar/);
});

test("production create opens the created run overlay", () => {
  const workspace = read(
    "app/(protected)/inventory/production/production-workspace-client.tsx",
  );
  const action = read("app/(protected)/inventory/production-run-actions.ts");

  assert.match(action, /type CreateProductionRunResult/);
  assert.match(action, /production_run_id/);
  assert.match(
    workspace,
    /overlay\.patchOverlay\(\{ runId, mode: "view" \}, "push"\)/,
  );
});

test("operations tabs use the same sectioned list chrome", () => {
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const issueListChrome = read(
    "app/(protected)/inventory/issues/issue-list-chrome.tsx",
  );
  const issuesSurface = issues + issueListChrome;
  const fulfillmentHub = read(
    "app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
  );

  for (const source of [grn, issuesSurface, fulfillmentHub]) {
    assert.match(source, /<AppListFrame/);
    assert.match(source, /variant="inline"/);
    assert.match(source, /<AppToolbar[\s\S]*search=\{/);
    assert.match(source, /<AppToolbar[\s\S]*filters=\{/);
  }

  for (const source of [grn, issuesSurface, fulfillmentHub]) {
    assert.doesNotMatch(
      source,
      /<div className="flex flex-wrap items-center justify-end gap-2">/,
    );
  }

  assert.match(grn, /<AppListFrame toolbar=\{loadFailed \? undefined : toolbar\}>/);
  assert.match(grn, /loadFailed/);
  assert.doesNotMatch(issues, /\bembedded\b/);
  assert.doesNotMatch(grn, /\bwithinOwnerTabs\b/);
  assert.match(fulfillmentHub, /<AppListFrame toolbar=\{toolbar\}>/);
  assert.doesNotMatch(fulfillmentHub, /searchable/);

  assert.doesNotMatch(grn, /paramKey=\{embedded \? "grnTab" : undefined\}/);
  assert.doesNotMatch(fulfillmentHub, /@comtammatu\/ui\/components\/tabs/);
  assert.doesNotMatch(fulfillmentHub, /variant="card"/);
});

test("operations management lists keep dense control sizing", () => {
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const fulfillmentHub = read(
    "app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
  );

  assert.doesNotMatch(grn, /basePath\.startsWith\("\/br\/"\)/);
  assert.doesNotMatch(issues, /listBasePath\.startsWith\("\/br\/"\)/);
  assert.doesNotMatch(fulfillmentHub, /basePath\.startsWith\("\/br\/"\)/);

  for (const source of [grn, issues, fulfillmentHub]) {
    assert.doesNotMatch(source, /size=\{embedded \? "touch"/);
    assert.doesNotMatch(source, /embedded \|\| isOperator/);
  }

  assert.match(issues, /useFormControlSize\("responsive"\)/);
  assert.match(fulfillmentHub, /size="field"/);
});

test("table empty rows render inline content instead of a dashed sub-card", () => {
  const source = read("app/components/table-empty-state-row.tsx");

  assert.match(source, /<TableRow className="border-0 hover:bg-transparent">/);
  assert.match(
    source,
    /className="mx-auto max-w-none border-0 bg-transparent p-0 shadow-none"/,
  );
  assert.doesNotMatch(source, /max-w-sm/);
});

test("operations table columns do not override table typography role", () => {
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const _issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const issueListChrome = read(
    "app/(protected)/inventory/issues/issue-list-chrome.tsx",
  );

  for (const block of [
    between(grn, "const grnColumns", "const filtered"),
    between(issueListChrome, "export function buildIssueColumns", "export function buildRecordedConsumptionColumns"),
  ]) {
    assert.doesNotMatch(block, /className:\s*"[^"]*\btext-sm\b/);
    assert.doesNotMatch(block, /className="[^"]*\btext-sm\b/);
    assert.doesNotMatch(block, /className:\s*"[^"]*\btext-muted-foreground\b/);
  }
});

test("Owner inventory lists share one frame for toolbar, table header, and empty state", () => {
  const stock = read("app/(protected)/inventory/stock/stock-client.tsx");
  const suppliers = read(
    "app/(protected)/inventory/suppliers/suppliers-client.tsx",
  );
  const ingredients = read(
    "app/(protected)/inventory/ingredients/ingredients-client.tsx",
  );
  const recipes = read("app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx");
  const purchaseOrders = read(
    "app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const fulfillmentHub = read(
    "app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
  );
  const stocktake = read(
    "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  );
  const production = read(
    "app/(protected)/inventory/production/production-runs-client.tsx",
  );
  const categories = read(
    "app/(protected)/inventory/settings/categories/categories-client.tsx",
  );
  const units = read(
    "app/(protected)/inventory/settings/units/units-client.tsx",
  );
  const thresholds = read(
    "app/(protected)/inventory/settings/thresholds/page.tsx",
  );
  const frame = read(
    "app/(protected)/inventory/_components/inventory-list-filters.ts",
  );

  assert.match(stock, /<AppPage width="xwide" density="compact"/);
  assert.doesNotMatch(stock, /isCompactLayout|useStockCompactLayout/);

  for (const source of [suppliers, ingredients, recipes]) {
    assert.match(source, /<AppPage width="xwide" density="compact"/);
  }

  for (const source of [
    stock,
    suppliers,
    ingredients,
    recipes,
    purchaseOrders,
    grn,
    issues,
    fulfillmentHub,
    stocktake,
    production,
    categories,
    units,
    thresholds,
  ]) {
    assert.match(source, /<AppListFrame/);
  }

  for (const source of [suppliers, ingredients, production, stocktake]) {
    assert.match(source, /<AppToolbar[\s\S]{0,120}variant="inline"/);
  }
  assert.doesNotMatch(production, /searchable/);

  assert.match(stock, /variant="inline"/);
  assert.doesNotMatch(
    stock,
    /isFirstLoadEmpty \?[\s\S]{0,40}firstLoadEmptyState[\s\S]{0,40}<DataTable/,
  );
  assert.match(frame, /inventoryListFilterSelectClassName = "w-44 shrink-0"/);
  assert.doesNotMatch(frame, /function InventoryListFrame|AppListFrame/);
  assert.doesNotMatch(purchaseOrders, /<DataTable[\s\S]{0,500}searchable/);
  assert.doesNotMatch(recipes, /<DataTable[\s\S]{0,500}searchable/);
  assert.doesNotMatch(recipes, /recipes\.length === 0/);
});

test("AppToolbar inline shares card surface without muted fill", () => {
  const surface = read("app/components/surface/app-toolbar.tsx");
  assert.match(
    surface,
    /if \(variant === "inline"\) \{[\s\S]{0,200}<Toolbar[\s\S]{0,80}className=\{cn\(\s*"gap-2 overflow-visible border-b border-border px-3 py-2"/,
  );
  assert.doesNotMatch(
    surface,
    /variant === "inline"[\s\S]{0,160}bg-muted\/30/,
  );
});

test("migrated inventory lists use AppListFrame toolbar slot", () => {
  const invoices = [
    read("app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx"),
    read("app/(protected)/finance/supplier-invoices/supplier-invoice-list-ui.tsx"),
  ].join("\n");
  const supplierItems = read(
    "app/(protected)/inventory/suppliers/[id]/items/supplier-items-client.tsx",
  );
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const countSlips = read(
    "app/(protected)/inventory/count-slips/count-slips-client.tsx",
  );
  const countAssignments = read(
    "app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  );
  const thresholdsClient = read(
    "app/(protected)/inventory/settings/thresholds/thresholds-client.tsx",
  );

  for (const source of [invoices, supplierItems, thresholdsClient]) {
    assert.match(source, /<AppListFrame[\s\S]{0,800}toolbar=\{/);
    assert.match(source, /variant="inline"/);
  }

  assert.match(
    grn,
    /<AppListFrame toolbar=\{loadFailed \? undefined : toolbar\}>/,
  );
  assert.match(countSlips, /<AppListFrame[\s\S]{0,200}toolbar=\{/);
  assert.match(countSlips, /<AppToolbar[\s\S]{0,120}variant="inline"/);
  assert.doesNotMatch(countSlips, /<AppListFrame title=/);
  assert.match(countAssignments, /<AppListFrame[\s\S]{0,200}toolbar=\{/);
  assert.match(countAssignments, /<AppToolbar[\s\S]{0,120}variant="inline"/);
  assert.doesNotMatch(countAssignments, /<DataTable[\s\S]{0,200}searchable/);
});

test("SelectContent defaults to popper and Inventory LIST filters share field width", () => {
  const select = read("../../packages/ui/src/components/select.tsx");
  const surface = [
    "app/components/surface/app-list-frame.tsx",
    "app/components/surface/app-toolbar.tsx",
  ]
    .map((path) => read(path))
    .join("\n");
  const frame = read(
    "app/(protected)/inventory/_components/inventory-list-filters.ts",
  );
  const dataTable = read("app/components/data-table/data-table.tsx");
  const stock = read("app/(protected)/inventory/stock/stock-client.tsx");
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const ingredients = read(
    "app/(protected)/inventory/ingredients/ingredients-client.tsx",
  );
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const issueListChrome = read(
    "app/(protected)/inventory/issues/issue-list-chrome.tsx",
  );
  const issuesSurface = issues + issueListChrome;
  const fulfillmentHub = read(
    "app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
  );
  const stocktake = read(
    "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  );
  const invoicesListUi = read(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-list-ui.tsx",
  );
  const financeInvoicesPage = read(
    "app/(protected)/finance/invoices/page.tsx",
  );
  const financeFilterBar = read(
    "app/(protected)/finance/components/filter-bar.tsx",
  );
  const orders = read("app/(protected)/orders/orders-client.tsx");
  const employeeTable = read("app/(protected)/hr/employee-table.tsx");

  assert.match(select, /position = "popper"/);
  assert.match(select, /positionMethod = FLOATING_POSITION_METHOD/);
  assert.match(select, /collisionBoundary = floatingCollisionBoundary\(\)/);
  assert.doesNotMatch(select, /position = "item-aligned"/);
  assert.doesNotMatch(
    select,
    /data-\[position=popper\]:h-\(--anchor-height\)/,
  );
  assert.match(
    surface,
    /className=\{cn\("overflow-visible", hasHeader \? "pb-0" : "py-0", className\)\}/,
  );
  assert.match(
    surface,
    /ToolbarGroup className="relative z-0 min-w-0 flex-1 gap-2"/,
  );
  assert.match(
    surface,
    /ToolbarGroup className="relative z-10 shrink-0 gap-2"/,
  );
  assert.match(
    frame,
    /export const inventoryListFilterSelectClassName = "w-44 shrink-0"/,
  );
  assert.match(
    frame,
    /export const inventoryListFilterSelectWideClassName = "w-56 shrink-0"/,
  );
  assert.match(stock, /search=\{searchControl\}/);
  assert.match(
    stock,
    /filters=\{\s*<>\s*\{filterControls\}/,
  );
  assert.doesNotMatch(stock, /isCompactLayout|useStockCompactLayout/);

  for (const source of [stock, ingredients, issuesSurface, stocktake]) {
    assert.match(source, /inventoryListFilterSelectClassName/);
  }
  assert.match(grn, /className="w-36"/);
  assert.match(fulfillmentHub, /inventoryListFilterSelectClassName/);
  assert.match(stock, /useFormControlSize\(\)/);
  assert.match(stock, /size=\{controlSize\}/);
  assert.match(ingredients, /useFormControlSize\(\)/);
  assert.match(issues, /useFormControlSize\("responsive"\)/);
  assert.match(fulfillmentHub, /size="field"/);
  assert.match(invoicesListUi, /<PopoverContent[\s\S]*className="w-\[min\(20rem/);
  assert.match(financeInvoicesPage, /variant="inline"/);
  assert.match(financeFilterBar, /className="w-full sm:w-44"/);
  assert.match(stocktake, /useFormControlSize\("responsive"\)/);
  assert.match(stocktake, /size="lg"/);
  assert.match(orders, /useFormControlSize\(\)/);
  assert.match(employeeTable, /useFormControlSize\(\)/);
  assert.match(
    dataTable,
    /const controlSize = isTouchLayout \? "touch" : "field"/,
  );
  assert.doesNotMatch(
    dataTable,
    /size=\{isTouchLayout \? "touch" : "default"\}/,
  );
});

test("stock never presents an all-location choice", () => {
  const stockModel = read("lib/inventory/stock-on-hand-model.ts");
  const ownerStocktake = read(
    "app/(protected)/inventory/stocktake/new/new-session-client.tsx",
  );
  const branchStocktake = read(
    "app/(protected)/br/[branchId]/(operator)/stock/stocktake/new/branch-stocktake-new-client.tsx",
  );
  const inventoryMessages = read("lib/messages/inventory.ts");

  for (const source of [stockModel, ownerStocktake, branchStocktake]) {
    assert.doesNotMatch(source, /allLocations|locationOptional/);
  }
  assert.doesNotMatch(inventoryMessages, /Mọi vị trí|Tất cả vị trí kho/);
  assert.match(ownerStocktake, /const selectedWarehouse = useMemo/);
  assert.match(branchStocktake, /const selectedWarehouse =/);
  assert.match(ownerStocktake, /locationId: selectedWarehouse\.id/);
  assert.match(branchStocktake, /locationId: selectedWarehouse\.id/);
});

test("Inventory sidebar keeps the four resolveInventoryNav group titles", () => {
  const nav = read("app/lib/control-surface-nav.ts");
  const shell = read("app/components/control-surface-shell.tsx");

  assert.match(nav, /export function flattenInventoryDeepNav/);
  assert.doesNotMatch(shell, /flattenInventoryDeepNav/);
  assert.match(shell, /activeModule === "inventory"/);
  assert.match(shell, /withInventoryBranchNavScope/);
});
