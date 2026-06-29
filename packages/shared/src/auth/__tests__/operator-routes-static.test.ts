import test from "node:test";
import assert from "node:assert/strict";
import { canAccess } from "../module-acl";
import {
  resolvePostLoginRedirect,
} from "../scope";
import type { JwtClaims } from "../types";
import {
  resolveModuleFromPath,
} from "../route-resolution";
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
  assert.equal(resolveModuleFromPath("/br/7/shift"), "employee");
  assert.equal(resolveModuleFromPath("/br/7/stock"), "inventory");
});

test("operator route families use operator bottom nav", () => {
  assert.equal(resolveRouteFamilyContract("/br")?.id, "branch-picker");

  for (const [path, id] of [
    ["/br/7", "operator-home"],
    ["/br/7/shift", "operator-shift"],
    ["/br/7/stock", "operator-stock"],
  ] as const) {
    const family = resolveRouteFamilyContract(path);
    assert.equal(family?.id, id);
    assert.equal(family?.primaryNav, "operator-bottom-nav");
    assert.equal(family?.requiresBranchId, true);
  }
});

test("operator home excludes office but includes active branch roles", () => {
  for (const role of ["owner", "branch_manager", "cashier", "chef"] as const) {
    assert.equal(canAccess(role, "operator_home"), true, role);
  }
  assert.equal(canAccess("warehouse_manager", "operator_home"), false);
  assert.equal(canAccess("production_manager", "operator_home"), false);
  assert.equal(canAccess("office", "operator_home"), false);
});

test("post-login hub fallback is device and branch aware", () => {
  const phone = { standaloneStation: null, isDesktop: false } as const;
  const desktop = { standaloneStation: null, isDesktop: true } as const;

  assert.equal(resolvePostLoginRedirect(claims("owner", null), null, phone), "/br");
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
  assert.equal(
    resolvePostLoginRedirect(claims("warehouse_manager", 7), "/br/8/stock", phone),
    "/employee",
  );
});
