import { canAccess } from "./module-acl";
import { resolveModuleFromPath } from "./route-resolution";
import type { JwtClaims, ScopeIds, StaffRole } from "./types";
import { ADMIN_ROLES, BRANCH_ROLES } from "./types";

/** Extract claims from Supabase user app_metadata */
export function extractClaims(
  appMetadata: Record<string, unknown>,
): JwtClaims | null {
  const tenantId = appMetadata.tenant_id;
  // JWT hook writes "user_role", raw app_metadata has "role"
  const role = appMetadata.user_role ?? appMetadata.role;

  if (typeof tenantId !== "number" || typeof role !== "string") {
    return null;
  }

  const branchId = appMetadata.branch_id;
  const areaId = appMetadata.area_id;

  return {
    tenant_id: tenantId,
    branch_id: typeof branchId === "number" ? branchId : null,
    area_id: typeof areaId === "number" ? areaId : null,
    user_role: role as StaffRole,
  };
}

/** Get scope IDs from claims */
export function getScope(claims: JwtClaims): ScopeIds {
  return {
    tenantId: claims.tenant_id,
    branchId: claims.branch_id,
  };
}

/** Determine the default redirect path for a role after login */
export function getDefaultRedirect(claims: JwtClaims): string {
  const { user_role } = claims;

  if (ADMIN_ROLES.includes(user_role)) {
    return "/admin/dashboard";
  }

  // All non-admin staff land on the employee workspace
  // (cashier, waiter, chef, office)
  return "/employee";
}

/** Validate and normalize an internal return path. */
export function getSafeInternalReturnTo(
  returnTo: string | null | undefined,
): string | null {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(returnTo, "http://localhost");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Prefer returning users to their original workspace when it is still valid. */
export function resolvePostLoginRedirect(
  claims: JwtClaims,
  returnTo: string | null | undefined,
): string {
  const fallback = getDefaultRedirect(claims);
  const safeReturnTo = getSafeInternalReturnTo(returnTo);

  if (!safeReturnTo) {
    return fallback;
  }

  const url = new URL(safeReturnTo, "http://localhost");
  const moduleKey = resolveModuleFromPath(url.pathname);

  if (!moduleKey || !canAccess(claims.user_role, moduleKey)) {
    return fallback;
  }

  if (moduleKey === "pos" || moduleKey === "kds") {
    const branchMatch = url.pathname.match(/^\/br\/(\d+)\//);
    const routeBranchId = branchMatch ? Number(branchMatch[1]) : null;

    if (routeBranchId === null || claims.branch_id !== routeBranchId) {
      return fallback;
    }
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

/** Check if a role is admin-level */
export function isAdminRole(role: StaffRole): boolean {
  return ADMIN_ROLES.includes(role);
}

/** Check if a role is branch-level */
export function isBranchRole(role: StaffRole): boolean {
  return BRANCH_ROLES.includes(role);
}
