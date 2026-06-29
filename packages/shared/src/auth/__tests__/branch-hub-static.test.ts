import test from "node:test";
import assert from "node:assert/strict";
import { resolveBranchHubDestination } from "../branch-hub";
import type { JwtClaims } from "../types";

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

test("resolveBranchHubDestination -> installed station PWA opens an accessible station", () => {
  assert.equal(
    resolveBranchHubDestination(claims("cashier", 2), {
      standaloneStation: "pos",
      isDesktop: false,
    }),
    "/br/2/pos",
  );
});

test("resolveBranchHubDestination -> inaccessible station falls back to branch home", () => {
  assert.equal(
    resolveBranchHubDestination(claims("chef", 2), {
      standaloneStation: "pos",
      isDesktop: false,
    }),
    "/br/2",
  );
});

test("resolveBranchHubDestination -> desktop owner stays on office plane", () => {
  assert.equal(
    resolveBranchHubDestination(claims("owner", null), {
      standaloneStation: null,
      isDesktop: true,
    }),
    "/admin/dashboard",
  );
});

test("resolveBranchHubDestination -> pinned operator lands on branch home", () => {
  assert.equal(
    resolveBranchHubDestination(claims("chef", 5), {
      standaloneStation: null,
      isDesktop: false,
    }),
    "/br/5",
  );
});

test("resolveBranchHubDestination -> central inventory roles keep current fallback", () => {
  for (const role of ["warehouse_manager", "production_manager"] as const) {
    assert.equal(
      resolveBranchHubDestination(claims(role, 5), {
        standaloneStation: null,
        isDesktop: false,
      }),
      "/employee",
      role,
    );
  }
});

test("resolveBranchHubDestination -> owner phone without branch lands on picker", () => {
  assert.equal(
    resolveBranchHubDestination(claims("owner", null), {
      standaloneStation: null,
      isDesktop: false,
    }),
    "/br",
  );
});

test("resolveBranchHubDestination -> office phone keeps current role fallback", () => {
  assert.equal(
    resolveBranchHubDestination(claims("office", null), {
      standaloneStation: null,
      isDesktop: false,
    }),
    "/employee",
  );
});
