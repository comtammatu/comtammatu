import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePostLoginRedirect,
  getSafeInternalReturnTo,
  getDefaultRedirect,
  getBetaDefaultRedirect,
} from "../scope";
import { buildAccessDeniedPath } from "../blocked-state";
import type { JwtClaims, StaffRole } from "../types";

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

test("getDefaultRedirect → admin roles land on /admin/dashboard", () => {
  for (const role of [
    "owner",
    "super_manager",
    "area_manager",
    "branch_manager",
    "warehouse_manager",
    "production_manager",
  ] as const) {
    assert.equal(getDefaultRedirect(makeClaims(role)), "/admin/dashboard");
  }
});

test("getDefaultRedirect → non-admin roles land on /employee", () => {
  for (const role of ["cashier", "waiter", "chef", "office"] as const) {
    assert.equal(getDefaultRedirect(makeClaims(role)), "/employee");
  }
});

test("getBetaDefaultRedirect → inventory-capable non-admin prefers /beta/inventory", () => {
  // admin → /beta/admin/dashboard
  assert.equal(
    getBetaDefaultRedirect(makeClaims("owner")),
    "/beta/admin/dashboard",
  );
  // no inventory access → /beta root
  assert.equal(getBetaDefaultRedirect(makeClaims("cashier")), "/beta");
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
  assert.equal(
    resolvePostLoginRedirect(makeClaims("super_manager"), "/admin/finance"),
    "/admin/finance",
  );
});

test("resolvePostLoginRedirect → returnTo to disallowed module → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/admin/dashboard"),
    "/employee",
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
    resolvePostLoginRedirect(
      makeClaims("owner"),
      "/hr/payroll?period=2026-04",
    ),
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

test("resolvePostLoginRedirect → beta surface wraps non-beta returnTo", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("owner"), "/admin/finance", {
      surface: "beta",
    }),
    "/beta/admin/finance",
  );
});

test("resolvePostLoginRedirect → beta surface + cross-branch POS → fallback", () => {
  assert.equal(
    resolvePostLoginRedirect(makeClaims("cashier", 3), "/beta/br/7/pos", {
      surface: "beta",
    }),
    "/beta",
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
  assert.equal(
    getSafeInternalReturnTo("/admin/orders?x=1#y"),
    "/admin/orders?x=1#y",
  );
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
