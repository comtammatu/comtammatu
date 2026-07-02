import { canAccess } from "./module-acl";
import { ADMIN_ROLES, type JwtClaims } from "./types";

export type StationKind = "pos" | "kds" | "runner";

export interface BranchHubContext {
  standaloneStation: StationKind | null;
  isDesktop: boolean;
  /**
   * Resolved home site for roles whose claims carry no branch (D055 §1
   * soft-routing: central-site operators keep `branch_id` null in the JWT).
   * Callers resolve it via `resolveCentralSiteHomeBranchId`; the resolver
   * only consumes it when `claims.branch_id` is null.
   */
  homeBranchId?: number | null;
}

function isAdminRole(role: JwtClaims["user_role"]): boolean {
  return ADMIN_ROLES.includes(role);
}

/** Determine the default redirect path for a role after login */
export function getDefaultRedirect(claims: JwtClaims): string {
  return isAdminRole(claims.user_role) ? "/admin/dashboard" : "/employee";
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

  if (claims.user_role === "office") {
    return getDefaultRedirect(claims);
  }

  const hubBranchId = claims.branch_id ?? ctx.homeBranchId ?? null;
  if (hubBranchId != null && canAccess(claims.user_role, "operator_home")) {
    return `/br/${hubBranchId}`;
  }

  if (isAdminRole(claims.user_role)) {
    return "/br";
  }

  return getDefaultRedirect(claims);
}
