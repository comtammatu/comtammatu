import { canAccess } from "./module-acl";
import type { JwtClaims } from "./types";

export type StationKind = "pos" | "kds" | "runner";

export interface BranchHubContext {
  standaloneStation: StationKind | null;
  isDesktop: boolean;
}

/** Determine the default redirect path for a role after login */
export function getDefaultRedirect(claims: JwtClaims): string {
  if (canAccess(claims.user_role, "operator_home")) {
    return claims.branch_id != null ? `/br/${claims.branch_id}` : "/";
  }

  if (canAccess(claims.user_role, "admin_dashboard")) {
    return "/admin";
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

  if (ctx.isDesktop && canAccess(claims.user_role, "admin_dashboard")) {
    return getDefaultRedirect(claims);
  }

  if (
    claims.branch_id != null &&
    canAccess(claims.user_role, "operator_home")
  ) {
    return `/br/${claims.branch_id}`;
  }

  if (canAccess(claims.user_role, "admin_dashboard")) {
    return "/";
  }

  if (canAccess(claims.user_role, "operator_home")) {
    return "/access-denied?reason=branch-scope-mismatch";
  }

  return getDefaultRedirect(claims);
}
