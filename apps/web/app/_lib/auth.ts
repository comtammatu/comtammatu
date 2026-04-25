import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import type { JwtClaims, PermissionKey, StaffRole } from "@comtammatu/shared/auth";
import type { Session } from "@supabase/supabase-js";

/**
 * Get authenticated user context with role authorization.
 * Returns null if unauthenticated, no claims, or role not in allowedRoles.
 *
 * Canonical copy — module-level `_lib/auth.ts` files re-export from here.
 */
export async function getAuthContext(allowedRoles: readonly StaffRole[]) {
  const supabase = await createClient();

  // Server Actions use getUser() — it validates the JWT against Supabase Auth
  // server, ensuring banned/deleted users are rejected immediately.
  // Pages/layouts can use getSession() (middleware already verified), but
  // mutations must re-verify for defense in depth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = extractClaimsFromAccessToken(session?.access_token);
  if (!claims) return null;

  if (!allowedRoles.includes(claims.user_role)) return null;

  return { supabase, claims, user };
}

type PermissionLike = PermissionKey | string;

type AuthContext = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;

async function hasPermissionGrant(
  ctx: AuthContext,
  permission: PermissionLike,
  branchId?: number | null,
): Promise<boolean> {
  if (branchId == null) {
    const { data, error } = await ctx.supabase.rpc("has_permission_any", {
      p_key: permission,
    });
    return !error && data === true;
  }

  const { data, error } = await ctx.supabase.rpc("has_permission", {
    p_branch_id: branchId,
    p_key: permission,
  });
  return !error && data === true;
}

// Cheap permission probe for callers that already have an `AuthContext`
// (i.e. resolved `getUser()` + `getSession()` once). Use this for UI hints
// like `canManageOrders` so the action does NOT pay a second `getUser()`
// HTTP round-trip just to ask "does this user also have key X?".
//
// Always parallelize with the data fetch via `Promise.all` — the probe
// has no dependency on the data result.
//
// Fail-safe: returns `false` on any RPC error (deny by default). The
// authoritative gate is the server-side RPC on the actual mutation.
export async function probePermission(
  ctx: AuthContext,
  permission: PermissionLike,
  branchId?: number | null,
): Promise<boolean> {
  return hasPermissionGrant(ctx, permission, branchId);
}

export async function getAuthContextWithPermission(
  allowedRoles: readonly StaffRole[],
  permission: PermissionLike,
  branchId?: number | null,
) {
  const ctx = await getAuthContext(allowedRoles);
  if (!ctx) return null;

  const allowed = await hasPermissionGrant(ctx, permission, branchId);
  return allowed ? ctx : null;
}

export async function getAuthContextWithAnyPermission(
  allowedRoles: readonly StaffRole[],
  permissions: readonly PermissionLike[],
  branchId?: number | null,
) {
  const ctx = await getAuthContext(allowedRoles);
  if (!ctx) return null;

  for (const permission of permissions) {
    if (await hasPermissionGrant(ctx, permission, branchId)) {
      return ctx;
    }
  }

  return null;
}

export async function getAuthContextWithPermissions(
  allowedRoles: readonly StaffRole[],
  permissions: readonly PermissionLike[],
  branchId?: number | null,
) {
  const ctx = await getAuthContext(allowedRoles);
  if (!ctx) return null;

  for (const permission of permissions) {
    if (!(await hasPermissionGrant(ctx, permission, branchId))) {
      return null;
    }
  }

  return ctx;
}

type LoadedAuthState = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  session: Session;
  claims: JwtClaims;
};

/**
 * Read auth state for a layout or page. Trusts the proxy (`apps/web/proxy.ts`)
 * as the single auth gate — callers MUST NOT re-check session, claims, or
 * module ACL. If anything is missing here, the proxy invariant is broken.
 *
 * Throws instead of silently redirecting so the failure surfaces via
 * `error.tsx` boundaries rather than masking the bug.
 *
 * Returns the Supabase client so callers can avoid creating a second one.
 */
export async function loadAuthState(): Promise<LoadedAuthState> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error(
      "loadAuthState: session missing — proxy (apps/web/proxy.ts) should have redirected to /login before reaching this layout.",
    );
  }

  const claims = extractClaimsFromAccessToken(session.access_token);
  if (!claims) {
    throw new Error(
      "loadAuthState: claims missing — proxy should have redirected to /access-denied (missing-auth-context).",
    );
  }

  return { supabase, session, claims };
}
