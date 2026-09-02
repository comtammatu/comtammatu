import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(repoRoot, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(resolve(repoRoot, path), "utf8");

test("Branch transfer hub stays on central; store redirects to /stock", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/branch-stock-fulfillment-hub-client.tsx",
  );

  assert.match(page, /isBranchKind/);
  assert.match(page, /redirect\([\s\S]*\/stock/);
  assert.match(page, /BranchStockFulfillmentHubClient/);
  assert.match(page, /mode = "central"/);
  assert.doesNotMatch(page, /(?<!Branch)StockFulfillmentHubClient/);

  assert.match(client, /ItemGroup/);
  assert.match(client, /ToggleGroup/);
  assert.match(client, /size="touch"/);
  assert.match(client, /stockFulfillmentRowHref/);
  assert.match(client, /mode === "branch" \? "active" : "all"/);
  assert.match(client, /copy\.receiveCta/);
  assert.match(client, /stockFulfillmentBranchProgressLines/);
  assert.match(client, /grid-cols-4/);
  assert.match(client, /Đang lọc: cần nhận/);
  assert.match(client, /receiveFocus/);
  assert.match(client, /omitLinkedTransferSearch: mode === "branch"/);
  assert.match(client, /Historical YCH remains readable/);
  assert.match(client, /inbound receive-ready/);
  // Branch drops document-type toggles (Tất cả|YCH|Nhận); central keeps them.
  assert.doesNotMatch(client, /grid-cols-3/);
  assert.match(client, /Điều chuyển và phiếu đang tới/);
  assert.match(
    client,
    /ToggleGroupItem value="request">YCH<\/ToggleGroupItem>/,
  );
  assert.doesNotMatch(client, /DataTable|AppListFrame|AppDialog/);
  assert.doesNotMatch(client, /sticky bottom-0/);
});

test("Branch stock landing is four doors then fulfillment list", () => {
  const landing = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );
  const hubModel = read(
    "apps/web/lib/inventory/stock-fulfillment-hub-model.ts",
  );
  const receiveClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-client.tsx",
  );
  const inventoryMessages = read("apps/web/lib/messages/inventory.ts");

  assert.match(landing, /loadStockFulfillmentRows/);
  assert.match(landing, /BranchStockFulfillmentHubClient/);
  assert.match(landing, /BranchStockDoors/);
  assert.match(landing, /BranchStockCountDoors/);
  assert.match(
    landing,
    /<BranchStockDoors[\s\S]*<BranchStockCountDoors[\s\S]*<BranchStockFulfillmentHubClient/,
  );
  assert.match(landing, /branchDoorOnHand/);
  assert.match(landing, /branchDoorWaste/);
  assert.match(landing, /grid grid-cols-2/);
  assert.match(
    landing,
    /<AppDetailFooter\s+sticky\s+className="sm:hidden"/,
  );
  assert.doesNotMatch(landing, /pb-20/);
  assert.match(landing, /min-w-0 flex-nowrap/);
  assert.doesNotMatch(landing, /line-clamp-none text-sm/);
  assert.doesNotMatch(landing, /BranchStockWorkPanel/);
  assert.doesNotMatch(landing, /key: "consumption"/);
  assert.doesNotMatch(landing, /ItemGroup className="grid/);
  assert.doesNotMatch(landing, /sticky bottom-0/);
  const dailyDoors = landing.match(
    /function BranchStockDoors[\s\S]*?\nfunction /,
  )?.[0];
  assert.ok(dailyDoors, "BranchStockDoors must exist");
  assert.doesNotMatch(dailyDoors, /count-assignments|count-slips/);
  assert.match(landing, /function BranchStockCountDoors/);
  assert.match(
    inventoryMessages,
    /branchDoorStocktakeMeta:\s*"Đếm số đang có, rồi đối soát lệch"/,
  );

  assert.match(hubModel, /\/stock\/receive\/\$\{transferId\}/);
  assert.match(hubModel, /preferWork\?:/);

  assert.match(receiveClient, /transferConfirmReceive/);
  assert.match(receiveClient, /receiveStarting/);
  assert.match(receiveClient, /startReceiveSession/);
  assert.doesNotMatch(receiveClient, /receiveStartAction/);
  assert.doesNotMatch(receiveClient, /receiveStartTitle/);
});

test("Branch transfer create uses NumberPad DOC with Branch basePath", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/new/branch-transfer-create-client.tsx",
  );

  assert.match(page, /BranchTransferCreateClient/);
  assert.match(client, /NumberPadSheet/);
  assert.match(client, /basePath = `\/br\/\$\{branchId\}\/stock\/transfer`/);
  assert.match(client, /sticky/);
  assert.doesNotMatch(client, /DataTable|CreateTransferForm/);
});

test("Branch purchase requests own a Sheet presenter", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-requests/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-requests/branch-purchase-requests-client.tsx",
  );
  const owner = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  ) + read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-list.tsx",
  );

  assert.match(page, /redirect\(PURCHASE_ORDER_CREATE_HREF\)/);
  assert.match(page, /redirect\(`\/br\/\$\{branchId\}\/stock`\)/);
  assert.doesNotMatch(page, /loadPurchaseDemandRows/);
  assert.doesNotMatch(page, /BranchPurchaseRequestsClient/);
  assert.doesNotMatch(page, /(?<!Branch)PurchaseRequestsClient/);
  assert.match(page, /parseOperatorBranchId/);

  assert.match(client, /BranchOperatorPage/);
  assert.match(client, /NumberPadSheet/);
  assert.match(client, /<AppSheet[\s\S]*side="bottom"/);
  assert.match(client, /savePurchaseDemand/);
  assert.match(client, /reviewPurchaseDemand/);
  assert.doesNotMatch(
    client,
    /DataTable|AppListFrame|AppDialog|InteractiveCard|RowActionsMenu/,
  );

  assert.match(owner, /DataTable/);
  assert.match(owner, /export function PurchaseRequestsClient/);
});
