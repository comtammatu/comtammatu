import test from "node:test";
import assert from "node:assert/strict";
import { canAccess } from "../module-acl";
import { resolvePostLoginRedirect } from "../scope";
import type { JwtClaims } from "../types";
import {
  centralSiteBranchKindForRole,
  requiredBranchKindForPositionCode,
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
  assert.equal(resolveModuleFromPath("/br"), "branch_picker");
  assert.equal(resolveModuleFromPath("/br/7"), "operator_home");
  assert.equal(resolveModuleFromPath("/br/7/shift"), "operator_home");
  assert.equal(
    resolveModuleFromPath("/br/7/shift/checkout-approvals"),
    "employee_checkout_approvals",
  );
  assert.equal(resolveModuleFromPath("/br/7/stock"), "inventory");
  assert.equal(resolveModuleFromPath("/br/7/stock/count"), "operator_home");
  assert.equal(resolveModuleFromPath("/br/7/stock/count-slips"), "inventory");
});

test("operator stock count does not require full inventory access", () => {
  assert.equal(canAccess("cashier", "operator_home"), true);
  assert.equal(canAccess("chef", "operator_home"), true);
  assert.equal(canAccess("cashier", "inventory"), false);
  assert.equal(canAccess("chef", "inventory"), false);
});

test("operator route families use operator bottom nav", () => {
  assert.equal(resolveRouteFamilyContract("/br")?.id, "branch-picker");

  for (const [path, id] of [
    ["/br/7", "operator-home"],
    ["/br/7/shift", "operator-shift"],
    ["/br/7/shift/checkout-approvals", "operator-shift-checkout-approvals"],
    ["/br/7/stock", "operator-stock"],
    ["/br/7/stock/count", "operator-stock"],
    ["/br/7/stock/count-slips", "operator-stock"],
    ["/br/7/stock/receive", "operator-stock"],
    ["/br/7/stock/receive/123", "operator-stock"],
    ["/br/7/stock/transfer", "operator-stock"],
    ["/br/7/stock/transfer/123", "operator-stock"],
    ["/br/7/stock/transfer/new", "operator-stock"],
    ["/br/7/stock/waste", "operator-stock"],
  ] as const) {
    const family = resolveRouteFamilyContract(path);
    assert.equal(family?.id, id);
    assert.equal(family?.primaryNav, "operator-bottom-nav");
    assert.equal(family?.requiresBranchId, true);
  }
});

test("operator home excludes office but includes every site-attached role", () => {
  for (const role of [
    "owner",
    "branch_manager",
    "cashier",
    "chef",
    "warehouse_manager",
    "production_manager",
  ] as const) {
    assert.equal(canAccess(role, "operator_home"), true, role);
  }
  assert.equal(canAccess("office", "operator_home"), false);
});

test("central-site role positions keep tenant-level branch claims", () => {
  assert.equal(
    requiredBranchKindForPositionCode("warehouse_manager"),
    null,
  );
  assert.equal(
    requiredBranchKindForPositionCode("central_supply_manager"),
    null,
  );
  assert.equal(
    requiredBranchKindForPositionCode("production_manager"),
    null,
  );
  assert.equal(
    requiredBranchKindForPositionCode("central_kitchen_manager"),
    null,
  );
  assert.equal(requiredBranchKindForPositionCode("head_chef"), null);

  assert.equal(
    centralSiteBranchKindForRole("warehouse_manager"),
    "central_supply",
  );
  assert.equal(
    centralSiteBranchKindForRole("production_manager"),
    "central_kitchen",
  );
  assert.equal(requiredBranchKindForPositionCode("branch_manager"), "branch");
  assert.equal(requiredBranchKindForPositionCode("cashier"), "branch");
  assert.equal(requiredBranchKindForPositionCode("chef"), "branch");
});

test("post-login hub fallback is device and branch aware", () => {
  const phone = { standaloneStation: null, isDesktop: false } as const;
  const desktop = { standaloneStation: null, isDesktop: true } as const;

  assert.equal(
    resolvePostLoginRedirect(claims("owner", null), null, phone),
    "/br",
  );
  assert.equal(
    resolvePostLoginRedirect(claims("owner", null), null, desktop),
    "/admin/dashboard",
  );
  assert.equal(
    resolvePostLoginRedirect(claims("cashier", 7), null, phone),
    "/br/7",
  );
  assert.equal(
    resolvePostLoginRedirect(claims("office", null), null, phone),
    "/employee",
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
  // Central-site role without a resolved home site: cross-site returnTo
  // falls back to /employee (claims stay tenant-level, D055 §1).
  assert.equal(
    resolvePostLoginRedirect(
      claims("warehouse_manager", null),
      "/br/8/stock",
      phone,
    ),
    "/employee",
  );
  // With a resolved central home site, the fallback is that site's hub.
  assert.equal(
    resolvePostLoginRedirect(claims("warehouse_manager", null), "/br/8/stock", {
      ...phone,
      homeBranchId: 10,
    }),
    "/br/10",
  );
});
