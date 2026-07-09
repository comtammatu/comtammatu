import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const between = (source: string, start: string, end: string) =>
  source.slice(source.indexOf(start), source.indexOf(end));

test("PO-created GRNs open detail instead of forcing review mode", () => {
  const poDetail = read(
    "app/(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx",
  );
  const grnFromPo = read(
    "app/(protected)/inventory/grn/new/grn-from-po-list.tsx",
  );
  const grnList = read("app/(protected)/inventory/grn/grn-list-client.tsx");

  assert.doesNotMatch(poDetail, /\?review=1/);
  assert.doesNotMatch(grnFromPo, /\?review=1/);
  assert.doesNotMatch(grnList, /draft\.grnId\}\?review=1/);
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

test("operator consumption and issue routes keep separate business roles", () => {
  const operatorConsumption = read(
    "app/(protected)/br/[branchId]/(operator)/stock/consumption/page.tsx",
  );
  const operatorIssues = read(
    "app/(protected)/br/[branchId]/(operator)/stock/issues/page.tsx",
  );
  const operatorConsumptionDetail = read(
    "app/(protected)/br/[branchId]/(operator)/stock/consumption/[id]/page.tsx",
  );
  const operations = read("app/(protected)/inventory/operations/page.tsx");
  const dictionary = read("app/(protected)/inventory/_lib/dictionary.ts");

  assert.match(operatorConsumption, /scope="consumption"/);
  assert.match(operatorIssues, /scope="internal"/);
  assert.match(
    operatorConsumptionDetail,
    /listBasePath=\{`\/br\/\$\{branchId\}\/stock\/consumption`\}/,
  );
  assert.match(operations, /label: "Tiêu hao vận hành"/);
  assert.match(operations, /label: "Sự cố kho"/);
  assert.match(
    dictionary,
    /issues: \{ short: "Sự cố kho", long: "Sự cố kho" \}/,
  );
  assert.match(dictionary, /stocktake: \{ long: "Kiểm kê đối chiếu" \}/);
});

test("office stock quick issue stays on consumption while Branch lookup stays read-only", () => {
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

test("consumption list separates POS ledger rows from manual slips", () => {
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const messages = read("../../packages/shared/src/messages/inventory.ts");

  assert.match(
    issues,
    /const isConsumptionScope =\s+allowedIssueTypes\.length === 1 && allowedIssueTypes\[0\] === "consumption";/,
  );
  assert.match(
    issues,
    /recordedConsumptions\.length > 0 \|\| isConsumptionScope/,
  );
  assert.match(issues, /title=\{INVENTORY_VI\.recordedConsumptionTitle\}/);
  assert.match(issues, /const issueListTitle = isConsumptionScope/);
  assert.match(issues, /const createIssueActionLabel = isConsumptionScope/);
  assert.match(issues, /title=\{issueListTitle\}/);
  assert.match(issues, /title=\{createIssueActionLabel\}/);
  assert.match(issues, /submitLabel=\{createIssueActionLabel\}/);

  assert.match(
    messages,
    /recordedConsumptionTitle: "Tiêu hao POS đã ghi nhận"/,
  );
  assert.match(
    messages,
    /manualConsumptionSlipsTitle: "Phiếu tiêu hao thủ công"/,
  );
  assert.match(
    messages,
    /manualConsumptionCreateAction: "Tạo phiếu tiêu hao thủ công"/,
  );
  assert.match(messages, /issueSlipsTitle: "WO \/ PXK khác"/);
  assert.match(messages, /issueCreateAction: "Tạo WO\/PXK khác"/);
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
  const po = read(
    "app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const transfers = read(
    "app/(protected)/inventory/transfers/transfers-list-client.tsx",
  );

  for (const source of [po, grn, issues, transfers]) {
    assert.match(
      source,
      /<AppSection[\s\S]{0,120}className="overflow-hidden"[\s\S]{0,120}contentFlush/,
    );
    assert.match(source, /<AppToolbar[\s\S]{0,120}variant="inline"/);
    assert.match(source, /<AppToolbar[\s\S]{0,500}search=\{/);
    assert.match(source, /<AppToolbar[\s\S]{0,1200}filters=\{/);
  }

  for (const source of [po, grn, issues, transfers]) {
    assert.doesNotMatch(
      source,
      /<div className="flex flex-wrap items-center justify-end gap-2">/,
    );
  }

  assert.match(po, /actions=\{embedded \? createPoAction : null\}/);
  assert.match(grn, /actions=\{embedded \? desktopActions : null\}/);
  assert.match(issues, /actions=\{embedded \? issueActions : null\}/);
  assert.match(transfers, /actions=\{embedded \? desktopCreateAction : null\}/);

  assert.doesNotMatch(grn, /paramKey=\{embedded \? "grnTab" : undefined\}/);
  assert.doesNotMatch(transfers, /@comtammatu\/ui\/components\/tabs/);
  assert.doesNotMatch(transfers, /variant="card"/);
});

test("operations embedded lists keep office density instead of touch sizing", () => {
  const po = read(
    "app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const transfers = read(
    "app/(protected)/inventory/transfers/transfers-list-client.tsx",
  );

  assert.match(po, /purchaseOrdersBasePath\.startsWith\("\/br\/"\)/);
  assert.match(grn, /basePath\.startsWith\("\/br\/"\)/);
  assert.match(issues, /listBasePath\.startsWith\("\/br\/"\)/);
  assert.match(transfers, /basePath\.startsWith\("\/br\/"\)/);

  for (const source of [po, grn, issues, transfers]) {
    assert.doesNotMatch(source, /embedded \? "touch"/);
    assert.doesNotMatch(source, /embedded \|\| isOperator/);
  }
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
  const po = read(
    "app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const grn = read("app/(protected)/inventory/grn/grn-list-client.tsx");
  const issues = read("app/(protected)/inventory/issues/issues-client.tsx");
  const transfers = read(
    "app/(protected)/inventory/transfers/transfers-list-client.tsx",
  );

  for (const block of [
    between(po, "const columns", "const createPoAction"),
    between(grn, "const grnColumns", "const filtered"),
    between(issues, "const issueColumns", "const renderIssueCard"),
    between(transfers, "const columns", "const transferDrawer"),
  ]) {
    assert.doesNotMatch(block, /className:\s*"[^"]*\btext-sm\b/);
    assert.doesNotMatch(block, /className="[^"]*\btext-sm\b/);
    assert.doesNotMatch(block, /className:\s*"[^"]*\btext-muted-foreground\b/);
  }
});
