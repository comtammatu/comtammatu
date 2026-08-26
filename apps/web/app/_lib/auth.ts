import { cache } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  extractUserIdFromAccessToken,
} from "@comtammatu/shared/auth";
import type {
  JwtClaims,
  PermissionKey,
  StaffRole,
} from "@comtammatu/shared/auth";
import type { Session, User } from "@supabase/supabase-js";
import { probeAuthSessionLiveness } from "./auth-session-liveness";

/**
 * Get authenticated user context with role authorization.
 * Returns null if unauthenticated, no claims, or role not in allowedRoles.
 *
 * Canonical copy — module-level `_lib/auth.ts` files re-export from here.
 *
 * Wrapped in React `cache()` so within ONE RSC render, parallel actions
 * sharing the same `allowedRoles` ref (e.g. `MODULE_ACL.pos.allowedRoles`
 * imported from a single module) dedupe to one session cookie read.
 * POS reload calls 7 actions that all pass `POS_ROLES` — without this
 * cache the page repeated auth work per action. Cache scope is per-request;
 * production safety unchanged.
 */
export const getAuthContext = cache(async function getAuthContext(
  allowedRoles: readonly StaffRole[],
) {
  const supabase = await createClient();

  // Align with loadAuthState: proxy (`apps/web/proxy.ts`) is the request auth
  // gate. Prefer getSession() cookie claims over getUser().
  //
  // getUser() maps Auth `session_not_found` to "Auth session missing!" even
  // when the cookie JWT still authorizes PostgREST/RLS — that false-null made
  // GRN / supplier-invoice / expense Server Action loaders return "Không có
  // quyền" while purchase-orders (loadAuthState + direct select) succeeded.
  // Do not Promise.all getUser+getSession (GoTrue client race).
  // Mutation Auth liveness lives in withAction (`ensureLiveAuthSession`);
  // protected RSC Auth liveness lives in loadAuthState (not here).
  // Do not add getUser here — see regressions ZOMBIE-JWT-AFTER-GLOBAL-SIGNOUT.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const claims = extractClaimsFromAccessToken(session.access_token);
  if (!claims) return null;

  if (!allowedRoles.includes(claims.user_role)) return null;

  // JWT `sub` equals session.user.id but reading session.user trips the
  // auth-js insecure-user warning proxy (cookie payload, unverified).
  // Never read session.user here or downstream — use `userId`.
  const userId = extractUserIdFromAccessToken(session.access_token);
  if (!userId) return null;

  return { supabase, claims, userId };
});

type PermissionLike = PermissionKey | string;

type AuthContext = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;
type PermissionContext = Pick<AuthContext, "supabase" | "claims">;

/**
 * Cached: identical (ctx, permission, branchId) tuples within one RSC render
 * dedupe to a single `has_permission`/`has_permission_any` RPC. POS reload
 * has 6 actions that all check `pos:use` with the same shared `ctx` (from
 * cached getAuthContext) — collapsing those 6 RPCs to 1 is the second-half
 * of the auth-fanout fix. Cache is per-request only.
 */
const hasPermissionGrant = cache(async function hasPermissionGrant(
  ctx: PermissionContext,
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

// Cheap permission probe for callers that already have authenticated
// `{ supabase, claims }`. Use this for UI hints like `canManageOrders` so the
// action does NOT re-enter getAuthContext just to ask "does this user also
// have key X?".
//
// Always parallelize with the data fetch via `Promise.all` — the probe
// has no dependency on the data result.
//
// Fail-safe: returns `false` on any RPC error (deny by default). The
// authoritative gate is the server-side RPC on the actual mutation.
export async function probePermission(
  ctx: PermissionContext,
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
 * branch (or tenant-wide if branchId null). Probes fire in parallel — single
 * RTT — instead of the prior `for…await` waterfall. `hasPermissionGrant` is
 * already cache()-wrapped so duplicate `(ctx, key, branch)` tuples across
 * sibling helpers in one render dedupe to a single RPC.
 */
export async function getAuthContextWithAnyPermission(
  allowedRoles: readonly StaffRole[],
  permissions: readonly PermissionLike[],
  branchId?: number | null,
) {
  const ctx = await getAuthContext(allowedRoles);
  if (!ctx) return null;

  const grants = await Promise.all(
    permissions.map((p) => hasPermissionGrant(ctx, p, branchId)),
  );
  return grants.some(Boolean) ? ctx : null;
}

/**
 * AND-semantics: returns ctx only if user has EVERY listed permission. Same
 * parallel fan-out as the OR sibling above but ORs collapse with `.every()`
 * instead of `.some()`. Distinct from `getAuthContextWithAnyPermission` —
 * do NOT copy `.some(Boolean)` here or the AND gate silently weakens.
 */
export async function getAuthContextWithPermissions(
  allowedRoles: readonly StaffRole[],
  permissions: readonly PermissionLike[],
  branchId?: number | null,
) {
  const ctx = await getAuthContext(allowedRoles);
  if (!ctx) return null;

  const grants = await Promise.all(
    permissions.map((p) => hasPermissionGrant(ctx, p, branchId)),
  );
  return grants.every(Boolean) ? ctx : null;
}

type LoadedAuthState = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  session: Session;
  claims: JwtClaims;
  user: User | null;
  /** Token-derived user id (`sub`) — always present, no Auth roundtrip. */
  userId: string;
};

/**
 * Read auth state for a layout or page. Trusts the proxy (`apps/web/proxy.ts`)
 * as the single route gate for session/claims/ACL. Callers MUST NOT re-check
 * module ACL. If session/claims are missing here, the proxy invariant is
 * broken — throw so `error.tsx` surfaces the gap (do not silently redirect).
 *
 * Separately probes Auth session liveness (`probeAuthSessionLiveness`) so a
 * far-from-expiry zombie JWT after global signOut redirects to cookie-clear
 * signout instead of serving authenticated UI. That is Auth liveness, not a
 * second ACL gate — `getAuthContext` stays getSession-only (GRN false-deny).
 *
 * Returns the Supabase client, the verified Auth user, and `userId` — the
 * JWT `sub` that equals `session.user.id` without ever reading the proxied
 * (unverified) `session.user` cookie payload. Callers must not read
 * `session.user` either: @supabase/auth-js wraps it in an insecure-user
 * warning proxy on the server.
 *
 * Wrapped in React `cache()` so repeated calls within ONE RSC render share
 * the same `{supabase, session, claims, user}` snapshot — eliminates duplicate
 * `getSession()` / liveness probe when both a layout and its page (or multiple
 * helpers like `getEmployeeContext`) read auth state. Cache scope is
 * per-request; production safety unchanged.
 */
export const loadAuthState = cache(async (): Promise<LoadedAuthState> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
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

  const userId = extractUserIdFromAccessToken(session.access_token);
  if (!userId) {
    throw new Error(
      "loadAuthState: user id (JWT sub) missing from access token — malformed session cookie.",
    );
  }

  // Far-from-expiry zombie: cookie JWT still valid, Auth session revoked.
  // Redirect (not throw) so recovery clears cookies via Route Handler.
  const user = await probeAuthSessionLiveness(supabase);

  return { supabase, session, claims, user, userId };
});
