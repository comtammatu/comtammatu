import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_LABEL_VI,
  STAFF_ROLES,
  requiredBranchKindForPositionCode,
  staffRoleFromPositionCode,
} from "../types";
import { INVENTORY_OPS_ROLES } from "../inventory-roles";
import { canAccess } from "../module-acl";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "../../../../..");

test("D088 roles are in STAFF_ROLES with Vietnamese labels", () => {
  for (const role of [
    "accountant",
    "central_supply_ops",
    "central_kitchen_lead",
  ] as const) {
    assert.ok(STAFF_ROLES.includes(role));
    assert.equal(typeof ROLE_LABEL_VI[role], "string");
    assert.ok(ROLE_LABEL_VI[role].length > 0);
  }
});

test("D088 position mapper and site kind pin", () => {
  assert.equal(staffRoleFromPositionCode("accountant"), "accountant");
  assert.equal(
    staffRoleFromPositionCode("central_supply_ops"),
    "central_supply_ops",
  );
  assert.equal(
    staffRoleFromPositionCode("central_kitchen_lead"),
    "central_kitchen_lead",
  );
  assert.equal(requiredBranchKindForPositionCode("accountant"), null);
  assert.equal(
    requiredBranchKindForPositionCode("central_supply_ops"),
    "central_supply",
  );
  assert.equal(
    requiredBranchKindForPositionCode("central_kitchen_lead"),
    "central_kitchen",
  );
});

test("D088 MODULE_ACL surfaces", () => {
  assert.equal(canAccess("accountant", "finance"), true);
  assert.equal(canAccess("accountant", "inventory"), true);
  assert.equal(canAccess("accountant", "hr"), false);
  assert.equal(canAccess("accountant", "staff"), false);
  assert.equal(canAccess("central_supply_ops", "inventory"), true);
  assert.equal(canAccess("central_supply_ops", "finance"), false);
  assert.equal(canAccess("central_kitchen_lead", "inventory"), true);
  assert.equal(canAccess("central_kitchen_lead", "finance"), false);
});

test("D088 central site roles pass the Inventory action gate", () => {
  assert.equal(INVENTORY_OPS_ROLES.includes("central_supply_ops"), true);
  assert.equal(INVENTORY_OPS_ROLES.includes("central_kitchen_lead"), true);
});

test("D088 procurement surfaces are permission-driven", () => {
  const files = [
    "apps/web/app/(protected)/inventory/layout.tsx",
    "apps/web/app/(protected)/inventory/_lib/dashboard-data.ts",
    "apps/web/lib/inventory/grn-source-data.ts",
    "apps/web/lib/inventory/grn-create-data.ts",
  ];
  for (const file of files) {
    const source = readFileSync(join(repoRoot, file), "utf8");
    assert.doesNotMatch(
      source,
      /canAccess\(claims\.user_role,\s*"branch_stock"\)/,
    );
  }
  for (const file of files.slice(0, 2)) {
    const source = readFileSync(join(repoRoot, file), "utf8");
    assert.match(
      source,
      /currentUserHasPermissionAny\(PERMISSION_KEYS\.PROCUREMENT_READ\)/,
    );
  }
});

test("D088 dashboard keeps the selected central site kind", () => {
  const dashboard = readFileSync(
    join(
      repoRoot,
      "apps/web/app/(protected)/inventory/_lib/dashboard-data.ts",
    ),
    "utf8",
  );
  assert.match(dashboard, /resolveSiteKind\(\{/);
  assert.doesNotMatch(
    dashboard,
    /const siteKind:\s*DashboardSiteKind\s*=\s*"branch"/,
  );
});

test("SQL twin mapper includes D088 roles", () => {
  const migration = readFileSync(
    join(
      repoRoot,
      "supabase/migrations/20260728140000_d088_b_full_ops_roles.sql",
    ),
    "utf8",
  );
  assert.match(migration, /WHEN 'accountant' THEN 'accountant'/);
  assert.match(
    migration,
    /WHEN 'central_supply_ops' THEN 'central_supply_ops'/,
  );
  assert.match(
    migration,
    /WHEN 'central_kitchen_lead' THEN 'central_kitchen_lead'/,
  );
  assert.match(migration, /temporary until ADR 0015/i);
  assert.match(migration, /position_site_kind_mismatch/);
  assert.match(migration, /central_supply/);
  assert.match(migration, /central_kitchen/);
});

test("D088 branch-scoped procurement can read supplier item mappings", () => {
  const migration = readFileSync(
    join(
      repoRoot,
      "supabase/migrations/20260728144000_d088_supplier_items_read_scope.sql",
    ),
    "utf8",
  );
  assert.match(migration, /ALTER POLICY supplier_items_read/);
  assert.match(
    migration,
    /has_permission_any\('procurement:price_list_read'\)/,
  );
  assert.doesNotMatch(
    migration,
    /has_permission\(NULL::bigint,\s*'procurement:price_list_read'/,
  );
});

test("D091 supplier mapping remains operational after price capability removal", () => {
  const migration = readFileSync(
    join(
      repoRoot,
      "supabase/migrations/20260728151000_inventory_monetary_column_hardening.sql",
    ),
    "utf8",
  );
  assert.match(migration, /ALTER POLICY supplier_items_read/);
  assert.match(migration, /has_permission_any\('procurement:read'\)/);
});

test("D089 accountant can enter PO prices before approval", () => {
  const migration = readFileSync(
    join(
      repoRoot,
      "supabase/migrations/20260728144500_d089_accountant_po_price_entry.sql",
    ),
    "utf8",
  );
  const action = readFileSync(
    join(
      repoRoot,
      "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
    ),
    "utf8",
  );
  const client = readFileSync(
    join(
      repoRoot,
      "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
    ),
    "utf8",
  );
  assert.match(migration, /FUNCTION public\.update_purchase_order_prices/);
  assert.match(migration, /has_permission_any\('procurement:read'\)/);
  assert.match(action, /updatePurchaseOrderPrices/);
  assert.match(client, /poCopy\.savePricesAction/);
});

test("D089 PO approval sync joins GRN lines in the UPDATE scope", () => {
  const migration = readFileSync(
    join(
      repoRoot,
      "supabase/migrations/20260728145000_d089_fix_po_approve_price_sync.sql",
    ),
    "utf8",
  );
  assert.match(
    migration,
    /FROM linked_grn lg,\s*public\.purchase_order_items poi/,
  );
  assert.doesNotMatch(
    migration,
    /JOIN public\.purchase_order_items poi[\s\S]*?ON[\s\S]*?gi\.ingredient_id/,
  );
});

test("D088 accountant can read the Finance funds summary", () => {
  const migration = readFileSync(
    join(
      repoRoot,
      "supabase/migrations/20260728145500_d088_accountant_finance_funds_read.sql",
    ),
    "utf8",
  );
  assert.match(migration, /FUNCTION public\.get_finance_current_funds/);
  assert.match(migration, /FUNCTION public\.get_cash_ledger_movement_since/);
  assert.match(migration, /FUNCTION public\.get_bank_ledger_movement_since/);
  assert.equal(
    migration.match(/has_permission_any\('finance:view'\)/g)?.length,
    3,
  );
  assert.doesNotMatch(migration, /auth_is_owner/);
});
