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
  assert.doesNotMatch(centralHub, /AppPageTabs|TabsContent/);
  assert.match(centralHub, /state.*"all"/s);
  assert.match(branchHub, /copy\.requestAction/);
  assert.match(inventoryMessages, /requestAction: "Yêu cầu hàng"/);
  assert.match(branchHub, /AppDetailFooter/);
  assert.match(
    read("apps/web/app/(protected)/inventory/transfers/page.tsx"),
    /STOCK_REQUEST_FULFILL_ROLES/,
  );
  assert.match(centralAlias, /\/inventory\/transfers\?work=request/);
  assert.match(branchAlias, /\/stock\/transfer/);
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
  assert.doesNotMatch(branchDetail, /useSearchParams|redirect\(/);
});

test("shipping and receiving use explicit atomic transitions", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
  );
  const branchDetail = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/branch-transfer-detail-client.tsx",
  );
  const migration = read(
    "supabase/migrations/20260730090000_unify_stock_fulfillment.sql",
  );

  const shipAction = actions.slice(
    actions.indexOf("export async function transferConfirmShip"),
    actions.indexOf("export async function transferMarkInTransit"),
  );
  assert.doesNotMatch(shipAction, /stock_transfer_mark_in_transit/);
  assert.match(actions, /Hãy bắt đầu kiểm nhận trước/);
  assert.match(branchDetail, /transferConfirmReceive/);
  assert.match(migration, /RETURN public\.stock_transfer_mark_in_transit/);
  assert.match(migration, /short_receive_reason_required/);
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
  assert.match(detailLoader, /data\.branchId === claims\.branch_id/);
  assert.match(detailLoader, /item\.fulfillSiteKind === actorKind/);
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
  assert.match(fulfill, /AppDialogFooter/);
  assert.match(fulfill, /size="touch"/);
  assert.doesNotMatch(transfer, /IconPrinter/);
  assert.match(transfer, /AppDialogFooter/);
});

test("central kitchen request route and database authority stay supply-only", () => {
  const route = read(
    "apps/web/app/(protected)/inventory/stock-requests/new/page.tsx",
  );
  const roles = read("packages/shared/src/auth/inventory-roles.ts");
  const migration = read(
    "supabase/migrations/20260730194403_enable_central_kitchen_stock_requests.sql",
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
