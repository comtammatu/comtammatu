import { canAccess } from "./module-acl";
import {
  isAdminRoutePath,
  isBetaPath,
  resolveLegacyRouteRedirectPath,
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
  const position = appMetadata.position;

  return {
    tenant_id: tenantId,
    branch_id: typeof branchId === "number" ? branchId : null,
    area_id: typeof areaId === "number" ? areaId : null,
    user_role: role as StaffRole,
    position: typeof position === "string" ? position : undefined,
  };
}

/**
 * Decode the `app_metadata` section of a Supabase access-token JWT.
 *
 * `session.user.app_metadata` (supabase-js) reads from the `auth.users` row and
 * DOES NOT include claims injected by the `custom_access_token_hook`. Those
 * hook-added claims (`user_role`, `position`) only live inside the JWT itself.
 * Call this helper on `session.access_token` whenever you need the canonical
 * server-side view of the user's claims.
 *
 * Environment: Node.js or edge runtimes (uses Buffer/atob). Safe in both
 * because we try `Buffer` first, then fall back to `atob`.
 */
export function decodeJwtAppMetadata(
  accessToken: string | null | undefined,
): Record<string, unknown> | null {
  if (!accessToken) return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    // Base64url → base64
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

    let decoded: string;
    if (typeof Buffer !== "undefined") {
      decoded = Buffer.from(padded, "base64").toString("utf-8");
    } else if (typeof atob !== "undefined") {
      decoded = decodeURIComponent(
        atob(padded)
          .split("")
          .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join(""),
      );
    } else {
      return null;
    }

    const payload = JSON.parse(decoded) as { app_metadata?: unknown };
    if (payload.app_metadata && typeof payload.app_metadata === "object") {
      return payload.app_metadata as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract JWT claims directly from the access token — the canonical path.
 * Use this in server components, Server Actions, and middleware instead of
 * `extractClaims(user.app_metadata)` when hook-injected claims are required.
 */
export function extractClaimsFromAccessToken(
  accessToken: string | null | undefined,
): JwtClaims | null {
  const appMetadata = decodeJwtAppMetadata(accessToken);
  if (!appMetadata) return null;
  return extractClaims(appMetadata);
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

  // All non-admin staff land on the employee workspace.
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
  const legacyRedirectPath = resolveLegacyRouteRedirectPath(targetUrl.pathname);
  if (legacyRedirectPath) {
    targetUrl.pathname = legacyRedirectPath;
  }

  // Guard against bouncing the user back to the login route itself.
  if (targetUrl.pathname === "/login" || targetUrl.pathname === "/beta/login") {
    return fallback;
  }

  const moduleKey = resolveModuleFromPath(targetUrl.pathname);

  // Non-module paths (e.g. /beta home) are allowed when surface matches.
  if (!moduleKey) {
    if (isAdminRoutePath(targetUrl.pathname)) {
      return fallback;
    }

    return surface === "beta"
      ? `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
      : fallback;
  }

  if (!canAccess(claims.user_role, moduleKey)) {
    return fallback;
  }

  if (
    moduleKey === "pos" ||
    moduleKey === "kds" ||
    moduleKey === "runner" ||
    moduleKey === "branch_settings" ||
    moduleKey === "branch_menu_limits"
  ) {
    const routePath = stripBetaPrefix(targetUrl.pathname);
    const branchMatch = routePath.match(/^\/br\/(\d+)\//);
    const routeBranchId = branchMatch ? Number(branchMatch[1]) : null;

    const allowCrossBranchSettings =
      (moduleKey === "branch_settings" || moduleKey === "branch_menu_limits") &&
      (claims.user_role === "owner" ||
        claims.user_role === "super_manager" ||
        claims.user_role === "area_manager");

    if (
      routeBranchId === null ||
      (!allowCrossBranchSettings && claims.branch_id !== routeBranchId)
    ) {
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
