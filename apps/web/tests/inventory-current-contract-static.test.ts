import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeEol } from "./static-source";

const repoRoot = join(import.meta.dirname, "../../..");

function read(path: string): string {
  return normalizeEol(readFileSync(join(repoRoot, path), "utf8"));
}

function decision(source: string, id: string): string {
  const start = source.indexOf(`## ${id}:`);
  assert.notEqual(start, -1, `missing ${id}`);
  const end = source.indexOf("\n## D", start + 4);
  return source.slice(start, end === -1 ? undefined : end);
}

const retiredPermissionKeys = [
  "inventory:catalog_review_policy_set",
  "inventory:grn_express_configure",
  "inventory:grn_express_extend",
  "inventory:grn_hardblock_override",
  "inventory:item_review_override_set",
  "procurement:override_code_rotate",
];

test("D099 is the current external purchasing authority", () => {
  const decisions = read("docs/plan/decisions.md");
  const current = decision(decisions, "D099");

  assert.match(current, /Nhu cầu mua/);
  assert.match(current, /ingredient-first/);
  assert.match(current, /ADR 0040/);
  assert.match(current, /One Auto-GRN per PO/);
  assert.match(current, /confirm books one NCC group/);
  assert.match(current, /`HĐ NCC`/);
});

test("Inventory references expose branch warehouse-kitchen split and physical rejection QC only", () => {
  const inventory = read("docs/ref/inventory.md");
  const sop = read("docs/ref/inventory-sop.md");
  const glossary = read("docs/ref/glossary.md");
  const notifications = read("docs/spec/toast-notification-system.md");

  assert.match(
    inventory,
    /Chi nhánh chưa tách dùng một `warehouse`; chi nhánh đã tách có một `warehouse`[^\n]*một `kitchen`/,
  );
  assert.match(inventory, /Site trung tâm vẫn dùng đúng một `warehouse`/);
  assert.match(inventory, /received_quantity - rejected_quantity/);
  assert.match(sop, /lý do \+ ảnh/);
  assert.match(sop, /\*\*Tạo đơn\*\* theo nguyên liệu/);
  assert.match(inventory, /Chờ nhập hàng/);
  assert.match(inventory, /\*\*Đơn giá\*\* net trên dòng GRN/);
  assert.match(inventory, /HĐ NCC công nợ \+ VAT/);

  for (const source of [inventory, sop, glossary]) {
    assert.doesNotMatch(source, /po_unit_price/);
  }
  assert.doesNotMatch(inventory, /Price Variance|receiving_temperature/);
  assert.doesNotMatch(
    notifications,
    /GRN price variance|grn_price_variance|Price drift/,
  );
});

test("the Inventory cleanup ships as a forward migration", () => {
  assert.equal(
    existsSync(
      join(
        repoRoot,
        "supabase/migration-archive/20260728190000_inventory_topology_physical_qc_cleanup.sql",
      ),
    ),
    true,
  );
  assert.equal(
    existsSync(
      join(
        repoRoot,
        "packages/shared/src/auth/__tests__/inventory-rpc-static.test.ts",
      ),
    ),
    false,
  );
});

test("generated database types match the final D091 catalog", () => {
  const generated = read("packages/database/src/types/database.types.ts");

  for (const retired of [
    "branch_express_window",
    "grn_hardblock_overrides",
    "inventory_qc_settings",
    "user_trust_score",
    "quality_status",
    "receiving_temperature",
    "price_variance_pct",
    "short_delivery_action",
    "create_purchase_order_with_lines",
    "quick_internal_transfer",
    "create_grn_from_po",
  ]) {
    assert.doesNotMatch(generated, new RegExp(`\\b${retired}\\b`));
  }
  const dropOrphans = read(
    "supabase/migrations/20260813142200_drop_inventory_orphan_rpcs.sql",
  );
  assert.match(
    dropOrphans,
    /DROP FUNCTION IF EXISTS public\.create_grn_from_approved_po\(bigint\)/,
  );
  assert.match(generated, /\bcreate_grn_draft_from_po\b/);
  assert.doesNotMatch(generated, /\bcreate_grn_from_approved_po\b/);
});

test("app authority keeps inter-site warehouse routing, split stock visibility, and omits retired QC permissions", () => {
  const permissions = read("packages/shared/src/auth/permissions.ts");
  const fixture = read("apps/web/tests/fixtures/supabase-e2e/tenant.sql");
  const roleMatrix = read("docs/spec/role-route-matrix.md");
  const purchaseOrderActions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const purchaseOrderClient = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const transferModel = read("apps/web/lib/inventory/transfer-create-model.ts");
  const stockData = read("apps/web/lib/inventory/stock-on-hand-data.ts");
  const inventoryMessages = read("apps/web/lib/messages/inventory.ts");
  const settingsMessages = read("apps/web/lib/messages/settings.ts");
  const quality = read("apps/web/lib/inventory/grn-quality.ts");
  const grnDetailClient = read(
    "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const grnLineRow = read(
    "apps/web/app/(protected)/inventory/grn/[id]/views/grn-line-row.tsx",
  );
  const rejectionPhotoInputs = [
    read("apps/web/app/(protected)/inventory/grn/[id]/views/grn-line-row.tsx"),
    read(
      "apps/web/app/(protected)/inventory/grn/[id]/views/amend-owner-dialog.tsx",
    ),
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet.tsx",
    ),
  ];

  for (const key of retiredPermissionKeys) {
    const pattern = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    assert.doesNotMatch(permissions, pattern);
    assert.doesNotMatch(fixture, pattern);
    assert.doesNotMatch(roleMatrix, pattern);
  }

  assert.match(purchaseOrderActions, /savePurchaseDemand/);
  assert.match(purchaseOrderActions, /reviewPurchaseDemand/);
  assert.doesNotMatch(purchaseOrderActions, /createPurchaseOrderFromGrn/);
  assert.doesNotMatch(purchaseOrderClient, /Duyệt mua|Gửi lại Kho/);
  assert.match(purchaseOrderClient, /copy\.receiveMoreAction/);
  assert.doesNotMatch(purchaseOrderClient, /unit_price|unitPrice/);
  assert.doesNotMatch(inventoryMessages, /tạo phiếu nhập trước/);
  assert.doesNotMatch(transferModel, /branch_kitchen|["']kitchen["']/);
  assert.match(stockData, /location\.location_kind === "kitchen"/);
  assert.match(stockData, /location\.default_consumption/);
  assert.doesNotMatch(inventoryMessages, /^\s*kitchen:\s*"Tiêu hao"/m);
  assert.doesNotMatch(
    settingsMessages,
    /qcSettings|Dung sai số lượng & giá|Giá lệch (?:cảnh báo|kiểm tra)/,
  );
  for (const source of rejectionPhotoInputs) {
    assert.match(source, /acceptTypes="image"/);
    assert.match(source, /allowPaste=\{false\}/);
  }
  assert.match(quality, /deriveGrnQualityStatus/);
  assert.doesNotMatch(quality, /Baseline|Variance|REVIEW_PCT/);
  assert.match(grnDetailClient, /\?\s*"Đã nhập kho"/);
  assert.match(grnLineRow, /excessShortText\(/);
  assert.match(grnLineRow, /formatGrnPersistQty\(excessQuantity, line\)/);
});

test("catalog writes cannot bypass PO price authority", () => {
  const actions = read(
    "apps/web/app/(protected)/inventory/ingredient-actions.ts",
  );
  const dialog = read(
    "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );

  assert.doesNotMatch(actions, /\bp_unit_cost\b/);
  assert.doesNotMatch(actions, /unit_cost: row\.unit_cost/);
  assert.doesNotMatch(dialog, /name="unit_cost"|values\.unit_cost/);
  assert.match(
    actions,
    /const sheets = buildIngredientSheets\([\s\S]*?\n {4}false,\n {2}\);/,
  );
});

test("D101 requires invoice valuation settlement instead of price history only", () => {
  const decisions = read("docs/plan/decisions.md");
  const current = decision(decisions, "D101");
  const migration = read(
    "supabase/migration-archive/20260730155938_inventory_valuation_subledger.sql",
  );

  assert.match(current, /company WAC/i);
  assert.match(current, /Valuation subledger append-only/);
  assert.match(current, /never a second quantity/);
  assert.match(current, /legacy_purchase_price_variance/);
  assert.match(current, /ADR 0040/);
  assert.match(migration, /CREATE TABLE public\.inventory_valuation_events/);
  assert.match(migration, /CREATE TABLE public\.inventory_value_allocations/);
  assert.match(migration, /inventory_valuation_events_immutable/);
  assert.match(migration, /stock_movements[\s\S]*grn_item_id/);
});
