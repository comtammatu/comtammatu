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
      expected: "/br/3/stock/grn/44",
    },
    {
      role: "branch_manager",
      actionUrl: "/br/3/stock/grn",
      entityId: 18,
      kind: "workflow.po_sent",
      expected: "/br/3/stock/grn",
    },
    {
      role: "branch_manager",
      actionUrl: "/br/3/stock/grn",
      entityId: 18,
      kind: "workflow.po_sent",
      expected: "/br/3/stock/grn",
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
      kind: "workflow.stocktake_submitted",
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
      actionUrl: "/br/3/shift/checkout-approvals",
      entityId: 7,
      kind: "attendance.checkout_requested",
      expected: "/br/3/shift/checkout-approvals",
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
      actionUrl: "/br/3/orders",
      entityId: 12,
      kind: "pos.payment_stock_failed",
      expected: "/br/3/orders",
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
    null,
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
