/**
 * Auth permission fetchers.
 *
 * Server helpers read `staff_permissions` through the authenticated
 * Supabase client. RLS restricts callers to their own rows, so no extra
 * authz check is needed here (rows are self-filtered).
 */

import { cache } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import type { PermissionKey } from "@comtammatu/shared/auth";

export interface UserPermission {
  permissionKey: string;
  branchId: number | null;
  sourceTemplate: number | null;
  grantedAt: string;
}

/**
 * Fetch current user's permission grants. Returns rows scoped to the
 * current branch (branch_id = p_branch) AND tenant-wide grants (branch_id IS NULL).
 * If `branchId` is null, only tenant-wide grants are returned.
 */
export async function fetchCurrentUserPermissions(
  branchId: number | null,
): Promise<UserPermission[]> {
  const supabase = await createClient();

  let query = supabase
    .from("staff_permissions")
    .select("permission_key, branch_id, source_template, granted_at")
    .order("permission_key");

  if (branchId === null) {
    query = query.is("branch_id", null);
  } else {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return [];

  return (data ?? []).map((r) => ({
    permissionKey: r.permission_key,
    branchId: r.branch_id,
    sourceTemplate: r.source_template,
    grantedAt: r.granted_at,
  }));
}

/**
 * Check if current user has a permission for a given branch (or tenant-wide).
 * Server-side; reads the same data as the RLS helper but returns a boolean to callers.
 *
 * Prefer calling this from Server Actions to gate UI. RLS is still the
 * authoritative enforcement layer.
 *
 * Wrapped in React `cache()` so identical `(branchId, key)` tuples within ONE
 * RSC render dedupe to a single RPC. Primitive args (number | null + string)
 * are value-keyed by `cache()`, so layout + page asking the same question
 * pay one RPC instead of two. Mirror `auth.ts:hasPermissionGrant` pattern.
 */
export const currentUserHasPermission = cache(
  async function currentUserHasPermission(
    branchId: number | null,
    key: PermissionKey | string,
  ): Promise<boolean> {
    const supabase = await createClient();

    if (branchId === null) {
      const { data, error } = await supabase.rpc("has_permission_any", {
        p_key: key,
      });
      return !error && data === true;
    }

    const { data, error } = await supabase.rpc("has_permission", {
      p_branch_id: branchId,
      p_key: key,
    });
    return !error && data === true;
  },
);

/**
 * Check if current user has a permission in any branch or tenant scope.
 * Mirrors the RLS helper `public.has_permission_any`, including owner bypass.
 *
 * Wrapped in React `cache()` so repeated single-key probes in one render
 * dedupe (e.g. inventory layout asks `procurement:read`, page asks again).
 */
export const currentUserHasPermissionAny = cache(
  async function currentUserHasPermissionAny(
    key: PermissionKey | string,
  ): Promise<boolean> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("has_permission_any", {
      p_key: key,
    });
    return !error && data === true;
  },
);

/**
 * Returns true if the user has ANY of the given permission keys (tenant-wide
 * or branch-scoped). Fires all RPCs in parallel — single network RTT — and
 * ORs the results. Each individual RPC still runs the owner bypass
 * server-side short-circuit.
 *
 * Empty `keys` returns `false` (matches sequential semantics). Errors in
 * underlying RPCs map to `false` per `currentUserHasPermissionAny`, so the
 * `Promise.all` never rejects. Intended for small key arrays (≤5); larger
 * fan-out should consider a batch RPC `has_any_permissions(keys[])` once
 * pool pressure is observed.
 *
 * NOT wrapped in React `cache()` — array argument identity changes per
 * render, so memoization would never hit. Dedup happens inside the
 * single-key helper instead.
 *
 * Spec: regressions.md MULTI-KEY-PERMISSION-PARALLEL.
 */
export async function currentUserHasAnyPermissionAny(
  keys: readonly (PermissionKey | string)[],
): Promise<boolean> {
  const results = await Promise.all(
    keys.map((key) => currentUserHasPermissionAny(key)),
  );
  return results.some(Boolean);
}
