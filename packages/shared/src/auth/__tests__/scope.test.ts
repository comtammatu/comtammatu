import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePostLoginRedirect,
  getSafeInternalReturnTo,
  getDefaultRedirect,
} from "../scope";
import { buildAccessDeniedPath } from "../blocked-state";
import {
  ADMIN_ROLES,
  STAFF_ROLES,
  type JwtClaims,
  type StaffRole,
} from "../types";
import { canAccess } from "../module-acl";
import { resolveDiscoveredApps } from "../app-discovery";
import { resolveRoleHomeLink } from "../nav-resolution";
import { resolveRouteFamilyContract } from "../route-map";
import { MODULE_LABELS_VI } from "../../labels";
import {
  isPublicAppPath,
  resolveLegacyRouteRedirectPath,
  resolveModuleFromPath,
  isRunnerPublicDisplayPath,
} from "../route-resolution";

function makeClaims(
  role: StaffRole,
  branchId: number | null = null,
  tenantId = 1,
): JwtClaims {
  return {
    tenant_id: tenantId,
    branch_id: branchId,
    user_role: role,
  };
}

test("getDefaultRedirect → owner and super_manager land on /admin/dashboard", () => {
  for (const role of ["owner", "super_manager"] as const) {
    assert.equal(getDefaultRedirect(makeClaims(role)), "/admin/dashboard");
  }
});

test("getDefaultRedirect → all other roles land on /employee", () => {
  for (const role of [
    "branch_manager",
    "warehouse_manager",
    "production_manager",
    "cashier",
    "waiter",
    "chef",
    "office",
  ] as const) {
    assert.equal(getDefaultRedirect(makeClaims(role)), "/employee");
  }
});

test("resolveRoleHomeLink → shell home link follows role-accessible landing", () => {
  assert.deepEqual(resolveRoleHomeLink("owner"), {
    label: "Quản trị",
    href: "/admin/dashboard",
  });
  assert.deepEqual(resolveRoleHomeLink("super_manager"), {
    label: "Quản trị",
    href: "/admin/dashboard",
  });

  for (const role of [
    "branch_manager",
    "warehouse_manager",
    "production_manager",
    "cashier",
    "waiter",
    "chef",
    "office",
  ] as const) {
    assert.deepEqual(resolveRoleHomeLink(role), {
      label: "Trang nhân viên",
      href: "/employee",
    });
  }
});

test("resolveRouteFamilyContract → classifies active app surfaces", () => {
  assert.equal(resolveRouteFamilyContract("/login")?.surface, "public");
  assert.equal(resolveRouteFamilyContract("/br/3/runner")?.surface, "public");
  assert.equal(
    resolveRouteFamilyContract("/br/3/runner/history")?.id,
    "runner",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/runner/history")?.surface,
    "branch_operation",
  );
  assert.equal(
    resolveRouteFamilyContract("/admin/settings/tables")?.id,
    "admin",
  );
  assert.equal(
    resolveRouteFamilyContract("/admin/finance/revenue")?.id,
    "finance",
  );
  assert.equal(
    resolveRouteFamilyContract("/inventory/grn/123")?.id,
    "inventory",
  );
  assert.equal(
    resolveRouteFamilyContract("/employee/tasks")?.primaryNav,
    "employee-bottom-nav",
  );

  const posFamily = resolveRouteFamilyContract("/br/3/pos");
  assert.equal(posFamily?.id, "pos");
  assert.equal(posFamily?.surface, "branch_operation");
  assert.equal(posFamily?.requiresBranchId, true);
});

test("unknown inventory paths are not active route contracts", () => {
  for (const pathname of [
    "/inventory/not-a-real-route",
    "/inventory/not-a-real-route/detail",
  ]) {
    assert.equal(resolveModuleFromPath(pathname), null);
    assert.equal(resolveRouteFamilyContract(pathname), null);
    assert.equal(
      resolvePostLoginRedirect(makeClaims("warehouse_manager"), pathname),
      "/employee",
    );
  }
});

test("resolvePostLoginRedirect → null returnTo → default", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), null),
    "/admin/dashboard",
  );
});

test("resolvePostLoginRedirect → empty returnTo → default", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), ""),
    "/employee",
  );
});

test("resolvePostLoginRedirect → valid returnTo for accessible module → keeps it", () => {
  // Finance route is `/finance`, not `/admin/finance` (per module-acl.ts).
  assert.equal(
    resolvePostLoginRedirect(makeClaims("super_manager"), "/finance"),
    "/finance",
  );
});

test("resolvePostLoginRedirect → legacy admin finance returnTo canonicalizes to finance workspace", () => {
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("super_manager"),
      "/admin/finance/revenue?range=today",
    ),
    "/finance/revenue?range=today",
  );
});

test("resolvePostLoginRedirect → returnTo to disallowed module → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/admin/dashboard"),
    "/employee",
  );
});

test("resolvePostLoginRedirect → admin returnTo to employee portal falls back to Admin", () => {
  for (const role of ADMIN_ROLES) {
    assert.equal(
      resolvePostLoginRedirect(makeClaims(role), "/employee"),
      "/admin/dashboard",
    );
    assert.equal(
      resolvePostLoginRedirect(makeClaims(role), "/employee/profile"),
      "/admin/dashboard",
    );
  }
});

test("resolvePostLoginRedirect → admin returnTo to checkout approvals is preserved", () => {
  for (const role of ADMIN_ROLES) {
    assert.equal(
      resolvePostLoginRedirect(
        makeClaims(role),
        "/employee/checkout-approvals",
      ),
      "/employee/checkout-approvals",
    );
  }
});

test("resolvePostLoginRedirect → retired admin inventory returnTo is not preserved", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/admin/inventory"),
    "/admin/dashboard",
  );
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("super_manager"),
      "/admin/inventory/trust?branchId=1",
    ),
    "/admin/dashboard",
  );
});

test("resolvePostLoginRedirect → former admin roles cannot keep admin returnTo", () => {
  for (const role of [
    "branch_manager",
    "warehouse_manager",
    "production_manager",
  ] as const) {
    assert.equal(
      resolvePostLoginRedirect(makeClaims(role, 3), "/admin/dashboard"),
      "/employee",
    );
    assert.equal(
      resolvePostLoginRedirect(makeClaims(role, 3), "/admin"),
      "/employee",
    );
    assert.equal(
      resolvePostLoginRedirect(makeClaims(role, 3), "/admin/unknown"),
      "/employee",
    );
  }
});

test("resolvePostLoginRedirect → cashier accessing own-branch POS → allowed", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/3/pos"),
    "/br/3/pos",
  );
});

test("resolvePostLoginRedirect → cashier on wrong branch → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/7/pos"),
    "/employee",
  );
});

test("resolvePostLoginRedirect → cashier with null branch_id visiting POS → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", null), "/br/3/pos"),
    "/employee",
  );
});

test("resolvePostLoginRedirect → preserves query + hash", () => {
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("owner"),
      "/hr/payroll?period=2026-04#row-12",
    ),
    "/hr/payroll?period=2026-04#row-12",
  );
});

test("resolvePostLoginRedirect → returnTo = /login is ignored", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/login"),
    "/admin/dashboard",
  );
});

test("resolvePostLoginRedirect → external URL is rejected", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "//evil.com"),
    "/admin/dashboard",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "http://evil"),
    "/admin/dashboard",
  );
});

test("resolvePostLoginRedirect → office role cannot access hr", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("office"), "/hr"),
    "/employee",
  );
});

test("resolvePostLoginRedirect → office role cannot access inventory", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("office"), "/inventory"),
    "/employee",
  );
});

test("resolvePostLoginRedirect → warehouse_manager accessing inventory suppliers → allowed", () => {
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("warehouse_manager"),
      "/inventory/suppliers",
    ),
    "/inventory/suppliers",
  );
});

test("resolvePostLoginRedirect → owner can access hr with query", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/hr/payroll?period=2026-04"),
    "/hr/payroll?period=2026-04",
  );
});

test("resolvePostLoginRedirect → chef accessing own KDS → allowed", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("chef", 5), "/br/5/kds"),
    "/br/5/kds",
  );
});

test("resolvePostLoginRedirect → public Runner display bypasses branch auth returnTo gating", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("office", null), "/br/5/runner"),
    "/br/5/runner",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("waiter", 5), "/br/7/runner"),
    "/br/7/runner",
  );
});

test("resolvePostLoginRedirect → chef on wrong KDS branch → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("chef", 5), "/br/7/kds"),
    "/employee",
  );
});

test("resolvePostLoginRedirect → branch_manager on own POS → allowed", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/br/3/pos"),
    "/br/3/pos",
  );
});

test("resolvePostLoginRedirect → branch_manager can enter HR shifts but not payroll", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/hr"),
    "/hr",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/hr/payroll"),
    "/employee",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/hr/payroll"),
    "/hr/payroll",
  );
});

test("isPublicAppPath PWA manifests and Runner display bypass auth proxy", () => {
  assert.equal(isPublicAppPath("/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/sw.js"), true);
  assert.equal(isPublicAppPath("/payment/momo/return"), true);
  assert.equal(
    isPublicAppPath("/brand/mascot/be-suon-tuoi-runner-idle.json"),
    true,
  );
  assert.equal(isPublicAppPath("/br/3/pos/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/br/3/kds/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/br/3/runner"), true);
  assert.equal(isPublicAppPath("/br/3/runner/"), true);
  assert.equal(isRunnerPublicDisplayPath("/br/3/runner"), true);
  assert.equal(isPublicAppPath("/r/abc123"), false);
  assert.equal(isPublicAppPath("/br/3/pos"), false);
  assert.equal(isPublicAppPath("/br/3/kds"), false);
  assert.equal(isPublicAppPath("/br/3/settings/manifest.webmanifest"), false);
  assert.equal(isPublicAppPath("/br/abc/runner"), false);
  assert.equal(isPublicAppPath("/br/3/runner/history"), false);
  assert.equal(isPublicAppPath("/br/abc/pos/manifest.webmanifest"), false);
  assert.equal(isPublicAppPath("/br/abc/kds/manifest.webmanifest"), false);
});

test("resolveLegacyRouteRedirectPath → admin finance redirects to canonical finance", () => {
  assert.equal(resolveLegacyRouteRedirectPath("/admin/finance"), "/finance");
  assert.equal(
    resolveLegacyRouteRedirectPath("/admin/finance/revenue"),
    "/finance/revenue",
  );
  assert.equal(resolveLegacyRouteRedirectPath("/admin/dashboard"), null);
});

test("resolveModuleFromPath → branch menu limits and finance workspace map to modules", () => {
  assert.equal(resolveModuleFromPath("/finance/revenue"), "finance");
  assert.equal(resolveModuleFromPath("/hr"), "hr");
  assert.equal(resolveModuleFromPath("/hr/payroll"), "hr_payroll");
  assert.equal(
    resolveModuleFromPath("/br/3/menu-limits"),
    "branch_menu_limits",
  );
  assert.equal(resolveModuleFromPath("/br/3/runner"), "runner");
  assert.equal(
    resolveModuleFromPath("/employee/checkout-approvals"),
    "employee_checkout_approvals",
  );
  assert.equal(resolveModuleFromPath("/employee/clock"), "employee");
});

test("resolvePostLoginRedirect → branch settings follows branch scope", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/br/3/settings"),
    "/br/3/settings",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/br/7/settings"),
    "/employee",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/br/7/settings"),
    "/br/7/settings",
  );
});

test("resolvePostLoginRedirect → branch menu limits follows branch scope", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/3/menu-limits"),
    "/br/3/menu-limits",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/7/menu-limits"),
    "/employee",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/br/7/menu-limits"),
    "/br/7/menu-limits",
  );
});

test("canAccess → only owner and super_manager can access tenant admin modules", () => {
  const adminModules = ["dashboard", "staff", "reports"] as const;
  for (const moduleKey of adminModules) {
    assert.equal(canAccess("owner", moduleKey), true);
    assert.equal(canAccess("super_manager", moduleKey), true);
    for (const role of [
      "branch_manager",
      "warehouse_manager",
      "production_manager",
      "cashier",
      "waiter",
      "chef",
      "office",
    ] as const) {
      assert.equal(canAccess(role, moduleKey), false);
    }
  }
});

test("canAccess → settings includes branch floor setting roles", () => {
  for (const role of ["owner", "super_manager", "branch_manager"] as const) {
    assert.equal(canAccess(role, "settings"), true);
  }
  for (const role of [
    "warehouse_manager",
    "production_manager",
    "cashier",
    "waiter",
    "chef",
    "office",
  ] as const) {
    assert.equal(canAccess(role, "settings"), false);
  }
});

test("canAccess → employee portal excludes admin-level roles", () => {
  for (const role of ADMIN_ROLES) {
    assert.equal(canAccess(role, "employee"), false);
  }

  for (const role of STAFF_ROLES.filter(
    (role) => !ADMIN_ROLES.includes(role),
  )) {
    assert.equal(canAccess(role, "employee"), true);
  }
});

test("canAccess → checkout approvals are manager-tier, not whole employee portal", () => {
  for (const role of ["owner", "super_manager", "branch_manager"] as const) {
    assert.equal(canAccess(role, "employee_checkout_approvals"), true);
  }

  for (const role of [
    "warehouse_manager",
    "production_manager",
    "cashier",
    "waiter",
    "chef",
    "office",
  ] as const) {
    assert.equal(canAccess(role, "employee_checkout_approvals"), false);
  }
});

test("canAccess → branch manager can access HR shift workspace but not payroll", () => {
  assert.equal(canAccess("branch_manager", "hr"), true);
  assert.equal(canAccess("branch_manager", "hr_payroll"), false);
  assert.equal(canAccess("owner", "hr_payroll"), true);
  assert.equal(canAccess("super_manager", "hr_payroll"), true);
});

test("resolveDiscoveredApps → settings entries are discoverable for authorized roles", () => {
  const ownerApps = resolveDiscoveredApps("owner");
  assert.ok(
    ownerApps.some(
      (app) => app.moduleKey === "settings" && app.href === "/admin/settings",
    ),
  );
  assert.equal(
    ownerApps.some((app) => app.moduleKey === "inventory_admin"),
    false,
  );
  assert.equal(
    ownerApps.some((app) => app.moduleKey === "accounting"),
    false,
  );
  assert.equal(MODULE_LABELS_VI.accounting, "Hỗ trợ khóa kỳ");
  assert.ok(
    ownerApps.some((app) => app.moduleKey === "hr" && app.href === "/hr"),
  );
  assert.equal(
    ownerApps.some((app) => app.moduleKey === "hr_payroll"),
    false,
  );

  const branchManagerApps = resolveDiscoveredApps("branch_manager", 3);
  assert.ok(
    branchManagerApps.some(
      (app) => app.moduleKey === "settings" && app.href === "/admin/settings",
    ),
  );
  assert.ok(
    branchManagerApps.some(
      (app) =>
        app.moduleKey === "branch_settings" && app.href === "/br/3/settings",
    ),
  );

  const cashierApps = resolveDiscoveredApps("cashier", 3);
  assert.equal(
    cashierApps.some((app) => app.moduleKey === "settings"),
    false,
  );
  assert.equal(
    cashierApps.some((app) => app.moduleKey === "branch_settings"),
    false,
  );
});

test("canAccess → retired inventory_admin module is unavailable to every role", () => {
  for (const role of STAFF_ROLES) {
    assert.equal(canAccess(role, "inventory_admin"), false);
  }
});

test("getSafeInternalReturnTo → accepts internal paths", () => {
  assert.equal(getSafeInternalReturnTo("/admin/dashboard"), "/admin/dashboard");
  assert.equal(getSafeInternalReturnTo("/orders?x=1#y"), "/orders?x=1#y");
});

test("getSafeInternalReturnTo → rejects unsafe paths", () => {
  assert.equal(getSafeInternalReturnTo(null), null);
  assert.equal(getSafeInternalReturnTo(""), null);
  assert.equal(getSafeInternalReturnTo("//evil.com"), null);
  assert.equal(getSafeInternalReturnTo("http://evil.com/x"), null);
  assert.equal(getSafeInternalReturnTo("javascript:alert(1)"), null);
  assert.equal(getSafeInternalReturnTo("no-leading-slash"), null);
});

test("buildAccessDeniedPath → encodes reason + from", () => {
  assert.equal(
    buildAccessDeniedPath("insufficient-permission", { from: "/admin/staff" }),
    "/access-denied?reason=insufficient-permission&from=%2Fadmin%2Fstaff",
  );
});

test("buildAccessDeniedPath → without from", () => {
  assert.equal(
    buildAccessDeniedPath("branch-scope-mismatch"),
    "/access-denied?reason=branch-scope-mismatch",
  );
});

test("buildAccessDeniedPath → preserves complex from with query + hash", () => {
  assert.equal(
    buildAccessDeniedPath("insufficient-permission", {
      from: "/br/7/pos?t=1#j",
    }),
    "/access-denied?reason=insufficient-permission&from=%2Fbr%2F7%2Fpos%3Ft%3D1%23j",
  );
});
