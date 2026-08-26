import test from "node:test";
import assert from "node:assert/strict";
import {
  canSubscribeBranchOpsTopic,
  canonicalizeSelfServicePath,
  extractClaimsFromAccessToken,
  extractUserIdFromAccessToken,
  resolvePostLoginRedirect,
  getSafeInternalReturnTo,
  getDefaultRedirect,
} from "../scope";
import { buildAccessDeniedPath } from "../blocked-state";
import type { JwtClaims, StaffRole } from "../types";
import { canAccess, MODULE_ACL } from "../module-acl";
import {
  resolveControlSurfaceDiscoveryGroups,
  resolveDiscoveredAppGroups,
  resolveDiscoveredApps,
} from "../app-discovery";
import { resolveRoleHomeLink } from "../nav-resolution";
import { resolveRouteFamilyContract } from "../route-map";
import {
  isOwnerRoutePath,
  isPublicAppPath,
  resolveModuleFromPath,
  isPickupPublicDisplayPath,
  isStationChromePath,
} from "../route-resolution";

function tokenWithAppMetadata(appMetadata: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ app_metadata: appMetadata })}.x`;
}

function makeClaims(
  role: StaffRole,
  branchId: number | null = null,
  tenantId = 1,
): JwtClaims {
  return {
    tenant_id: tenantId,
    branch_id: branchId,
    user_role: role,
    position_code:
      role === "branch_staff"
        ? "cleaner"
        : role === "self_service"
          ? "office_admin"
          : role,
  };
}

test("extractClaimsFromAccessToken accepts only canonical, consistent claims", () => {
  assert.deepEqual(
    extractClaimsFromAccessToken(
      tokenWithAppMetadata({
        tenant_id: 1,
        branch_id: 3,
        user_role: "branch_manager",
        position_code: "branch_manager",
      }),
    ),
    {
      tenant_id: 1,
      branch_id: 3,
      user_role: "branch_manager",
      position_code: "branch_manager",
    },
  );

  assert.deepEqual(
    extractClaimsFromAccessToken(
      tokenWithAppMetadata({
        tenant_id: 1,
        branch_id: null,
        user_role: "self_service",
        position_code: "office_admin",
      }),
    ),
    {
      tenant_id: 1,
      branch_id: null,
      user_role: "self_service",
      position_code: "office_admin",
    },
  );

  for (const appMetadata of [
    {
      tenant_id: 1,
      branch_id: 3,
      role: "branch_manager",
      access_bucket: "branch_manager",
      position: "branch_manager",
    },
    {
      tenant_id: 1,
      branch_id: 3,
      user_role: "office",
      position_code: "office",
    },
    {
      tenant_id: 1,
      branch_id: 3,
      user_role: "cashier",
      position_code: "chef",
    },
    {
      tenant_id: 1,
      branch_id: null,
      user_role: "self_service",
      position_code: "cashier",
    },
    {
      tenant_id: 0,
      branch_id: 3,
      user_role: "cashier",
      position_code: "cashier",
    },
    {
      tenant_id: 1,
      branch_id: -1,
      user_role: "cashier",
      position_code: "cashier",
    },
  ]) {
    assert.equal(
      extractClaimsFromAccessToken(tokenWithAppMetadata(appMetadata)),
      null,
    );
  }
});

test("extractUserIdFromAccessToken returns the JWT sub without session.user", () => {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = (payload: unknown) =>
    `${encode({ alg: "none" })}.${encode(payload)}.x`;

  assert.equal(
    extractUserIdFromAccessToken(token({ sub: "11111111-2222-3333-4444-555555555555" })),
    "11111111-2222-3333-4444-555555555555",
  );
  // sub survives alongside app_metadata (shared payload decode path).
  assert.equal(
    extractUserIdFromAccessToken(
      token({
        sub: "abc-123",
        app_metadata: {
          tenant_id: 1,
          branch_id: 3,
          user_role: "cashier",
          position_code: "cashier",
        },
      }),
    ),
    "abc-123",
  );

  for (const bad of [
    null,
    undefined,
    "",
    "not-a-jwt",
    token({}),
    token({ sub: "" }),
    token({ sub: 42 }),
  ]) {
    assert.equal(extractUserIdFromAccessToken(bad), null);
  }
});

test("canSubscribeBranchOpsTopic mirrors owner vs assigned-branch Realtime scope", () => {
  assert.equal(canSubscribeBranchOpsTopic(makeClaims("owner", null), 1), true);
  assert.equal(canSubscribeBranchOpsTopic(makeClaims("owner", 2), 9), true);
  assert.equal(
    canSubscribeBranchOpsTopic(makeClaims("branch_manager", 3), 3),
    true,
  );
  assert.equal(
    canSubscribeBranchOpsTopic(makeClaims("branch_manager", 3), 1),
    false,
  );
  assert.equal(
    canSubscribeBranchOpsTopic(makeClaims("accountant", null), 1),
    false,
  );
  assert.equal(
    canSubscribeBranchOpsTopic(makeClaims("central_supply_ops", 5), 1),
    false,
  );
});

test("getDefaultRedirect → owner enters the L0 root", () => {
  assert.equal(getDefaultRedirect(makeClaims("owner")), "/");
});

test("getDefaultRedirect → zero-module company member enters Control home", () => {
  assert.equal(getDefaultRedirect(makeClaims("self_service")), "/");
});

test("getDefaultRedirect → branch_manager lands on work entry", () => {
  assert.equal(getDefaultRedirect(makeClaims("branch_manager", 3)), "/br/3");
  assert.equal(
    getDefaultRedirect(makeClaims("branch_manager", null)),
    "/access-denied?reason=branch-scope-mismatch",
  );
});

test("getDefaultRedirect → branch roles without scope fail closed", () => {
  for (const role of ["cashier", "chef", "branch_staff"] as const) {
    assert.equal(
      getDefaultRedirect(makeClaims(role)),
      "/access-denied?reason=branch-scope-mismatch",
    );
  }
});

test("resolveRoleHomeLink → shell home link follows role-accessible landing", () => {
  assert.deepEqual(resolveRoleHomeLink("owner"), {
    label: "Tổng quan",
    href: "/",
  });
  assert.deepEqual(resolveRoleHomeLink("owner", 3), {
    label: "Tổng quan",
    href: "/",
  });
  assert.deepEqual(resolveRoleHomeLink("self_service"), {
    label: "Tổng quan",
    href: "/",
  });
  assert.deepEqual(resolveRoleHomeLink("branch_manager"), {
    label: "Hôm nay",
    href: "/access-denied?reason=branch-scope-mismatch",
  });

  assert.deepEqual(resolveRoleHomeLink("branch_manager", 3), {
    label: "Hôm nay",
    href: "/br/3",
  });

  for (const role of ["cashier", "chef", "branch_staff"] as const) {
    assert.deepEqual(resolveRoleHomeLink(role, 3), {
      label: "Hôm nay",
      href: "/br/3",
    });
  }

  for (const role of ["cashier", "chef", "branch_staff"] as const) {
    assert.deepEqual(resolveRoleHomeLink(role), {
      label: "Hôm nay",
      href: "/access-denied?reason=branch-scope-mismatch",
    });
  }

  for (const role of ["central_supply_ops", "central_kitchen_lead"] as const) {
    assert.deepEqual(resolveRoleHomeLink(role, 3), {
      label: "Tổng quan",
      href: "/",
    });
  }

  assert.deepEqual(resolveRoleHomeLink("accountant"), {
    label: "Tổng quan",
    href: "/",
  });
});

test("resolveRouteFamilyContract → classifies active app surfaces", () => {
  assert.equal(resolveRouteFamilyContract("/login")?.surface, "public");
  assert.equal(resolveRouteFamilyContract("/br/3/pickup")?.surface, "public");
  assert.equal(resolveRouteFamilyContract("/br/3/runner"), null);
  assert.equal(resolveRouteFamilyContract("/br/3/runner/history"), null);
  assert.equal(resolveRouteFamilyContract("/settings/tables")?.id, "settings");
  assert.equal(resolveRouteFamilyContract("/")?.surface, "owner");
  assert.equal(resolveRouteFamilyContract("/me/clock")?.surface, "self");
  assert.equal(
    resolveRouteFamilyContract("/me/clock")?.primaryNav,
    "owner-sidebar",
  );
  assert.equal(
    resolveRouteFamilyContract("/inventory/grn/123")?.surface,
    "owner",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/dashboard")?.id,
    "branch-dashboard",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/dashboard")?.surface,
    "branch_management",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/dashboard")?.primaryNav,
    "operator-bottom-nav",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/settings")?.surface,
    "branch_management",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/settings/printers")?.primaryNav,
    "operator-bottom-nav",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/menu-limits")?.surface,
    "branch_operation",
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
    "branch_operation",
  );
  assert.equal(
    resolveRouteFamilyContract("/br/3/pos-sessions")?.primaryNav,
    "operator-bottom-nav",
  );
  assert.equal(resolveRouteFamilyContract("/br/3/settings/pos-sessions"), null);
  assert.equal(
    resolveRouteFamilyContract("/inventory/grn/123")?.id,
    "inventory",
  );
  assert.equal(resolveRouteFamilyContract("/employee/tasks"), null);

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
      resolvePostLoginRedirect(makeClaims("branch_staff", 3), pathname),
      "/br/3",
    );
  }
});

test("route resolver rejects segment lookalikes", () => {
  for (const pathname of [
    "/settings-old",
    "/finance-old",
    "/branches-old",
    "/menu-old",
    "/orders-old",
    "/hr-old",
    "/notifications-old",
    "/br/3/shift-old",
    "/br/3/profile-old",
    "/br/3/stock-old",
    "/br/3/orders-old",
    "/br/3/dashboard-old",
    "/br/3/team-old",
    "/br/3/settings-old",
  ]) {
    assert.equal(resolveModuleFromPath(pathname), null, pathname);
  }
});

test("resolvePostLoginRedirect rejects segment lookalikes", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/orders-old"),
    "/br/3",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/settings-old"),
    "/",
  );
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
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/finance"),
    "/finance",
  );
});

test("self-service excludes Owner and canonicalizes Branch staff", () => {
  for (const path of [
    "/me",
    "/me/clock",
    "/me/schedule",
    "/me/profile",
    "/me/payslip",
  ]) {
    assert.equal(resolvePostLoginRedirect(makeClaims("owner"), path), "/");
  }
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("cashier", 3),
      "/me/schedule/leave?month=2026-08",
    ),
    "/br/3/shift/schedule/leave?month=2026-08",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("accountant"), "/me/clock?from=home"),
    "/me/clock?from=home",
  );
  for (const role of ["central_supply_ops", "central_kitchen_lead"] as const) {
    assert.equal(
      resolvePostLoginRedirect(makeClaims(role, 8), "/me/clock?from=inventory"),
      "/me/clock?from=inventory",
    );
  }
  assert.equal(
    canonicalizeSelfServicePath(
      makeClaims("chef", 9),
      "/me/profile/payslip?year=2026#latest",
    ),
    "/br/9/profile/payslip?year=2026#latest",
  );
  assert.equal(
    canonicalizeSelfServicePath(makeClaims("chef", 9), "/me"),
    "/br/9/shift",
  );
  assert.equal(
    canonicalizeSelfServicePath(makeClaims("chef", 9), "/me/clock"),
    "/br/9/shift/clock",
  );
  for (const role of [
    "branch_manager",
    "cashier",
    "chef",
    "branch_staff",
    "central_supply_ops",
    "central_kitchen_lead",
  ] as const) {
    assert.equal(canonicalizeSelfServicePath(makeClaims(role), "/me"), null);
    assert.equal(
      resolvePostLoginRedirect(makeClaims(role), "/me"),
      "/access-denied?reason=branch-scope-mismatch",
    );
  }
  assert.equal(
    canonicalizeSelfServicePath(makeClaims("self_service"), "/me"),
    "/me",
  );
  assert.equal(
    canonicalizeSelfServicePath(makeClaims("owner"), "/me/clock"),
    null,
  );
});

test("resolvePostLoginRedirect → non-owner management surfaces use role fallback", () => {
  for (const role of ["branch_manager", "cashier"] as const) {
    for (const returnTo of [
      "/",
      "/menu",
      "/orders?status=open",
      "/inventory/stock",
      "/finance/revenue",
      "/branches",
    ]) {
      assert.equal(
        resolvePostLoginRedirect(makeClaims(role, 3), returnTo),
        "/br/3",
        `${role}: ${returnTo}`,
      );
    }
  }

  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/hr"),
    "/hr",
  );
});

test("resolvePostLoginRedirect → cashier keeps Branch-native orders", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/3/orders"),
    "/br/3/orders",
  );
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
    "/access-denied?reason=branch-scope-mismatch",
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

test("resolvePostLoginRedirect → branch_manager top-level inventory falls back to Branch", () => {
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("branch_manager", 3),
      "/inventory/suppliers",
    ),
    "/br/3",
  );
});

test("resolvePostLoginRedirect → Branch-native capabilities remain available", () => {
  for (const pathname of ["/br/3/stock", "/br/3/orders", "/br/3/menu-limits"]) {
    assert.equal(
      resolvePostLoginRedirect(makeClaims("branch_manager", 3), pathname),
      pathname,
    );
  }
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/3/orders"),
    "/br/3/orders",
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

test("resolvePostLoginRedirect → public pickup display bypasses branch auth returnTo gating", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_staff", null), "/br/5/pickup"),
    "/br/5/pickup",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 5), "/br/7/pickup"),
    "/br/7/pickup",
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

test("resolvePostLoginRedirect → cashier branch gating follows JWT scope", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/3/pos"),
    "/br/3/pos",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/br/7/pos"),
    "/br/3",
  );
});

test("resolvePostLoginRedirect → explicit Owner oversight resolves cross-branch POS/KDS/Pickup returnTo", () => {
  // Owner has branch_id null and may cover a shift on any branch surface.
  for (const path of ["/br/7/pos", "/br/7/kds", "/br/7/pickup"]) {
    assert.equal(resolvePostLoginRedirect(makeClaims("owner"), path), path);
  }
});

test("resolvePostLoginRedirect → HR stays a candidate for the live proxy gate", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/hr"),
    "/hr",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/hr/payroll"),
    "/hr/payroll",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/hr/payroll"),
    "/hr/payroll",
  );
});

test("isPublicAppPath PWA manifests and pickup display bypass auth proxy", () => {
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
  assert.equal(isPublicAppPath("/me/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/me"), false);
  assert.equal(isPublicAppPath("/br/3/pickup"), true);
  assert.equal(isPublicAppPath("/br/3/pickup/"), true);
  assert.equal(isPickupPublicDisplayPath("/br/3/pickup"), true);
  assert.equal(isStationChromePath("/br/3/pos"), true);
  assert.equal(isStationChromePath("/br/3/kds/"), true);
  assert.equal(isStationChromePath("/br/3/pos-sessions"), false);
  assert.equal(isStationChromePath("/br/3/dashboard"), false);
  assert.equal(isPublicAppPath("/br/3/runner"), false);
  assert.equal(isPublicAppPath("/br/3/runner/"), false);
  assert.equal(isPublicAppPath("/r/abc123DEF4567"), true);
  assert.equal(isPublicAppPath("/api/feedback/abc123DEF4567"), true);
  assert.equal(isPublicAppPath("/br/3/pos"), false);
  assert.equal(isPublicAppPath("/br/3/kds"), false);
  assert.equal(isPublicAppPath("/br/3/settings/manifest.webmanifest"), false);
  assert.equal(isPublicAppPath("/br/abc/pos/manifest.webmanifest"), false);
  assert.equal(isPublicAppPath("/br/abc/kds/manifest.webmanifest"), false);
});

test("resolveModuleFromPath → branch operation controls and finance workspace map to modules", () => {
  assert.equal(resolveModuleFromPath("/finance/revenue"), "finance");
  assert.equal(resolveModuleFromPath("/inventory/grn/123"), "inventory");
  assert.equal(
    resolveModuleFromPath("/inventory/purchase-orders"),
    "inventory",
  );
  assert.equal(
    resolveModuleFromPath("/inventory/stock"),
    "inventory_operations",
  );
  assert.equal(
    resolveModuleFromPath("/inventory/ingredients"),
    "inventory_operations",
  );
  assert.equal(resolveModuleFromPath("/hr"), "hr");
  assert.equal(resolveModuleFromPath("/hr/payroll"), "hr_payroll");
  assert.equal(resolveModuleFromPath("/me/profile"), "me");
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
  assert.equal(resolveModuleFromPath("/br/3/pickup"), "pickup");
  assert.equal(resolveModuleFromPath("/br/3/runner"), null);
  assert.equal(resolveModuleFromPath("/employee/checkout-approvals"), null);
  assert.equal(resolveModuleFromPath("/employee/clock"), null);
});

test("accountant reaches GRN and PO routes but not inventory operations", () => {
  assert.equal(canAccess("accountant", "inventory"), true);
  assert.equal(canAccess("accountant", "inventory_operations"), false);
  assert.equal(canAccess("owner", "inventory_operations"), true);
  assert.equal(canAccess("central_supply_ops", "inventory_operations"), true);
  assert.equal(canAccess("central_kitchen_lead", "inventory_operations"), true);
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

test("canAccess → only owner can access L0 control modules", () => {
  const ownerModules = ["owner", "settings"] as const;
  for (const moduleKey of ownerModules) {
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

test("canAccess → HR approvals belong to Owner and Branch Manager", () => {
  assert.equal(canAccess("owner", "employee_checkout_approvals"), true);
  assert.equal(canAccess("owner", "employee_leave_approvals"), true);
  assert.equal(
    canAccess("branch_manager", "employee_checkout_approvals"),
    true,
  );
  assert.equal(canAccess("branch_manager", "employee_leave_approvals"), true);
  for (const role of ["cashier", "chef"] as const) {
    assert.equal(canAccess(role, "employee_checkout_approvals"), false);
    assert.equal(canAccess(role, "employee_leave_approvals"), false);
  }
});

test("canAccess → Owner may explicitly oversee POS/KDS/pickup; floor roles stay branch-pinned", () => {
  for (const moduleKey of ["pos", "kds", "pickup"] as const) {
    assert.equal(canAccess("owner", moduleKey), true);
  }
  // POS floor roles follow the current cashier + manager + waiter service model.
  for (const role of ["cashier", "branch_manager", "branch_staff"] as const) {
    assert.equal(canAccess(role, "pos"), true);
  }
  assert.equal(canAccess("chef", "pos"), false);
  // KDS floor roles unchanged.
  for (const role of ["chef", "branch_manager"] as const) {
    assert.equal(canAccess(role, "kds"), true);
  }
  for (const role of ["cashier", "branch_staff"] as const) {
    assert.equal(canAccess(role, "kds"), false);
  }
  // Pickup display is open to all branch floor roles (guest board; staff may open it).
  for (const role of [
    "cashier",
    "chef",
    "branch_manager",
    "branch_staff",
  ] as const) {
    assert.equal(canAccess(role, "pickup"), true);
  }
});

test("canAccess → HR modules are candidates for a live capability gate", () => {
  assert.equal(canAccess("branch_manager", "hr"), true);
  assert.equal(canAccess("branch_manager", "hr_payroll"), true);
  assert.equal(canAccess("owner", "hr_payroll"), true);
});

test("canAccess → self-service explicitly excludes Owner", () => {
  assert.equal(canAccess("owner", "me"), false);
  for (const role of [
    "accountant",
    "central_supply_ops",
    "central_kitchen_lead",
    "branch_manager",
    "cashier",
    "chef",
    "branch_staff",
  ] as const) {
    assert.equal(canAccess(role, "me"), true);
  }
});

test("resolveDiscoveredApps → settings entries are discoverable for authorized roles", () => {
  const ownerApps = resolveDiscoveredApps("owner");
  assert.ok(
    ownerApps.some((app) => app.moduleKey === "owner" && app.href === "/"),
  );
  assert.ok(
    ownerApps.some(
      (app) => app.moduleKey === "settings" && app.href === "/settings",
    ),
  );
  assert.equal(Object.hasOwn(MODULE_ACL, "dashboard"), false);
  assert.ok(
    ownerApps.some((app) => app.moduleKey === "hr" && app.href === "/hr"),
  );
  assert.ok(
    ownerApps.some((app) => app.moduleKey === "menu" && app.href === "/menu"),
  );
  assert.ok(
    ownerApps.some(
      (app) => app.moduleKey === "promotions" && app.href === "/promotions",
    ),
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
  const branchManagementGroup = branchManagerGroups.find(
    (group) => group.surface === "branch_management",
  );
  const branchOperationGroup = branchManagerGroups.find(
    (group) => group.surface === "branch_operation",
  );
  assert.deepEqual(
    branchManagementGroup?.items.map((app) => app.moduleKey),
    ["branch_team", "branch_settings", "branch_feedback"],
  );
  assert.deepEqual(
    branchOperationGroup?.items.map((app) => app.moduleKey),
    [
      "pos",
      "kds",
      "branch_menu_limits",
      "branch_pos_sessions",
      "branch_close_day",
      "pickup",
    ],
  );
  assert.equal(
    branchManagerApps.some((app) => app.moduleKey === "settings"),
    false,
  );
  assert.equal(
    branchManagerApps.some((app) => app.moduleKey === "branch_dashboard"),
    false,
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
    "branch_operation",
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
    "branch_operation",
  );
  assert.equal(
    branchManagerGroups.some((group) => group.surface === "owner"),
    false,
  );
  for (const href of ["/", "/menu", "/orders", "/inventory", "/hr"]) {
    assert.equal(
      branchManagerApps.some((app) => app.href === href),
      false,
      href,
    );
  }

  const cashierApps = resolveDiscoveredApps("cashier", 3);
  assert.equal(
    cashierApps.some((app) => app.moduleKey === "settings"),
    false,
  );
  assert.equal(
    cashierApps.some((app) => app.moduleKey === "branch_settings"),
    false,
  );

  assert.equal(
    resolveDiscoveredApps("owner").some((app) => app.moduleKey === "me"),
    false,
  );
  assert.ok(
    resolveDiscoveredApps("accountant").some(
      (app) => app.moduleKey === "me" && app.href === "/me",
    ),
  );

  assert.deepEqual(resolveControlSurfaceDiscoveryGroups("self_service"), []);
  assert.deepEqual(
    resolveDiscoveredApps("self_service").map((app) => app.moduleKey),
    ["me"],
  );
});

test("getSafeInternalReturnTo → accepts internal paths", () => {
  assert.equal(getSafeInternalReturnTo("/finance"), "/finance");
  assert.equal(getSafeInternalReturnTo("/orders?x=1#y"), "/orders?x=1#y");
});

test("isOwnerRoutePath → classifies only tenant management families", () => {
  for (const pathname of [
    "/",
    "/settings",
    "/menu",
    "/promotions",
    "/orders/history",
    "/inventory/grn",
    "/finance",
    "/branches",
    "/hr/payroll",
  ]) {
    assert.equal(isOwnerRoutePath(pathname), true, pathname);
  }

  for (const pathname of [
    "/br/7/orders",
    "/br/7/stock",
    "/br/7/menu-limits",
    "/notifications",
    "/orders-old",
  ]) {
    assert.equal(isOwnerRoutePath(pathname), false, pathname);
  }
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
