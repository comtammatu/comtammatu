import { canAccess } from "./module-acl";
import type { JwtClaims } from "./types";

/** Determine the default redirect path for a role after login */
export function getDefaultRedirect(claims: JwtClaims): string {
  if (claims.user_role === "owner") {
    return "/";
  }

  // D076 temporary adapter until ADR 0015: accountant lands on Finance.
  if (
    claims.user_role === "accountant" &&
    canAccess(claims.user_role, "finance")
  ) {
    return "/finance";
  }

  // D076 temporary adapters until ADR 0015: central site roles land on Inventory L0.
  if (
    (claims.user_role === "central_supply_ops" ||
      claims.user_role === "central_kitchen_lead") &&
    canAccess(claims.user_role, "inventory")
  ) {
    return "/inventory";
  }

  if (claims.branch_id != null && canAccess(claims.user_role, "branch_home")) {
    return `/br/${claims.branch_id}`;
  }

  if (canAccess(claims.user_role, "branch_home")) {
    return "/access-denied?reason=branch-scope-mismatch";
  }

  return "/access-denied?reason=role-unassigned";
}
