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
    "Đang xử lý",
    "Yêu cầu",
    "Cần giao",
    "Cần nhận",
    "Lịch sử",
  ]) {
    assert.match(centralHub, new RegExp(label));
  }
  assert.match(branchHub, /copy\.requestAction/);
  assert.match(inventoryMessages, /requestAction: "Yêu cầu hàng"/);
  assert.match(branchHub, /AppDetailFooter/);
  assert.match(
    read("apps/web/app/(protected)/inventory/transfers/page.tsx"),
    /STOCK_REQUEST_FULFILL_ROLES/,
  );
  assert.match(centralAlias, /\/inventory\/transfers\?queue=requests/);
  assert.match(branchAlias, /\/stock\/transfer/);
});

test("stock request details stay canonical and expose the full timeline", () => {
  const detail = read("apps/web/app/components/stock-request-detail-view.tsx");
  const branchDetail = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/requests/[id]/page.tsx",
  );

  assert.match(detail, /const STAGES: StockJourneyStage\[\]/);
  assert.match(detail, /STOCK_JOURNEY_STAGE_LABELS/);
  assert.match(detail, /copy\.transfersTitle/);
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
