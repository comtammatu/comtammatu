import { canAccess } from "./module-acl";
import {
  isBetaPath,
  resolveModuleFromPath,
  stripBetaPrefix,
} from "./route-resolution";
import type { JwtClaims, ScopeIds, StaffRole } from "./types";
import { ADMIN_ROLES, BRANCH_ROLES } from "./types";

export type AuthSurface = "legacy" | "beta";

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

export function toBetaPath(pathname: string): string {
  const safePath = getSafeInternalReturnTo(pathname);

  if (!safePath) {
    return "/beta";
  }

  if (safePath === "/") {
    return "/beta";
  }

  if (isBetaPath(safePath)) {
    return safePath;
  }

  return `/beta${safePath}`;
}

export function getBetaDefaultRedirect(claims: JwtClaims): string {
  if (ADMIN_ROLES.includes(claims.user_role)) {
    return "/beta/admin/dashboard";
  }

  if (canAccess(claims.user_role, "inventory")) {
    return "/beta/inventory";
  }

  return "/beta";
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

function getSurfaceDefaultRedirect(
  claims: JwtClaims,
  surface: AuthSurface,
): string {
  return surface === "beta"
    ? getBetaDefaultRedirect(claims)
    : getDefaultRedirect(claims);
}

/**
 * Resolve the post-login destination for a user.
 *
 * Preference order:
 *  1. Caller-supplied `returnTo`, when it is safe, resolves to a module the
 *     role can access, and — for branch-scoped modules — matches the user's
 *     branch.
 *  2. Role's default landing page (`getDefaultRedirect` /
 *     `getBetaDefaultRedirect`).
 *
 * Surface is carried through so beta users stay on `/beta/*` and legacy users
 * stay on root paths.
 */
export function resolvePostLoginRedirect(
  claims: JwtClaims,
  returnTo: string | null | undefined,
  options?: { surface?: AuthSurface },
): string {
  const surface: AuthSurface = options?.surface ?? "legacy";
  const fallback = getSurfaceDefaultRedirect(claims, surface);
  const safeReturnTo = getSafeInternalReturnTo(returnTo);

  if (!safeReturnTo) {
    return fallback;
  }

  const targetPath =
    surface === "beta" ? toBetaPath(safeReturnTo) : safeReturnTo;
  const targetUrl = new URL(targetPath, "http://localhost");

  // Guard against bouncing the user back to the login route itself.
  if (targetUrl.pathname === "/login" || targetUrl.pathname === "/beta/login") {
    return fallback;
  }

  const moduleKey = resolveModuleFromPath(targetUrl.pathname);

  // Non-module paths (e.g. /beta home) are allowed when surface matches.
  if (!moduleKey) {
    return surface === "beta"
      ? `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
      : fallback;
  }

  if (!canAccess(claims.user_role, moduleKey)) {
    return fallback;
  }

  if (moduleKey === "pos" || moduleKey === "kds") {
    const routePath = stripBetaPrefix(targetUrl.pathname);
    const branchMatch = routePath.match(/^\/br\/(\d+)\//);
    const routeBranchId = branchMatch ? Number(branchMatch[1]) : null;

    if (routeBranchId === null || claims.branch_id !== routeBranchId) {
      return fallback;
    }
  }

  return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
}

/** Check if a role is admin-level */
export function isAdminRole(role: StaffRole): boolean {
  return ADMIN_ROLES.includes(role);
}

/** Check if a role is branch-level */
export function isBranchRole(role: StaffRole): boolean {
  return BRANCH_ROLES.includes(role);
}
