import { canAccess } from "./module-acl";
import { requiredOperatorBranchKindForRole, type JwtClaims } from "./types";

/** Determine the default redirect path for a role after login */
export function getDefaultRedirect(claims: JwtClaims): string {
  if (claims.user_role === "owner") {
    return "/";
  }

  if (claims.user_role === "self_service") {
    return "/me";
  }

  // D076 temporary adapter until ADR 0015: accountant lands on Finance.
  if (
    claims.user_role === "accountant" &&
    canAccess(claims.user_role, "finance")
  ) {
    return "/finance";
  }

  if (
    claims.branch_id != null &&
    requiredOperatorBranchKindForRole(claims.user_role) === "branch" &&
    canAccess(claims.user_role, "branch_home")
  ) {
    return `/br/${claims.branch_id}`;
  }

  if (claims.branch_id != null && canAccess(claims.user_role, "inventory")) {
    return "/inventory";
  }

  if (canAccess(claims.user_role, "branch_home")) {
    return "/access-denied?reason=branch-scope-mismatch";
  }

  return "/access-denied?reason=role-unassigned";
}
