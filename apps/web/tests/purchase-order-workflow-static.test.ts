import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("purchase requests create supplier POs and POs create delivery GRNs", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const nav = read("apps/web/app/(protected)/inventory/_lib/inventory-nav.ts");
  const migration = read(
    "supabase/migrations/20260729260000_streamline_procurement_workflows.sql",
  );

  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
      ),
    ),
    true,
  );
  assert.match(nav, /\/inventory\/purchase-orders/);
  assert.match(nav, /\/inventory\/purchase-requests/);
  assert.match(nav, /Đơn mua hàng/);
  assert.match(actions, /savePurchaseRequest/);
  assert.match(actions, /savePurchaseOrdersFromRequest/);
  assert.match(actions, /createGrnDraftFromPurchaseOrder/);
  assert.match(actions, /PROCUREMENT_PO_CREATE/);
  assert.doesNotMatch(actions, /PROCUREMENT_PO_APPROVE/);
  assert.match(actions, /save_purchase_request/);
  assert.match(actions, /save_purchase_orders_from_request/);
  assert.match(actions, /create_grn_draft_from_po/);
  assert.match(actions, /send_purchase_order/);
  assert.doesNotMatch(actions, /approve_purchase_order/);
  assert.doesNotMatch(actions, /createPurchaseOrderFromGrn/);
  assert.match(client, /sendPurchaseOrder/);
  assert.match(client, /variant="document"/);
  assert.match(client, /\/inventory\/grn\?grnId=/);
  assert.match(migration, /save_purchase_orders_from_request/);
  assert.match(migration, /p_idempotency_key/);
  assert.match(migration, /cancel_purchase_order/);
  assert.match(migration, /close_purchase_order/);
});

test("PO send is the only internal release transition and has no approval step", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const sendStart = client.indexOf("async function send");
  const createGrnStart = client.indexOf("function createGrn", sendStart);
  assert.ok(sendStart >= 0 && createGrnStart > sendStart);
  const sendBlock = client.slice(sendStart, createGrnStart);

  assert.match(sendBlock, /sendPurchaseOrder\(\{ poId: row\.id \}\)/);
  assert.match(sendBlock, /startTransition\(async \(\) => \{/);
  assert.match(sendBlock, /finally \{\s*setPendingId\(null\);\s*\}/);
  assert.doesNotMatch(client, /approvePurchaseOrder|function approve/);
  assert.doesNotMatch(actions, /approve_purchase_order|PROCUREMENT_PO_APPROVE/);
});

test("supplier-item remove awaits confirm outside startTransition", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/supplier-items-client.tsx",
  );
  const removeStart = client.indexOf("async function remove");
  assert.ok(removeStart >= 0, "remove function must exist");
  const removeBlock = client.slice(removeStart, removeStart + 800);

  assert.match(removeBlock, /await confirm\(/);
  assert.match(removeBlock, /if \(!accepted\) return;/);
  assert.match(removeBlock, /startTransition\(async \(\) => \{/);
  assert.doesNotMatch(
    removeBlock,
    /startTransition\(async \(\) => \{[\s\S]*await confirm\(/,
  );
  assert.match(removeBlock, /deleteSupplierItem\(/);

  const iConfirm = removeBlock.indexOf("await confirm(");
  const iGuard = removeBlock.indexOf("if (!accepted) return;");
  const iTransition = removeBlock.indexOf("startTransition(");
  assert.ok(
    iConfirm < iGuard && iGuard < iTransition,
    "confirm → cancel guard → startTransition order required",
  );
});

test("PO list keeps its URL-addressable document dialog and never shows an empty-action dash", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const page = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );

  assert.match(client, /onRowClick=\{openDetail\}/);
  assert.match(client, /key:\s*"view"/);
  assert.match(client, /poCopy\.viewDetail/);
  // Code cell uses the same primary affordance as GRN list (not plain mono text).
  assert.match(
    client,
    /key:\s*"code"[\s\S]*?variant="link"[\s\S]*?openDetail\(row\)/,
    "PO code column is a primary open control like GRN list links",
  );
  assert.match(client, /params\.set\("poId", String\(row\.id\)\)/);
  assert.match(client, /params\.set\("mode", "view"\)/);
  assert.match(client, /<AppDialog/);
  assert.match(client, /variant="document"/);
  assert.doesNotMatch(client, /DocumentFormFrame/);
  assert.doesNotMatch(client, /h-72|min-h-0 overflow-hidden sm:h-80/);
  assert.doesNotMatch(client, /poCopy\.noNotes/);
  assert.match(client, /poCopy\.detail\.overviewLinesTitle/);
  assert.match(client, /poCopy\.detail\.linkedGrnsTitle/);
  assert.doesNotMatch(
    client,
    /items\.length > 0 \? \([\s\S]*RowActionsMenu[\s\S]*\) : \([\s\S]*text-muted-foreground[\s\S]*—/,
  );
  assert.match(
    page,
    /purchase_order_items\([\s\S]*ingredients\(name\)[\s\S]*units!purchase_order_items_entry_unit_id_fkey/,
  );
  assert.match(
    page,
    /goods_received_notes!goods_received_notes_po_id_fkey\(id, grn_number, status/,
  );
  assert.match(page, /purchase_request_id/);
});
