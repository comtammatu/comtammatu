import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const readDemandModule = () =>
  [
    "purchase-requests-client.tsx",
    "purchase-requests-list.tsx",
    "purchase-request-form-dialog.tsx",
    "purchase-request-view-dialog.tsx",
    "purchase-request-allocate-dialog.tsx",
  ]
    .map((file) =>
      read(
        `apps/web/app/(protected)/inventory/purchase-requests/${file}`,
      ),
    )
    .join("\n");

test("purchase demand review atomically creates supplier POs and GRN drafts", () => {
  const purchaseActions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const stockRequestActions = read(
    "apps/web/app/(protected)/inventory/stock-request-actions.ts",
  );
  const grnActions = read("apps/web/app/(protected)/inventory/grn-actions.ts");
  const migration =
    read(
      "supabase/migration-archive/20260730140000_po_first_purchase_workflow.sql",
    ) +
    read(
      "supabase/migration-archive/20260730190000_purchase_demand_supplier_allocation.sql",
    );

  assert.match(purchaseActions, /save_purchase_demand/);
  assert.match(purchaseActions, /save_purchase_demand_allocations/);
  assert.match(purchaseActions, /review_purchase_demand/);
  assert.match(stockRequestActions, /save_stock_request/);
  assert.match(grnActions, /save_goods_receipt_note/);
  assert.match(purchaseActions, /PROCUREMENT_PO_APPROVE/);

  for (const rpc of [
    "save_purchase_demand",
    "save_purchase_demand_allocations",
    "review_purchase_demand",
    "cancel_purchase_order",
    "close_purchase_order",
  ]) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${rpc}`), rpc);
  }
});

test("Owner and Ops keep procurement documents in URL-addressable AppDialogs", () => {
  const poClient = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const grnPage = read("apps/web/app/(protected)/inventory/grn/page.tsx");
  const grnClient = read(
    "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const overlayHook = read(
    "apps/web/lib/navigation/use-document-overlay-url.ts",
  );
  assert.match(poClient, /useDocumentOverlayUrl/);
  assert.match(poClient, /overlay\.patchOverlay/);
  assert.match(poClient, /variant="document"/);
  assert.doesNotMatch(poClient, /reviewPurchaseOrder|savePurchaseOrderGroup/);
  assert.match(overlayHook, /history\.pushState/);
  assert.match(overlayHook, /history\.replaceState/);

  assert.match(grnPage, /GrnDocumentDialogHost/);
  assert.doesNotMatch(grnPage, /presentation="dialog"/);
  assert.match(grnClient, /variant="document"/);
});

test("warehouse can submit missing suppliers but accountant cannot approve incomplete allocation", () => {
  const demandClient = readDemandModule();
  const purchaseActions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const inventoryMessages = read("apps/web/lib/messages/inventory.ts");

  assert.match(demandClient, /copy\.missingSupplierShort/);
  assert.match(inventoryMessages, /missingSupplierShort: "Chưa có NCC"/);
  assert.match(demandClient, /savePurchaseDemand\(/);
  assert.match(demandClient, /disabled=\{isPending \|\| !allocationComplete\}/);
  assert.match(
    demandClient,
    /mode !== "allocate"[\s\S]*buildPurchaseOrderDrafts\([\s\S]*selected\.allocations/,
  );
  assert.doesNotMatch(demandClient, /unitPrice|Đơn giá/);
  assert.match(purchaseActions, /purchase_demand_allocation_incomplete/);
});

test("submitted demands remain allocatable during cutover", () => {
  const demandClient = readDemandModule();
  const purchaseActions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const purchasePage = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  const migration = read(
    "supabase/migration-archive/20260730192000_fix_purchase_demand_legacy_cutover.sql",
  );
  const compatibilityAction = purchaseActions.slice(
    purchaseActions.indexOf("export const savePurchaseRequest"),
    purchaseActions.indexOf("export const savePurchaseDemand"),
  );

  assert.match(compatibilityAction, /"save_purchase_demand"/);
  assert.doesNotMatch(compatibilityAction, /"save_purchase_request"/);
  assert.ok((demandClient.match(/status === "submitted"/g) ?? []).length >= 2);
  assert.ok(
    (
      purchasePage.match(
        /\["submitted", "pending_allocation", "partially_ordered"\]/g,
      ) ?? []
    ).length >= 2,
  );
  assert.match(
    migration,
    /status = 'submitted'[\s\S]*status <> 'cancelled'[\s\S]*status = 'pending_allocation'/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.save_purchase_request\([\s\S]*FROM PUBLIC, anon, authenticated/,
  );
});

test("purchase request URLs redirect to the PO-first workspace", () => {
  const requestPage = read(
    "apps/web/app/(protected)/inventory/purchase-requests/page.tsx",
  );

  assert.match(requestPage, /params\.set\("tab", "needs"\)/);
  assert.match(requestPage, /key === "requestId" \? "demandId" : key/);
  assert.match(requestPage, /value === "create-po" \? "allocate" : value/);
});

test("PO cancellation permits only trusted cancellation after linked GRNs are cancelled", () => {
  const migration = read(
    "supabase/migration-archive/20260730120000_allow_po_cancel_after_draft_grn.sql",
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
