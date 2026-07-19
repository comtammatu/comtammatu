import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultRedirect } from "../login-destination";
import type { JwtClaims } from "../types";

function claims(
  role: JwtClaims["user_role"],
  branchId: number | null,
): JwtClaims {
  return {
    tenant_id: 1,
    branch_id: branchId,
    user_role: role,
    position_code: role === "branch_staff" ? "cleaner" : role,
  };
}

test("Owner lands at the tenant root", () => {
  assert.equal(getDefaultRedirect(claims("owner", null)), "/");
  assert.equal(getDefaultRedirect(claims("owner", 2)), "/");
});

test("branch-pinned roles land at their branch root", () => {
  assert.equal(getDefaultRedirect(claims("branch_manager", 2)), "/br/2");
  assert.equal(getDefaultRedirect(claims("cashier", 3)), "/br/3");
  assert.equal(getDefaultRedirect(claims("chef", 4)), "/br/4");
  assert.equal(getDefaultRedirect(claims("branch_staff", 5)), "/br/5");
});

test("branch roles without branch scope fail closed", () => {
  assert.equal(
    getDefaultRedirect(claims("branch_staff", null)),
    "/access-denied?reason=branch-scope-mismatch",
  );
});
