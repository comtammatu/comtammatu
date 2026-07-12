import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const ordersPage = readSource(
  "app/(protected)/br/[branchId]/(operator)/orders/page.tsx",
);
const ordersClient = readSource(
  "app/(protected)/br/[branchId]/(operator)/orders/operator-orders-client.tsx",
);
const ordersActions = readSource("app/(protected)/orders/actions.ts");
const orderDetail = readSource("app/(protected)/orders/order-detail-sheet.tsx");
const menuPage = readSource(
  "app/(protected)/br/[branchId]/(operator)/menu-limits/page.tsx",
);
const menuClient = readSource(
  "app/(protected)/br/[branchId]/(operator)/menu-limits/menu-limits-table.tsx",
);
const stockReports = readSource(
  "app/(protected)/br/[branchId]/(operator)/stock/reports/branch-stock-reports-client.tsx",
);
const transferDetail = readSource(
  "app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/branch-transfer-detail-client.tsx",
);
const countSlips = readSource(
  "app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
);
const stocktakeDetail = readSource(
  "app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/branch-stocktake-detail-client.tsx",
);
const ingredientDetail = readSource(
  "app/(protected)/br/[branchId]/(operator)/stock/on-hand/[ingredientId]/branch-stock-ingredient-detail.tsx",
);

test("branch orders keeps scan rows compact and URL-owns the active view", () => {
  assert.match(ordersClient, /useRouter/);
  assert.match(ordersClient, /router\.replace/);
  assert.match(ordersClient, /view: value === "recent" \? "recent" : null/);
  assert.match(ordersPage, /activeOnly: view === "active"/);
  assert.match(ordersPage, /pageSize: PAGE_SIZE/);
  assert.match(
    ordersActions,
    /query\.not\("status", "in", "\(completed,cancelled\)"\)/,
  );
  assert.match(ordersActions, /\.range\(\(page - 1\) \* pageSize/);
  assert.match(ordersClient, /replaceServerParams\(\{ page:/);
  assert.doesNotMatch(ordersClient, /orders\.filter/);
  assert.doesNotMatch(ordersClient, /if \(orders\.length === 0\)/);
  assert.doesNotMatch(
    ordersClient,
    /STAFF_VI|operatorActiveCountNote|operatorCountNote/,
  );
  assert.match(ordersPage, /summary\.totalCount/);
  assert.match(orderDetail, /auditVisible/);
  assert.match(orderDetail, /useRealtimeChannel/);
});

test("count-slip review defaults to changed lines and keeps full evidence on demand", () => {
  assert.match(countSlips, /selectedChangedLines/);
  assert.match(countSlips, /showAllLines/);
  assert.match(countSlips, /SheetDescription className="sr-only"/);
  assert.doesNotMatch(countSlips, /label: INVENTORY_VI\.varianceShort/);
});

test("stocktake detail defaults to exception lines and discloses full evidence", () => {
  assert.match(stocktakeDetail, /priorityLines/);
  assert.match(stocktakeDetail, /showAllLines/);
  assert.match(stocktakeDetail, /Xem tất cả/);
});

test("ingredient detail keeps stock visible and discloses secondary evidence", () => {
  assert.equal((ingredientDetail.match(/<details/g) ?? []).length, 3);
  assert.doesNotMatch(ingredientDetail, /AppDetailFooter/);
  assert.equal((ingredientDetail.match(/statusBadge\.label/g) ?? []).length, 1);
});

test("stock reports and transfer detail expose one body job", () => {
  assert.match(stockReports, /useOperatorUrlState/);
  assert.match(stockReports, /TabsList/);
  assert.match(stockReports, /view === "variance"/);
  assert.doesNotMatch(stockReports, /BranchOperatorPanel|grid-cols-3/);
  assert.match(transferDetail, /SectionLabel/);
  assert.doesNotMatch(
    transferDetail,
    /BranchOperatorPanel|BranchOperatorDetailList|internalTransferTitle/,
  );
  assert.match(transferDetail, /AppDetailFooter sticky/);
});

test("menu limits renders failure alone and separates limit from replenish", () => {
  assert.match(menuPage, /result\.success && result\.data/);
  assert.match(menuPage, /mode="error"/);
  assert.doesNotMatch(menuPage, /<p role="alert"/);
  assert.match(menuClient, /"limit" \| "replenish"/);
  assert.doesNotMatch(menuClient, /DescriptionList|AppToolbar|AppSection/);
  assert.doesNotMatch(menuClient, /base_price/);
  for (const table of [
    "branch_menu_item_daily_limits",
    "branch_menu_item_daily_holds",
    "orders",
    "stock_levels",
  ]) {
    assert.match(menuClient, new RegExp(`table: "${table}"`));
  }
});
