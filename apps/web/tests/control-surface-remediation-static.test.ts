import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("Finance landing keeps exceptions on specialist queues", () => {
  const source = read("apps/web/app/(protected)/finance/page.tsx");

  assert.doesNotMatch(source, /attentionExceptions|exceptionsTitle/);
  assert.match(source, /financeCopy\.basic\.sections\.grossProfit/);
  assert.match(source, /financeCopy\.basic\.sections\.periodResult/);
});

test("tracking settings does not repeat page chrome inside its section", () => {
  const page = read("apps/web/app/(protected)/settings/tracking/page.tsx");
  const messages = read("apps/web/lib/messages/settings.ts");

  assert.equal((page.match(/title=\{copy\.title\}/g) ?? []).length, 1);
  assert.equal(
    (page.match(/description=\{copy\.description\}/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(messages, /Ba nguồn khác nhau:/);
});

test("high-risk control-surface copy stays in Vietnamese message contracts", () => {
  const productionImport = read(
    "apps/web/app/(protected)/inventory/production-recipe-import-export-menu.tsx",
  );
  const issueDetail = read(
    "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );
  const printers = read(
    "apps/web/app/(protected)/br/_shared/settings/printers/printers-client.tsx",
  );
  const channelPrices = read(
    "apps/web/app/(protected)/menu/item-channel-prices-fields.tsx",
  );
  const menuMessages = read("packages/shared/src/messages/menu.ts");
  const productionDialog = read(
    "apps/web/app/(protected)/inventory/production/production-create-dialog.tsx",
  );
  const roleBindings = read(
    "apps/web/app/(protected)/hr/staff/[id]/permissions/role-bindings-client.tsx",
  );
  const menuImport = read(
    "apps/web/app/(protected)/menu/import-export-menu.tsx",
  );

  assert.match(productionImport, /INVENTORY_VI\.exportXlsx/);
  assert.match(productionImport, /INVENTORY_VI\.exportCsv/);
  assert.doesNotMatch(issueDetail, />ID:|<ItemDescription>ID:/);
  assert.doesNotMatch(printers, /LAN host \/ IP|LAN port/);
  assert.doesNotMatch(channelPrices, />Markup %:/);
  assert.match(
    menuMessages,
    /channelPricesMarkupLabel: "Tỷ lệ tăng giá \(%\)"/,
  );
  assert.doesNotMatch(menuMessages, /Áp markup|Markup từ/);
  assert.doesNotMatch(productionDialog, /site Bếp|đối soát tự động/);
  assert.doesNotMatch(
    roleBindings,
    /role binding|Cần xác thực AAL2|phiên đăng nhập AAL2/,
  );
  assert.doesNotMatch(menuImport, /Danh muc|Mon an/);
});

test("Owner inventory queues use canonical LIST actions and hide opaque ids", () => {
  const wasteApprovals = read(
    "apps/web/app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  );
  const countAssignments = read(
    "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  );

  assert.match(wasteApprovals, /AppListFrame/);
  assert.match(wasteApprovals, /AppToolbar/);
  assert.match(wasteApprovals, /DataTable/);
  assert.doesNotMatch(wasteApprovals, /CN #/);
  assert.match(countAssignments, /renderRowContextMenu/);
  assert.match(countAssignments, /RowActionsMenu/);
});

test("Finance keeps formulas visible and delegates branch scope to the shell", () => {
  const formulaShell = read(
    "apps/web/app/(protected)/finance/components/finance-period-formula-shell.tsx",
  );
  const currentFunds = read(
    "apps/web/app/(protected)/finance/components/current-funds-section.tsx",
  );
  const financePage = read("apps/web/app/(protected)/finance/page.tsx");
  const foodCost = read(
    "apps/web/app/(protected)/finance/food-cost/food-cost-client.tsx",
  );
  const invoices = read("apps/web/app/(protected)/finance/invoices/page.tsx");
  const expenses = read(
    "apps/web/app/(protected)/finance/expenses/expenses-client.tsx",
  );

  assert.doesNotMatch(
    formulaShell,
    /Collapsible|xl:hidden|hidden gap-4 xl:grid/,
  );
  assert.match(formulaShell, /className="grid gap-4"/);
  assert.ok(
    currentFunds.indexOf("{children}") <
      currentFunds.indexOf("cash.branches.map"),
  );
  assert.match(financePage, /hide=\{\["branch", "granularity", "compare"\]\}/);
  assert.match(foodCost, /hide=\{\["branch", "compare", "granularity"\]\}/);
  assert.match(
    invoices,
    /hide=\{\["branch", "range", "granularity", "compare"\]\}/,
  );
  assert.match(expenses, /\? \["branch", "compare", "granularity", "range"\]/);
});

test("Finance errors are recoverable and expense titles hide database ids", () => {
  const expensePage = read(
    "apps/web/app/(protected)/finance/expenses/page.tsx",
  );
  const equipmentPage = read(
    "apps/web/app/(protected)/finance/equipment/page.tsx",
  );
  const constructionPage = read(
    "apps/web/app/(protected)/finance/construction/page.tsx",
  );
  const invoicesPage = read(
    "apps/web/app/(protected)/finance/supplier-invoices/page.tsx",
  );
  const expensesClient = read(
    "apps/web/app/(protected)/finance/expenses/expenses-client.tsx",
  );
  const viewDialog = read(
    "apps/web/app/(protected)/finance/expenses/expense-view-dialog.tsx",
  );

  assert.match(expensePage, /throw new Error/);
  assert.match(equipmentPage, /throw new Error/);
  assert.match(constructionPage, /throw new Error/);
  assert.match(invoicesPage, /throw new Error/);
  assert.doesNotMatch(expensesClient, /#\$\{editingExpense\.id\}/);
  assert.doesNotMatch(viewDialog, /#\$\{expense\.id\}/);
});

test("Inventory metric filters are keyboard controls and header actions are touch responsive", () => {
  for (const path of [
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
    "apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  ]) {
    const source = read(path);
    const metricSource = source.slice(
      path.includes("stocktake")
        ? source.indexOf('<div className="grid grid-cols-2')
        : source.indexOf("const underThresholdButton"),
    );
    const interactiveItems = [...metricSource.matchAll(/<Item\b[\s\S]*?>/g)]
      .map((match) => match[0])
      .filter((tag) => tag.includes("onClick="));
    assert.ok(interactiveItems.length > 0, `${path} must have metric filters`);
    for (const tag of interactiveItems) {
      assert.match(tag, /render=\{\s*<button\s+type="button"/);
    }
  }

  for (const path of [
    "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx",
    "apps/web/app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx",
    "apps/web/app/(protected)/inventory/production/production-workspace-client.tsx",
    "apps/web/app/(protected)/inventory/suppliers/suppliers-client.tsx",
    "apps/web/app/(protected)/inventory/transfers/page.tsx",
  ]) {
    assert.match(read(path), /ResponsiveActionButton/);
  }
});

test("Production document supports mobile editing without horizontal panning", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/production/[id]/production-detail-client.tsx",
  );

  assert.match(source, /DataTable/);
  assert.match(source, /mobileCardRender/);
  assert.match(source, /ResponsiveActionButton/);
  assert.doesNotMatch(source, /min-w-\[640px\]/);
});

test("Operator copy hides authentication internals and uses the Vietnamese file term", () => {
  const authMessages = read("apps/web/lib/messages/auth.ts");
  const authClient = read("apps/web/lib/auth/mfa-security-client.tsx");
  const hrSetup = read("apps/web/app/(protected)/hr/setup/setup-client.tsx");
  const orderDetail = read(
    "apps/web/app/(protected)/orders/order-detail-sheet.tsx",
  );
  const copySources = [
    "apps/web/app/(protected)/finance/bank-transactions/import-actions.ts",
    "apps/web/app/(protected)/menu/actions.ts",
    "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
    "apps/web/app/(protected)/inventory/ingredient-actions.ts",
    "packages/shared/src/messages/toast.ts",
    "apps/web/lib/messages/settings.ts",
  ].map(read);

  assert.doesNotMatch(authMessages, /AAL1|AAL2|TOTP|\bMFA\b/);
  assert.doesNotMatch(authClient, /aal\.toUpperCase\(\)/);
  assert.doesNotMatch(hrSetup, /headerHint=/);
  assert.doesNotMatch(orderDetail, /const VERDICT_COPY/);
  for (const source of copySources) {
    assert.doesNotMatch(
      source,
      /Thiếu file|đọc (?:được |)file|Chọn đúng file|Đã xuất file|LAN host trước/i,
    );
    assert.doesNotMatch(source, /Danh muc|Mon an/);
  }
});

test("Control and inventory surfaces never use opaque database ids as labels", () => {
  const sources = [
    "apps/web/lib/inventory/branch-consumption-data.ts",
    "apps/web/lib/inventory/branch-count-assignment-data.ts",
    "apps/web/lib/inventory/branch-count-slip-data.ts",
    "apps/web/lib/inventory/branch-stock-issue-data.ts",
    "apps/web/lib/inventory/branch-stock-report-data.ts",
    "apps/web/lib/inventory/branch-stocktake-data.ts",
    "apps/web/lib/inventory/branch-waste-create-data.ts",
    "apps/web/lib/inventory/grn-detail-data.ts",
    "apps/web/lib/inventory/load-purchase-workspace.ts",
    "apps/web/lib/inventory/smart-reorder-data.ts",
    "apps/web/lib/inventory/stock-fulfillment-data.ts",
    "apps/web/lib/inventory/stock-on-hand-data.ts",
    "apps/web/lib/inventory/stock-on-hand-detail-data.ts",
    "apps/web/lib/inventory/stock-request-detail-data.ts",
    "apps/web/lib/inventory/transfer-detail-data.ts",
    "apps/web/lib/inventory/waste-analytics-data.ts",
    "apps/web/lib/inventory/waste-approvals-data.ts",
    "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
    "apps/web/app/(protected)/inventory/count-slips/page.tsx",
    "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
    "apps/web/app/(protected)/inventory/issues/[id]/issue-a4-print-dialog.tsx",
    "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
    "apps/web/app/(protected)/br/_shared/settings/printers/printers-client.tsx",
    "apps/web/app/(protected)/br/_shared/settings/kds/stations-client.tsx",
    "apps/web/app/(protected)/settings/printers/jobs/print-jobs-client.tsx",
    "apps/web/lib/hr/roster/roster-day-cell.tsx",
    "apps/web/app/(protected)/hr/leave-request-actions.ts",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/page.tsx",
  ].map(read);

  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /`(?:CN|Kho|Chi nhánh|Điểm|NL|Nguyên liệu) #?\$\{/,
    );
    assert.doesNotMatch(source, /\?\? `#\$\{/);
  }
});

test("Business references never masquerade database ids as document numbers", () => {
  const financeInvoices = read(
    "apps/web/app/(protected)/finance/invoice-list.tsx",
  );
  const manualInvoice = read(
    "apps/web/app/(protected)/finance/manual-issue-invoice-dialog.tsx",
  );
  const posSessions = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );
  const syntheticDocumentSources = [
    "apps/web/app/(protected)/inventory/count-slips/page.tsx",
    "apps/web/lib/inventory/branch-count-slip-data.ts",
    "apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
    "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
    "apps/web/lib/inventory/branch-stocktake-data.ts",
    "apps/web/lib/inventory/branch-stock-issue-data.ts",
    "apps/web/lib/inventory/branch-consumption-data.ts",
    "apps/web/app/(protected)/inventory/stocktake/[id]/count/count-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/count/branch-stocktake-count-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/branch-stocktake-detail-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/branch-stocktake-list-client.tsx",
  ].map(read);
  const financeReferences = [
    "apps/web/app/(protected)/finance/_lib/sepay-bank-transactions.ts",
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
    "apps/web/app/(protected)/finance/expense-actions.ts",
  ].map(read);

  assert.doesNotMatch(financeInvoices, /`#\$\{/);
  assert.doesNotMatch(manualInvoice, /`#\$\{/);
  assert.doesNotMatch(posSessions, /`POS #\$\{/);
  for (const source of syntheticDocumentSources) {
    assert.doesNotMatch(source, /`(?:PD|KK|PXK)-\$\{/);
  }
  for (const source of financeReferences) {
    assert.doesNotMatch(source, /`#\$\{/);
  }
});

test("Vietnamese copy avoids leaked system ids and mixed file or site terms", () => {
  const catalog = read("apps/web/lib/messages/catalog.ts");
  const financeMessages = read("apps/web/lib/messages/finance.ts");
  const inventoryMessages = read("apps/web/lib/messages/inventory.ts");
  const settingsMessages = read("apps/web/lib/messages/settings.ts");

  assert.doesNotMatch(catalog, /File \.xlsx/);
  assert.doesNotMatch(financeMessages, /File PDF|Nhập file|Thanh toán #\$\{/);
  assert.doesNotMatch(
    inventoryMessages,
    /Bỏ file|mở file|site\/kho|site vận hành|Đã tạo phiên #\$\{/,
  );
  assert.doesNotMatch(settingsMessages, /lệnh in #\$\{|chứng từ #\$\{/);
  assert.doesNotMatch(settingsMessages, /AAL1|AAL2|TOTP|\bMFA\b/);
});

test("remaining page and shell chrome stays single-owner on narrow screens", () => {
  const grnList = read(
    "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  );
  const branchPage = read(
    "apps/web/lib/branch-operator/components/branch-operator-page.tsx",
  );
  const appShell = read("apps/web/app/components/app-shell.tsx");

  assert.match(grnList, /<TabsList[\s\S]*layout="scroll"/);
  assert.doesNotMatch(grnList, /flex w-max min-w-full/);
  assert.match(branchPage, /compactOnMobile=\{true\}/);
  assert.match(appShell, /sidebarHeaderAccessory && !isTouchLayout/);
  assert.match(appShell, /isTouchLayout \? mobileScopeAccessory : null/);
});

test("remaining control copy hides system internals and keeps descriptions concise", () => {
  const printJobs = read(
    "apps/web/app/(protected)/settings/printers/jobs/print-jobs-client.tsx",
  );
  const orderDetail = read(
    "apps/web/app/(protected)/orders/order-detail-sheet.tsx",
  );
  const revenueDrill = read(
    "apps/web/app/(protected)/finance/revenue/[date]/revenue-drill-tabs.tsx",
  );
  const stockDetail = read(
    "apps/web/lib/inventory/stock-on-hand-detail-model.ts",
  );
  const printerActions = read(
    "apps/web/app/(protected)/br/_shared/settings/printers/actions.ts",
  );
  const mfa = read("apps/web/lib/auth/mfa.ts");
  const bindingActions = read(
    "apps/web/app/(protected)/hr/staff/[id]/permissions/actions.ts",
  );
  const supplierInvoiceActions = read(
    "apps/web/app/(protected)/finance/supplier-invoice-actions.ts",
  );
  const financeMessages = read("apps/web/lib/messages/finance.ts");
  const thresholdDialog = read(
    "apps/web/app/components/inventory/branch-stock-thresholds-dialog.tsx",
  );

  assert.doesNotMatch(printJobs, /header: "#"|<ItemTitle>#\{job\.id\}/);
  assert.doesNotMatch(
    printJobs,
    />\{job\.printer_role\}|\{job\.last_error \?\? ""\}/,
  );
  assert.doesNotMatch(orderDetail, /ca POS #/);
  assert.doesNotMatch(revenueDrill, /Ca #/);
  assert.doesNotMatch(stockDetail, /Phiếu nhập #\$\{/);
  assert.doesNotMatch(printerActions, /LAN host/);
  assert.doesNotMatch(mfa, /Không thể xác thực MFA/);
  assert.doesNotMatch(bindingActions, /Cần xác thực AAL2/);
  assert.doesNotMatch(supplierInvoiceActions, /file HĐ GTGT/);
  assert.doesNotMatch(financeMessages, /TT 32\/2025|NĐ 254\/2026/);
  assert.match(
    thresholdDialog,
    /description=\{INVENTORY_VI\.branchThresholdsDescription\}/,
  );
});

test("stocktake review and assignment routes keep one concrete branch scope", () => {
  const countSlipsPage = read(
    "apps/web/app/(protected)/inventory/count-slips/page.tsx",
  );
  const countSlipsClient = read(
    "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx",
  );
  const countAssignmentsPage = read(
    "apps/web/app/(protected)/inventory/count-assignments/page.tsx",
  );
  const countAssignmentsClient = read(
    "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  );
  const stocktakeTabs = read(
    "apps/web/app/(protected)/inventory/_components/stocktake-nav-tabs.tsx",
  );

  assert.match(countSlipsPage, /resolveInventoryListScope/);
  assert.match(countSlipsPage, /queryBranch=\{params\.branch\}/);
  assert.match(countSlipsPage, /\.eq\("branch_id", selectedBranchId\)/);
  assert.match(countSlipsPage, /branchId=\{selectedBranchId\}/);
  assert.match(countAssignmentsPage, /scope\.defaultBranchId/);
  assert.match(countAssignmentsPage, /withControlSurfaceBranchScope/);
  assert.match(countSlipsClient, /withControlSurfaceBranchScope/);
  assert.match(countAssignmentsClient, /withControlSurfaceBranchScope/);
  assert.doesNotMatch(
    countSlipsClient,
    /render=\{<Link href="\/inventory\/count-assignments" \/>\}/,
  );
  assert.doesNotMatch(
    countAssignmentsClient,
    /render=\{<Link href="\/inventory\/count-slips" \/>\}/,
  );
  assert.doesNotMatch(stocktakeTabs, /branchParam === "all" \? "all"/);
});
