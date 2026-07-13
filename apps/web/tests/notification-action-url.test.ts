import assert from "node:assert/strict";
import test from "node:test";
import type { JwtClaims, StaffRole } from "@comtammatu/shared/auth";
import { resolveNotificationActionUrl } from "@lib/notifications/action-url";

function claims(role: StaffRole, branchId: number | null): JwtClaims {
  return { tenant_id: 1, branch_id: branchId, user_role: role };
}

test("Owner keeps Admin Dashboard notification links", () => {
  assert.equal(
    resolveNotificationActionUrl(claims("owner", null), {
      actionUrl: "/inventory/grn/44",
      entityId: 44,
      kind: "workflow.grn_pending",
      targetBranchId: 3,
    }),
    "/inventory/grn/44",
  );
});

test("Branch roles receive Branch-native inventory notification links", () => {
  const branchManager = claims("branch_manager", 3);
  assert.equal(
    resolveNotificationActionUrl(branchManager, {
      actionUrl: "/inventory/stock?ingredient=12&branch=3",
      entityId: 12,
      kind: "inventory.stock_low",
      targetBranchId: 3,
    }),
    "/br/3/stock/on-hand/12",
  );
  assert.equal(
    resolveNotificationActionUrl(branchManager, {
      actionUrl: "/inventory/grn/44",
      entityId: 44,
      kind: "workflow.grn_pending",
      targetBranchId: 3,
    }),
    "/br/3/stock/grn/44",
  );
  assert.equal(
    resolveNotificationActionUrl(branchManager, {
      actionUrl: "/inventory/count-slips",
      entityId: 8,
      kind: "inventory.count_slip_submitted",
      targetBranchId: 3,
    }),
    "/br/3/stock/count-slips",
  );
  assert.equal(
    resolveNotificationActionUrl(branchManager, {
      actionUrl: "/inventory/grn",
      entityId: 18,
      kind: "workflow.po_sent",
      targetBranchId: 3,
    }),
    "/br/3/stock/grn",
  );
  assert.equal(
    resolveNotificationActionUrl(branchManager, {
      actionUrl: "/inventory/stocktake/21",
      entityId: 21,
      kind: "workflow.stocktake_submitted",
      targetBranchId: 3,
    }),
    "/br/3/stock/stocktake/21",
  );
  assert.equal(
    resolveNotificationActionUrl(branchManager, {
      actionUrl: "/inventory/transfers/34",
      entityId: 34,
      kind: "workflow.transfer_in_transit",
      targetBranchId: 3,
    }),
    "/br/3/stock/receive/34",
  );
});

test("stored and generic Admin links fall back to the matching Branch workflow", () => {
  const branchManager = claims("branch_manager", 3);
  assert.equal(
    resolveNotificationActionUrl(branchManager, {
      actionUrl: "/inventory/expiry?branch=3",
      entityId: 12,
      kind: "inventory.expiry_soon",
      targetBranchId: 3,
    }),
    "/br/3/stock",
  );
  assert.equal(
    resolveNotificationActionUrl(branchManager, {
      actionUrl: "/menu/items/9",
      entityId: 9,
      kind: "menu.catalog_changed",
      targetBranchId: 3,
    }),
    "/br/3/menu-limits",
  );
  assert.equal(
    resolveNotificationActionUrl(branchManager, {
      actionUrl: "/hr/attendance/9",
      entityId: 9,
      kind: "hr.attendance_updated",
      targetBranchId: 3,
    }),
    "/br/3/team",
  );
});

test("Branch roles keep valid Branch links and reject cross-branch targets", () => {
  const cashier = claims("cashier", 3);
  assert.equal(
    resolveNotificationActionUrl(cashier, {
      actionUrl: "/br/3/orders",
      entityId: 9,
      kind: "pos.order_new",
      targetBranchId: 3,
    }),
    "/br/3/orders",
  );
  assert.equal(
    resolveNotificationActionUrl(cashier, {
      actionUrl: "/orders/9",
      entityId: 9,
      kind: "pos.order_new",
      targetBranchId: 7,
    }),
    null,
  );
});

test("mapped Branch links fail closed to the role's accessible Branch root", () => {
  for (const role of ["cashier", "chef", "branch_staff"] as const) {
    assert.equal(
      resolveNotificationActionUrl(claims(role, 3), {
        actionUrl: "/inventory/stock?ingredient=12&branch=3",
        entityId: 12,
        kind: "inventory.stock_low",
        targetBranchId: 3,
      }),
      "/br/3",
    );
  }
});

test("Branch manager leave approval links stay in Branch", () => {
  assert.equal(
    resolveNotificationActionUrl(claims("branch_manager", 3), {
      actionUrl: "/hr",
      entityId: 5,
      kind: "hr.leave_requested",
      targetBranchId: 3,
    }),
    "/br/3/shift/leave-approvals",
  );
});

test("unsafe notification links are rejected", () => {
  assert.equal(
    resolveNotificationActionUrl(claims("branch_manager", 3), {
      actionUrl: "https://example.com/inventory/stock",
      entityId: 2,
      kind: "inventory.stock_low",
      targetBranchId: 3,
    }),
    null,
  );
});
