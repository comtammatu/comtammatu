import { canAccess } from "./module-acl";
import { requiredOperatorBranchKindForRole, type JwtClaims } from "./types";

/** Determine the default redirect path for a role after login */
export function getDefaultRedirect(claims: JwtClaims): string {
  // Control home (`/`) for Owner and L0 adapters that canAccess the owner module.
  if (canAccess(claims.user_role, "owner")) {
    return "/";
  }

  if (claims.user_role === "self_service") {
    return "/";
  }

  if (
    claims.branch_id != null &&
    requiredOperatorBranchKindForRole(claims.user_role) === "branch" &&
    canAccess(claims.user_role, "branch_home")
  ) {
    return `/br/${claims.branch_id}`;
  }

  if (canAccess(claims.user_role, "branch_home")) {
    return "/access-denied?reason=branch-scope-mismatch";
  }

  return "/access-denied?reason=role-unassigned";
}
