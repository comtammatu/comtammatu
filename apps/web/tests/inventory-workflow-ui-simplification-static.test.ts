import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const between = (source: string, start: string, end: string) =>
  source.slice(source.indexOf(start), source.indexOf(end));

test("Inventory cancel navigation returns to its owning list", () => {
  const productionNew = read(
    "app/(protected)/inventory/production/new/production-new-client.tsx",
  );

  assert.doesNotMatch(productionNew, /router\.back\(\)/);
  assert.match(productionNew, /onClick=\{\(\) => router\.push\(basePath\)\}/);
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

test("Branch keeps separate roles while Owner combines consumption and waste", () => {
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
  assert.match(ownerConsumption, /scope="all"/);
  assert.match(ownerConsumption, /detailBasePath="\/inventory\/consumption"/);
  assert.match(
    dictionary,
    /issues: \{ short: "Sự cố kho", long: "Sự cố kho" \}/,
  );
  assert.match(dictionary, /stocktake: \{ long: "Kiểm kê đối chiếu" \}/);
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
  assert.match(
    stock,
    /issueType === "consumption"\s+\? "\/inventory\/consumption"\s+: "\/inventory\/issues"/,
  );
  assert.doesNotMatch(
    branchStock,
    /QuickStockIssueDialog|QuickInternalTransferDialog|AdjustStockDialog/,
  );
  assert.match(dialog, /form\.register\("issueType"\)/);
  assert.doesNotMatch(dialog, /name="issueType"/);
  assert.doesNotMatch(dialog, /stockCopy\.quickIssue\.operation/);
  assert.match(messages, /issueStock: "Ghi tiêu hao"/);
  assert.match(messages, /issueTitle: "Ghi tiêu hao nhanh"/);
});

test("consumption list combines POS ledger rows with operational and waste slips", () => {
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const messages = read("../../packages/shared/src/messages/inventory.ts");

  assert.match(
    issues,
    /const isConsumptionScope =\s+allowedIssueTypes\.length === 1 && allowedIssueTypes\[0\] === "consumption";/,
  );
  assert.match(issues, /const showsRecordedConsumption =/);
  assert.match(
    issues,
    /recordedConsumptions\.length > 0 \|\| showsRecordedConsumption/,
  );
  assert.match(issues, /title=\{INVENTORY_VI\.recordedConsumptionTitle\}/);
  assert.match(issues, /const issueListTitle = isCombinedConsumptionScope/);
  assert.match(
    issues,
    /const createIssueActionLabel = isCombinedConsumptionScope/,
  );
  assert.match(issues, /title=\{issueListTitle\}/);
  assert.match(issues, /title=\{createIssueActionLabel\}/);
  assert.match(issues, /submitLabel=\{createIssueActionLabel\}/);

  assert.match(messages, /recordedConsumptionTitle: "Tiêu hao đã ghi nhận"/);
  assert.match(
    messages,
    /manualConsumptionSlipsTitle: "Phiếu tiêu hao thủ công"/,
  );
  assert.match(
    messages,
    /manualConsumptionCreateAction: "Tạo phiếu tiêu hao thủ công"/,
  );
  assert.match(
    messages,
    /combinedConsumptionSlipsTitle: "Phiếu vận hành và hao hụt"/,
  );
  assert.match(
    messages,
    /combinedConsumptionCreateAction: "Tạo phiếu tiêu hao \/ hao hụt"/,
  );
});

test("recorded consumption toolbar keeps one baseline and separate slots", () => {
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");

  assert.match(
    issues,
    /const recordedConsumptionFilterBar = \(\s*<AppToolbar\s+variant="inline"\s+className="items-center"/,
  );
  assert.doesNotMatch(
    issues,
    /recordedConsumptionFilterBar[\s\S]{0,200}items-stretch/,
  );
  assert.match(
    issues,
    /recordedConsumptionFilterBar[\s\S]*?search=\{\s*<InputGroup size=\{controlSize\} className="min-w-0 flex-1"/,
  );
  assert.match(
    issues,
    /recordedConsumptionFilterBar[\s\S]*?filters=\{\s*<>[\s\S]*?Select[\s\S]*?items=\{recordedBranchSelectItems\}/,
  );
  assert.match(
    issues,
    /id="recorded-start-date"[\s\S]*?aria-label=\{FORM_VI\.fromDate\}/,
  );
  assert.match(
    issues,
    /id="recorded-end-date"[\s\S]*?aria-label=\{FORM_VI\.toDate\}/,
  );
  assert.doesNotMatch(
    issues,
    /htmlFor="recorded-start-date"|htmlFor="recorded-end-date"/,
  );
  assert.doesNotMatch(
    issues,
    /recordedConsumptionFilterBar[\s\S]*?search=\{\s*<>[\s\S]*?<Select/,
  );
});

test("production create redirects to the created run detail", () => {
  const client = read(
    "app/(protected)/inventory/production/new/production-new-client.tsx",
  );
  const action = read("app/(protected)/inventory/production-run-actions.ts");

  assert.match(action, /type CreateProductionRunResult/);
  assert.match(action, /production_run_id/);
  assert.match(
    client,
    /router\.push\(`\$\{basePath\}\/\$\{res\.data\.productionRunId\}`\)/,
  );
  assert.doesNotMatch(client, /router\.push\(basePath\);/);
});

test("operations tabs use the same sectioned list chrome", () => {
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const transfers = read(
    "app/(protected)/inventory/transfers/transfers-list-client.tsx",
  );

  for (const source of [grn, issues, transfers]) {
    assert.match(source, /<AppListFrame/);
    assert.match(source, /<AppToolbar[\s\S]{0,120}variant="inline"/);
    assert.match(source, /<AppToolbar[\s\S]{0,500}search=\{/);
    assert.match(source, /<AppToolbar[\s\S]{0,1200}filters=\{/);
  }

  for (const source of [grn, issues, transfers]) {
    assert.doesNotMatch(
      source,
      /<div className="flex flex-wrap items-center justify-end gap-2">/,
    );
  }

  assert.match(grn, /<AppListFrame toolbar=\{loadFailed \? undefined : toolbar\}>/);
  assert.match(grn, /loadFailed/);
  assert.match(issues, /actions=\{embedded \? issueActions : null\}/);
  assert.match(transfers, /actions=\{embedded \? desktopCreateAction : null\}/);

  assert.doesNotMatch(grn, /paramKey=\{embedded \? "grnTab" : undefined\}/);
  assert.doesNotMatch(transfers, /@comtammatu\/ui\/components\/tabs/);
  assert.doesNotMatch(transfers, /variant="card"/);
});

test("operations embedded lists keep management density instead of touch sizing", () => {
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const transfers = read(
    "app/(protected)/inventory/transfers/transfers-list-client.tsx",
  );

  assert.doesNotMatch(grn, /basePath\.startsWith\("\/br\/"\)/);
  assert.match(issues, /listBasePath\.startsWith\("\/br\/"\)/);
  assert.doesNotMatch(transfers, /basePath\.startsWith\("\/br\/"\)/);

  for (const source of [grn, issues, transfers]) {
    assert.doesNotMatch(source, /size=\{embedded \? "touch"/);
    assert.doesNotMatch(source, /embedded \|\| isOperator/);
  }

  assert.match(
    transfers,
    /useFormControlSize\(embedded \? "touch" : "responsive"\)/,
  );
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
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const transfers = read(
    "app/(protected)/inventory/transfers/transfers-list-client.tsx",
  );

  for (const block of [
    between(grn, "const grnColumns", "const filtered"),
    between(issues, "const issueColumns", "const renderIssueCard"),
    between(transfers, "const columns", "const desktopCreateAction"),
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
  const transfers = read(
    "app/(protected)/inventory/transfers/transfers-list-client.tsx",
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
    "app/(protected)/inventory/_components/inventory-list-frame.tsx",
  );

  assert.match(
    stock,
    /width=\{isCompactLayout \? "narrow" : "xwide"\}[\s\S]{0,80}density="compact"/,
  );

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
    transfers,
    stocktake,
    production,
    categories,
    units,
    thresholds,
  ]) {
    assert.match(source, /<AppListFrame/);
  }

  for (const source of [suppliers, ingredients]) {
    assert.match(source, /<AppToolbar[\s\S]{0,120}variant="inline"/);
  }

  assert.match(stock, /variant="inline"/);
  assert.doesNotMatch(
    stock,
    /variant=\{isCompactLayout \? "card" : "inline"\}/,
  );
  assert.doesNotMatch(
    stock,
    /isFirstLoadEmpty \?[\s\S]{0,40}firstLoadEmptyState[\s\S]{0,40}<DataTable/,
  );
  assert.match(frame, /<AppListFrame \{\.\.\.props\}>/);
  assert.doesNotMatch(purchaseOrders, /<DataTable[\s\S]{0,500}searchable/);
  assert.doesNotMatch(recipes, /<DataTable[\s\S]{0,500}searchable/);
  assert.doesNotMatch(recipes, /recipes\.length === 0/);
});

test("AppToolbar inline shares card surface without muted fill", () => {
  const surface = read("app/components/surface.tsx");
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
  const invoices = read(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );
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
    assert.match(source, /<AppToolbar[\s\S]{0,120}variant="inline"/);
  }

  assert.match(
    grn,
    /<AppListFrame toolbar=\{loadFailed \? undefined : toolbar\}>/,
  );
  assert.match(countSlips, /<AppListFrame title=/);
  assert.match(countAssignments, /<AppListFrame>/);
});

test("SelectContent defaults to popper and Inventory LIST filters share field width", () => {
  const select = read("../../packages/ui/src/components/select.tsx");
  const surface = read("app/components/surface.tsx");
  const frame = read(
    "app/(protected)/inventory/_components/inventory-list-frame.tsx",
  );
  const dataTable = read("app/components/data-table/data-table.tsx");
  const stock = read("app/(protected)/inventory/stock/stock-client.tsx");
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const ingredients = read(
    "app/(protected)/inventory/ingredients/ingredients-client.tsx",
  );
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const transfers = read(
    "app/(protected)/inventory/transfers/transfers-list-client.tsx",
  );
  const stocktake = read(
    "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  );
  const invoices = read(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
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
    /filters=\{\s*isCompactLayout \? undefined : \(\s*<>\s*\{filterControls\}/,
  );
  assert.doesNotMatch(
    stock,
    /search=\{\s*isCompactLayout \? \(\s*searchControl/,
  );

  for (const source of [stock, ingredients, issues, stocktake, invoices]) {
    assert.match(source, /inventoryListFilterSelectClassName/);
  }
  assert.match(grn, /className="w-44"/);
  assert.match(transfers, /inventoryListFilterSelectWideClassName/);
  assert.match(stock, /useFormControlSize\(\)/);
  assert.match(stock, /size=\{controlSize\}/);
  assert.match(ingredients, /useFormControlSize\(\)/);
  assert.match(
    issues,
    /useFormControlSize\(isOperator \? "touch" : "responsive"\)/,
  );
  assert.match(
    transfers,
    /useFormControlSize\(embedded \? "touch" : "responsive"\)/,
  );
  assert.match(invoices, /size="lg"/);
  assert.match(
    stocktake,
    /useFormControlSize\(embedded \? "touch" : "responsive"\)/,
  );
  assert.match(stocktake, /size=\{embedded \? "touch" : "lg"\}/);
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

test("Inventory sidebar keeps workflow labels out of the visible sub-navigation", () => {
  const nav = read("app/lib/control-surface-nav.ts");
  const shell = read("app/components/control-surface-shell.tsx");

  assert.match(nav, /title:\s*""/);
  assert.match(nav, /\.flatMap\(\(group\) => group\.items\)/);
  assert.match(shell, /flattenInventoryDeepNav/);
  assert.match(shell, /module="inventory"|module === "inventory"/);
});
