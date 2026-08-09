import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { JwtClaims, StaffRole } from "@comtammatu/shared/auth";
import { resolveNotificationActionUrl } from "@lib/notifications/action-url";

function claims(role: StaffRole, branchId: number | null): JwtClaims {
  return {
    tenant_id: 1,
    branch_id: branchId,
    user_role: role,
    position_code: role === "branch_staff" ? "cleaner" : role,
  };
}

test("Owner keeps Owner links and receives canonical Branch links", () => {
  assert.equal(
    resolveNotificationActionUrl(claims("owner", null), {
      actionUrl: "/inventory/grn/44",
      entityId: 44,
      kind: "workflow.grn_pending",
      targetBranchId: 3,
    }),
    "/inventory/grn/44",
  );
  assert.equal(
    resolveNotificationActionUrl(claims("owner", null), {
      actionUrl: "/br/3/pos-sessions?session=92",
      entityId: 92,
      kind: "pos.shift_variance",
      targetBranchId: 3,
    }),
    "/br/3/pos-sessions?session=92",
  );
});

test("R14: L0 shell roles rewrite residual /br stock deep-links to /inventory", () => {
  const cases: Array<{
    role: StaffRole;
    branchId: number | null;
    actionUrl: string;
    kind: string;
    entityId: number;
    expected: string;
  }> = [
    {
      role: "owner",
      branchId: null,
      actionUrl: "/br/20/stock/grn/44",
      kind: "workflow.grn_pending",
      entityId: 44,
      expected: "/inventory/grn/44",
    },
    {
      role: "accountant",
      branchId: null,
      actionUrl: "/br/20/stock/grn/44",
      kind: "workflow.grn_pending",
      entityId: 44,
      expected: "/inventory/grn/44",
    },
    {
      role: "central_supply_ops",
      branchId: 20,
      actionUrl: "/br/20/stock/on-hand/12",
      kind: "inventory.stock_low",
      entityId: 12,
      expected: "/inventory/stock/12?branchId=20",
    },
    {
      role: "central_kitchen_lead",
      branchId: 10,
      actionUrl: "/br/10/stock/receive/34",
      kind: "workflow.transfer_in_transit",
      entityId: 34,
      expected: "/inventory/transfers/34",
    },
    {
      role: "central_supply_ops",
      branchId: 20,
      actionUrl: "/br/20/stock/transfer",
      kind: "inventory.stock_request_submitted",
      entityId: 9,
      expected: "/inventory/transfers?branchId=20",
    },
    {
      role: "owner",
      branchId: null,
      actionUrl: "/br/20/stock/stocktake/21",
      kind: "inventory.stocktake_completed",
      entityId: 21,
      expected: "/inventory/stocktake/21?branchId=20",
    },
    {
      role: "owner",
      branchId: null,
      actionUrl: "/br/20/stock/production",
      kind: "inventory.production_ready",
      entityId: 1,
      expected: "/inventory/production",
    },
  ];

  for (const item of cases) {
    assert.equal(
      resolveNotificationActionUrl(claims(item.role, item.branchId), {
        actionUrl: item.actionUrl,
        entityId: item.entityId,
        kind: item.kind,
        targetBranchId: Number(item.actionUrl.match(/^\/br\/(\d+)/)?.[1]),
      }),
      item.expected,
      `${item.role} ${item.actionUrl}`,
    );
  }
});

test("R14: accountant may open tenant-wide inventory links across branches", () => {
  assert.equal(
    resolveNotificationActionUrl(claims("accountant", null), {
      actionUrl:
        "/inventory/purchase-orders?tab=orders&poId=21&mode=view",
      entityId: 21,
      kind: "procurement.po_pending_approval",
      targetBranchId: null,
    }),
    "/inventory/purchase-orders?tab=orders&poId=21&mode=view",
  );
  assert.equal(
    resolveNotificationActionUrl(claims("accountant", null), {
      actionUrl: "/inventory/grn/44",
      entityId: 44,
      kind: "workflow.grn_pending",
      targetBranchId: 20,
    }),
    "/inventory/grn/44",
  );
});

test("known notification kinds keep canonical Branch workflow URLs", () => {
  const cases: Array<{
    role: StaffRole;
    actionUrl: string;
    entityId: number;
    kind: string;
    expected: string;
  }> = [
    {
      role: "branch_manager",
      actionUrl: "/br/3/stock/on-hand/12",
      entityId: 12,
      kind: "inventory.stock_low",
      expected: "/br/3/stock/on-hand/12",
    },
    {
      role: "branch_manager",
      actionUrl: "/br/3/stock/grn/44",
      entityId: 44,
      kind: "workflow.grn_pending",
      expected: "/br/3/stock/transfer",
    },
    {
      role: "branch_manager",
      actionUrl: "/br/3/stock/grn",
      entityId: 18,
      kind: "workflow.po_sent",
      expected: "/br/3/stock/transfer",
    },
    {
      role: "branch_manager",
      actionUrl: "/br/3/stock/grn",
      entityId: 18,
      kind: "workflow.po_sent",
      expected: "/br/3/stock/transfer",
    },
    {
      role: "branch_manager",
      actionUrl: "/br/3/stock/count-slips",
      entityId: 8,
      kind: "inventory.count_slip_submitted",
      expected: "/br/3/stock/count-slips",
    },
    {
      role: "branch_manager",
      actionUrl: "/br/3/stock/stocktake/21",
      entityId: 21,
      kind: "inventory.stocktake_completed",
      expected: "/br/3/stock/stocktake/21",
    },
    {
      role: "branch_manager",
      actionUrl: "/br/3/stock/stocktake/21",
      entityId: 21,
      kind: "inventory.stocktake_conflict",
      expected: "/br/3/stock/stocktake/21",
    },
    {
      role: "branch_manager",
      actionUrl: "/br/3/stock/receive/34",
      entityId: 34,
      kind: "workflow.transfer_in_transit",
      expected: "/br/3/stock/receive/34",
    },
    {
      role: "owner",
      actionUrl: "/hr",
      entityId: 5,
      kind: "hr.leave_requested",
      expected: "/hr",
    },
    {
      role: "owner",
      actionUrl: "/br/3/shift/checkout-approvals?attendanceId=7",
      entityId: 7,
      kind: "attendance.checkout_requested",
      expected: "/br/3/shift/checkout-approvals?attendanceId=7",
    },
    {
      role: "cashier",
      actionUrl: "/br/3/stock/count",
      entityId: 9,
      kind: "inventory.count_slip_approved",
      expected: "/br/3/stock/count",
    },
    {
      role: "chef",
      actionUrl: "/br/3/stock/count",
      entityId: 10,
      kind: "inventory.count_slip_recount",
      expected: "/br/3/stock/count",
    },
    {
      role: "cashier",
      actionUrl: "/br/3/shift/schedule/leave",
      entityId: 11,
      kind: "hr.leave_approved",
      expected: "/br/3/shift/schedule/leave",
    },
    {
      role: "branch_manager",
      actionUrl: "/br/3/pos-sessions?session=92",
      entityId: 92,
      kind: "pos.shift_variance",
      expected: "/br/3/pos-sessions?session=92",
    },
    {
      role: "branch_manager",
      actionUrl: "/br/3/pos?orderId=12",
      entityId: 12,
      kind: "pos.void_resolved",
      expected: "/br/3/pos?orderId=12",
    },
  ];

  for (const item of cases) {
    assert.equal(
      resolveNotificationActionUrl(claims(item.role, 3), {
        actionUrl: item.actionUrl,
        entityId: item.entityId,
        kind: item.kind,
        targetBranchId: 3,
      }),
      item.expected,
      item.kind,
    );
  }

  assert.equal(
    resolveNotificationActionUrl(claims("branch_manager", 3), {
      actionUrl: "/hr",
      kind: "hr.leave_requested",
      entityId: 5,
      targetBranchId: 3,
    }),
    "/br/3/shift/leave-approvals?leaveRequestId=5",
  );
});

test("valid same-branch links survive and unprovable links fail closed", () => {
  const cashier = claims("cashier", 3);
  const cases = [
    {
      target: {
        actionUrl: "/br/3/pos?order=9",
        entityId: 9,
        kind: "pos.order_new",
        targetBranchId: 3,
      },
      expected: "/br/3/pos?order=9",
    },
    {
      target: {
        actionUrl: "/br/3/pos?order=9",
        entityId: 9,
        kind: "pos.order_new",
        targetBranchId: 7,
      },
      expected: null,
    },
    {
      target: {
        actionUrl: "/inventory/stock?ingredient=2",
        entityId: 2,
        kind: "inventory.stock_low",
        targetBranchId: 3,
      },
      expected: null,
    },
    {
      target: {
        actionUrl: "/inventory/stock?ingredient=2",
        entityId: 2,
        kind: "inventory.stock_low",
        targetBranchId: null,
      },
      expected: null,
    },
    {
      target: {
        actionUrl: "/menu/items/9",
        entityId: 9,
        kind: "menu.catalog_changed",
        targetBranchId: 3,
      },
      expected: null,
    },
    {
      target: {
        actionUrl: "https://example.com/inventory/stock",
        entityId: 2,
        kind: "inventory.stock_low",
        targetBranchId: 3,
      },
      expected: null,
    },
  ];

  for (const item of cases) {
    assert.equal(
      resolveNotificationActionUrl(cashier, item.target),
      item.expected,
    );
  }
});

test("notification hydration resolves URLs before feed and foreground delivery", () => {
  const source = readFileSync(
    join(process.cwd(), "app/(protected)/notifications/actions.ts"),
    "utf8",
  );
  assert.match(source, /action_url:\s*resolveNotificationActionUrl\(claims,/);
});
