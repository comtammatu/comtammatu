/**
 * Auth v2 permission fetchers.
 *
 * Server helpers read `staff_permissions` through the authenticated
 * Supabase client. RLS restricts callers to their own rows, so no extra
 * authz check is needed here (rows are self-filtered).
 */

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
 */
export async function currentUserHasPermission(
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
}

/**
 * Check if current user has a permission in any branch or tenant scope.
 * Mirrors the RLS helper `public.has_permission_any`, including owner bypass.
 */
export async function currentUserHasPermissionAny(
  key: PermissionKey | string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission_any", {
    p_key: key,
  });
  return !error && data === true;
}

export async function currentUserHasAnyPermissionAny(
  keys: readonly (PermissionKey | string)[],
): Promise<boolean> {
  for (const key of keys) {
    if (await currentUserHasPermissionAny(key)) {
      return true;
    }
  }
  return false;
}
