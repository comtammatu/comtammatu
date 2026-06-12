import { canAccess } from "./module-acl";
import {
  isRunnerPublicDisplayPath,
  resolveLegacyRouteRedirectPath,
  resolveModuleFromPath,
} from "./route-resolution";
import type { JwtClaims, StaffRole } from "./types";
import { ADMIN_ROLES } from "./types";

/** Extract claims from Supabase user app_metadata */
function extractClaims(appMetadata: Record<string, unknown>): JwtClaims | null {
  const tenantId = appMetadata.tenant_id;
  // JWT hook writes "user_role", raw app_metadata has "role"
  const role = appMetadata.user_role ?? appMetadata.role;

  if (typeof tenantId !== "number" || typeof role !== "string") {
    return null;
  }

  const branchId = appMetadata.branch_id;
  const position = appMetadata.position;
  const accessBucket = appMetadata.access_bucket;
  const positionCode = appMetadata.position_code;

  return {
    tenant_id: tenantId,
    branch_id: typeof branchId === "number" ? branchId : null,
    user_role: role as StaffRole,
    access_bucket:
      typeof accessBucket === "string"
        ? (accessBucket as StaffRole)
        : undefined,
    position: typeof position === "string" ? position : undefined,
    position_code: typeof positionCode === "string" ? positionCode : undefined,
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
function decodeJwtAppMetadata(
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

/** Determine the default redirect path for a role after login */
export function getDefaultRedirect(claims: JwtClaims): string {
  const { user_role } = claims;

  if (ADMIN_ROLES.includes(user_role)) {
    return "/admin/dashboard";
  }

  // All non-admin staff land on the employee workspace.
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

/**
 * Resolve the post-login destination for a user.
 *
 * Preference order:
 *  1. Caller-supplied `returnTo`, when it is safe, resolves to a module the
 *     role can access, and — for branch-scoped modules — matches the user's
 *     branch.
 *  2. Role's default landing page (`getDefaultRedirect`).
 */
export function resolvePostLoginRedirect(
  claims: JwtClaims,
  returnTo: string | null | undefined,
): string {
  const fallback = getDefaultRedirect(claims);
  const safeReturnTo = getSafeInternalReturnTo(returnTo);

  if (!safeReturnTo) {
    return fallback;
  }

  const targetUrl = new URL(safeReturnTo, "http://localhost");
  const legacyRedirectPath = resolveLegacyRouteRedirectPath(targetUrl.pathname);
  if (legacyRedirectPath) {
    targetUrl.pathname = legacyRedirectPath;
  }

  // Guard against bouncing the user back to the login route itself.
  if (targetUrl.pathname === "/login") {
    return fallback;
  }

  if (isRunnerPublicDisplayPath(targetUrl.pathname)) {
    return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
  }

  const moduleKey = resolveModuleFromPath(targetUrl.pathname);

  // Non-module paths fall back to the role's default landing page.
  if (!moduleKey) {
    return fallback;
  }

  if (!canAccess(claims.user_role, moduleKey)) {
    return fallback;
  }

  if (
    moduleKey === "pos" ||
    moduleKey === "kds" ||
    moduleKey === "runner" ||
    moduleKey === "branch_dashboard" ||
    moduleKey === "branch_settings" ||
    moduleKey === "branch_menu_limits"
  ) {
    const branchMatch = targetUrl.pathname.match(/^\/br\/(\d+)\//);
    const routeBranchId = branchMatch ? Number(branchMatch[1]) : null;

    const allowCrossBranchBranchSurface =
      (moduleKey === "branch_dashboard" ||
        moduleKey === "branch_settings" ||
        moduleKey === "branch_menu_limits") &&
      (claims.user_role === "owner" || claims.user_role === "super_manager");

    if (
      routeBranchId === null ||
      (!allowCrossBranchBranchSurface && claims.branch_id !== routeBranchId)
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
