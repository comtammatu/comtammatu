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
  assert.match(data, /order_id, issue_id/);
  assert.match(data, /stock_issues!stock_movements_issue_id_fkey/);
  assert.match(data, /\.limit\(100\)/);
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
  assert.match(issueData, /photo_urls/);
  assert.match(issueActions, /photoUrls: z\.array\(z\.string\(\)\.url\(\)\)\.max\(1\)\.optional\(\)/);
  assert.match(issueActions, /photo_urls: d\.photoUrls/);
  assert.match(nav, /\/br\/\{branchId\}\/stock\/consumption/);
});

test("recorded consumption copy no longer claims every source is POS", () => {
  const copy = read("packages/shared/src/messages/inventory.ts");
  assert.match(copy, /recordedConsumptionTitle: "Tiêu hao đã ghi nhận"/);
  assert.match(copy, /POS, phiếu thủ công và nguồn khác/);
  assert.doesNotMatch(copy, /recordedConsumptionTitle: "Tiêu hao POS/);
});
