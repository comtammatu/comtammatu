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
    "/finance",
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

test("resolveBranchHubDestination -> central-site roles land on their resolved home site", () => {
  for (const role of ["warehouse_manager", "production_manager"] as const) {
    assert.equal(
      resolveBranchHubDestination(claims(role, null), {
        standaloneStation: null,
        isDesktop: false,
        homeBranchId: 9,
      }),
      "/br/9",
      role,
    );
  }
});

test("resolveBranchHubDestination -> central-site roles without a home site stop before old employee URLs", () => {
  for (const role of ["warehouse_manager", "production_manager"] as const) {
    assert.equal(
      resolveBranchHubDestination(claims(role, null), {
        standaloneStation: null,
        isDesktop: false,
      }),
      "/access-denied?reason=branch-scope-mismatch",
      role,
    );
    assert.equal(
      resolveBranchHubDestination(claims(role, null), {
        standaloneStation: null,
        isDesktop: false,
        homeBranchId: null,
      }),
      "/access-denied?reason=branch-scope-mismatch",
      role,
    );
  }
});

test("resolveBranchHubDestination -> homeBranchId never overrides pinned claims", () => {
  assert.equal(
    resolveBranchHubDestination(claims("cashier", 2), {
      standaloneStation: null,
      isDesktop: false,
      homeBranchId: 9,
    }),
    "/br/2",
  );
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

test("resolveBranchHubDestination -> office phone lands on finance", () => {
  assert.equal(
    resolveBranchHubDestination(claims("office", null), {
      standaloneStation: null,
      isDesktop: false,
    }),
    "/finance",
  );
  // Office has no operator hub; a stray home site must not move it.
  assert.equal(
    resolveBranchHubDestination(claims("office", null), {
      standaloneStation: null,
      isDesktop: false,
      homeBranchId: 9,
    }),
    "/finance",
  );
});
