import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Branch consumption owns a source-aware touch list and typed native detail", () => {
  const listRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/page.tsx",
  );
  const detailRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/[id]/page.tsx",
  );
  const listClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
  );
  const detailClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/[id]/branch-stock-issue-detail-client.tsx",
  );
  const data = read("apps/web/lib/inventory/branch-consumption-data.ts");
  const issueData = read("apps/web/lib/inventory/branch-stock-issue-data.ts");
  const issueActions = read("apps/web/app/(protected)/inventory/issue-actions.ts");
  const ownerDetail = read(
    "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );
  const ownerList = read(
    "apps/web/app/(protected)/inventory/issues/issues-client.tsx",
  );
  const ownerIssueCreateDialog = read(
    "apps/web/app/(protected)/inventory/issues/issue-create-dialog.tsx",
  );
  const ownerListCreateUi = ownerList + ownerIssueCreateDialog;
  const nav = read("packages/shared/src/auth/nav-config.ts");

  assert.match(listRoute, /loadBranchConsumptionListData/);
  assert.match(listRoute, /BranchConsumptionListClient/);
  assert.match(
    detailRoute,
    /loadBranchStockIssueDetailData\([\s\S]*"consumption"/,
  );
  assert.match(detailRoute, /BranchStockIssueDetailClient/);
  assert.doesNotMatch(
    listRoute + detailRoute,
    /IssuesPageContent|IssueDetailPageContent|embedded/,
  );

  assert.match(data, /import "server-only"/);
  assert.match(data, /orders!stock_movements_order_id_fkey/);
  assert.match(data, /groupSaleConsumptionsByOrder/);
  assert.match(data, /branch\?\.branch_kind === "branch"/);
  assert.match(data, /\.not\("order_id", "is", null\)/);
  assert.match(listClient, /showRecorded && requestedView !== "manual"/);
  assert.match(data, /RECORDED_SALE_CONSUMPTION_MOVEMENT_FETCH_LIMIT/);
  assert.match(data, /RECORDED_SALE_CONSUMPTION_ORDER_LIMIT/);
  assert.match(listClient, /order\.orderNumber/);
  assert.match(listClient, /selectedOrder\.lines\.map/);
  assert.match(issueData, /expectedType/);
  assert.match(issueData, /detail\.issue\.issue_type !== expectedType/);

  assert.match(listClient, /value="recorded"/);
  assert.match(listClient, /value="manual"/);
  assert.match(listClient, /<SheetContent[\s\S]*side="bottom"/);
  assert.match(listClient, /lg:grid-cols-2/);
  assert.doesNotMatch(listClient, /DataTable|DocumentFormFrame|AppToolbar/);
  assert.match(detailClient, /listBasePath/);
  assert.match(detailClient, /size="icon-touch"/);
  assert.match(detailClient, /PhotoUploadInput/);
  assert.match(detailClient, /showConsumptionPhoto/);
  assert.match(ownerDetail, /PhotoUploadInput/);
  assert.match(ownerDetail, /showConsumptionPhoto/);
  assert.match(ownerDetail, /initialLine\?: IssueLine \| null/);
  assert.match(ownerDetail, /IconPencil/);
  assert.match(ownerDetail, /onEdit=\{handleEditLine\}/);
  assert.match(
    ownerList,
    /\$\{createHref\}\?branch=\$\{defaultBranchId\}&branchId=\$\{defaultBranchId\}/,
  );
  assert.match(ownerList, /writeRequiresSitePick/);
  assert.match(ownerList, /createHref/);
  assert.match(ownerList, /value: "waste"/);
  assert.match(ownerListCreateUi, /option\.value === "consumption"/);
  assert.match(ownerListCreateUi, /option\.value !== "writeoff"/);
  assert.match(issueData, /photo_urls/);
  assert.match(issueActions, /photoUrls: z\.array\(z\.string\(\)\.url\(\)\)\.max\(1\)\.optional\(\)/);
  assert.match(issueActions, /photo_urls: d\.photoUrls/);
  assert.match(issueActions, /\.rpc\("save_stock_issue_line" as never/);
  assert.doesNotMatch(
    issueActions,
    /\.from\("stock_issue_items"\)\.upsert/,
  );
  assert.match(nav, /\/br\/\{branchId\}\/stock\/consumption/);
});

test("recorded consumption is POS-only and hidden for central sites", () => {
  const copy = read("packages/shared/src/messages/inventory.ts");
  const page = read(
    "apps/web/app/(protected)/inventory/issues/issues-page-content.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/issues/issues-client.tsx",
  );

  assert.match(copy, /recordedConsumptionTitle: "Tiêu hao đã ghi nhận"/);
  assert.match(
    copy,
    /Mỗi dòng là một đơn POS đã trừ tồn; mở chi tiết để xem nguyên liệu\./,
  );
  assert.match(page, /branch_kind === "branch"/);
  assert.match(page, /\.not\("order_id", "is", null\)/);
  assert.match(page, /showRecordedConsumptions=\{showRecordedConsumptions\}/);
  assert.match(client, /showRecordedConsumptions = true/);
  assert.match(
    client,
    /showsRecordedConsumption =\s*showRecordedConsumptions &&/,
  );
});
