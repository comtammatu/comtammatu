import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePostLoginRedirect,
  getSafeInternalReturnTo,
  getDefaultRedirect,
  getBetaDefaultRedirect,
} from "../scope";
import { buildAccessDeniedPath } from "../blocked-state";
import { STAFF_ROLES, type JwtClaims, type StaffRole } from "../types";
import { canAccess } from "../module-acl";
import { resolveDiscoveredApps } from "../app-discovery";

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

test("resolvePostLoginRedirect → returnTo to disallowed module → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/admin/dashboard"),
    "/employee",
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

test("resolvePostLoginRedirect → branch settings follows branch scope", () => {
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("branch_manager", 3),
      "/br/3/settings",
    ),
    "/br/3/settings",
  );
  assert.equal(
    resolvePostLoginRedirect(
      makeClaims("branch_manager", 3),
      "/br/7/settings",
    ),
    "/employee",
  );
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/br/7/settings"),
    "/br/7/settings",
  );
});

test("canAccess → only owner and super_manager can access tenant admin modules", () => {
  const adminModules = [
    "dashboard",
    "staff",
    "crm",
    "reports",
  ] as const;
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
  for (const role of ["owner", "super_manager", "area_manager", "branch_manager"] as const) {
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

test("canAccess → employee portal is available to every staff role", () => {
  for (const role of STAFF_ROLES) {
    assert.equal(canAccess(role, "employee"), true);
  }
});

test("resolveDiscoveredApps → settings entries are discoverable from employee portal", () => {
  const ownerApps = resolveDiscoveredApps("owner");
  assert.ok(
    ownerApps.some(
      (app) => app.moduleKey === "settings" && app.href === "/admin/settings",
    ),
  );
  assert.ok(
    ownerApps.some(
      (app) =>
        app.moduleKey === "inventory_admin" && app.href === "/admin/inventory",
    ),
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
        app.moduleKey === "branch_settings" &&
        app.href === "/br/3/settings",
    ),
  );

  const cashierApps = resolveDiscoveredApps("cashier", 3);
  assert.equal(cashierApps.some((app) => app.moduleKey === "settings"), false);
  assert.equal(
    cashierApps.some((app) => app.moduleKey === "branch_settings"),
    false,
  );
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
    resolvePostLoginRedirect(makeClaims("owner"), "/admin/finance", {
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
