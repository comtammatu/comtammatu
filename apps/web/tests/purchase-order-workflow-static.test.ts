import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("warehouse creates demand and accountant allocation creates POs with GRN drafts", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const demandClient = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );
  const inventoryMessages = read("apps/web/lib/messages/inventory.ts");
  const nav = read("apps/web/app/(protected)/inventory/_lib/inventory-nav.ts");
  const migration =
    read("supabase/migrations/20260730140000_po_first_purchase_workflow.sql") +
    read(
      "supabase/migrations/20260730190000_purchase_demand_supplier_allocation.sql",
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
  assert.doesNotMatch(nav, /href: "\/inventory\/purchase-requests"/);
  assert.match(nav, /label: "Mua hàng"/);
  assert.match(actions, /savePurchaseDemand/);
  assert.match(actions, /savePurchaseDemandAllocations/);
  assert.match(actions, /reviewPurchaseDemand/);
  assert.match(actions, /PROCUREMENT_PO_APPROVE/);
  assert.match(actions, /save_purchase_demand/);
  assert.match(actions, /review_purchase_demand/);
  assert.doesNotMatch(actions, /createPurchaseOrderFromGrn/);
  assert.match(demandClient, /copy\.submitAction/);
  assert.match(demandClient, /copy\.approveAllocationAction/);
  assert.match(
    inventoryMessages,
    /approveAllocationAction: "Duyệt & tạo đơn mua"/,
  );
  assert.match(demandClient, /variant="document"/);
  assert.match(migration, /save_purchase_demand/);
  assert.match(migration, /review_purchase_demand/);
  assert.match(migration, /p_idempotency_key/);
  assert.match(migration, /cancel_purchase_order/);
  assert.match(migration, /close_purchase_order/);
});

test("demand review keeps approve, return, and reject in one action", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const viewStart = client.indexOf(
    'open={selected != null && mode === "view"}',
  );
  const allocationStart = client.indexOf("open={allocateOpen}", viewStart);
  const viewDialog = client.slice(viewStart, allocationStart);

  assert.ok(viewStart >= 0 && allocationStart > viewStart);
  assert.match(client, /reviewPurchaseDemand/);
  assert.match(client, /action: "approve"/);
  assert.match(viewDialog, /kind: "request_changes"/);
  assert.match(viewDialog, /kind: "reject"/);
  assert.match(viewDialog, /copy\.allocateAction/);
  assert.match(viewDialog, /canAllocate/);
  assert.match(actions, /PROCUREMENT_PO_APPROVE/);
  assert.match(actions, /review_purchase_demand/);
});

test("warehouse cannot submit demand lines without an active supplier", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );
  const page = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  const migration = read(
    "supabase/migrations/20260802162827_block_purchase_demand_without_supplier.sql",
  );
  const saveStart = client.indexOf("function saveRequest");
  const saveBlock = client.slice(
    saveStart,
    client.indexOf("function openAllocation"),
  );

  assert.ok(saveStart >= 0, "saveRequest must exist");
  assert.match(saveBlock, /submit &&/);
  assert.match(saveBlock, /mappedIngredientIds\.includes/);
  assert.match(saveBlock, /copy\.missingSupplierMappings/);
  assert.ok(
    saveBlock.indexOf("mappedIngredientIds.includes") <
      saveBlock.indexOf("startTransition"),
    "missing suppliers must block before the Server Action starts",
  );
  assert.match(page, /const activeSupplierIds = new Set/);
  assert.match(
    page,
    /supplierMappings = \(supplierItemResult\.data \?\? \[\]\)\.filter/,
  );
  assert.match(migration, /supplier_item_mapping_required/);
  assert.match(migration, /supplier_item\.is_active/);
  assert.match(migration, /supplier\.is_active/);
});

test("warehouse can edit an unallocated pending demand without reopening draft", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const migration = read(
    "supabase/migrations/20260730121028_allow_pending_demand_edit_before_allocation.sql",
  );

  assert.match(
    client,
    /row\.status === "pending_allocation"[\s\S]*key: "edit"/,
  );
  assert.match(
    client,
    /\(row\.status === "draft" \|\| row\.status === "changes_requested"\)[\s\S]*key: "cancel"/,
  );
  assert.match(client, /editingPendingDemand/);
  assert.match(client, /editingPendingDemand[\s\S]*ACTIONS_VI\.saveChanges/);
  assert.match(actions, /purchase_demand_allocation_started/);
  assert.match(
    migration,
    /status NOT IN \([\s\S]*?'draft',[\s\S]*?'submitted',[\s\S]*?'pending_allocation'[\s\S]*?\)/,
  );
  assert.match(migration, /purchase_demand_allocation_started/);
  assert.match(migration, /WHEN v_was_pending THEN v_demand\.submitted_by/);
  assert.match(migration, /WHEN v_was_pending THEN v_demand\.submitted_at/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.save_purchase_request\([\s\S]*FROM PUBLIC, anon, authenticated/,
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

test("PO list keeps its URL-addressable document dialog and never shows an empty-action dash", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const page = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );

  assert.match(
    client,
    /onRowClick=\{\(row\) => updateUrl\(row\.id, "view"\)\}/,
  );
  assert.match(client, /key:\s*"view"/);
  assert.match(
    client,
    /<span className="font-mono font-medium">\{row\.code\}<\/span>/,
  );
  assert.match(client, /params\.set\("poId", String\(poId\)\)/);
  assert.match(client, /params\.set\("mode", nextMode\)/);
  assert.match(client, /<AppDialog/);
  assert.match(client, /variant="document"/);
  assert.doesNotMatch(client, /DocumentFormFrame/);
  assert.doesNotMatch(client, /h-72|min-h-0 overflow-hidden sm:h-80/);
  assert.doesNotMatch(client, /poCopy\.noNotes/);
  assert.match(client, /copy\.detail\.overviewLinesTitle/);
  assert.match(client, /copy\.detail\.linkedGrnsTitle/);
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
  assert.match(page, /purchase_group_key/);
});

test("demand progress converts PO receipt qty into demand entry units", () => {
  const page = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  const helper = read("apps/web/lib/inventory/purchase-demand-progress.ts");
  const migration = read(
    "supabase/migrations/20260731212207_purchase_demand_coverage_base_units.sql",
  );

  assert.match(page, /purchaseDemandLineProgress/);
  assert.match(page, /entry_to_base_factor/);
  assert.match(
    page,
    /ingredient_units!ingredient_units_ingredient_tenant_fkey\(unit_id, to_base_factor, is_active\)/,
  );
  assert.match(helper, /entryToBaseFactor/);
  assert.match(helper, /demandToBaseFactor/);
  assert.match(migration, /purchase_request_item_ordered_base/);
  assert.match(migration, /purchase_request_item_remaining_demand_qty/);
  assert.match(
    migration,
    /coalesce\(coverage\.base_quantity, 0\)\s*>= demand_item\.quantity \* request_unit\.to_base_factor/,
  );
  assert.match(migration, /repair_demand_coverage_status/);
  assert.match(
    read(
      "supabase/migrations/20260731212932_fix_purchase_demand_remaining_greatest_form.sql",
    ),
    /IF v_remaining < 0 THEN/,
  );
});

test("purchase_order_items entry snapshot columns are granted to authenticated", () => {
  const grantMigration = read(
    "supabase/migrations/20260731233612_grant_inventory_entry_snapshot_columns.sql",
  );
  assert.match(
    grantMigration,
    /GRANT SELECT \(\s*entry_to_base_factor,\s*entry_unit_code\s*\) ON public\.purchase_order_items TO authenticated/,
  );
  for (const table of [
    "grn_items",
    "stock_transfer_items",
    "stock_issue_items",
    "stock_movements",
  ]) {
    assert.match(
      grantMigration,
      new RegExp(
        `GRANT SELECT \\(\\s*entry_to_base_factor,\\s*entry_unit_code\\s*\\) ON public\\.${table} TO authenticated`,
      ),
      table,
    );
  }
});
