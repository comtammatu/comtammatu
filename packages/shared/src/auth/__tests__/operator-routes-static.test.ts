import test from "node:test";
import assert from "node:assert/strict";
import { canAccess } from "../module-acl";
import { resolvePostLoginRedirect } from "../scope";
import type { JwtClaims } from "../types";
import {
  requiredBranchKindForPositionCode,
  staffRoleFromPositionCode,
} from "../types";
import { resolveModuleFromPath } from "../route-resolution";
import { resolveRouteFamilyContract } from "../route-map";

function claims(
  role: JwtClaims["user_role"],
  branchId: number | null,
): JwtClaims {
  return {
    tenant_id: 1,
    branch_id: branchId,
    user_role: role,
  };
}

test("operator routes resolve to ACL modules", () => {
  assert.equal(resolveModuleFromPath("/"), "branch_picker");
  assert.equal(resolveModuleFromPath("/br"), "branch_picker");
  assert.equal(resolveModuleFromPath("/br/7"), "operator_home");
  assert.equal(resolveModuleFromPath("/br/7/shift"), "operator_home");
  assert.equal(
    resolveModuleFromPath("/br/7/shift/checkout-approvals"),
    "employee_checkout_approvals",
  );
  assert.equal(
    resolveModuleFromPath("/br/7/shift/leave-approvals"),
    "employee_leave_approvals",
  );
  assert.equal(resolveModuleFromPath("/br/7/stock"), "inventory");
  assert.equal(resolveModuleFromPath("/br/7/stock/count"), "operator_home");
  assert.equal(resolveModuleFromPath("/br/7/stock/count-slips"), "inventory");
  assert.equal(
    resolveModuleFromPath("/br/7/pos-sessions"),
    "branch_pos_sessions",
  );
  assert.equal(resolveModuleFromPath("/br/7/settings/pos-sessions"), null);
  assert.equal(
    resolveModuleFromPath("/br/7/pos-sessions/1"),
    "branch_pos_sessions",
  );
  assert.equal(resolveModuleFromPath("/br/7/pos-terminal"), null);
});

test("operator stock count does not require full inventory access", () => {
  assert.equal(canAccess("cashier", "operator_home"), true);
  assert.equal(canAccess("chef", "operator_home"), true);
  assert.equal(canAccess("branch_staff", "operator_home"), true);
  assert.equal(canAccess("cashier", "inventory"), false);
  assert.equal(canAccess("chef", "inventory"), false);
  assert.equal(canAccess("branch_staff", "inventory"), false);
});

test("operator route families use operator bottom nav", () => {
  assert.equal(resolveRouteFamilyContract("/")?.id, "branch-picker");
  assert.equal(resolveRouteFamilyContract("/br")?.id, "branch-picker");

  for (const [path, id] of [
    ["/br/7", "operator-home"],
    ["/br/7/shift", "operator-shift"],
    ["/br/7/shift/checkout-approvals", "operator-shift-checkout-approvals"],
    ["/br/7/shift/leave-approvals", "operator-shift-leave-approvals"],
    ["/br/7/stock", "operator-stock"],
    ["/br/7/stock/count", "operator-stock"],
    ["/br/7/stock/count-slips", "operator-stock"],
    ["/br/7/stock/receive", "operator-stock"],
    ["/br/7/stock/receive/123", "operator-stock"],
    ["/br/7/stock/transfer", "operator-stock"],
    ["/br/7/stock/transfer/123", "operator-stock"],
    ["/br/7/stock/transfer/new", "operator-stock"],
    ["/br/7/stock/waste", "operator-stock"],
    ["/br/7/pos-sessions", "branch-pos-sessions"],
  ] as const) {
    const family = resolveRouteFamilyContract(path);
    assert.equal(family?.id, id);
    assert.equal(family?.primaryNav, "operator-bottom-nav");
    assert.equal(family?.requiresBranchId, true);
  }
});

test("operator home includes every surviving role", () => {
  for (const role of [
    "owner",
    "branch_manager",
    "cashier",
    "chef",
    "branch_staff",
  ] as const) {
    assert.equal(canAccess(role, "operator_home"), true, role);
  }
});

test("retired central/office position codes resolve to unassigned", () => {
  assert.equal(
    requiredBranchKindForPositionCode("warehouse_manager"),
    "unassigned",
  );
  assert.equal(
    requiredBranchKindForPositionCode("central_supply_manager"),
    "unassigned",
  );
  assert.equal(
    requiredBranchKindForPositionCode("production_manager"),
    "unassigned",
  );
  assert.equal(
    requiredBranchKindForPositionCode("central_kitchen_manager"),
    "unassigned",
  );
  assert.equal(requiredBranchKindForPositionCode("head_chef"), "unassigned");
  assert.equal(requiredBranchKindForPositionCode("office"), "unassigned");

  assert.equal(requiredBranchKindForPositionCode("branch_manager"), "branch");
  assert.equal(requiredBranchKindForPositionCode("cashier"), "branch");
  assert.equal(requiredBranchKindForPositionCode("chef"), "branch");
  assert.equal(requiredBranchKindForPositionCode("guard"), "branch");
  assert.equal(requiredBranchKindForPositionCode("cleaner"), "branch");
  assert.equal(staffRoleFromPositionCode("guard"), "branch_staff");
  assert.equal(staffRoleFromPositionCode("cleaner"), "branch_staff");
  assert.equal(staffRoleFromPositionCode("warehouse_manager"), "unassigned");
  assert.equal(staffRoleFromPositionCode("office"), "unassigned");
});

test("post-login hub fallback promotes Branch entry on every device", () => {
  const phone = { standaloneStation: null, isDesktop: false } as const;
  const desktop = { standaloneStation: null, isDesktop: true } as const;

  assert.equal(
    resolvePostLoginRedirect(claims("owner", null), null, phone),
    "/",
  );
  assert.equal(
    resolvePostLoginRedirect(claims("owner", null), null, desktop),
    "/",
  );
  assert.equal(
    resolvePostLoginRedirect(claims("cashier", 7), null, phone),
    "/br/7",
  );
});

test("post-login returnTo cannot cross branch-scoped operator routes", () => {
  const phone = { standaloneStation: null, isDesktop: false } as const;

  assert.equal(
    resolvePostLoginRedirect(claims("cashier", 7), "/br/8", phone),
    "/br/7",
  );
  assert.equal(
    resolvePostLoginRedirect(claims("cashier", 7), "/br/8/shift", phone),
    "/br/7",
  );
  // Unassigned/tenant-level operational claims (branch_id null) fail closed.
  assert.equal(
    resolvePostLoginRedirect(
      claims("branch_staff", null),
      "/br/8/stock",
      phone,
    ),
    "/access-denied?reason=branch-scope-mismatch",
  );
});
