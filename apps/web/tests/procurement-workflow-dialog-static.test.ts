import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("procurement documents use atomic direct-send actions", () => {
  const purchaseActions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const stockRequestActions = read(
    "apps/web/app/(protected)/inventory/stock-request-actions.ts",
  );
  const grnActions = read("apps/web/app/(protected)/inventory/grn-actions.ts");
  const migration = read(
    "supabase/migrations/20260729260000_streamline_procurement_workflows.sql",
  );

  assert.match(purchaseActions, /save_purchase_request/);
  assert.match(purchaseActions, /save_purchase_orders_from_request/);
  assert.match(purchaseActions, /send_purchase_order/);
  assert.match(stockRequestActions, /save_stock_request/);
  assert.match(grnActions, /save_goods_receipt_note/);
  assert.doesNotMatch(purchaseActions, /PROCUREMENT_PO_APPROVE/);
  assert.doesNotMatch(purchaseActions, /approve_purchase_order/);

  for (const rpc of [
    "cancel_purchase_request",
    "close_purchase_request",
    "cancel_purchase_order",
    "close_purchase_order",
    "cancel_goods_receipt_note",
    "close_stock_request",
    "cancel_stock_transfer",
  ]) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${rpc}`), rpc);
  }
});

test("Owner and Ops keep procurement documents in URL-addressable AppDialogs", () => {
  const requestClient = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );
  const poClient = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const grnPage = read("apps/web/app/(protected)/inventory/grn/page.tsx");
  const grnClient = read(
    "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  assert.match(requestClient, /searchParams\.get\("requestId"\)/);
  assert.match(requestClient, /router\[method\]\(href, \{ scroll: false \}\)/);
  assert.match(requestClient, /saveRequest\(false\)[\s\S]*saveRequest\(true\)/);
  assert.match(requestClient, /savePo\(false\)[\s\S]*savePo\(true\)/);
  assert.match(requestClient, /variant="document"/);

  assert.match(poClient, /params\.set\("poId", String\(row\.id\)\)/);
  assert.match(poClient, /sendPurchaseOrder/);
  assert.match(poClient, /variant="document"/);
  assert.doesNotMatch(poClient, /approvePurchaseOrder/);

  assert.match(grnPage, /params\.grnId/);
  assert.match(grnPage, /presentation="dialog"/);
  assert.match(grnClient, /variant="document"/);
});

test("PO creation keeps unmapped ingredients outstanding while saving mapped orders", () => {
  const requestClient = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );
  const purchaseActions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );

  assert.match(requestClient, /findUnassignedPurchaseRequestItemIds/);
  assert.match(
    requestClient,
    /!unassignedPoItemIds\.includes\(item\.id\)[\s\S]*totals\.get\(item\.id\)/,
  );
  assert.doesNotMatch(
    requestClient,
    /if \(unassignedPoItemIds\.length > 0\) \{[\s\S]{0,300}return;/,
  );
  assert.doesNotMatch(
    requestClient,
    /poDrafts\.length === 0 \|\|\s*unassignedPoItemIds\.length > 0/,
  );
  assert.match(requestClient, /copy\.missingSupplierMappings/);
  assert.match(requestClient, /href="\/inventory\/suppliers"/);
  assert.match(purchaseActions, /supplier_item_mapping_required/);
});

test("purchase requests keep branch-scoped staff inside their assigned site and recover stale edit URLs", () => {
  const requestPage = read(
    "apps/web/app/(protected)/inventory/purchase-requests/page.tsx",
  );
  const requestClient = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );

  assert.match(
    requestPage,
    /claims\.user_role === "owner"[\s\S]*procurementBranches[\s\S]*branch\.id === claims\.branch_id/,
  );
  assert.match(
    requestPage,
    /branches=\{requestBranches\.map\(\(branch\) => \(\{/,
  );
  assert.match(
    requestPage,
    /focusedRequestId[\s\S]*\.eq\("id" as never, focusedRequestId\)[\s\S]*\.maybeSingle\(\)/,
  );
  assert.match(
    requestClient,
    /mode === "view" \|\| mode === "edit" \|\| mode === "create-po"[\s\S]*!recordMode \|\| selectedId == null \|\| selected != null[\s\S]*copy\.notFound[\s\S]*updateUrl\(null, null, "replace"\)/,
  );
  assert.match(
    requestClient,
    /mode === "create" \|\| \(mode === "edit" && selected != null\)/,
  );
});

test("PO cancellation permits only trusted cancellation after linked GRNs are cancelled", () => {
  const migration = read(
    "supabase/migrations/20260730120000_allow_po_cancel_after_draft_grn.sql",
  );

  assert.match(
    migration,
    /OLD\.status IN \('draft', 'sent'\)[\s\S]*NEW\.status = 'cancelled'/,
  );
  assert.match(
    migration,
    /v_trusted_rpc IS TRUE[\s\S]*AND NOT EXISTS \([\s\S]*goods_received_notes[\s\S]*grn\.status <> 'cancelled'/,
  );
});

test("GRN compatibility detail route remains list-addressed", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/grn/[id]/page.tsx",
  );
  assert.match(source, /redirect\(/);
  assert.doesNotMatch(source, /GRNDetailClient/);
});
