import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeEol } from "./static-source";

const read = (path: string) =>
  normalizeEol(readFileSync(join(process.cwd(), path), "utf8"));

const migration = read(
  "../../supabase/migration-archive/20260820174417_pos_delivery_channel.sql",
);
const menuFields = read(
  "app/(protected)/menu/item-channel-prices-fields.tsx",
);
const menuActions = read("app/(protected)/menu/actions.ts");
const mark = read("app/components/delivery-platform-mark.tsx");
const financeTypes = read(
  "app/(protected)/finance/revenue/_lib/finance-types-revenue.ts",
);
const decisions = read("../../docs/plan/decisions.md");
const einvoice = read("../../docs/ref/einvoice-tax.md");

test("delivery migration allows platform tender and channel prices", () => {
  assert.match(migration, /order_type = ANY \(ARRAY\['dine_in'::text, 'takeaway'::text, 'delivery'::text\]\)/);
  assert.match(
    migration,
    /payment_method = ANY \(ARRAY\['cash'::text, 'vietqr'::text, 'platform'::text\]\)/,
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.menu_item_channel_prices/);
  assert.match(migration, /FUNCTION public\.confirm_platform_payment/);
  assert.match(
    migration,
    /v_payment\.method NOT IN \('vietqr', 'cash', 'platform'\)/,
  );
  assert.match(migration, /platform_revenue/);
  assert.match(migration, /delivery_revenue/);
  assert.match(migration, /seed_menu_item_channel_prices/);
  assert.match(migration, /payments_method_check[\s\S]*platform/);
});

test("menu channel prices UI supports per-platform and apply-all", () => {
  assert.match(menuFields, /channelPricesTitle/);
  assert.match(menuFields, /channelPricesApplyAllAction/);
  assert.match(menuFields, /channelPricesMarkupAll/);
  assert.match(menuActions, /deliveryPlatform === "all"/);
  assert.match(menuActions, /seed_menu_item_channel_prices/);
});

test("DeliveryPlatformMark is not BrandMark", () => {
  assert.match(mark, /export function DeliveryPlatformMark/);
  assert.doesNotMatch(mark, /BrandMark/);
  assert.doesNotMatch(mark, /\/brand\//);
  assert.match(mark, /aria-hidden="true"/);
  assert.match(mark, /function PlatformSvg/);
  assert.match(mark, /fill="#00B14F"/);
  assert.doesNotMatch(mark, /\/delivery-platforms\//);
});

test("POS delivery platform picker uses a 2-col button grid not ToggleGroup strip", () => {
  const cartPane = read(
    "app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx",
  );
  const identityBlock =
    /data-testid="pos-delivery-identity"[\s\S]*?id="pos-delivery-external-ref"/.exec(
      cartPane,
    )?.[0] ?? "";
  assert.match(identityBlock, /grid w-full grid-cols-2 gap-2/);
  assert.match(identityBlock, /deliveryPlatformChipLabel/);
  assert.doesNotMatch(identityBlock, /<ToggleGroup/);
  assert.doesNotMatch(identityBlock, /sm:grid-cols-4/);
});

test("finance revenue types expose delivery and platform KPIs", () => {
  assert.match(financeTypes, /platform_revenue: number/);
  assert.match(financeTypes, /delivery_revenue: number/);
});

test("docs lock internal delivery channel HĐĐT and D104", () => {
  assert.match(decisions, /## D104: Internal delivery channel does not lift D103/);
  assert.match(einvoice, /SHOPEEFOOD_VN_0392303/);
  assert.match(einvoice, /truyền mã đơn sàn/);
});

test("POS delivery identity is reachable on empty cart before first item", () => {
  const cartPane = read(
    "app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx",
  );
  assert.match(cartPane, /data-testid="pos-delivery-identity"/);
  assert.doesNotMatch(cartPane, /externalRefHint/);
  // Identity must not be nested only under the non-empty cart footer path.
  const identityIdx = cartPane.indexOf('data-testid="pos-delivery-identity"');
  const emptyStateUsageIdx = cartPane.indexOf("<AppEmptyState");
  assert.ok(identityIdx >= 0 && emptyStateUsageIdx >= 0);
  assert.ok(
    identityIdx < emptyStateUsageIdx,
    "delivery identity must render above empty cart state",
  );
  // Incomplete delivery identity must not center a large empty-state panel.
  assert.match(
    cartPane,
    /orderType === "delivery" && !deliveryReady \? \(\s*<div className="min-h-0 flex-1"/,
  );

  const posInner = read(
    "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );
  assert.match(
    posInner,
    /handleCreateDeliveryOrder[\s\S]*?setCartDrawerOpen\(true\)/,
  );
  assert.match(posInner, /editingSentItem\?\.orderType/);
  assert.match(posInner, /deliveryPlatform: sentPlatform/);
});

test("POS session list treats delivery as Mang về ops queue with dual identity", () => {
  const history = read(
    "app/(protected)/br/[branchId]/pos/order-history.tsx",
  );
  assert.match(
    history,
    /order\.order_type === "takeaway" \|\| order\.order_type === "delivery"/,
  );
  assert.match(history, /DeliveryPlatformMark/);
  assert.match(history, /external_order_ref/);

  const display = read(
    "app/(protected)/br/[branchId]/pos/_utils/order-display.ts",
  );
  assert.match(display, /MV\|GH/);
  assert.match(display, /Giao hàng/);

  const billSummary = read(
    "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-summary.tsx",
  );
  assert.match(billSummary, /messages\.pos\.receipt\.delivery/);
  assert.match(billSummary, /DeliveryPlatformMark/);
  assert.match(billSummary, /external_order_ref/);

  const billSheet = read(
    "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );
  assert.match(billSheet, /canPrintProvisional && !isDeliveryOrder/);

  const printActions = read(
    "app/(protected)/br/[branchId]/pos/print-actions.ts",
  );
  assert.match(printActions, /order\.order_type === "delivery"/);

  const deliveryUnblockMigration = read(
    "../../supabase/migration-archive/20260822162000_delivery_order_ref_unblock_and_receipt_payload.sql",
  );
  assert.match(
    deliveryUnblockMigration,
    /DROP INDEX IF EXISTS public\.orders_branch_delivery_ref_active_uidx/,
  );
  assert.match(
    deliveryUnblockMigration,
    /'delivery_platform',\s*v_order\.delivery_platform/,
  );
  assert.match(
    deliveryUnblockMigration,
    /'external_order_ref',\s*v_order\.external_order_ref/,
  );

  const appendMessages = read(
    "app/(protected)/br/[branchId]/pos/_lib/messages.ts",
  );
  assert.match(appendMessages, /channel_price_missing/);
});

test("server re-prices from channel helper; POS list price follows append target", () => {
  assert.match(migration, /pos_resolve_item_list_price\(/);
  assert.match(migration, /channel_price_missing/);
  assert.match(
    migration,
    /v_base_price := public\.pos_resolve_item_list_price\(\s*p_tenant_id/,
  );
  assert.match(
    migration,
    /v_base_price := public\.pos_resolve_item_list_price\(\s*v_order\.tenant_id/,
  );

  const posInner = read(
    "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );
  assert.match(posInner, /listPriceOrderType/);
  assert.match(posInner, /appendOrderSummary\?\.order_type === "delivery"/);
  assert.match(posInner, /orderType=\{listPriceOrderType\}/);
  assert.doesNotMatch(
    posInner,
    /unit_price: item\.base_price,\s*modifiers: \[\],\s*sides: \[\],\s*\};\s*addAppendDraftItem/,
  );

  const customizer = read(
    "app/(protected)/br/[branchId]/pos/item-customizer.tsx",
  );
  assert.match(customizer, /never silently fall back/);
  assert.match(customizer, /channelPriceReady/);
});

test("delivery sides use channel list price on server and POS customizer", () => {
  const sidesMigration = read(
    "../../supabase/migration-archive/20260821044934_delivery_side_channel_list_price.sql",
  );
  assert.match(
    sidesMigration,
    /pos_resolve_item_list_price\(\s*p_tenant_id,\s*mi\.id/,
  );
  // Production append_order_items identity (not p_request_key text).
  assert.match(
    sidesMigration,
    /p_order_id bigint, p_items jsonb, p_idempotency_key uuid/,
  );
  assert.doesNotMatch(
    sidesMigration,
    /p_order_id bigint, p_items jsonb, p_request_key text/,
  );
  assert.match(
    sidesMigration,
    /COALESCE\(v_item -> 'sides', '\[\]'::JSONB\),\s*p_order_type,\s*v_platform/,
  );
  assert.match(
    sidesMigration,
    /COALESCE\(v_item -> 'sides', '\[\]'::JSONB\),\s*v_order\.order_type,\s*v_order\.delivery_platform/,
  );
  assert.match(
    sidesMigration,
    /COALESCE\(p_sides, '\[\]'::JSONB\),\s*v_order\.order_type,\s*v_order\.delivery_platform/,
  );

  const customizer = read(
    "app/(protected)/br/[branchId]/pos/item-customizer.tsx",
  );
  assert.match(
    customizer,
    /resolvePosMenuListPrice\(\s*s\.side_item,\s*listPriceOrderType,\s*listPriceDeliveryPlatform/,
  );
  assert.doesNotMatch(customizer, /price: s\.side_item\.base_price/);
  assert.doesNotMatch(customizer, /sum \+ s\.side_item\.base_price/);

  const menuActions = read(
    "app/(protected)/br/[branchId]/pos/menu-actions.ts",
  );
  assert.match(
    menuActions,
    /channel_prices: channelPricesByItemId\.get\(item\.id\) \?\? \{\}/,
  );
});

test("POS delivery payment locks to platform tender without counter collection options", () => {
  const billSheet = read(
    "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );
  assert.match(billSheet, /data-testid="bill-confirm-platform"/);
  assert.doesNotMatch(billSheet, /deliveryTender/);
  assert.doesNotMatch(billSheet, /counterCollection/);

  const posMessages = read("lib/messages/pos.ts");
  assert.doesNotMatch(posMessages, /deliveryTenderTitle/);
  assert.doesNotMatch(posMessages, /counterCollection/);
});
