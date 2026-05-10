import { cache } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import type { JwtClaims, PermissionKey, StaffRole } from "@comtammatu/shared/auth";
import type { Session } from "@supabase/supabase-js";

/**
 * Get authenticated user context with role authorization.
 * Returns null if unauthenticated, no claims, or role not in allowedRoles.
 *
 * Canonical copy — module-level `_lib/auth.ts` files re-export from here.
 *
 * Wrapped in React `cache()` so within ONE RSC render, parallel actions
 * sharing the same `allowedRoles` ref (e.g. `MODULE_ACL.pos.allowedRoles`
 * imported from a single module) dedupe to one `getUser()` HTTP roundtrip
 * + one `getSession()` cookie read. POS reload calls 7 actions that all
 * pass `POS_ROLES` — without this cache the page paid 7× ~150-300ms to
 * Supabase Auth. Cache scope is per-request; production safety unchanged.
 */
export const getAuthContext = cache(async function getAuthContext(
  allowedRoles: readonly StaffRole[],
) {
  const supabase = await createClient();

  // Server Actions use getUser() — it validates the JWT against Supabase Auth
  // server, ensuring banned/deleted users are rejected immediately.
  // Pages/layouts can use getSession() (middleware already verified), but
  // mutations must re-verify for defense in depth.
  //
  // Parallelize the two reads: getUser() makes an HTTP roundtrip to the Auth
  // server while getSession() decodes the cookie locally. They have no
  // dependency, so sequencing them only added latency. If getUser() rejects
  // a banned user we still return null — the parallel session read is
  // discarded harmlessly (no permission RPC has fired yet).
  const [userRes, sessionRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);

  const user = userRes.data.user;
  if (!user) return null;

  const session = sessionRes.data.session;
  const claims = extractClaimsFromAccessToken(session?.access_token);
  if (!claims) return null;

  if (!allowedRoles.includes(claims.user_role)) return null;

  return { supabase, claims, user };
});

type PermissionLike = PermissionKey | string;

type AuthContext = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;

/**
 * Cached: identical (ctx, permission, branchId) tuples within one RSC render
 * dedupe to a single `has_permission`/`has_permission_any` RPC. POS reload
 * has 6 actions that all check `pos:use` with the same shared `ctx` (from
 * cached getAuthContext) — collapsing those 6 RPCs to 1 is the second-half
 * of the auth-fanout fix. Cache is per-request only.
 */
const hasPermissionGrant = cache(async function hasPermissionGrant(
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
});

function normalizePermissionKeys(
  permissions: readonly PermissionLike[],
): string[] {
  return [...new Set(permissions.filter((p) => p.length > 0))];
}

async function hasAnyPermissionGrant(
  ctx: AuthContext,
  permissions: readonly PermissionLike[],
  branchId?: number | null,
): Promise<boolean> {
  const keys = normalizePermissionKeys(permissions);
  if (keys.length === 0) return false;
  if (keys.length === 1) {
    const key = keys[0];
    return key ? hasPermissionGrant(ctx, key, branchId) : false;
  }

  if (branchId == null) {
    const { data, error } = await ctx.supabase.rpc(
      "has_any_permissions_any",
      { p_keys: keys },
    );
    if (!error) return data === true;
  } else {
    const { data, error } = await ctx.supabase.rpc(
      "has_any_permissions_for_branch",
      { p_branch_id: branchId, p_keys: keys },
    );
    if (!error) return data === true;
  }

  // Deployment-safe fallback: if code reaches an environment before the
  // migration is applied, preserve the old semantics instead of denying all
  // multi-key gates.
  const grants = await Promise.all(
    keys.map((p) => hasPermissionGrant(ctx, p, branchId)),
  );
  return grants.some(Boolean);
}

async function hasAllPermissionGrants(
  ctx: AuthContext,
  permissions: readonly PermissionLike[],
  branchId?: number | null,
): Promise<boolean> {
  const keys = normalizePermissionKeys(permissions);
  if (keys.length === 0) return true;
  if (keys.length === 1) {
    const key = keys[0];
    return key ? hasPermissionGrant(ctx, key, branchId) : true;
  }

  if (branchId == null) {
    const { data, error } = await ctx.supabase.rpc(
      "has_all_permissions_any",
      { p_keys: keys },
    );
    if (!error) return data === true;
  } else {
    const { data, error } = await ctx.supabase.rpc(
      "has_all_permissions_for_branch",
      { p_branch_id: branchId, p_keys: keys },
    );
    if (!error) return data === true;
  }

  const grants = await Promise.all(
    keys.map((p) => hasPermissionGrant(ctx, p, branchId)),
  );
  return grants.every(Boolean);
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

/**
 * OR-semantics: returns ctx if user has ANY of the listed permissions on the
 * branch (or any branch if branchId null). Multi-key checks use one batch RPC
 * instead of N permission RPCs. The single-key path stays cache()-wrapped so
 * duplicate `(ctx, key, branch)` tuples across sibling helpers dedupe.
 */
export async function getAuthContextWithAnyPermission(
  allowedRoles: readonly StaffRole[],
  permissions: readonly PermissionLike[],
  branchId?: number | null,
) {
  const ctx = await getAuthContext(allowedRoles);
  if (!ctx) return null;

  const allowed = await hasAnyPermissionGrant(ctx, permissions, branchId);
  return allowed ? ctx : null;
}

/**
 * AND-semantics: returns ctx only if user has EVERY listed permission. Uses
 * the batch ALL RPC for multi-key probes. Distinct from
 * `getAuthContextWithAnyPermission` — do NOT collapse this with OR semantics.
 */
export async function getAuthContextWithPermissions(
  allowedRoles: readonly StaffRole[],
  permissions: readonly PermissionLike[],
  branchId?: number | null,
) {
  const ctx = await getAuthContext(allowedRoles);
  if (!ctx) return null;

  const allowed = await hasAllPermissionGrants(ctx, permissions, branchId);
  return allowed ? ctx : null;
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
 *
 * Wrapped in React `cache()` so repeated calls within ONE RSC render share
 * the same `{supabase, session, claims}` snapshot — eliminates duplicate
 * `getSession()` cookie parses when both a layout and its page (or multiple
 * helpers like `getEmployeeContext` / `mobile-header`) read auth state.
 * Inventory layout + page used to invoke this twice; Employee home invoked
 * it three times (page + mobile-header + employee-context). Cache scope is
 * per-request; production safety unchanged.
 */
export const loadAuthState = cache(async (): Promise<LoadedAuthState> => {
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
});
