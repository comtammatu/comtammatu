import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("stock requests and transfers share job-based canonical hubs", () => {
  const centralHub = read(
    "apps/web/app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
  );
  const branchHub = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx",
  );
  const centralAlias = read(
    "apps/web/app/(protected)/inventory/stock-requests/page.tsx",
  );
  const branchAlias = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/page.tsx",
  );
  const inventoryMessages = read("apps/web/lib/messages/inventory.ts");

  for (const label of [
    "Phân loại",
    "Đang xử lý",
    "Yêu cầu",
    "Cần giao",
    "Cần nhận",
  ]) {
    assert.match(centralHub, new RegExp(label));
  }
  assert.match(centralHub, /rawState === "active"[\s\S]*: "all"/);
  assert.match(centralHub, /header: "Phiếu"/);
  assert.match(centralHub, /row\.kind === "request" \? "YCH" : "DC"/);
  assert.match(centralHub, /copy\.linkedTransferLabel/);
  assert.match(inventoryMessages, /linkedTransferLabel: "DC liên kết"/);
  const branchHubClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/branch-stock-fulfillment-hub-client.tsx",
  );
  const projection = read(
    "apps/web/lib/inventory/stock-fulfillment-projection.ts",
  );
  assert.match(projection, /viewer\.mode === "branch"/);
  assert.match(projection, /inbound receive-ready/);
  assert.match(projection, /workKinds\.includes\("receive"\)/);
  assert.match(branchHubClient, /omitLinkedTransferSearch: mode === "branch"/);
  assert.match(branchHubClient, /Đang lọc: cần nhận/);
  assert.match(branchHubClient, /Yêu cầu hàng và phiếu đang tới/);
  assert.doesNotMatch(branchHubClient, /grid-cols-3/);
  assert.match(
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/data.ts",
    ),
    /STOCK_FULFILLMENT_RECEIVE_READY_STATUSES/,
  );
  assert.doesNotMatch(centralHub, /AppPageTabs|TabsContent/);
  assert.match(centralHub, /state.*"all"/s);
  assert.match(inventoryMessages, /requestAction: "Yêu cầu hàng"/);
  assert.match(branchHub, /AppDetailFooter|permanentRedirect|redirect\(/);
  assert.match(
    read("apps/web/app/(protected)/inventory/transfers/page.tsx"),
    /STOCK_REQUEST_FULFILL_ROLES/,
  );
  assert.match(centralAlias, /\/inventory\/transfers\?work=request/);
  assert.match(branchAlias, /\/br\/\$\{branchId\}\/stock`\);/);
});

test("fulfillment loader restores parents and sibling trips outside list windows", () => {
  const loader = read("apps/web/lib/inventory/stock-fulfillment-data.ts");

  assert.match(loader, /missingParentIds/);
  assert.match(loader, /\.in\("id", missingParentIds\)/);
  assert.match(loader, /\.in\("stock_request_id", requestIds\)/);
});

test("stock request details stay canonical and expose the full timeline", () => {
  const detail = read("apps/web/app/components/stock-request-detail-view.tsx");
  const branchDetail = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/[id]/page.tsx",
  );

  assert.match(detail, /const STAGES: StockJourneyStage\[\]/);
  assert.match(detail, /STOCK_JOURNEY_STAGE_LABELS/);
  assert.match(detail, /sourceProgressTitle/);
  assert.match(detail, /onTransferOpen/);
  assert.match(detail, /copy\.referenceCode/);
  assert.match(detail, /AuditHistoryList/);
  assert.match(detail, /workFirst/);
  assert.match(detail, /copy\.tripsTitle/);
  assert.match(detail, /copy\.detailsToggle/);
  assert.match(detail, /Collapsible/);
  assert.match(detail, /tripsSection/);
  assert.match(detail, /transfersForSite/);
  // Branch: 4-step progress only — no central source/DC prep chrome.
  assert.match(detail, /getBranchStockRequestProgress/);
  assert.match(detail, /BRANCH_STOCK_REQUEST_STEP_LABELS/);
  assert.match(detail, /BranchRequestDetailContent/);
  assert.match(detail, /`\/br\/\$\{data\.branchId\}\/stock`/);
  assert.match(detail, /branchSubmittedDescription/);
  const branchBlock = detail.slice(
    detail.indexOf("function BranchRequestDetailContent"),
    detail.indexOf("export function StockRequestDetailView"),
  );
  assert.doesNotMatch(branchBlock, /sourceProgressTitle|TransferLinks|AuditHistoryList/);
  // Work-first: actions → visible trips → details collapsible (meta only).
  assert.match(
    detail,
    /\{actions\}[\s\S]*\{tripsSection\}[\s\S]*<Collapsible>/,
  );
  assert.match(
    detail,
    /flex min-w-0 flex-wrap gap-x-3 gap-y-1">\s*<TransferLinks/,
  );
  assert.doesNotMatch(detail, /<ItemDescription[^>]*>\s*<TransferLinks/);
  assert.doesNotMatch(detail, /detailsWithTripsToggle/);
  assert.doesNotMatch(branchDetail, /useSearchParams|redirect\(/);
});

test("shipping and receiving use explicit atomic transitions", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
  );
  const receiveClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/receive/[id]/transfer-receive-client.tsx",
  );
  const migration = read(
    "supabase/migration-archive/20260730090000_unify_stock_fulfillment.sql",
  );
  const shortfallMigration = read(
    "supabase/migrations/20260810012250_transfer_shortfall_ownership.sql",
  );

  const shipAction = actions.slice(
    actions.indexOf("export async function transferConfirmShip"),
    actions.indexOf("export async function transferMarkInTransit"),
  );
  assert.doesNotMatch(shipAction, /stock_transfer_mark_in_transit/);
  assert.match(actions, /Hãy bắt đầu kiểm nhận trước/);
  assert.match(receiveClient, /transferConfirmReceive/);
  assert.match(receiveClient, /startReceiveSession/);
  assert.match(receiveClient, /shortfall_class/);
  assert.match(migration, /RETURN public\.stock_transfer_mark_in_transit/);
  assert.match(migration, /short_receive_reason_required/);
  assert.match(shortfallMigration, /short_receive_classification_required/);
  assert.match(shortfallMigration, /transfer_transit_loss/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated, service_role/);
});

test("owner fulfillment detail is one URL-addressable document dialog", () => {
  const page = read("apps/web/app/(protected)/inventory/transfers/page.tsx");
  const hub = read(
    "apps/web/app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
  );
  const fulfill = read(
    "apps/web/app/(protected)/inventory/stock-requests/[id]/stock-request-fulfill-client.tsx",
  );
  const detailLoader = read(
    "apps/web/lib/inventory/stock-request-fulfillment-detail-data.ts",
  );

  assert.match(page, /requestId\?: string \| string\[\]/);
  assert.match(page, /transferId\?: string \| string\[\]/);
  assert.match(page, /loadStockRequestFulfillmentDetail/);
  assert.match(page, /loadTransferDetailPageData/);
  assert.match(hub, /variant="document"/);
  assert.match(hub, /replaceDetail\(\{ transferId: null \}\)/);
  assert.match(hub, /embeddedHeader=\{false\}/);
  assert.match(hub, /onTransferCreated/);
  assert.equal(hub.match(/<AppDialog/g)?.length, 1);
  assert.match(fulfill, /const activeGroup/);
  assert.equal(fulfill.match(/<AppDetailFooter/g)?.length, 2);
  assert.match(fulfill, /AppDialogFooter/);
  assert.match(fulfill, /DataTable/);
  assert.match(fulfill, /Checkbox/);
  assert.match(fulfill, /size="touch"/);
  assert.match(fulfill, /seedPendingSelection|pendingLineIds/);
  assert.match(fulfill, /copy\.lineQtyUnit/);
  assert.match(fulfill, /copy\.onHandColumn|AlertTitle/);
  assert.match(fulfill, /isFulfillLineShort|shortageAlertTitle/);
  assert.match(fulfill, /toastInsufficientNamed|errorCode === "insufficient_stock"/);
  assert.match(fulfill, /pendingLineColumns|doneLineColumns/);
  assert.match(fulfill, /pendingLines\.length/);
  assert.match(fulfill, /doneLinesToggle|noPendingLines/);
  assert.match(fulfill, /uniformDoneStatus|showDoneStatus/);
  assert.match(fulfill, /fulfillPrimary|fulfillLabel/);
  assert.match(fulfill, /Collapsible/);
  assert.doesNotMatch(fulfill, /lineDescription|type="checkbox"/);
  assert.doesNotMatch(fulfill, /data=\{group\.lines\}/);
  assert.match(detailLoader, /data\.branchId === claims\.branch_id/);
  assert.match(detailLoader, /item\.fulfillSiteKind === actorKind/);
  assert.match(detailLoader, /unitLabel: item\.unitLabel/);
  assert.match(detailLoader, /stockByLocation|loadStockByLocation|stock_levels/);
  assert.match(detailLoader, /toBaseFactor|ingredient_units/);
});

test("fulfill maps insufficient_stock ingredient id for UI feedback", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/stock-request-actions.ts",
  );
  const helper = read(
    "apps/web/app/(protected)/inventory/_lib/rpc-failure.ts",
  );
  assert.match(actions, /mapInventoryRpcFailure/);
  assert.match(helper, /parseInsufficientStockIngredientId/);
  assert.match(helper, /INSUFFICIENT_STOCK/);
  assert.match(helper, /meta:[\s\S]*ingredientId/);
});

test("fulfill copy shows quantity with unit, on-hand, and shortage alerts", () => {
  const inventoryMessages = read("apps/web/lib/messages/inventory.ts");
  const fulfillBlock = inventoryMessages.slice(
    inventoryMessages.indexOf("fulfill: {"),
    inventoryMessages.indexOf("branch: {"),
  );

  assert.match(fulfillBlock, /lineQtyUnit:/);
  assert.match(fulfillBlock, /onHandColumn:/);
  assert.match(fulfillBlock, /needVsOnHand:/);
  assert.match(fulfillBlock, /shortageAlertTitle:/);
  assert.match(fulfillBlock, /toastInsufficientNamed:/);
  assert.match(fulfillBlock, /doneLinesToggle:/);
  assert.match(fulfillBlock, /fulfillPrimary:/);
  assert.match(fulfillBlock, /noPendingLines:/);
  assert.match(fulfillBlock, /pendingOnlySummary:/);
  assert.match(fulfillBlock, /formatQuantity\(quantity\)/);
  assert.doesNotMatch(fulfillBlock, /lineDescription:/);
  assert.doesNotMatch(fulfillBlock, /`SL \$\{quantity\}/);
});

test("embedded transfer dialog drops timeline and history chrome", () => {
  const transfer = read(
    "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  );
  assert.match(transfer, /embedded \? null : \([\s\S]*TimelineStepper/);
  assert.match(transfer, /const embeddedLayout = pageLayout/);
  assert.doesNotMatch(
    transfer,
    /const embeddedLayout = \([\s\S]*historySectionTitle/,
  );
});

test("embedded transfer dialog scrolls the line list without moving the summary panel", () => {
  const transfer = read(
    "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  );
  const hub = read(
    "apps/web/app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
  );

  assert.match(transfer, /embedded && "lg:h-full lg:min-h-0"/);
  assert.match(
    transfer,
    /import \{ ScrollArea \} from "@comtammatu\/ui\/components\/scroll-area"/,
  );
  assert.match(
    transfer,
    /<ScrollArea className="lg:h-full">\{lineTable\}<\/ScrollArea>/,
  );
  assert.match(
    transfer,
    /embedded && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"/,
  );
  assert.match(
    transfer,
    /embedded \? "shrink-0 lg:self-start" : "lg:sticky lg:top-4"/,
  );
  assert.match(hub, /selectedTransfer \? "lg:overflow-hidden"/);
});

test("branch confirm_receive navigates into native receive workspace", () => {
  const branchDetail = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/branch-transfer-detail-client.tsx",
  );
  assert.match(branchDetail, /opensReceiveWorkspace/);
  assert.match(
    branchDetail,
    /actionConfig\?\.kind === "confirm_receive"/,
  );
  assert.match(branchDetail, /render=\{<Link href=\{receiveHref\} \/>\}/);
  assert.doesNotMatch(branchDetail, /transferConfirmReceive/);
});

test("mixed-source requests expose source ownership without source tabs", () => {
  const editor = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/new/stock-request-editor.tsx",
  );
  const fulfill = read(
    "apps/web/app/(protected)/inventory/stock-requests/[id]/stock-request-fulfill-client.tsx",
  );
  const transfer = read(
    "apps/web/app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  );

  assert.match(editor, /fulfillSiteKind/);
  assert.match(editor, /sourceHint/);
  assert.match(editor, /hint: copy\.sourceHint/);
  assert.doesNotMatch(fulfill, /role="tablist"/);
  assert.match(fulfill, /aria-pressed=\{isActive\}/);
  assert.match(fulfill, /multiSource/);
  assert.match(fulfill, /AppDialogFooter/);
  assert.match(fulfill, /size="touch"/);
  assert.match(fulfill, /activateSource/);
  assert.match(fulfill, /ItemActions/);
  assert.doesNotMatch(transfer, /IconPrinter/);
  assert.match(transfer, /AppDialogFooter/);
});

test("central kitchen request route and database authority stay supply-only", () => {
  const route = read(
    "apps/web/app/(protected)/inventory/stock-requests/new/page.tsx",
  );
  const roles = read("packages/shared/src/auth/inventory-roles.ts");
  const migration = read(
    "supabase/migration-archive/20260730194403_enable_central_kitchen_stock_requests.sql",
  );

  assert.match(roles, /STOCK_REQUEST_ROLES[\s\S]*central_kitchen_lead/);
  assert.match(route, /default_fulfill_site_kind", "central_supply"/);
  assert.match(route, /branch_kind !== "central_kitchen"/);
  assert.match(route, /returnHref=.*requestId=:requestId/);
  assert.match(
    migration,
    /branch\.branch_kind IN \('branch', 'central_kitchen'\)/,
  );
  assert.match(
    migration,
    /ingredient\.default_fulfill_site_kind = 'central_supply'/,
  );
  assert.match(migration, /\/inventory\/transfers\?requestId=%s/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.canonicalize_notification\(\)[\s\S]*WHEN 'inventory\.stock_request_submitted' THEN[\s\S]*\/inventory\/transfers\?requestId=%s/,
  );
  assert.match(
    migration,
    /ON CONFLICT \(tenant_id, dedup_key\)[\s\S]*DO UPDATE[\s\S]*expires_at = NULL/,
  );
  assert.doesNotMatch(
    migration,
    /OLD\.status IS NOT DISTINCT FROM 'submitted'/,
  );
  assert.match(migration, /expire_stock_request_source_notification/);
  assert.match(migration, /AFTER INSERT OR UPDATE OF status OR DELETE/);
  assert.match(migration, /'fulfilled', 'closed', 'cancelled'/);
});
