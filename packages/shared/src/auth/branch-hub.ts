import { canAccess } from "./module-acl";
import { ADMIN_ROLES, type JwtClaims } from "./types";

export type StationKind = "pos" | "kds" | "runner";

export interface BranchHubContext {
  standaloneStation: StationKind | null;
  isDesktop: boolean;
}

function isAdminRole(role: JwtClaims["user_role"]): boolean {
  return ADMIN_ROLES.includes(role);
}

/** Determine the default redirect path for a role after login */
export function getDefaultRedirect(claims: JwtClaims): string {
  if (isAdminRole(claims.user_role)) {
    return "/finance";
  }

  if (canAccess(claims.user_role, "operator_home")) {
    return claims.branch_id != null ? `/br/${claims.branch_id}` : "/";
  }

  return "/access-denied?reason=role-unassigned";
}

export function resolveBranchHubDestination(
  claims: JwtClaims,
  ctx: BranchHubContext,
): string {
  if (
    ctx.standaloneStation &&
    claims.branch_id != null &&
    canAccess(claims.user_role, ctx.standaloneStation)
  ) {
    return `/br/${claims.branch_id}/${ctx.standaloneStation}`;
  }

  if (ctx.isDesktop && isAdminRole(claims.user_role)) {
    return getDefaultRedirect(claims);
  }

  if (claims.branch_id != null && canAccess(claims.user_role, "operator_home")) {
    return `/br/${claims.branch_id}`;
  }

  if (isAdminRole(claims.user_role)) {
    return "/";
  }

  if (canAccess(claims.user_role, "operator_home")) {
    return "/access-denied?reason=branch-scope-mismatch";
  }

  return getDefaultRedirect(claims);
}
