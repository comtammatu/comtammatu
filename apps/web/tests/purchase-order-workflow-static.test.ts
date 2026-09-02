import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);
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

test("warehouse creates demand and accountant allocation creates POs with GRN drafts", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const demandClient = readDemandModule();
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
  assert.match(nav, /tNav\("purchaseOrders", "navigation"\)/);
  assert.match(actions, /savePurchaseDemand/);
  assert.match(actions, /savePurchaseDemandAllocations/);
  assert.match(actions, /reviewPurchaseDemand/);
  assert.match(actions, /ycmWriteFrozen/);
  assert.doesNotMatch(actions, /"save_purchase_demand"/);
  assert.doesNotMatch(actions, /"review_purchase_demand"/);
  assert.match(actions, /PROCUREMENT_PO_APPROVE/);
  assert.doesNotMatch(actions, /createPurchaseOrderFromGrn/);
  assert.match(demandClient, /copy\.submitAction/);
  assert.match(demandClient, /copy\.approveAllocationAction/);
  assert.match(demandClient, /copy\.addAllocationLine/);
  assert.match(
    inventoryMessages,
    /approveAllocationAction: "Duyệt & tạo đơn mua"/,
  );
  assert.match(inventoryMessages, /addAllocationLine: "Thêm dòng phân bổ"/);
  assert.match(inventoryMessages, /chooseSupplier: "Chọn nhà cung cấp"/);
  assert.match(demandClient, /variant="document"/);
  assertSqlMatch(migration, /save_purchase_demand/);
  assertSqlMatch(migration, /review_purchase_demand/);
  assertSqlMatch(migration, /p_idempotency_key/);
  assertSqlMatch(migration, /cancel_purchase_order/);
  assertSqlMatch(migration, /close_purchase_order/);
});

test("demand review keeps approve, return, and reject in one action", () => {
  const client = readDemandModule();
  const viewDialog = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-request-view-dialog.tsx",
  );
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );

  assert.match(client, /reviewPurchaseDemand/);
  assert.match(client, /action: "approve"/);
  assert.match(viewDialog, /onRequestChanges/);
  assert.match(viewDialog, /onReject/);
  assert.match(viewDialog, /copy\.allocateAction/);
  assert.match(viewDialog, /canAllocate/);
  assert.match(actions, /PROCUREMENT_PO_APPROVE/);
  assert.doesNotMatch(actions, /"review_purchase_demand"/);
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
  assertSqlMatch(migration, /supplier_item_mapping_required/);
  assertSqlMatch(migration, /supplier_item\.is_active/);
  assertSqlMatch(migration, /supplier\.is_active/);
});

test("pending demand edit RPC remains; Wave 2 hides the create/edit chrome", () => {
  const client = readDemandModule();
  const page = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  const migration = read(
    "supabase/migrations/20260730121028_allow_pending_demand_edit_before_allocation.sql",
  );

  assert.doesNotMatch(page, /canCreateRequest=\{false\}/);
  assert.doesNotMatch(page, /canAllocate=\{false\}/);
  assert.match(client, /canCreateRequest &&/);
  assert.match(client, /key: "edit"/);
  assert.match(client, /editingPendingDemand/);
  assert.match(client, /ACTIONS_VI\.saveChanges/);
  const rpcErrors = read("apps/web/lib/messages/inventory-rpc-errors.ts");
  assert.match(rpcErrors, /purchase_demand_allocation_started/);
  assertSqlMatch(migration,
    /status NOT IN \([\s\S]*?'draft',[\s\S]*?'submitted',[\s\S]*?'pending_allocation'[\s\S]*?\)/,
  );
  assertSqlMatch(migration, /purchase_demand_allocation_started/);
  assertSqlMatch(migration, /WHEN v_was_pending THEN v_demand\.submitted_by/);
  assertSqlMatch(migration, /WHEN v_was_pending THEN v_demand\.submitted_at/);
  assertSqlMatch(migration,
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
  assert.match(client, /overlay\.patchOverlay/);
  assert.match(client, /poId,/);
  assert.match(client, /mode: nextMode/);
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
  const loader = read("apps/web/lib/inventory/load-purchase-workspace.ts");
  assert.match(
    loader,
    /units!purchase_order_items_entry_unit_id_fkey/,
  );
  assert.match(loader, /ORDER_ITEM_SELECT/);
  assert.match(loader, /from\("purchase_order_items"\)/);
  assert.match(loader, /\.in\("po_id", idChunk\)/);
  assert.match(loader, /from\("goods_received_notes"\)/);
  assert.match(loader, /\.in\("po_id", idChunk\)/);
  assert.match(loader, /from\("grn_items"\)/);
  assert.match(loader, /\.in\("grn_id", idChunk\)/);
  assert.match(loader, /PURCHASE_WORKSPACE_IN_CHUNK_SIZE/);
  assert.match(loader, /fetchRowsInChunks/);
  assert.match(loader, /purchase_group_key/);
  assert.doesNotMatch(
    loader,
    /goods_received_notes!goods_received_notes_po_id_fkey/,
  );
  assert.match(page, /loadPurchaseOrderRows/);
  assert.match(page, /includeUnits: false/);
  assert.match(page, /loadPurchasePickerUnits/);
});

test("demand progress converts PO receipt qty into demand entry units", () => {
  const page = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  const loader = read("apps/web/lib/inventory/load-purchase-workspace.ts");
  const helper = read("apps/web/lib/inventory/purchase-demand-progress.ts");
  const migration = read(
    "supabase/migrations/20260731212207_purchase_demand_coverage_base_units.sql",
  );

  assert.doesNotMatch(page, /loadPurchaseDemandRows/);
  assert.match(loader, /export function mapPurchaseDemandRows/);
  assert.match(loader, /purchaseDemandLineProgress/);
  assert.match(loader, /entry_to_base_factor/);
  assert.doesNotMatch(loader, /from\("purchase_requests"/);
  assert.doesNotMatch(
    loader,
    /ingredient_units!ingredient_units_ingredient_tenant_fkey/,
  );
  assert.doesNotMatch(
    loader,
    /purchase_orders\(id, po_number, display_id, status, supplier_id, purchase_order_items/,
  );
  assert.match(loader, /DEMAND_COVERAGE_ITEM_SELECT/);
  assert.match(loader, /from\("purchase_order_items"\)/);
  assert.match(loader, /\.in\("po_id", idChunk\)/);
  assert.match(helper, /entryToBaseFactor/);
  assert.match(helper, /demandToBaseFactor/);
  assertSqlMatch(migration, /purchase_request_item_ordered_base/);
  assertSqlMatch(migration, /purchase_request_item_remaining_demand_qty/);
  assertSqlMatch(migration,
    /coalesce\(coverage\.base_quantity, 0\)\s*>= demand_item\.quantity \* request_unit\.to_base_factor/,
  );
  assertSqlMatch(migration, /repair_demand_coverage_status/);
  assertSqlMatch(read(
      "supabase/migrations/20260731212932_fix_purchase_demand_remaining_greatest_form.sql",
    ),
    /IF v_remaining < 0 THEN/,
  );
});

test("purchase_order_items entry snapshot columns are granted to authenticated", () => {
  const grantMigration = read(
    "supabase/migrations/20260731233612_grant_inventory_entry_snapshot_columns.sql",
  );
  assertSqlMatch(grantMigration,
    /GRANT SELECT \(\s*entry_to_base_factor,\s*entry_unit_code\s*\) ON public\.purchase_order_items TO authenticated/,
  );
  for (const table of [
    "grn_items",
    "stock_transfer_items",
    "stock_issue_items",
    "stock_movements",
  ]) {
    assertSqlMatch(grantMigration,
      new RegExp(
        `GRANT SELECT \\(\\s*entry_to_base_factor,\\s*entry_unit_code\\s*\\) ON public\\.${table} TO authenticated`,
      ),
      table,
    );
  }
});

test("ADR 0040 line columns are granted to authenticated", () => {
  const migration = read(
    "supabase/migrations/20260820133724_grant_po_grn_line_column_access_and_fix_grn_trigger_coalesce.sql",
  );
  assertSqlMatch(migration,
    /GRANT SELECT \(supplier_id\) ON public\.purchase_order_items TO authenticated/,
  );
  assertSqlMatch(migration,
    /GRANT SELECT \(confirmed_at\) ON public\.grn_items TO authenticated/,
  );
  assertSqlMatch(migration,
    /'false'::pg_catalog\.text/,
  );
});

test("purchase order immutability allows direct approved transition and maps status transition error", () => {
  const migration = read(
    "supabase/migrations/20260820212536_fix_po_status_transition_approved.sql",
  );
  const rpcErrors = read("apps/web/lib/messages/inventory-rpc-errors.ts");

  assertSqlMatch(migration,
    /OLD\.status = 'draft'[\s\S]*?NEW\.status IN \('approved', 'sent', 'pending_approval', 'cancelled'\)/,
  );
  assertSqlMatch(migration,
    /NEW\.status NOT IN \('draft', 'pending_approval', 'approved'\)/,
  );
  assert.match(
    rpcErrors,
    /purchase_order_status_transition_invalid/,
  );
});

