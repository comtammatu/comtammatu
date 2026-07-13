import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePostLoginRedirect,
  getSafeInternalReturnTo,
  getDefaultRedirect,
} from "../scope";
import { buildAccessDeniedPath } from "../blocked-state";
import { ADMIN_ROLES, type JwtClaims, type StaffRole } from "../types";
import { canAccess, MODULE_ACL } from "../module-acl";
import {
  resolveDiscoveredAppGroups,
  resolveDiscoveredApps,
} from "../app-discovery";
import { resolveRoleHomeLink } from "../nav-resolution";
import {
  canAccessRouteSurface,
  resolveRouteFamilyContract,
} from "../route-map";
import {
  isPublicAppPath,
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

test("getDefaultRedirect → owner enters the branch resolver", () => {
  assert.equal(getDefaultRedirect(makeClaims("owner")), "/");
});

test("getDefaultRedirect → branch_manager lands on work entry", () => {
  assert.equal(getDefaultRedirect(makeClaims("branch_manager", 3)), "/br/3");
  assert.equal(getDefaultRedirect(makeClaims("branch_manager", null)), "/");
});

test("getDefaultRedirect → non-admin roles land on their role home", () => {
  for (const role of ["cashier", "chef", "branch_staff"] as const) {
    assert.equal(getDefaultRedirect(makeClaims(role)), "/");
  }
});

test("resolveRoleHomeLink → shell home link follows role-accessible landing", () => {
  assert.deepEqual(resolveRoleHomeLink("owner"), {
    label: "Nay",
    href: "/",
  });
  assert.deepEqual(resolveRoleHomeLink("owner", 3), {
    label: "Nay",
    href: "/br/3",
  });
  assert.deepEqual(resolveRoleHomeLink("branch_manager"), {
    label: "Nay",
    href: "/",
  });

  // Operator-plane roles with a branch in scope go home to the operator hub.
  for (const role of [
    "branch_manager",
    "cashier",
    "chef",
    "branch_staff",
  ] as const) {
    assert.deepEqual(resolveRoleHomeLink(role, 3), {
      label: "Nay",
      href: "/br/3",
    });
  }

  for (const role of ["cashier", "chef", "branch_staff"] as const) {
    assert.deepEqual(resolveRoleHomeLink(role), {
      label: "Nay",
      href: "/",
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
    "branch",
  );
  assert.equal(
    resolveRouteFamilyContract("/admin/settings/tables")?.id,
    "admin",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/dashboard")?.id,
    "branch-dashboard",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/dashboard")?.surface,
    "branch",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/dashboard")?.primaryNav,
    "operator-bottom-nav",
  );
  assert.equal(resolveRouteFamilyContract("/br/3/settings")?.surface, "branch");
  assert.equal(
    resolveRouteFamilyContract("/br/3/settings/printers")?.primaryNav,
    "operator-bottom-nav",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/menu-limits")?.surface,
    "branch",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/menu-limits")?.primaryNav,
    "operator-bottom-nav",
  );
  assert.equal(resolveRouteFamilyContract("/br/3/settings/menu-limits"), null);
  assert.equal(
    resolveRouteFamilyContract("/br/3/pos-sessions")?.id,
    "branch-pos-sessions",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/pos-sessions")?.surface,
    "branch",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/pos-sessions")?.primaryNav,
    "operator-bottom-nav",
  );
  assert.equal(resolveRouteFamilyContract("/br/3/settings/pos-sessions"), null);
  assert.equal(resolveRouteFamilyContract("/admin/finance/revenue"), null);
  assert.equal(
    resolveRouteFamilyContract("/inventory/grn/123")?.id,
    "inventory",
  );
  assert.equal(resolveRouteFamilyContract("/employee/tasks"), null);

  const posFamily = resolveRouteFamilyContract("/br/3/pos");
  assert.equal(posFamily?.id, "pos");
  assert.equal(posFamily?.surface, "branch");
  assert.equal(posFamily?.requiresBranchId, true);
  assert.equal(
    resolveRouteFamilyContract("/finance")?.surface,
    "admin_dashboard",
  );
  assert.equal(resolveRouteFamilyContract("/notifications")?.surface, "branch");
});

test("canAccessRouteSurface → Admin Dashboard is owner-only while Branch stays role-neutral", () => {
  assert.equal(canAccessRouteSurface("owner", "admin_dashboard"), true);
  for (const role of [
    "branch_manager",
    "cashier",
    "chef",
    "branch_staff",
  ] as const) {
    assert.equal(canAccessRouteSurface(role, "admin_dashboard"), false);
    assert.equal(canAccessRouteSurface(role, "branch"), true);
  }
});

test("unknown inventory paths are not active route contracts", () => {
  for (const pathname of [
    "/inventory/not-a-real-route",
    "/inventory/not-a-real-route/detail",
  ]) {
    assert.equal(resolveModuleFromPath(pathname), null);
    assert.equal(resolveRouteFamilyContract(pathname), null);
    assert.equal(
      resolvePostLoginRedirect(makeClaims("branch_staff"), pathname),
      "/",
    );
  }
});

test("resolvePostLoginRedirect → null returnTo → default", () => {
  assert.equal(resolvePostLoginRedirect(makeClaims("owner"), null), "/");
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), null),
    "/br/3",
  );
});

test("resolvePostLoginRedirect → empty returnTo → default", () => {
  assert.equal(resolvePostLoginRedirect(makeClaims("cashier", 3), ""), "/br/3");
});

test("resolvePostLoginRedirect → valid returnTo for accessible module → keeps it", () => {
  // Finance route is `/finance`, not `/admin/finance` (per module-acl.ts).
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/finance"),
    "/finance",
  );
});

test("resolvePostLoginRedirect → removed admin aliases fall back", () => {
  for (const returnTo of [
    "/admin/dashboard",
    "/admin/finance/revenue?range=today",
    "/admin/reports",
    "/admin/reports/stock-movement",
    "/admin/inventory",
    "/admin/staff",
  ]) {
    assert.equal(resolvePostLoginRedirect(makeClaims("owner"), returnTo), "/");
    assert.equal(
      resolvePostLoginRedirect(makeClaims("cashier", 3), returnTo),
      "/br/3",
    );
  }
});

test("resolvePostLoginRedirect → admin returnTo to retired employee route falls back to Branch entry", () => {
  for (const role of ADMIN_ROLES) {
    assert.equal(resolvePostLoginRedirect(makeClaims(role), "/employee"), "/");
    assert.equal(
      resolvePostLoginRedirect(makeClaims(role), "/employee/profile"),
      "/",
    );
  }
});

test("resolvePostLoginRedirect → admin returnTo to old checkout approvals falls back", () => {
  for (const role of ADMIN_ROLES) {
    assert.equal(
      resolvePostLoginRedirect(
        makeClaims(role),
        "/employee/checkout-approvals",
      ),
      "/",
    );
  }
});

test("resolvePostLoginRedirect → removed admin inventory returnTo is not preserved", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/admin/inventory"),
    "/",
  );
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("owner"),
      "/admin/inventory/trust?branchId=1",
    ),
    "/",
  );
});

test("resolvePostLoginRedirect → branch_manager cannot keep admin returnTo", () => {
  for (const returnTo of ["/admin/dashboard", "/admin", "/admin/unknown"]) {
    assert.equal(
      resolvePostLoginRedirect(makeClaims("branch_manager", 3), returnTo),
      "/br/3",
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
    "/br/3",
  );
});

test("resolvePostLoginRedirect → cashier with null branch_id visiting POS → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", null), "/br/3/pos"),
    "/",
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
  assert.equal(resolvePostLoginRedirect(makeClaims("owner"), "/login"), "/");
});

test("resolvePostLoginRedirect → external URL is rejected", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "//evil.com"),
    "/",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "http://evil"),
    "/",
  );
});

test("resolvePostLoginRedirect → branch_manager cannot keep Admin Dashboard procurement returnTo", () => {
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("branch_manager", 3),
      "/inventory/suppliers",
    ),
    "/br/3",
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
    resolvePostLoginRedirect(makeClaims("branch_staff", null), "/br/5/runner"),
    "/br/5/runner",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 5), "/br/7/runner"),
    "/br/7/runner",
  );
});

test("resolvePostLoginRedirect → chef on wrong KDS branch → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("chef", 5), "/br/7/kds"),
    "/br/5",
  );
});

test("resolvePostLoginRedirect → branch_manager on own POS → allowed", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/br/3/pos"),
    "/br/3/pos",
  );
});

test("resolvePostLoginRedirect → cashier branch gating unchanged with hub context", () => {
  const ctx = { standaloneStation: null, isDesktop: false };
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/3/pos", ctx),
    "/br/3/pos",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/7/pos", ctx),
    "/br/3",
  );
});

test("resolvePostLoginRedirect → owner cover-ca POS/KDS/Runner returnTo resolves cross-branch", () => {
  // Owner has branch_id null and may cover a shift on any branch surface.
  for (const path of ["/br/7/pos", "/br/7/kds", "/br/7/runner"]) {
    assert.equal(resolvePostLoginRedirect(makeClaims("owner"), path), path);
  }
});

test("resolvePostLoginRedirect → branch_manager cannot keep Admin Dashboard HR returnTo", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/hr"),
    "/br/3",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/hr/payroll"),
    "/br/3",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/hr/payroll"),
    "/hr/payroll",
  );
});

test("resolvePostLoginRedirect → non-owner Admin Dashboard deep links fail closed", () => {
  for (const path of [
    "/menu",
    "/orders/history",
    "/inventory/stock",
    "/inventory/grn",
    "/hr/shifts",
    "/finance",
    "/branches",
    "/admin/settings",
  ]) {
    assert.equal(
      resolvePostLoginRedirect(makeClaims("branch_manager", 3), path),
      "/br/3",
    );
  }

  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/orders"),
    "/br/3",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/notifications"),
    "/notifications",
  );
});

test("resolvePostLoginRedirect → Branch-native daily work stays reachable", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/br/3/stock"),
    "/br/3/stock",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/3/orders"),
    "/br/3/orders",
  );
});

test("isPublicAppPath PWA manifests and Runner display bypass auth proxy", () => {
  assert.equal(isPublicAppPath("/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/sw.js"), true);
  assert.equal(isPublicAppPath("/q/table-token-123"), true);
  assert.equal(isPublicAppPath("/api/self-order/table-token-123"), true);
  assert.equal(
    isPublicAppPath("/api/self-order/table-token-123/batches"),
    true,
  );
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

test("resolveModuleFromPath → branch operation controls and finance workspace map to modules", () => {
  assert.equal(resolveModuleFromPath("/finance/revenue"), "finance");
  assert.equal(resolveModuleFromPath("/hr"), "hr");
  assert.equal(resolveModuleFromPath("/hr/payroll"), "hr_payroll");
  assert.equal(resolveModuleFromPath("/br/3/dashboard"), "branch_dashboard");
  assert.equal(
    resolveModuleFromPath("/br/3/menu-limits"),
    "branch_menu_limits",
  );
  assert.equal(resolveModuleFromPath("/br/3/settings/menu-limits"), null);
  assert.equal(
    resolveModuleFromPath("/br/3/pos-sessions"),
    "branch_pos_sessions",
  );
  assert.equal(resolveModuleFromPath("/br/3/settings/pos-sessions"), null);
  assert.equal(resolveModuleFromPath("/br/3/runner"), "runner");
  assert.equal(resolveModuleFromPath("/employee/checkout-approvals"), null);
  assert.equal(resolveModuleFromPath("/employee/clock"), null);
});

test("resolvePostLoginRedirect → branch POS sessions follows branch scope", () => {
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("branch_manager", 3),
      "/br/3/pos-sessions",
    ),
    "/br/3/pos-sessions",
  );
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("branch_manager", 3),
      "/br/7/pos-sessions",
    ),
    "/br/3",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/3/pos-sessions"),
    "/br/3",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/br/7/pos-sessions"),
    "/br/7/pos-sessions",
  );
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("branch_manager", 3),
      "/br/3/settings/pos-sessions",
    ),
    "/br/3",
  );
});

test("resolvePostLoginRedirect → branch settings follows branch scope", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/br/3/settings"),
    "/br/3/settings",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/br/7/settings"),
    "/br/3",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/br/7/settings"),
    "/br/7/settings",
  );
});

test("resolvePostLoginRedirect → branch menu limits follows branch scope", () => {
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("branch_manager", 3),
      "/br/3/menu-limits",
    ),
    "/br/3/menu-limits",
  );
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("branch_manager", 3),
      "/br/7/menu-limits",
    ),
    "/br/3",
  );
  // Cashier no longer reaches the menu-limits day-control surface (D048):
  // access is tightened to owner + branch_manager, so it falls back home.
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/3/menu-limits"),
    "/br/3",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/br/7/menu-limits"),
    "/br/7/menu-limits",
  );
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("branch_manager", 3),
      "/br/3/settings/menu-limits",
    ),
    "/br/3",
  );
});

test("canAccess → only owner can access tenant admin modules", () => {
  const adminModules = ["menu", "staff", "settings"] as const;
  for (const moduleKey of adminModules) {
    assert.equal(canAccess("owner", moduleKey), true);
    for (const role of ["branch_manager", "cashier", "chef"] as const) {
      assert.equal(canAccess(role, moduleKey), false);
    }
  }
});

test("canAccess → branch command and branch settings include branch manager", () => {
  for (const role of ["owner", "branch_manager"] as const) {
    assert.equal(canAccess(role, "branch_dashboard"), true);
    assert.equal(canAccess(role, "branch_settings"), true);
    assert.equal(canAccess(role, "branch_pos_sessions"), true);
  }
  for (const role of ["cashier", "chef", "branch_staff"] as const) {
    assert.equal(canAccess(role, "branch_dashboard"), false);
    assert.equal(canAccess(role, "branch_settings"), false);
    assert.equal(canAccess(role, "branch_pos_sessions"), false);
  }
});

test("canAccess → tenant settings excludes branch floor roles", () => {
  for (const role of ["owner"] as const) {
    assert.equal(canAccess(role, "settings"), true);
  }
  for (const role of [
    "branch_manager",
    "cashier",
    "chef",
    "branch_staff",
  ] as const) {
    assert.equal(canAccess(role, "settings"), false);
  }
});

test("canAccess → checkout approvals are manager-tier, not whole employee portal", () => {
  for (const role of ["owner", "branch_manager"] as const) {
    assert.equal(canAccess(role, "employee_checkout_approvals"), true);
  }

  for (const role of ["cashier", "chef"] as const) {
    assert.equal(canAccess(role, "employee_checkout_approvals"), false);
  }
});

test("canAccess → owner can cover-ca POS/KDS/Runner; floor roles unchanged", () => {
  for (const moduleKey of ["pos", "kds", "runner"] as const) {
    assert.equal(canAccess("owner", moduleKey), true);
  }
  // POS floor roles follow the current cashier + manager service model.
  for (const role of ["cashier", "branch_manager"] as const) {
    assert.equal(canAccess(role, "pos"), true);
  }
  assert.equal(canAccess("chef", "pos"), false);
  // KDS floor roles unchanged.
  for (const role of ["chef", "branch_manager"] as const) {
    assert.equal(canAccess(role, "kds"), true);
  }
  for (const role of ["cashier"] as const) {
    assert.equal(canAccess(role, "kds"), false);
  }
  // No non-station Branch role gained POS/KDS access.
  for (const role of ["branch_staff"] as const) {
    assert.equal(canAccess(role, "pos"), false);
    assert.equal(canAccess(role, "kds"), false);
    assert.equal(canAccess(role, "runner"), false);
  }
});

test("canAccess → branch manager can access HR shift workspace but not payroll", () => {
  assert.equal(canAccess("branch_manager", "hr"), true);
  assert.equal(canAccess("branch_manager", "hr_payroll"), false);
  assert.equal(canAccess("owner", "hr_payroll"), true);
});

test("resolveDiscoveredApps → settings entries are discoverable for authorized roles", () => {
  const ownerApps = resolveDiscoveredApps("owner");
  assert.ok(
    ownerApps.some(
      (app) => app.moduleKey === "settings" && app.href === "/admin/settings",
    ),
  );
  assert.equal(Object.hasOwn(MODULE_ACL, "dashboard"), false);
  assert.equal(Object.hasOwn(MODULE_ACL, "inventory_admin"), false);
  assert.ok(
    ownerApps.some((app) => app.moduleKey === "hr" && app.href === "/hr"),
  );
  assert.ok(
    ownerApps.some((app) => app.moduleKey === "menu" && app.href === "/menu"),
  );
  assert.ok(
    ownerApps.some(
      (app) => app.moduleKey === "orders" && app.href === "/orders",
    ),
  );
  assert.equal(
    ownerApps.some((app) => app.moduleKey === "hr_payroll"),
    false,
  );

  const branchManagerApps = resolveDiscoveredApps("branch_manager", 3);
  const branchManagerGroups = resolveDiscoveredAppGroups("branch_manager", 3);
  const branchGroups = branchManagerGroups.filter(
    (group) => group.surface === "branch",
  );
  assert.deepEqual(
    branchGroups.map((group) => group.items.map((app) => app.moduleKey)),
    [
      ["branch_settings"],
      ["pos", "kds", "branch_menu_limits", "branch_pos_sessions", "runner"],
    ],
  );
  assert.equal(
    branchManagerApps.some((app) => app.moduleKey === "settings"),
    false,
  );
  assert.equal(
    branchManagerApps.some((app) => app.moduleKey === "branch_dashboard"),
    false,
    "the dashboard redirect route must not be advertised as a Branch destination",
  );
  assert.ok(
    branchManagerApps.some(
      (app) =>
        app.moduleKey === "branch_settings" && app.href === "/br/3/settings",
    ),
  );
  assert.ok(
    branchManagerApps.some(
      (app) =>
        app.moduleKey === "branch_menu_limits" &&
        app.href === "/br/3/menu-limits",
    ),
  );
  assert.equal(
    branchManagerApps.find((app) => app.moduleKey === "branch_menu_limits")
      ?.surface,
    "branch",
  );
  assert.ok(
    branchManagerApps.some(
      (app) =>
        app.moduleKey === "branch_pos_sessions" &&
        app.href === "/br/3/pos-sessions",
    ),
  );
  assert.equal(
    branchManagerApps.find((app) => app.moduleKey === "branch_pos_sessions")
      ?.surface,
    "branch",
  );
  for (const moduleKey of ["menu", "orders", "inventory", "hr"] as const) {
    assert.equal(
      branchManagerApps.some((app) => app.moduleKey === moduleKey),
      false,
    );
  }
  assert.equal(
    branchManagerGroups.some((group) => group.surface === "admin_dashboard"),
    false,
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

test("getSafeInternalReturnTo → accepts internal paths", () => {
  assert.equal(getSafeInternalReturnTo("/finance"), "/finance");
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
    buildAccessDeniedPath("insufficient-permission", { from: "/hr/staff" }),
    "/access-denied?reason=insufficient-permission&from=%2Fhr%2Fstaff",
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
