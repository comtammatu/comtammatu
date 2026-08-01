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
    position_code: role === "branch_staff" ? "cleaner" : role,
  };
}

test("operator routes resolve to ACL modules", () => {
  assert.equal(resolveModuleFromPath("/"), "owner");
  assert.equal(resolveModuleFromPath("/br"), null);
  assert.equal(resolveModuleFromPath("/br/7"), "branch_home");
  assert.equal(resolveModuleFromPath("/br/7/shift"), "branch_home");
  assert.equal(
    resolveModuleFromPath("/br/7/shift/checkout-approvals"),
    "employee_checkout_approvals",
  );
  assert.equal(
    resolveModuleFromPath("/br/7/shift/leave-approvals"),
    "employee_leave_approvals",
  );
  assert.equal(
    resolveModuleFromPath("/br/7/shift/roster"),
    "branch_shift_roster",
  );
  assert.equal(
    resolveModuleFromPath("/br/7/shift/roster/extra"),
    "branch_shift_roster",
  );
  assert.equal(
    resolveModuleFromPath("/br/7/shift/attendance"),
    "branch_shift_attendance",
  );
  assert.equal(resolveModuleFromPath("/br/7/stock"), "branch_stock");
  assert.equal(resolveModuleFromPath("/br/7/stock/count"), "branch_home");
  assert.equal(
    resolveModuleFromPath("/br/7/stock/count-slips"),
    "branch_stock",
  );
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

test("operator stock count does not require branch stock access", () => {
  assert.equal(canAccess("cashier", "branch_home"), true);
  assert.equal(canAccess("chef", "branch_home"), true);
  assert.equal(canAccess("branch_staff", "branch_home"), true);
  assert.equal(canAccess("cashier", "branch_stock"), false);
  assert.equal(canAccess("chef", "branch_stock"), false);
  assert.equal(canAccess("branch_staff", "branch_stock"), false);
});

test("branch route families use branch bottom nav", () => {
  assert.equal(resolveRouteFamilyContract("/")?.id, "owner");
  assert.equal(resolveRouteFamilyContract("/br"), null);

  for (const [path, id] of [
    ["/br/7", "branch-home"],
    ["/br/7/shift", "branch-shift"],
    ["/br/7/shift/checkout-approvals", "branch-shift-checkout-approvals"],
    ["/br/7/shift/leave-approvals", "branch-shift-leave-approvals"],
    ["/br/7/shift/roster", "branch-shift-roster"],
    ["/br/7/shift/attendance", "branch-shift-attendance"],
    ["/br/7/stock", "branch-stock"],
    ["/br/7/stock/count", "branch-stock"],
    ["/br/7/stock/count-slips", "branch-stock"],
    ["/br/7/stock/receive", "branch-stock"],
    ["/br/7/stock/receive/123", "branch-stock"],
    ["/br/7/stock/transfer", "branch-stock"],
    ["/br/7/stock/transfer/123", "branch-stock"],
    ["/br/7/stock/waste", "branch-stock"],
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
    assert.equal(canAccess(role, "branch_home"), true, role);
  }
});

test("active branch position codes resolve to branch scope", () => {
  assert.equal(requiredBranchKindForPositionCode("branch_manager"), "branch");
  assert.equal(requiredBranchKindForPositionCode("cashier"), "branch");
  assert.equal(requiredBranchKindForPositionCode("chef"), "branch");
  assert.equal(requiredBranchKindForPositionCode("guard"), "branch");
  assert.equal(requiredBranchKindForPositionCode("cleaner"), "branch");
  assert.equal(staffRoleFromPositionCode("guard"), "branch_staff");
  assert.equal(staffRoleFromPositionCode("cleaner"), "branch_staff");
  assert.equal(staffRoleFromPositionCode("unknown_position"), "unassigned");
});

test("post-login fallback follows role and branch scope", () => {
  assert.equal(resolvePostLoginRedirect(claims("owner", null), null), "/");
  assert.equal(resolvePostLoginRedirect(claims("cashier", 7), null), "/br/7");
});

test("post-login returnTo cannot cross branch-scoped operator routes", () => {
  assert.equal(
    resolvePostLoginRedirect(claims("cashier", 7), "/br/8"),
    "/br/7",
  );
  assert.equal(
    resolvePostLoginRedirect(claims("cashier", 7), "/br/8/shift"),
    "/br/7",
  );
  // Unassigned/tenant-level operational claims (branch_id null) fail closed.
  assert.equal(
    resolvePostLoginRedirect(claims("branch_staff", null), "/br/8/stock"),
    "/access-denied?reason=branch-scope-mismatch",
  );
});
