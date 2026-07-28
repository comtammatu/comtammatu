import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("purchase orders are created retrospectively from GRN drafts", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const nav = read("apps/web/app/(protected)/inventory/_lib/inventory-nav.ts");

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
  assert.match(nav, /Đơn mua hàng/);
  assert.match(actions, /createPurchaseOrderFromGrn/);
  assert.match(actions, /PROCUREMENT_PO_CREATE/);
  assert.match(actions, /PROCUREMENT_PO_APPROVE/);
  assert.match(actions, /create_purchase_order_from_grn/);
  assert.match(actions, /approve_purchase_order/);
  assert.doesNotMatch(
    actions,
    /createPurchaseOrderWithLines|create_purchase_order_with_lines/,
  );
  assert.doesNotMatch(
    actions,
    /createGrnFromPurchaseOrder|create_grn_from_approved_po/,
  );
  assert.doesNotMatch(client, /PurchaseOrderFields|createGrnAction/);
});

test("PO approve awaits confirm outside startTransition so the dialog can open", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const approveStart = client.indexOf("async function approve");
  assert.ok(approveStart >= 0, "approve function must exist");
  const renderActionsStart = client.indexOf(
    "function renderActions",
    approveStart,
  );
  assert.ok(
    renderActionsStart > approveStart,
    "renderActions must follow approve",
  );
  const approveBlock = client.slice(approveStart, renderActionsStart);

  assert.match(approveBlock, /await confirm\(/);
  assert.match(approveBlock, /if \(!accepted\) return;/);
  assert.match(approveBlock, /startTransition\(async \(\) => \{/);
  assert.doesNotMatch(
    approveBlock,
    /startTransition\(async \(\) => \{[\s\S]*await confirm\(/,
  );
  assert.match(approveBlock, /approvePurchaseOrder\(\{ poId: row\.id \}\)/);
  assert.match(approveBlock, /finally \{\s*setPendingId\(null\);\s*\}/);

  const iConfirm = approveBlock.indexOf("await confirm(");
  const iGuard = approveBlock.indexOf("if (!accepted) return;");
  const iPending = approveBlock.indexOf("setPendingId(row.id)");
  const iTransition = approveBlock.indexOf("startTransition(");
  assert.ok(
    iConfirm < iGuard && iGuard < iPending && iPending < iTransition,
    "confirm → cancel guard → pendingId → startTransition order required",
  );
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

test("PO list opens read-only detail and never shows an empty-action dash", () => {
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
  assert.match(client, /AppDialog/);
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
  assert.match(page, /goods_received_notes\(id, grn_number, status/);
});
