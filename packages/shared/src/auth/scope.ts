import { canAccess } from "./module-acl";
import { getDefaultRedirect } from "./login-destination";
import {
  isOwnerRoutePath,
  isRunnerPublicDisplayPath,
  resolveModuleFromPath,
} from "./route-resolution";
import {
  BRANCH_REQUIRED_OPERATIONAL_ROLES,
  STAFF_ROLES,
  requiredOperatorBranchKindForRole,
  staffRoleFromPositionCode,
  type JwtClaims,
  type StaffRole,
} from "./types";

export { getDefaultRedirect } from "./login-destination";

/** Extract claims from Supabase user app_metadata */
function extractClaims(appMetadata: Record<string, unknown>): JwtClaims | null {
  const tenantId = appMetadata.tenant_id;
  const role = appMetadata.user_role;
  const positionCode = appMetadata.position_code;
  const branchId = appMetadata.branch_id;
  const mappedRole =
    typeof positionCode === "string"
      ? staffRoleFromPositionCode(positionCode)
      : "unassigned";

  if (
    typeof tenantId !== "number" ||
    !Number.isSafeInteger(tenantId) ||
    tenantId <= 0 ||
    typeof role !== "string" ||
    !STAFF_ROLES.includes(role as StaffRole) ||
    typeof positionCode !== "string" ||
    positionCode.length === 0 ||
    (role === "self_service"
      ? mappedRole !== "unassigned"
      : mappedRole !== role) ||
    (branchId !== null &&
      (typeof branchId !== "number" ||
        !Number.isSafeInteger(branchId) ||
        branchId <= 0))
  ) {
    return null;
  }

  return {
    tenant_id: tenantId,
    branch_id: branchId,
    user_role: role as StaffRole,
    position_code: positionCode,
  };
}

/**
 * Decode the `app_metadata` section of a Supabase access-token JWT.
 *
 * `session.user.app_metadata` (supabase-js) reads from the `auth.users` row and
 * DOES NOT include claims injected by the `custom_access_token_hook`. Those
 * hook-added claims (`user_role`, `position_code`) only live inside the JWT.
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

/**
 * JWT mirror of `public.can_read_branch_ops(branch_id)` for private
 * `branch:{id}:ops` topics. Owner may subscribe across tenant branches;
 * every non-Owner is limited to `claims.branch_id`. Does not widen via
 * `staff_permissions` — see REALTIME-BRANCH-OPS-ACTIVE-SCOPE.
 */
export function canSubscribeBranchOpsTopic(
  claims: JwtClaims,
  branchId: number,
): boolean {
  if (claims.user_role === "owner") return true;
  return claims.branch_id != null && claims.branch_id === branchId;
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

const SELF_SERVICE_BRANCH_PATHS = [
  ["/me/clock", "/shift/clock"],
  ["/me/schedule", "/shift/schedule"],
  ["/me/profile", "/profile"],
  ["/me/payslip", "/profile/payslip"],
  ["/me", "/shift"],
] as const;

export function canonicalizeSelfServicePath(
  claims: JwtClaims,
  path: string,
): string | null {
  const targetUrl = new URL(path, "http://localhost");
  if (targetUrl.pathname !== "/me" && !targetUrl.pathname.startsWith("/me/")) {
    return path;
  }
  if (claims.user_role === "owner") return null;
  if (
    BRANCH_REQUIRED_OPERATIONAL_ROLES.includes(claims.user_role) &&
    claims.branch_id == null
  ) {
    return null;
  }
  if (
    requiredOperatorBranchKindForRole(claims.user_role) !== "branch" ||
    !canAccess(claims.user_role, "branch_home")
  ) {
    return path;
  }

  const mapping = SELF_SERVICE_BRANCH_PATHS.find(
    ([source]) =>
      targetUrl.pathname === source ||
      targetUrl.pathname.startsWith(`${source}/`),
  );
  if (!mapping) return null;
  const [source, destination] = mapping;
  targetUrl.pathname = `/br/${claims.branch_id}${destination}${targetUrl.pathname.slice(source.length)}`;
  return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
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

  // Guard against bouncing the user back to the login route itself.
  if (targetUrl.pathname === "/login") {
    return fallback;
  }

  const canonicalSelfPath = canonicalizeSelfServicePath(claims, safeReturnTo);
  if (canonicalSelfPath === null) return fallback;
  if (canonicalSelfPath !== safeReturnTo) {
    return canonicalSelfPath;
  }

  if (isRunnerPublicDisplayPath(targetUrl.pathname)) {
    return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
  }

  if (isOwnerRoutePath(targetUrl.pathname) && claims.user_role !== "owner") {
    const ownerModuleKey = resolveModuleFromPath(targetUrl.pathname);
    if (!ownerModuleKey || !canAccess(claims.user_role, ownerModuleKey)) {
      return fallback;
    }
  }

  const moduleKey = resolveModuleFromPath(targetUrl.pathname);

  // Non-module paths fall back to the role's default landing page.
  if (!moduleKey) {
    return fallback;
  }

  if (!canAccess(claims.user_role, moduleKey)) {
    return fallback;
  }

  const branchMatch = targetUrl.pathname.match(/^\/br\/(\d+)(?:\/|$)/);
  const routeBranchId = branchMatch ? Number(branchMatch[1]) : null;

  if (routeBranchId != null) {
    const allowCrossBranchBranchSurface = claims.user_role === "owner";

    if (!allowCrossBranchBranchSurface && claims.branch_id !== routeBranchId) {
      return fallback;
    }
  }

  return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
}
