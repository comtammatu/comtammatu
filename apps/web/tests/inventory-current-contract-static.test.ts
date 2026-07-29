import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");

function read(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
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

test("D096 is the current external purchasing authority", () => {
  const decisions = read("docs/plan/decisions.md");
  const current = decision(decisions, "D096");

  assert.match(current, /Yêu cầu mua/);
  assert.match(current, /mỗi PO thuộc đúng một yêu cầu mua và một NCC/);
  assert.match(current, /tối đa một\s+GRN nháp/);
  assert.match(current, /đơn giá `0`/);
  assert.match(current, /Trả hàng không tự giảm công nợ/);
  assert.match(current, /Supersedes:[\s\S]*D091[\s\S]*D092/);
});

test("Inventory references expose one warehouse and physical rejection QC only", () => {
  const inventory = read("docs/ref/inventory.md");
  const sop = read("docs/ref/inventory-sop.md");
  const glossary = read("docs/ref/glossary.md");
  const notifications = read("docs/spec/toast-notification-system.md");

  assert.match(inventory, /Mỗi site active có đúng một active `warehouse`/);
  assert.match(inventory, /received_quantity - rejected_quantity/);
  assert.match(sop, /lý do \+ ảnh là bắt buộc/);
  assert.match(sop, /Yêu cầu mua → PO theo NCC → GRN theo\s+ lần giao/);
  assert.match(inventory, /Chờ nhập hàng/);
  assert.match(inventory, /phần dư ngoài đơn dùng giá `0`/);

  for (const source of [inventory, sop, glossary]) {
    assert.doesNotMatch(source, /branch_kitchen|po_unit_price/);
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
        "supabase/migrations/20260728190000_inventory_topology_physical_qc_cleanup.sql",
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
  assert.match(generated, /\bcreate_grn_from_approved_po\b/);
});

test("app authority uses request to PO to GRN and omits retired QC permissions", () => {
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

  assert.match(purchaseOrderActions, /createPurchaseOrderFromRequest/);
  assert.match(purchaseOrderActions, /createGrnDraftFromPurchaseOrder/);
  assert.doesNotMatch(purchaseOrderActions, /createPurchaseOrderFromGrn/);
  assert.match(purchaseOrderClient, /Tạo phiếu nhập/);
  assert.match(purchaseOrderClient, /Tiếp tục nhập hàng/);
  assert.match(inventoryMessages, /đơn giá từ 0 trở lên/);
  assert.match(
    inventoryMessages,
    /Phiếu nhập được tạo theo từng lần giao từ đơn đặt hàng đã gửi/,
  );
  assert.doesNotMatch(inventoryMessages, /tạo phiếu nhập trước/);
  assert.doesNotMatch(transferModel, /branch_kitchen|["']kitchen["']/);
  assert.doesNotMatch(stockData, /\bkitchen\b/);
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
  assert.match(grnLineRow, /Dư ngoài đơn \$\{formatQty\(excessQuantity\)\}/);
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
