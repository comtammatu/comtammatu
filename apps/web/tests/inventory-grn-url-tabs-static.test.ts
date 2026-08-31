import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const grnPageSource = readFileSync(
  "app/(protected)/inventory/grn/page.tsx",
  "utf8",
);
const grnListClientSource = readFileSync(
  "app/(protected)/inventory/grn/grn-list-client.tsx",
  "utf8",
);

test("GRN is a direct route and /inventory/operations is gone", () => {
  assert.equal(
    existsSync("app/(protected)/inventory/operations/page.tsx"),
    false,
  );
  assert.match(
    grnPageSource,
    /<GRNListPageContent searchParams=\{searchParams\} \/>/,
  );

  assert.match(grnListClientSource, /<AppListFrame/);
  assert.doesNotMatch(grnListClientSource, /AppPageTabs|TabsContent/);
  assert.match(grnListClientSource, /<TabsList[\s\S]*?aria-label=\{grnCopy\.statusTabsAria\}/);
});

test("GRN status uses header tabs on the compact operational list", () => {
  assert.match(grnListClientSource, /tabs=\{statusTabs\}/);
  assert.match(grnListClientSource, /value=\{filters\.status\}/);
  assert.match(
    grnListClientSource,
    /navigate\(\{[\s\S]*?status: value[\s\S]*?page: null[\s\S]*?dateField: null/,
  );
  assert.doesNotMatch(grnListClientSource, /applyFilters/);
  assert.doesNotMatch(grnListClientSource, /supplierFilter/);
  assert.doesNotMatch(grnListClientSource, /purchaseOrderFilter/);
  assert.doesNotMatch(grnListClientSource, /header: "Đơn đặt hàng"/);
  assert.doesNotMatch(grnListClientSource, /header: "Yêu cầu mua"/);
  assert.doesNotMatch(grnListClientSource, /requestId: filters\.purchaseRequestId/);
  assert.match(grnListClientSource, /OWNER_UNPRICED_GRN_STATUS/);
  assert.match(grnListClientSource, /grnCopy\.confirmedUnitCost\.tab/);
  assert.doesNotMatch(grnListClientSource, /header: "Giá trị nhập"/);
  assert.doesNotMatch(grnListClientSource, /header: "Hóa đơn"/);
  assert.doesNotMatch(grnListClientSource, /viewPendingOrders/);
});
