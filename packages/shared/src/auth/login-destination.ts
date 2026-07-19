import { canAccess } from "./module-acl";
import type { JwtClaims } from "./types";

/** Determine the default redirect path for a role after login */
export function getDefaultRedirect(claims: JwtClaims): string {
  if (claims.user_role === "owner") {
    return "/";
  }

  if (
    claims.branch_id != null &&
    canAccess(claims.user_role, "branch_home")
  ) {
    return `/br/${claims.branch_id}`;
  }

  if (canAccess(claims.user_role, "branch_home")) {
    return "/access-denied?reason=branch-scope-mismatch";
  }

  return "/access-denied?reason=role-unassigned";
}
