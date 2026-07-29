import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { INVENTORY_OPS_ROLES } from "../inventory-roles";
import { canAccess } from "../module-acl";
import {
  ROLE_LABEL_VI,
  STAFF_ROLES,
  requiredBranchKindForPositionCode,
  staffRoleFromPositionCode,
} from "../types";

const repoRoot = join(import.meta.dirname, "../../../../..");

function read(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

test("D076 operational roles are canonical and have Vietnamese labels", () => {
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

test("D076 position mapping pins central operators to their site kind", () => {
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

test("D076 module ACL admits only the assigned operational surfaces", () => {
  assert.equal(canAccess("accountant", "finance"), true);
  assert.equal(canAccess("accountant", "inventory"), true);
  assert.equal(canAccess("accountant", "hr"), false);
  assert.equal(canAccess("accountant", "staff"), false);
  assert.equal(canAccess("central_supply_ops", "inventory"), true);
  assert.equal(canAccess("central_supply_ops", "finance"), false);
  assert.equal(canAccess("central_kitchen_lead", "inventory"), true);
  assert.equal(canAccess("central_kitchen_lead", "finance"), false);
});

test("D091 central site roles pass the Inventory action gate", () => {
  assert.equal(INVENTORY_OPS_ROLES.includes("central_supply_ops"), true);
  assert.equal(INVENTORY_OPS_ROLES.includes("central_kitchen_lead"), true);
});

test("central site templates can create, ship, and receive manual transfers", () => {
  const fixture = read("apps/web/tests/fixtures/supabase-e2e/tenant.sql");

  for (const role of ["central_supply_ops", "central_kitchen_lead"]) {
    const template = fixture.match(
      new RegExp(`\\('${role}', '${role}', ARRAY\\[([^\\]]+)\\]\\)`),
    )?.[1];
    assert.ok(template, role);
    assert.match(template, /'inventory:transfer_receive'/);
    assert.match(template, /'inventory:transfer_ship'/);
    assert.match(template, /'inventory:transfer_create'/);
  }
});

test("D091 procurement surfaces are permission-driven", () => {
  const files = [
    "apps/web/app/(protected)/inventory/layout.tsx",
    "apps/web/app/(protected)/inventory/_lib/dashboard-data.ts",
    "apps/web/lib/inventory/grn-source-data.ts",
    "apps/web/lib/inventory/grn-create-data.ts",
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /canAccess\(claims\.user_role,\s*"branch_stock"\)/,
    );
  }
  for (const file of files.slice(0, 2)) {
    assert.match(
      read(file),
      /currentUserHasPermissionAny\(PERMISSION_KEYS\.PROCUREMENT_READ\)/,
    );
  }
});

test("D091 dashboard keeps the selected central site kind", () => {
  const dashboard = read(
    "apps/web/app/(protected)/inventory/_lib/dashboard-data.ts",
  );
  assert.match(dashboard, /resolveSiteKind\(\{/);
  assert.doesNotMatch(
    dashboard,
    /const siteKind:\s*DashboardSiteKind\s*=\s*"branch"/,
  );
});

test("D091 accountant can set PO prices before approval", () => {
  const action = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );
  const client = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );

  assert.match(action, /updatePurchaseOrderPrices/);
  assert.match(action, /PERMISSION_KEYS\.PROCUREMENT_PO_CREATE/);
  assert.match(client, /poCopy\.savePricesAction/);
});
