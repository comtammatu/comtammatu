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

function defaultRedirect(claims: JwtClaims): string {
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
    return defaultRedirect(claims);
  }

  if (claims.user_role === "office") {
    return defaultRedirect(claims);
  }

  if (
    claims.branch_id != null &&
    canAccess(claims.user_role, "operator_home")
  ) {
    return `/br/${claims.branch_id}`;
  }

  if (isAdminRole(claims.user_role)) {
    return "/br";
  }

  return defaultRedirect(claims);
}
