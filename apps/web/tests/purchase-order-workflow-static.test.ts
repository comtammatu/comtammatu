import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("purchase orders use the atomic create, approve, and receive RPC flow", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const migration = read(
    "supabase/migrations/20260727121036_add_menu_vat_and_purchase_approval.sql",
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
  // Owner restore 2026-07-28 — PO stays in Inventory sidebar daily IA.
  assert.match(nav, /\/inventory\/purchase-orders/);
  assert.match(nav, /Đơn mua hàng/);
  assert.match(actions, /PROCUREMENT_PO_CREATE/);
  assert.match(actions, /PROCUREMENT_PO_APPROVE/);
  assert.match(actions, /PROCUREMENT_GRN_CREATE/);
  assert.match(actions, /create_purchase_order_with_lines/);
  assert.match(actions, /approve_purchase_order/);
  assert.match(actions, /create_grn_from_approved_po/);
  assert.match(migration, /v_po\.status <> 'draft'/);
  assert.match(
    migration,
    /has_permission\(v_po\.branch_id, 'procurement:po_approve'\)/,
  );
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON public\.purchase_orders FROM authenticated/,
  );
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.create_grn_from_po\(bigint\)/,
  );
});

test("PO create dialog keeps add-line below lines and notes compact", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );

  const fieldsBlock = client.slice(
    client.indexOf("function PurchaseOrderFields"),
    client.indexOf("export function PurchaseOrdersClient"),
  );

  assert.match(fieldsBlock, /fields\.map\([\s\S]*?poCopy\.addLine/);
  assert.doesNotMatch(fieldsBlock, /TextareaField/);
  assert.match(fieldsBlock, /TextField[\s\S]*name="notes"/);
  assert.match(fieldsBlock, /placeholder=\{poCopy\.notesPlaceholder\}/);
});

test("PO receiving remains owner-control only and supports partial receipts", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const baseline = read("supabase/migrations/20260727120000_baseline.sql");

  assert.match(client, /\["sent", "partially_received"\]/);
  assert.match(client, /poCopy\.createGrnAction/);
  assert.match(
    baseline,
    /v_po\.status NOT IN \('sent', 'partially_received'\)/,
  );
  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-orders/page.tsx",
      ),
    ),
    false,
  );
});



test("PO approve awaits confirm outside startTransition so the dialog can open", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const approveStart = client.indexOf("async function approve");
  const createGrnStart = client.indexOf("function createGrn");
  assert.ok(approveStart >= 0, "approve function must exist");
  assert.ok(createGrnStart > approveStart, "createGrn must follow approve");
  const approveBlock = client.slice(approveStart, createGrnStart);

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
