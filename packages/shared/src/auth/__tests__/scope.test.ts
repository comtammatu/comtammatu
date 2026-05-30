import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePostLoginRedirect,
  getSafeInternalReturnTo,
  getDefaultRedirect,
  getBetaDefaultRedirect,
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
import {
  isFeedbackPublicPath,
  isPublicAppPath,
  normalizeHost,
  resolveHostSurface,
  resolveLegacyRouteRedirectPath,
  resolveModuleFromPath,
} from "../route-resolution";

function makeClaims(
  role: StaffRole,
  branchId: number | null = null,
  tenantId = 1,
): JwtClaims {
  return {
    tenant_id: tenantId,
    branch_id: branchId,
    area_id: null,
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
    "area_manager",
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

test("getBetaDefaultRedirect → owner and super_manager keep beta admin, others use employee portal", () => {
  assert.equal(
    getBetaDefaultRedirect(makeClaims("owner")),
    "/beta/admin/dashboard",
  );
  assert.equal(
    getBetaDefaultRedirect(makeClaims("super_manager")),
    "/beta/admin/dashboard",
  );
  assert.equal(getBetaDefaultRedirect(makeClaims("area_manager")), "/employee");
  assert.equal(getBetaDefaultRedirect(makeClaims("cashier")), "/employee");
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
    "area_manager",
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

test("resolvePostLoginRedirect → branch staff accessing own Runner → allowed", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("waiter", 5), "/br/5/runner"),
    "/br/5/runner",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("chef", 5), "/br/5/runner"),
    "/br/5/runner",
  );
});

test("resolvePostLoginRedirect → chef on wrong KDS branch → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("chef", 5), "/br/7/kds"),
    "/employee",
  );
});

test("resolvePostLoginRedirect → Runner on wrong branch → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("waiter", 5), "/br/7/runner"),
    "/employee",
  );
});

test("resolvePostLoginRedirect → branch_manager on own POS → allowed", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("branch_manager", 3), "/br/3/pos"),
    "/br/3/pos",
  );
});

test("isPublicAppPath PWA manifests bypass auth proxy", () => {
  assert.equal(isPublicAppPath("/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/sw.js"), true);
  assert.equal(isPublicAppPath("/payment/momo/return"), true);
  assert.equal(isPublicAppPath("/br/3/pos/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/br/3/pos"), false);
  assert.equal(isPublicAppPath("/br/abc/pos/manifest.webmanifest"), false);
});

test("normalizeHost strips port + lowercases", () => {
  assert.equal(
    normalizeHost("Feedback.ComTamMatu.COM"),
    "feedback.comtammatu.com",
  );
  assert.equal(
    normalizeHost("feedback.comtammatu.com:443"),
    "feedback.comtammatu.com",
  );
  assert.equal(normalizeHost("localhost:3000"), "localhost");
  assert.equal(normalizeHost("  app.comtammatu.com  "), "app.comtammatu.com");
  assert.equal(normalizeHost(""), null);
  assert.equal(normalizeHost(null), null);
  assert.equal(normalizeHost(undefined), null);
});

test("resolveHostSurface → matches configured hosts case-insensitive, port-agnostic", () => {
  const cfg = {
    feedbackHost: "feedback.comtammatu.com",
    appHost: "app.comtammatu.com",
  };
  assert.equal(resolveHostSurface("feedback.comtammatu.com", cfg), "feedback");
  assert.equal(resolveHostSurface("FEEDBACK.COMTAMMATU.COM", cfg), "feedback");
  assert.equal(
    resolveHostSurface("feedback.comtammatu.com:443", cfg),
    "feedback",
  );
  assert.equal(resolveHostSurface("app.comtammatu.com", cfg), "app");
  assert.equal(resolveHostSurface("app.comtammatu.com:443", cfg), "app");
});

test("resolveHostSurface → unknown host falls back to 'unknown' (Vercel preview, IP, missing)", () => {
  const cfg = {
    feedbackHost: "feedback.comtammatu.com",
    appHost: "app.comtammatu.com",
  };
  assert.equal(
    resolveHostSurface("comtammatu-pr-42.vercel.app", cfg),
    "unknown",
  );
  assert.equal(resolveHostSurface("127.0.0.1", cfg), "unknown");
  assert.equal(resolveHostSurface(null, cfg), "unknown");
  assert.equal(resolveHostSurface("", cfg), "unknown");
});

test("resolveHostSurface → no env configured → all hosts fall through to 'unknown'", () => {
  // Pre-cutover state: env vars unset → gate is a no-op, behaviour matches
  // single-host deploy. resolveHostSurface MUST NOT default any host into a
  // surface when config is empty (would expose admin or feedback wrongly).
  assert.equal(
    resolveHostSurface("feedback.comtammatu.com", {
      feedbackHost: null,
      appHost: null,
    }),
    "unknown",
  );
  assert.equal(
    resolveHostSurface("app.comtammatu.com", {
      feedbackHost: undefined,
      appHost: undefined,
    }),
    "unknown",
  );
});

test("isFeedbackPublicPath → only /r/* prefix", () => {
  assert.equal(isFeedbackPublicPath("/r/abc123"), true);
  assert.equal(isFeedbackPublicPath("/r/abc/thank-you"), true);
  assert.equal(isFeedbackPublicPath("/r/"), true);
  assert.equal(isFeedbackPublicPath("/admin/feedback"), false);
  assert.equal(isFeedbackPublicPath("/api/r/abc"), false);
  assert.equal(isFeedbackPublicPath("/"), false);
});

test("resolveLegacyRouteRedirectPath → admin finance redirects to canonical finance", () => {
  assert.equal(resolveLegacyRouteRedirectPath("/admin/finance"), "/finance");
  assert.equal(
    resolveLegacyRouteRedirectPath("/admin/finance/revenue"),
    "/finance/revenue",
  );
  assert.equal(
    resolveLegacyRouteRedirectPath("/beta/admin/finance/revenue"),
    "/beta/finance/revenue",
  );
  assert.equal(resolveLegacyRouteRedirectPath("/admin/dashboard"), null);
});

test("resolveModuleFromPath → branch menu limits and finance workspace map to modules", () => {
  assert.equal(resolveModuleFromPath("/finance/revenue"), "finance");
  assert.equal(
    resolveModuleFromPath("/br/3/menu-limits"),
    "branch_menu_limits",
  );
  assert.equal(resolveModuleFromPath("/br/3/runner"), "runner");
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
  const adminModules = ["dashboard", "staff", "crm", "reports"] as const;
  for (const moduleKey of adminModules) {
    assert.equal(canAccess("owner", moduleKey), true);
    assert.equal(canAccess("super_manager", moduleKey), true);
    for (const role of [
      "area_manager",
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
  for (const role of [
    "owner",
    "super_manager",
    "area_manager",
    "branch_manager",
  ] as const) {
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

test("resolvePostLoginRedirect → beta surface → admin returnTo becomes /beta/admin/dashboard", () => {
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("super_manager"),
      "/beta/admin/dashboard",
      { surface: "beta" },
    ),
    "/beta/admin/dashboard",
  );
});

test("resolvePostLoginRedirect → beta surface + /beta/login returnTo → beta default", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("super_manager"), "/beta/login", {
      surface: "beta",
    }),
    "/beta/admin/dashboard",
  );
});

test("resolvePostLoginRedirect → beta surface rejects unknown admin returnTo", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/admin/not-a-route", {
      surface: "beta",
    }),
    "/beta/admin/dashboard",
  );
});

test("resolvePostLoginRedirect → beta surface + cross-branch POS → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/beta/br/7/pos", {
      surface: "beta",
    }),
    "/employee",
  );
});

test("resolvePostLoginRedirect → beta surface + own-branch POS → allowed", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/beta/br/3/pos", {
      surface: "beta",
    }),
    "/beta/br/3/pos",
  );
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
